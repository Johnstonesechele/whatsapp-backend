import { getSupabaseAdminClient } from '@/backend/database/supabase-config'
import {
  buildLoginRedirectUrl,
  buildLogoutRedirectUrl,
  parseSAMLResponse,
  generateSPMetadata,
  SAMLConfig
} from './saml-handler'
import {
  discoverOIDC,
  generatePKCE,
  generateAuthorizationUrl,
  exchangeCodeForTokens,
  fetchUserInfo,
  decodeIDToken,
  validateIDTokenClaims,
  generateState,
  OIDCConfig
} from './oidc-handler'
import jwt from 'jsonwebtoken'
import { getJWTSecret } from '@/lib/jwt'

const supabase = getSupabaseAdminClient()

export interface SSOProviderConfig {
  id: string
  company_id: string
  provider: string
  protocol: 'saml' | 'oidc'
  display_name: string | null
  is_enabled: boolean
  is_default: boolean
  sso_url: string | null
  slo_url: string | null
  entity_id: string | null
  x509_certificate: string | null
  client_id: string | null
  client_secret_encrypted: string | null
  discovery_url: string | null
  authorize_url: string | null
  token_url: string | null
  userinfo_url: string | null
  scopes: string[]
  attribute_mapping: Record<string, string>
  allow_idp_initiated: boolean
  enforce_sso: boolean
  jit_provisioning: boolean
}

interface SSOInitiateResult {
  redirectUrl: string
  state: string
  codeVerifier?: string
}

interface SSOCallbackResult {
  success: boolean
  user?: {
    id: string
    email: string
    name: string
    role: string
    company_id: string
    token: string
  }
  error?: string
  requiresMfa?: boolean
}

export async function getSSOConfigurations(companyId: string): Promise<SSOProviderConfig[]> {
  const { data, error } = await supabase
    .from('sso_configurations')
    .select('*')
    .eq('company_id', companyId)
    .order('is_default', { ascending: false })

  if (error) throw error
  return (data || []).map(row => ({
    ...row,
    scopes: Array.isArray(row.scopes) ? row.scopes : JSON.parse(row.scopes || '[]'),
    attribute_mapping: typeof row.attribute_mapping === 'object' ? row.attribute_mapping : JSON.parse(row.attribute_mapping || '{}')
  }))
}

export async function getSSOConfigById(configId: string, companyId: string): Promise<SSOProviderConfig | null> {
  const { data, error } = await supabase
    .from('sso_configurations')
    .select('*')
    .eq('id', configId)
    .eq('company_id', companyId)
    .single()

  if (error || !data) return null
  return {
    ...data,
    scopes: Array.isArray(data.scopes) ? data.scopes : JSON.parse(data.scopes || '[]'),
    attribute_mapping: typeof data.attribute_mapping === 'object' ? data.attribute_mapping : JSON.parse(data.attribute_mapping || '{}')
  }
}

export async function getDefaultSSOConfig(companyId: string): Promise<SSOProviderConfig | null> {
  const { data, error } = await supabase
    .from('sso_configurations')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_enabled', true)
    .eq('is_default', true)
    .single()

  if (error || !data) {
    const { data: anyEnabled } = await supabase
      .from('sso_configurations')
      .select('*')
      .eq('company_id', companyId)
      .eq('is_enabled', true)
      .limit(1)
      .single()

    if (!anyEnabled) return null
    return {
      ...anyEnabled,
      scopes: Array.isArray(anyEnabled.scopes) ? anyEnabled.scopes : JSON.parse(anyEnabled.scopes || '[]'),
      attribute_mapping: typeof anyEnabled.attribute_mapping === 'object' ? anyEnabled.attribute_mapping : JSON.parse(anyEnabled.attribute_mapping || '{}')
    }
  }

  return {
    ...data,
    scopes: Array.isArray(data.scopes) ? data.scopes : JSON.parse(data.scopes || '[]'),
    attribute_mapping: typeof data.attribute_mapping === 'object' ? data.attribute_mapping : JSON.parse(data.attribute_mapping || '{}')
  }
}

export async function initiateSSOLogin(
  config: SSOProviderConfig,
  acsUrl: string,
  relayState?: string
): Promise<SSOInitiateResult> {
  const state = generateState()

  if (config.protocol === 'saml') {
    const samlConfig: SAMLConfig = {
      ssoUrl: config.sso_url!,
      sloUrl: config.slo_url || undefined,
      entityId: config.entity_id!,
      x509Certificate: config.x509_certificate!,
      metadataUrl: config.display_name || undefined
    }
    const redirectUrl = buildLoginRedirectUrl(samlConfig, acsUrl, relayState || state)
    return { redirectUrl, state }
  }

  const oidcConfig: OIDCConfig = {
    clientId: config.client_id!,
    clientSecret: config.client_secret_encrypted!,
    discoveryUrl: config.discovery_url || undefined,
    authorizeUrl: config.authorize_url || undefined,
    tokenUrl: config.token_url || undefined,
    userinfoUrl: config.userinfo_url || undefined,
    scopes: config.scopes
  }

  const { codeVerifier, codeChallenge } = generatePKCE()

  await supabase.from('sso_configurations').update({
    metadata: { code_verifier: codeVerifier, state },
    updated_at: new Date().toISOString()
  }).eq('id', config.id)

  const redirectUrl = generateAuthorizationUrl(
    oidcConfig,
    acsUrl,
    state,
    codeChallenge
  )

  return { redirectUrl, state, codeVerifier }
}

export async function handleSAMLCallback(
  config: SSOProviderConfig,
  samlResponse: string,
  acsUrl: string
): Promise<SSOCallbackResult> {
  try {
    const samlConfig: SAMLConfig = {
      ssoUrl: config.sso_url!,
      sloUrl: config.slo_url || undefined,
      entityId: config.entity_id!,
      x509Certificate: config.x509_certificate!
    }

    const attributes = parseSAMLResponse(samlResponse, samlConfig, config.entity_id!)

    return await processSSOUser(config, {
      email: attributes.email,
      firstName: attributes.firstName,
      lastName: attributes.lastName,
      role: attributes.role,
      department: attributes.department,
      groups: attributes.groups,
      externalId: attributes.nameId
    })
  } catch (error: any) {
    console.error('SAML callback error:', error)
    return { success: false, error: error.message }
  }
}

export async function handleOIDCCallback(
  config: SSOProviderConfig,
  code: string,
  redirectUri: string
): Promise<SSOCallbackResult> {
  try {
    const oidcConfig: OIDCConfig = {
      clientId: config.client_id!,
      clientSecret: config.client_secret_encrypted!,
      discoveryUrl: config.discovery_url || undefined,
      authorizeUrl: config.authorize_url || undefined,
      tokenUrl: config.token_url || undefined,
      userinfoUrl: config.userinfo_url || undefined,
      scopes: config.scopes
    }

    const metadata = typeof config.attribute_mapping === 'object' ? {} : {}
    const tokens = await exchangeCodeForTokens(oidcConfig, code, redirectUri, '')

    const idClaims = decodeIDToken(tokens.id_token)
    const expectedIssuer = config.discovery_url
      ? (await discoverOIDC(config.discovery_url)).issuer
      : config.token_url?.replace('/token', '')
    validateIDTokenClaims(idClaims, expectedIssuer || '', config.client_id!)

    const userInfo = await fetchUserInfo(oidcConfig, tokens.access_token)

    return await processSSOUser(config, {
      email: userInfo.email,
      firstName: userInfo.firstName,
      lastName: userInfo.lastName,
      role: userInfo.role,
      department: userInfo.department,
      groups: userInfo.groups,
      externalId: userInfo.sub
    })
  } catch (error: any) {
    console.error('OIDC callback error:', error)
    return { success: false, error: error.message }
  }
}

async function processSSOUser(
  config: SSOProviderConfig,
  ssoUser: {
    email: string
    firstName: string
    lastName: string
    role?: string
    department?: string
    groups?: string[]
    externalId: string
  }
): Promise<SSOCallbackResult> {
  const mapping = config.attribute_mapping
  const roleMapping = mapping.role || 'role'

  let { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('email', ssoUser.email)
    .eq('company_id', config.company_id)
    .single()

  if (!user && config.jit_provisioning) {
    const userRole = ssoUser.role || 'team-member'
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert({
        email: ssoUser.email,
        name: `${ssoUser.firstName} ${ssoUser.lastName}`.trim(),
        role: userRole,
        company_id: config.company_id,
        active: true,
        email_verified: true,
        auth_provider: 'sso',
        external_id: ssoUser.externalId,
        permissions: JSON.stringify(['*'])
      })
      .select()
      .single()

    if (createError) {
      return { success: false, error: `Failed to create user: ${createError.message}` }
    }
    user = newUser
  } else if (!user) {
    return { success: false, error: 'User not found and JIT provisioning is disabled' }
  }

  if (!user.active) {
    return { success: false, error: 'Account is deactivated' }
  }

  const token = jwt.sign(
    {
      id: user.id,
      userId: user.id,
      email: user.email,
      role: user.role,
      company_id: user.company_id,
      sso_provider: config.provider,
      sso_verified: true
    },
    getJWTSecret(),
    { expiresIn: '12h' }
  )

  await supabase.from('activity_logs').insert({
    user_id: user.id,
    action: 'sso_login',
    entity_type: 'auth',
    details: `SSO login via ${config.provider}`,
    ip_address: null,
    user_agent: null
  })

  return {
    success: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      company_id: user.company_id,
      token
    }
  }
}

export async function testSSOConnection(config: SSOProviderConfig): Promise<{ success: boolean; message: string }> {
  try {
    if (config.protocol === 'oidc' && config.discovery_url) {
      const doc = await discoverOIDC(config.discovery_url)
      return {
        success: true,
        message: `Connected to ${doc.issuer}. Endpoints: auth=${doc.authorization_endpoint}, token=${doc.token_endpoint}`
      }
    }

    if (config.protocol === 'saml' && config.sso_url) {
      const response = await fetch(config.sso_url, { method: 'HEAD', signal: AbortSignal.timeout(10000) })
      return {
        success: response.ok || response.status === 405,
        message: `IdP endpoint reachable (status: ${response.status})`
      }
    }

    return { success: false, message: 'Incomplete SSO configuration' }
  } catch (error: any) {
    return { success: false, message: `Connection test failed: ${error.message}` }
  }
}

export function generateSPMetadataForCompany(
  config: SSOProviderConfig,
  acsUrl: string
): string {
  return generateSPMetadata(
    config.entity_id!,
    acsUrl,
    config.slo_url || undefined,
    config.x509_certificate || undefined
  )
}
