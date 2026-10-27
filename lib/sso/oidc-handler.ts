import crypto from 'crypto'

export interface OIDCConfig {
  clientId: string
  clientSecret: string
  discoveryUrl?: string
  authorizeUrl?: string
  tokenUrl?: string
  userinfoUrl?: string
  scopes: string[]
}

export interface OIDCTokens {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
  id_token: string
  scope: string
}

export interface OIDCUserAttributes {
  email: string
  firstName: string
  lastName: string
  role?: string
  department?: string
  groups?: string[]
  sub: string
}

export interface OIDCDiscoveryDocument {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  userinfo_endpoint: string
  jwks_uri: string
  revocation_endpoint?: string
  scopes_supported: string[]
  response_types_supported: string[]
  subject_types_supported: string[]
  id_token_signing_alg_values_supported: string[]
  claims_supported: string[]
}

function base64urlEncode(data: Buffer | string): string {
  const str = typeof data === 'string' ? data : data.toString('base64')
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlDecode(str: string): Buffer {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4) base64 += '='
  return Buffer.from(base64, 'base64')
}

export async function discoverOIDC(discoveryUrl: string): Promise<OIDCDiscoveryDocument> {
  const response = await fetch(discoveryUrl)
  if (!response.ok) {
    throw new Error(`OIDC discovery failed: ${response.status}`)
  }
  return response.json()
}

export function generatePKCE() {
  const codeVerifier = base64urlEncode(crypto.randomBytes(32))
  const codeChallenge = base64urlEncode(
    crypto.createHash('sha256').update(codeVerifier).digest()
  )
  return { codeVerifier, codeChallenge }
}

export function generateAuthorizationUrl(
  config: OIDCConfig,
  redirectUri: string,
  state: string,
  codeChallenge: string,
  extraParams?: Record<string, string>
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: redirectUri,
    scope: config.scopes.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    ...extraParams
  })
  return `${config.authorizeUrl}?${params.toString()}`
}

export async function exchangeCodeForTokens(
  config: OIDCConfig,
  code: string,
  redirectUri: string,
  codeVerifier: string
): Promise<OIDCTokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code_verifier: codeVerifier
  })

  const response = await fetch(config.tokenUrl!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Token exchange failed: ${error}`)
  }

  return response.json()
}

export async function refreshTokens(
  config: OIDCConfig,
  refreshToken: string
): Promise<OIDCTokens> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret
  })

  const response = await fetch(config.tokenUrl!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  })

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status}`)
  }

  return response.json()
}

export async function fetchUserInfo(
  config: OIDCConfig,
  accessToken: string
): Promise<OIDCUserAttributes> {
  const response = await fetch(config.userinfoUrl!, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })

  if (!response.ok) {
    throw new Error(`UserInfo fetch failed: ${response.status}`)
  }

  const claims = await response.json()

  return {
    email: claims.email,
    firstName: claims.given_name || claims.name?.split(' ')[0] || '',
    lastName: claims.family_name || claims.name?.split(' ').slice(1).join(' ') || '',
    role: claims.role || claims.roles?.[0],
    department: claims.department || claims.dept,
    groups: claims.groups || [],
    sub: claims.sub
  }
}

export function decodeIDToken(idToken: string): Record<string, any> {
  const parts = idToken.split('.')
  if (parts.length !== 3) throw new Error('Invalid ID token format')

  const payload = base64urlDecode(parts[1]).toString('utf-8')
  return JSON.parse(payload)
}

export function validateIDTokenClaims(
  claims: Record<string, any>,
  expectedIssuer: string,
  expectedAudience: string,
  maxAgeSeconds: number = 3600
): void {
  const now = Math.floor(Date.now() / 1000)

  if (claims.iss !== expectedIssuer) {
    throw new Error(`Invalid issuer: expected ${expectedIssuer}, got ${claims.iss}`)
  }

  if (claims.aud !== expectedAudience && !claims.aud?.includes(expectedAudience)) {
    throw new Error(`Invalid audience: expected ${expectedAudience}`)
  }

  if (claims.exp && claims.exp < now) {
    throw new Error('ID token has expired')
  }

  if (claims.iat && (now - claims.iat) > maxAgeSeconds) {
    throw new Error('ID token is too old')
  }

  if (claims.nonce) {
    // nonce validation should be done against session
  }
}

export function generateState(): string {
  return base64urlEncode(crypto.randomBytes(32))
}

export function generateNonce(): string {
  return base64urlEncode(crypto.randomBytes(16))
}

export async function revokeToken(
  config: OIDCConfig,
  token: string,
  tokenTypeHint: 'access_token' | 'refresh_token' = 'access_token'
): Promise<void> {
  const revocationEndpoint = (config.discoveryUrl
    ? (await discoverOIDC(config.discoveryUrl)).revocation_endpoint
    : config.tokenUrl?.replace('/token', '/revoke'))

  if (!revocationEndpoint) {
    console.warn('No revocation endpoint available')
    return
  }

  const body = new URLSearchParams({
    token,
    token_type_hint: tokenTypeHint,
    client_id: config.clientId,
    client_secret: config.clientSecret
  })

  await fetch(revocationEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  })
}
