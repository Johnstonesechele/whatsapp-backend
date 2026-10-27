/**
 * Provider-Specific OAuth Configuration
 * Each provider has different OAuth requirements and flows
 */

export interface OAuthProviderConfig {
  id: string;
  name: string;
  icon: string;
  authMethod: 'oauth2' | 'api_key' | 'custom';
  
  // OAuth URLs
  authUrl: string;
  tokenUrl: string;
  
  // OAuth Flow
  flow: 'authorization_code' | 'implicit' | 'client_credentials' | 'pkce';
  usePKCE?: boolean; // Proof Key for Code Exchange (more secure)
  
  // Scopes
  defaultScopes: string[];
  scopeSeparator: string; // How to join scopes: ',' or ' '
  
  // Verification requirements
  requiresVerification: boolean;
  verificationType?: 'email' | 'domain' | 'manual' | 'automatic';
  verificationInstructions?: string;
  
  // Special requirements
  requiresState: boolean; // OAuth state parameter
  requiresNonce?: boolean; // OpenID Connect nonce
  
  // Token handling
  tokenType: 'Bearer' | 'OAuth';
  refreshTokenSupport: boolean;
  tokenExpiresIn?: number; // Default expiration in seconds
  
  // Additional parameters
  additionalAuthParams?: Record<string, string>;
  additionalTokenParams?: Record<string, string>;
  
  // Custom behavior
  customRedirectHandling?: boolean;
  postAuthSetup?: string[]; // Steps after OAuth completes
  
  // Documentation
  docsUrl: string;
  setupInstructions: string[];
}

export const OAUTH_PROVIDERS: Record<string, OAuthProviderConfig> = {
  slack: {
    id: 'slack',
    name: 'Slack',
    icon: '',
    authMethod: 'oauth2',
    
    authUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
    
    flow: 'authorization_code',
    usePKCE: false,
    
    defaultScopes: [
      'channels:read',
      'channels:write',
      'chat:write',
      'users:read',
      'team:read',
      'commands',
      'incoming-webhook'
    ],
    scopeSeparator: ',',
    
    requiresVerification: true,
    verificationType: 'manual',
    verificationInstructions: 'Your Slack app must be approved by a Slack workspace admin before users can connect. After creating the app, share the installation link with your workspace admin.',
    
    requiresState: true,
    requiresNonce: false,
    
    tokenType: 'Bearer',
    refreshTokenSupport: false, // Slack tokens don't expire
    
    customRedirectHandling: false,
    postAuthSetup: [
      'Verify bot token starts with xoxb-',
      'Test connection by calling users.list API',
      'Subscribe to relevant Events API events'
    ],
    
    docsUrl: 'https://api.slack.com/authentication/oauth-v2',
    setupInstructions: [
      'Go to https://api.slack.com/apps',
      'Create a new app or select existing',
      'Navigate to OAuth & Permissions',
      'Add your redirect URI',
      'Copy Client ID and Client Secret',
      'Request required scopes',
      'Install app to workspace'
    ]
  },
  
  hubspot: {
    id: 'hubspot',
    name: 'HubSpot',
    icon: '',
    authMethod: 'oauth2',
    
    authUrl: 'https://app.hubspot.com/oauth/authorize',
    tokenUrl: 'https://api.hubapi.com/oauth/v1/token',
    
    flow: 'authorization_code',
    usePKCE: false,
    
    defaultScopes: [
      'crm.objects.contacts.read',
      'crm.objects.contacts.write',
      'crm.objects.deals.read',
      'crm.objects.deals.write',
      'crm.objects.companies.read',
      'crm.objects.companies.write'
    ],
    scopeSeparator: ' ',
    
    requiresVerification: false,
    verificationType: 'automatic',
    
    requiresState: true,
    requiresNonce: false,
    
    tokenType: 'Bearer',
    refreshTokenSupport: true,
    tokenExpiresIn: 21600, // 6 hours
    
    additionalAuthParams: {},
    
    customRedirectHandling: true, // HubSpot redirects to their login page
    postAuthSetup: [
      'Store refresh token securely',
      'Set up token refresh before expiration',
      'Verify portal ID is accessible'
    ],
    
    docsUrl: 'https://developers.hubspot.com/docs/api/oauth-quickstart-guide',
    setupInstructions: [
      'Go to https://app.hubspot.com/developers',
      'Create or select an app',
      'Navigate to Auth tab',
      'Add redirect URI',
      'Select required scopes',
      'Copy App ID (Client ID) and Client Secret',
      'No verification needed - users log into their HubSpot account'
    ]
  },
  
  google: {
    id: 'google',
    name: 'Google Workspace',
    icon: '',
    authMethod: 'oauth2',
    
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    
    flow: 'authorization_code',
    usePKCE: true, // Google recommends PKCE for additional security
    
    defaultScopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile'
    ],
    scopeSeparator: ' ',
    
    requiresVerification: true,
    verificationType: 'email',
    verificationInstructions: 'Google requires domain verification for production use. During development, you can add test users. For production, submit for OAuth verification.',
    
    requiresState: true,
    requiresNonce: false,
    
    tokenType: 'Bearer',
    refreshTokenSupport: true,
    tokenExpiresIn: 3600, // 1 hour
    
    additionalAuthParams: {
      access_type: 'offline', // Get refresh token
      prompt: 'consent'       // Force consent screen to get refresh token
    },
    
    customRedirectHandling: true, // Google shows consent screen
    postAuthSetup: [
      'Store refresh token securely',
      'Set up automatic token refresh',
      'Verify email and profile scopes work',
      'For production: Submit app for verification'
    ],
    
    docsUrl: 'https://developers.google.com/identity/protocols/oauth2',
    setupInstructions: [
      'Go to https://console.cloud.google.com/apis/credentials',
      'Create a new project or select existing',
      'Enable required APIs (Gmail, Calendar, Drive)',
      'Create OAuth 2.0 Client ID',
      'Select "Web application" type',
      'Add authorized redirect URI',
      'Copy Client ID and Client Secret',
      'Add test users for development',
      'For production: Submit for OAuth verification at console.cloud.google.com/apis/credentials/consent'
    ]
  },
  
  zapier: {
    id: 'zapier',
    name: 'Zapier',
    icon: '',
    authMethod: 'oauth2',
    
    authUrl: 'https://zapier.com/oauth/authorize',
    tokenUrl: 'https://zapier.com/oauth/token',
    
    flow: 'authorization_code',
    usePKCE: false,
    
    defaultScopes: [],
    scopeSeparator: ' ',
    
    requiresVerification: false,
    verificationType: 'automatic',
    
    requiresState: true,
    requiresNonce: false,
    
    tokenType: 'Bearer',
    refreshTokenSupport: true,
    tokenExpiresIn: 31536000, // 1 year
    
    customRedirectHandling: false,
    postAuthSetup: [
      'Configure webhook endpoints',
      'Set up trigger events',
      'Test with a simple Zap'
    ],
    
    docsUrl: 'https://platform.zapier.com/quickstart/oauth',
    setupInstructions: [
      'Go to https://zapier.com/app/developer',
      'Create an integration',
      'Choose OAuth v2',
      'Add redirect URI',
      'Copy Client ID and Client Secret',
      'Define triggers and actions',
      'Users log into Zapier to connect'
    ]
  },
  
  salesforce: {
    id: 'salesforce',
    name: 'Salesforce',
    icon: '',
    authMethod: 'oauth2',
    
    authUrl: 'https://login.salesforce.com/services/oauth2/authorize',
    tokenUrl: 'https://login.salesforce.com/services/oauth2/token',
    
    flow: 'authorization_code',
    usePKCE: false,
    
    defaultScopes: [
      'full',
      'refresh_token',
      'api'
    ],
    scopeSeparator: ' ',
    
    requiresVerification: false,
    verificationType: 'automatic',
    
    requiresState: true,
    requiresNonce: false,
    
    tokenType: 'Bearer',
    refreshTokenSupport: true,
    tokenExpiresIn: 7200, // 2 hours (configurable in Salesforce)
    
    additionalAuthParams: {
      prompt: 'login consent'
    },
    
    customRedirectHandling: true, // Salesforce has their own login page
    postAuthSetup: [
      'Store instance URL from response',
      'Store refresh token securely',
      'Set up token refresh mechanism',
      'Verify API version compatibility'
    ],
    
    docsUrl: 'https://help.salesforce.com/s/articleView?id=sf.remoteaccess_oauth_web_server_flow.htm',
    setupInstructions: [
      'Log into Salesforce',
      'Go to Setup > Apps > App Manager',
      'Click "New Connected App"',
      'Enable OAuth Settings',
      'Add callback URL',
      'Select OAuth scopes',
      'Save and copy Consumer Key (Client ID)',
      'Copy Consumer Secret (Client Secret)',
      'Users log into their Salesforce org to authorize'
    ]
  },
  
  microsoft: {
    id: 'microsoft',
    name: 'Microsoft 365',
    icon: '',
    authMethod: 'oauth2',
    
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    
    flow: 'authorization_code',
    usePKCE: true,
    
    defaultScopes: [
      'User.Read',
      'Mail.Read',
      'Mail.Send',
      'Calendars.ReadWrite',
      'Files.ReadWrite',
      'offline_access'
    ],
    scopeSeparator: ' ',
    
    requiresVerification: true,
    verificationType: 'domain',
    verificationInstructions: 'Microsoft requires publisher verification for production apps. Add your company domain and verify ownership.',
    
    requiresState: true,
    requiresNonce: true,
    
    tokenType: 'Bearer',
    refreshTokenSupport: true,
    tokenExpiresIn: 3600,
    
    additionalAuthParams: {
      response_mode: 'query',
      prompt: 'consent'
    },
    
    customRedirectHandling: true,
    postAuthSetup: [
      'Store refresh token',
      'Verify tenant ID',
      'Set up admin consent for org-wide permissions',
      'For production: Complete publisher verification'
    ],
    
    docsUrl: 'https://docs.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-auth-code-flow',
    setupInstructions: [
      'Go to https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade',
      'Click "New registration"',
      'Enter app name',
      'Select supported account types',
      'Add redirect URI (Web)',
      'Copy Application (client) ID',
      'Go to Certificates & secrets',
      'Create new client secret',
      'Copy secret value immediately',
      'Go to API permissions and add required scopes',
      'For production: Complete publisher verification'
    ]
  }
};

/**
 * Get provider configuration
 */
export function getProviderConfig(providerId: string): OAuthProviderConfig | null {
  return OAUTH_PROVIDERS[providerId] || null;
}

/**
 * Check if provider requires verification
 */
export function requiresVerification(providerId: string): boolean {
  const config = getProviderConfig(providerId);
  return config?.requiresVerification || false;
}

/**
 * Get OAuth URL for provider
 */
export function buildOAuthUrl(
  providerId: string,
  clientId: string,
  redirectUri: string,
  state: string,
  customScopes?: string[]
): string {
  const config = getProviderConfig(providerId);
  if (!config) {
    throw new Error(`Unknown provider: ${providerId}`);
  }

  const scopes = customScopes || config.defaultScopes;
  const scopeString = scopes.join(config.scopeSeparator);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopeString,
    state: state,
    ...config.additionalAuthParams
  });

  return `${config.authUrl}?${params.toString()}`;
}

/**
 * Get human-readable instructions for provider
 */
export function getProviderInstructions(providerId: string): {
  setup: string[];
  verification?: string;
  postAuth: string[];
} {
  const config = getProviderConfig(providerId);
  if (!config) {
    return { setup: [], postAuth: [] };
  }

  return {
    setup: config.setupInstructions,
    verification: config.verificationInstructions,
    postAuth: config.postAuthSetup || []
  };
}
