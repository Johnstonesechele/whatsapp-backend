import { getSupabaseAdminClient } from "@/backend/database/supabase-config";
import { randomUUID } from "crypto";

export interface IntegrationCredentials {
  id?: string;
  company_id: string;
  provider: string;
  client_id: string;
  client_secret: string;
  redirect_uri?: string;
  scopes?: string[];
  additional_config?: Record<string, any>;
}

/**
 * Save or update OAuth credentials for a company
 */
export async function saveIntegrationCredentials(credentials: IntegrationCredentials) {
  const supabase = getSupabaseAdminClient();
  
  try {
    // Check if credentials already exist
    const { data: existing } = await supabase
      .from('integration_credentials')
      .select('id')
      .eq('company_id', credentials.company_id)
      .eq('provider', credentials.provider)
      .single();

    const credentialData = {
      company_id: credentials.company_id,
      provider: credentials.provider,
      client_id: credentials.client_id,
      client_secret: credentials.client_secret, // TODO: Encrypt this
      redirect_uri: credentials.redirect_uri,
      scopes: credentials.scopes,
      additional_config: credentials.additional_config,
      updated_at: new Date().toISOString()
    };

    if (existing) {
      // Update existing credentials
      const { error } = await supabase
        .from('integration_credentials')
        .update(credentialData)
        .eq('id', existing.id);

      if (error) throw error;
      return { success: true, id: existing.id };
    } else {
      // Create new credentials
      const { data, error } = await supabase
        .from('integration_credentials')
        .insert({
          id: randomUUID(),
          ...credentialData,
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      return { success: true, id: data.id };
    }
  } catch (error) {
    console.error('Error saving integration credentials:', error);
    throw error;
  }
}

/**
 * Get OAuth credentials for a company and provider
 */
export async function getIntegrationCredentials(company_id: string, provider: string) {
  const supabase = getSupabaseAdminClient();
  
  try {
    const { data, error } = await supabase
      .from('integration_credentials')
      .select('*')
      .eq('company_id', company_id)
      .eq('provider', provider)
      .eq('is_active', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No credentials found
        return null;
      }
      throw error;
    }

    return data;
  } catch (error) {
    console.error('Error getting integration credentials:', error);
    return null;
  }
}

/**
 * Delete OAuth credentials for a company and provider
 */
export async function deleteIntegrationCredentials(company_id: string, provider: string) {
  const supabase = getSupabaseAdminClient();
  
  try {
    const { error } = await supabase
      .from('integration_credentials')
      .delete()
      .eq('company_id', company_id)
      .eq('provider', provider);

    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error('Error deleting integration credentials:', error);
    throw error;
  }
}

/**
 * List all OAuth credentials for a company
 */
export async function listIntegrationCredentials(company_id: string) {
  const supabase = getSupabaseAdminClient();
  
  try {
    const { data, error } = await supabase
      .from('integration_credentials')
      .select('id, provider, client_id, redirect_uri, scopes, created_at, updated_at')
      .eq('company_id', company_id)
      .eq('is_active', true)
      .order('provider');

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Error listing integration credentials:', error);
    return [];
  }
}

/**
 * Check if company has credentials configured for a provider
 */
export async function hasIntegrationCredentials(company_id: string, provider: string): Promise<boolean> {
  const credentials = await getIntegrationCredentials(company_id, provider);
  return credentials !== null;
}
