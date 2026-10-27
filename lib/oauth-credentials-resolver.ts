/**
 * OAuth Credentials Management with Fallback Support
 * 
 * Priority Order:
 * 1. Custom company credentials (from database) - for enterprise users
 * 2. Default/shared credentials (from environment) - for normal users
 * 3. Error if neither available
 */

import { getSupabaseAdminClient } from '@/backend/database/supabase-config';
import { getRedirectUri } from './oauth-utils';

export interface OAuthCredentials {
  client_id: string;
  client_secret: string;
  redirect_uri: string;
  scopes?: string[];
  is_custom?: boolean; // true if from database, false if from env
}

/**
 * Get default OAuth credentials from environment variables
 * These are the shared credentials that work for all users
 */
export function getDefaultOAuthCredentials(provider: string): OAuthCredentials | null {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  
  switch (provider.toLowerCase()) {
    case 'slack':
      if (process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET) {
        return {
          client_id: process.env.SLACK_CLIENT_ID,
          client_secret: process.env.SLACK_CLIENT_SECRET,
          redirect_uri: process.env.SLACK_REDIRECT_URI || `${baseUrl}/api/integrations/slack/callback`,
          is_custom: false,
        };
      }
      break;
      
    case 'google':
      if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
        return {
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          redirect_uri: process.env.GOOGLE_REDIRECT_URI || `${baseUrl}/api/integrations/google/callback`,
          is_custom: false,
        };
      }
      break;
      
    case 'hubspot':
      if (process.env.HUBSPOT_CLIENT_ID && process.env.HUBSPOT_CLIENT_SECRET) {
        return {
          client_id: process.env.HUBSPOT_CLIENT_ID,
          client_secret: process.env.HUBSPOT_CLIENT_SECRET,
          redirect_uri: process.env.HUBSPOT_REDIRECT_URI || `${baseUrl}/api/integrations/hubspot/callback`,
          is_custom: false,
        };
      }
      break;
      
    case 'salesforce':
      if (process.env.SALESFORCE_CLIENT_ID && process.env.SALESFORCE_CLIENT_SECRET) {
        return {
          client_id: process.env.SALESFORCE_CLIENT_ID,
          client_secret: process.env.SALESFORCE_CLIENT_SECRET,
          redirect_uri: process.env.SALESFORCE_REDIRECT_URI || `${baseUrl}/api/integrations/salesforce/callback`,
          is_custom: false,
        };
      }
      break;
      
    case 'zapier':
      if (process.env.ZAPIER_CLIENT_ID && process.env.ZAPIER_CLIENT_SECRET) {
        return {
          client_id: process.env.ZAPIER_CLIENT_ID,
          client_secret: process.env.ZAPIER_CLIENT_SECRET,
          redirect_uri: process.env.ZAPIER_REDIRECT_URI || `${baseUrl}/api/integrations/zapier/callback`,
          is_custom: false,
        };
      }
      break;
      
    default:
      return null;
  }
  
  return null;
}

/**
 * Get custom OAuth credentials from database (enterprise feature)
 */
export async function getCustomOAuthCredentials(
  companyId: string,
  provider: string
): Promise<OAuthCredentials | null> {
  try {
    const supabase = getSupabaseAdminClient();
    
    const { data, error } = await supabase
      .from('integration_credentials')
      .select('*')
      .eq('company_id', companyId)
      .eq('provider', provider)
      .eq('is_active', true)
      .single();
    
    if (error || !data) {
      return null;
    }
    
    return {
      client_id: data.client_id,
      client_secret: data.client_secret,
      redirect_uri: data.redirect_uri,
      scopes: data.scopes,
      is_custom: true,
    };
  } catch (error) {
    console.error('Error fetching custom credentials:', error);
    return null;
  }
}

/**
 * Get OAuth credentials with fallback logic
 * 
 * Priority:
 * 1. Custom credentials (if company configured their own)
 * 2. Default credentials (from environment variables)
 * 3. Throw error if neither available
 * 
 * This allows normal users to "just work" while giving
 * enterprise customers the option to use custom OAuth apps
 */
export async function getOAuthCredentials(
  companyId: string,
  provider: string
): Promise<OAuthCredentials> {
  // Try custom credentials first (enterprise feature)
  const customCreds = await getCustomOAuthCredentials(companyId, provider);
  if (customCreds) {
    console.log(` Using custom OAuth credentials for ${provider} (company: ${companyId})`);
    return customCreds;
  }
  
  // Fall back to default credentials (for normal users)
  const defaultCreds = getDefaultOAuthCredentials(provider);
  if (defaultCreds) {
    console.log(` Using default OAuth credentials for ${provider} (company: ${companyId})`);
    return defaultCreds;
  }
  
  // No credentials available
  throw new Error(
    `OAuth credentials not configured for ${provider}. ` +
    `Please contact support or configure custom credentials in Settings.`
  );
}

/**
 * Check if provider has default credentials configured
 * Used to show/hide integration options
 */
export function hasDefaultCredentials(provider: string): boolean {
  const creds = getDefaultOAuthCredentials(provider);
  return creds !== null;
}

/**
 * Get available providers (those with default credentials)
 * Used to dynamically show integration options
 */
export function getAvailableProviders(): string[] {
  const providers = ['slack', 'google', 'hubspot', 'salesforce', 'zapier'];
  return providers.filter(provider => hasDefaultCredentials(provider));
}

// Re-export the original functions for backward compatibility
export * from './integration-credentials-db';
