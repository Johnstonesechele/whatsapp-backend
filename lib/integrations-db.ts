import { getSupabaseAdminClient } from "@/backend/database/supabase-config";
import { randomUUID } from "crypto";
import { getJWTSecret } from "@/lib/jwt"

export interface IntegrationConfig {
  company_id: string;
  user_id: string;
  provider: string;
  access_token: string;
  refresh_token?: string;
  token_expires_at?: Date;
  instance_url?: string;
  metadata?: Record<string, any>;
}

export interface UserOAuthCredentials {
  company_id: string;
  user_id: string;
  provider: string;
  user_client_id: string;
  user_client_secret: string;
  user_redirect_uri?: string;
}

/**
 * Save or update integration tokens for a specific company
 */
export async function saveIntegrationTokens(config: IntegrationConfig) {
  const supabase = getSupabaseAdminClient();
  
  try {
    // Check if integration already exists for this company and provider
    const { data: existing } = await supabase
      .from('integrations')
      .select('id')
      .eq('company_id', config.company_id)
      .eq('provider', config.provider)
      .single();

    const integrationData = {
      company_id: config.company_id,
      name: config.provider.charAt(0).toUpperCase() + config.provider.slice(1),
      slug: config.provider.toLowerCase(),
      provider: config.provider,
      status: 'connected',
      is_active: true,
      is_enabled: true,
      auth_method: 'oauth2',
      access_token: config.access_token,
      refresh_token: config.refresh_token,
      token_expires_at: config.token_expires_at,
      last_sync: new Date().toISOString(),
      last_sync_status: 'success',
      metadata: {
        ...config.metadata,
        connected_by: config.user_id,
        connected_at: new Date().toISOString(),
        instance_url: config.instance_url
      },
      created_by: config.user_id,
      updated_at: new Date().toISOString()
    };

    if (existing) {
      // Update existing integration
      const { error } = await supabase
        .from('integrations')
        .update(integrationData)
        .eq('id', existing.id);

      if (error) throw error;
      return { success: true, id: existing.id };
    } else {
      // Create new integration
      const { data, error } = await supabase
        .from('integrations')
        .insert({
          id: randomUUID(),
          ...integrationData,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      return { success: true, id: data.id };
    }
  } catch (error) {
    console.error('Error saving integration tokens:', error);
    throw error;
  }
}

/**
 * Get integration tokens for a specific company and provider
 */
export async function getIntegrationTokens(company_id: string, provider: string) {
  const supabase = getSupabaseAdminClient();
  
  try {
    const { data, error } = await supabase
      .from('integrations')
      .select('*')
      .eq('company_id', company_id)
      .eq('provider', provider)
      .maybeSingle();

    if (error) {
      console.error('Error getting integration tokens:', error);
      return null;
    }

    // Return null if not found or not active
    if (!data || !data.is_active) {
      return null;
    }

    return data;
  } catch (error) {
    console.error('Error getting integration tokens:', error);
    return null;
  }
}

/**
 * Get integration with user OAuth credentials
 */
export async function getIntegrationWithUserCredentials(company_id: string, provider: string) {
  const supabase = getSupabaseAdminClient();
  
  try {
    const { data, error } = await supabase
      .from('integrations')
      .select('*')
      .eq('company_id', company_id)
      .eq('provider', provider)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned - integration not connected
        return null;
      }
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error getting integration tokens:', error);
    return null;
  }
}

/**
 * Disconnect integration for a specific company
 */
export async function disconnectIntegration(company_id: string, provider: string) {
  const supabase = getSupabaseAdminClient();
  
  try {
    const { error } = await supabase
      .from('integrations')
      .update({
        status: 'disconnected',
        is_active: false,
        access_token: null,
        refresh_token: null,
        token_expires_at: null,
        updated_at: new Date().toISOString()
      })
      .eq('company_id', company_id)
      .eq('provider', provider);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Error disconnecting integration:', error);
    throw error;
  }
}

/**
 * Log integration sync activity
 */
export async function logIntegrationSync(
  integration_id: string,
  status: 'success' | 'error',
  records_processed: number,
  errors: number = 0,
  error_details?: string
) {
  const supabase = getSupabaseAdminClient();
  
  try {
    const { error } = await supabase
      .from('integration_logs')
      .insert({
        id: randomUUID(),
        integration_id,
        status,
        records_processed,
        errors,
        error_details,
        start_time: new Date().toISOString(),
        end_time: new Date().toISOString()
      });

    if (error) throw error;
    
    // Update integration stats
    await supabase
      .from('integrations')
      .update({
        last_sync: new Date().toISOString(),
        last_sync_status: status,
        sync_count: supabase.rpc('increment', { row_id: integration_id }),
        data_points: supabase.rpc('increment', { row_id: integration_id, amount: records_processed }),
        updated_at: new Date().toISOString()
      })
      .eq('id', integration_id);

    return { success: true };
  } catch (error) {
    console.error('Error logging integration sync:', error);
    return { success: false };
  }
}

/**
 * Get user info from JWT token
 */
export async function getUserFromToken(token: string): Promise<{ userId: string; companyId: string } | null> {
  const jwt = require('jsonwebtoken');
  
  try {
    const decoded = jwt.verify(token, getJWTSecret()) as any;
    
    const supabase = getSupabaseAdminClient();
    const { data: user, error } = await supabase
      .from('users')
      .select('id, company_id')
      .eq('id', decoded.userId)
      .eq("active", true)
      .single();
    
    if (error || !user || !user.company_id) {
      return null;
    }
    
    return {
      userId: user.id,
      companyId: user.company_id
    };
  } catch (error) {
    console.error('Error getting user from token:', error);
    return null;
  }
}

/**
 * Save user's own OAuth app credentials (for multi-tenant where each user has their own OAuth app)
 */
export async function saveUserOAuthCredentials(credentials: UserOAuthCredentials) {
  const supabase = getSupabaseAdminClient();
  
  try {
    // Check if integration config already exists
    const { data: existing } = await supabase
      .from('integrations')
      .select('id')
      .eq('company_id', credentials.company_id)
      .eq('provider', credentials.provider)
      .maybeSingle();

    const integrationData = {
      company_id: credentials.company_id,
      user_id: credentials.user_id,
      name: credentials.provider.charAt(0).toUpperCase() + credentials.provider.slice(1),
      slug: credentials.provider.toLowerCase(),
      provider: credentials.provider,
      status: 'configured', // Not connected yet, just configured
      is_active: false, // Will be active after OAuth flow completes
      is_enabled: true,
      auth_method: 'oauth2',
      user_client_id: credentials.user_client_id,
      user_client_secret: credentials.user_client_secret, // TODO: Encrypt this
      user_redirect_uri: credentials.user_redirect_uri,
      created_by: credentials.user_id,
      updated_at: new Date().toISOString()
    };

    if (existing) {
      // Update existing integration config
      const { error } = await supabase
        .from('integrations')
        .update(integrationData)
        .eq('id', existing.id);

      if (error) throw error;
      return { success: true, id: existing.id };
    } else {
      // Create new integration config
      const { data, error } = await supabase
        .from('integrations')
        .insert({
          id: randomUUID(),
          ...integrationData,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      return { success: true, id: data.id };
    }
  } catch (error) {
    console.error('Error saving user OAuth credentials:', error);
    throw error;
  }
}
