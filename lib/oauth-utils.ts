/**
 * OAuth Utility Functions
 * Handles PKCE, token refresh, and provider-specific OAuth flows
 */

import crypto from 'crypto';
import { OAUTH_PROVIDERS, OAuthProviderConfig } from './oauth-providers-config';

/**
 * PKCE (Proof Key for Code Exchange) Functions
 * Used for Google OAuth and other providers that support/require PKCE
 */

export interface PKCEPair {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256' | 'plain';
}

/**
 * Generate a random code verifier for PKCE
 * Must be 43-128 characters, using [A-Z][a-z][0-9]-._~ characters
 */
export function generateCodeVerifier(length: number = 128): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const values = crypto.randomBytes(length);
  return Array.from(values)
    .map((x) => possible[x % possible.length])
    .join('')
    .slice(0, length);
}

/**
 * Generate code challenge from code verifier using SHA256
 */
export function generateCodeChallenge(verifier: string): string {
  return crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
}

/**
 * Generate PKCE pair for OAuth flow
 */
export function generatePKCE(): PKCEPair {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  
  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256'
  };
}

/**
 * OAuth State Management
 */

export interface OAuthState {
  userId: string;
  companyId: string;
  provider: string;
  codeVerifier?: string; // For PKCE
  redirectPath?: string; // Where to redirect after auth
  timestamp: number;
}

/**
 * Encode OAuth state for security
 */
export function encodeOAuthState(state: OAuthState): string {
  const stateJson = JSON.stringify(state);
  return Buffer.from(stateJson).toString('base64url');
}

/**
 * Decode OAuth state
 */
export function decodeOAuthState(encodedState: string): OAuthState | null {
  try {
    const stateJson = Buffer.from(encodedState, 'base64url').toString('utf-8');
    const state = JSON.parse(stateJson) as OAuthState;
    
    // Verify state is not too old (max 10 minutes)
    const age = Date.now() - state.timestamp;
    if (age > 10 * 60 * 1000) {
      console.error('OAuth state expired');
      return null;
    }
    
    return state;
  } catch (error) {
    console.error('Failed to decode OAuth state:', error);
    return null;
  }
}

/**
 * Build OAuth Authorization URL
 */

export interface BuildAuthUrlOptions {
  provider: string;
  clientId: string;
  redirectUri: string;
  state: string;
  scopes?: string[];
  additionalParams?: Record<string, string>;
  pkce?: PKCEPair;
}

export function buildOAuthAuthUrl(options: BuildAuthUrlOptions): string {
  const providerConfig = OAUTH_PROVIDERS[options.provider];
  if (!providerConfig) {
    throw new Error(`Unknown OAuth provider: ${options.provider}`);
  }

  const params = new URLSearchParams({
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    state: options.state,
    response_type: 'code',
  });

  // Add scopes
  const scopes = options.scopes || providerConfig.defaultScopes;
  if (scopes.length > 0) {
    params.set('scope', scopes.join(providerConfig.scopeSeparator));
  }

  // Add PKCE parameters if provided
  if (options.pkce && providerConfig.usePKCE) {
    params.set('code_challenge', options.pkce.codeChallenge);
    params.set('code_challenge_method', options.pkce.codeChallengeMethod);
  }

  // Add provider-specific parameters
  const additionalParams = {
    ...providerConfig.additionalAuthParams,
    ...options.additionalParams
  };
  
  for (const [key, value] of Object.entries(additionalParams)) {
    params.set(key, value);
  }

  return `${providerConfig.authUrl}?${params.toString()}`;
}

/**
 * Token Exchange
 */

export interface ExchangeCodeForTokenOptions {
  provider: string;
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  codeVerifier?: string; // For PKCE
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in?: number;
  scope?: string;
  [key: string]: any; // Provider-specific fields
}

export async function exchangeCodeForToken(
  options: ExchangeCodeForTokenOptions
): Promise<TokenResponse> {
  const providerConfig = OAUTH_PROVIDERS[options.provider];
  if (!providerConfig) {
    throw new Error(`Unknown OAuth provider: ${options.provider}`);
  }

  const body: Record<string, string> = {
    grant_type: 'authorization_code',
    code: options.code,
    client_id: options.clientId,
    client_secret: options.clientSecret,
    redirect_uri: options.redirectUri,
  };

  // Add PKCE code_verifier if using PKCE
  if (options.codeVerifier && providerConfig.usePKCE) {
    body.code_verifier = options.codeVerifier;
  }

  // Add provider-specific parameters
  if (providerConfig.additionalTokenParams) {
    Object.assign(body, providerConfig.additionalTokenParams);
  }

  const response = await fetch(providerConfig.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: new URLSearchParams(body),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error_description || 
      errorData.error || 
      `Failed to exchange code for token: ${response.status}`
    );
  }

  return await response.json();
}

/**
 * Token Refresh
 */

export interface RefreshTokenOptions {
  provider: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}

export async function refreshAccessToken(
  options: RefreshTokenOptions
): Promise<TokenResponse> {
  const providerConfig = OAUTH_PROVIDERS[options.provider];
  if (!providerConfig) {
    throw new Error(`Unknown OAuth provider: ${options.provider}`);
  }

  if (!providerConfig.refreshTokenSupport) {
    throw new Error(`Provider ${options.provider} does not support token refresh`);
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: options.refreshToken,
    client_id: options.clientId,
    client_secret: options.clientSecret,
  });

  const response = await fetch(providerConfig.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error_description || 
      errorData.error || 
      `Failed to refresh token: ${response.status}`
    );
  }

  return await response.json();
}

/**
 * Token Validation
 */

export interface TokenValidation {
  isValid: boolean;
  isExpired: boolean;
  expiresIn?: number; // seconds until expiration
  needsRefresh: boolean; // true if token expires within 5 minutes
}

export function validateToken(
  expiresAt: Date | null | undefined,
  refreshThresholdMinutes: number = 5
): TokenValidation {
  if (!expiresAt) {
    // No expiration means token is valid indefinitely (e.g., Slack)
    return {
      isValid: true,
      isExpired: false,
      needsRefresh: false,
    };
  }

  const now = new Date();
  const expiresAtDate = new Date(expiresAt);
  const isExpired = now >= expiresAtDate;
  
  // Calculate time until expiration
  const expiresIn = Math.floor((expiresAtDate.getTime() - now.getTime()) / 1000);
  
  // Check if token needs refresh (within threshold)
  const refreshThresholdSeconds = refreshThresholdMinutes * 60;
  const needsRefresh = expiresIn < refreshThresholdSeconds && expiresIn > 0;

  return {
    isValid: !isExpired,
    isExpired,
    expiresIn: Math.max(0, expiresIn),
    needsRefresh,
  };
}

/**
 * Provider-Specific Utilities
 */

/**
 * Get redirect URI for a provider
 */
export function getRedirectUri(provider: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${baseUrl}/api/integrations/${provider}/callback`;
}

/**
 * Build provider authorization URL with all required parameters
 */
export async function buildProviderAuthUrl(
  provider: string,
  clientId: string,
  userId: string,
  companyId: string,
  redirectPath?: string
): Promise<{ authUrl: string; state: OAuthState }> {
  const providerConfig = OAUTH_PROVIDERS[provider];
  if (!providerConfig) {
    throw new Error(`Unknown provider: ${provider}`);
  }

  // Generate PKCE if required
  let pkce: PKCEPair | undefined;
  if (providerConfig.usePKCE) {
    pkce = generatePKCE();
  }

  // Build state
  const state: OAuthState = {
    userId,
    companyId,
    provider,
    timestamp: Date.now(),
    redirectPath,
  };

  // Store code verifier in state if using PKCE
  if (pkce) {
    state.codeVerifier = pkce.codeVerifier;
  }

  const encodedState = encodeOAuthState(state);

  // Build auth URL
  const authUrl = buildOAuthAuthUrl({
    provider,
    clientId,
    redirectUri: getRedirectUri(provider),
    state: encodedState,
    pkce,
  });

  return { authUrl, state };
}

/**
 * Validate provider credentials
 */
export interface CredentialValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateProviderCredentials(
  provider: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): CredentialValidation {
  const result: CredentialValidation = {
    isValid: true,
    errors: [],
    warnings: [],
  };

  // Basic validation
  if (!clientId || clientId.trim() === '') {
    result.errors.push('Client ID is required');
    result.isValid = false;
  }

  if (!clientSecret || clientSecret.trim() === '') {
    result.errors.push('Client Secret is required');
    result.isValid = false;
  }

  if (!redirectUri || redirectUri.trim() === '') {
    result.errors.push('Redirect URI is required');
    result.isValid = false;
  }

  // Redirect URI validation
  if (redirectUri) {
    const expectedUri = getRedirectUri(provider);
    if (redirectUri !== expectedUri) {
      result.warnings.push(
        `Redirect URI mismatch. Expected: ${expectedUri}, Got: ${redirectUri}`
      );
    }

    // Check if using localhost in production
    if (redirectUri.includes('localhost') && process.env.NODE_ENV === 'production') {
      result.warnings.push('Using localhost redirect URI in production');
    }
  }

  return result;
}

/**
 * Get provider-specific error message
 */
export function getProviderErrorMessage(provider: string, error: string): string {
  const commonErrors: Record<string, string> = {
    'invalid_client': 'Invalid Client ID or Client Secret. Please check your credentials.',
    'invalid_grant': 'Authorization code is invalid or expired. Please try again.',
    'access_denied': 'User denied authorization. Please try again.',
    'redirect_uri_mismatch': 'Redirect URI does not match. Please update your OAuth app settings.',
    'invalid_scope': 'One or more requested scopes are invalid.',
  };

  return commonErrors[error] || `OAuth error: ${error}`;
}

export default {
  generatePKCE,
  encodeOAuthState,
  decodeOAuthState,
  buildOAuthAuthUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  validateToken,
  getRedirectUri,
  buildProviderAuthUrl,
  validateProviderCredentials,
  getProviderErrorMessage,
};
