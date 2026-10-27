import crypto from 'crypto'
import { getSupabaseAdminClient } from '@/backend/database/supabase-config'

const supabase = getSupabaseAdminClient()

export interface APIKey {
  id: string
  company_id: string
  user_id: string
  name: string
  key_prefix: string
  scopes: string[]
  is_active: boolean
  rate_limit: number
  usage_count: number
  last_used_at: string | null
  last_used_ip: string | null
  expires_at: string | null
  revoked: boolean
  created_at: string
}

interface CreateAPIKeyInput {
  name: string
  scopes?: string[]
  rate_limit?: number
  expires_at?: string
}

interface CreateAPIKeyResult {
  key: string
  keyData: APIKey
}

function generateAPIKey(): string {
  const randomPart = crypto.randomBytes(32).toString('hex')
  return `crmv_live_${randomPart}`
}

function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex')
}

export async function createAPIKey(
  companyId: string,
  userId: string,
  input: CreateAPIKeyInput
): Promise<CreateAPIKeyResult> {
  const rawKey = generateAPIKey()
  const keyHash = hashKey(rawKey)
  const keyPrefix = rawKey.substring(0, 16) + '...'

  const { data, error } = await supabase
    .from('api_keys')
    .insert({
      company_id: companyId,
      user_id: userId,
      name: input.name,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      scopes: input.scopes || [],
      permissions: input.scopes || [],
      is_active: true,
      rate_limit: input.rate_limit || 1000,
      usage_count: 0,
      expires_at: input.expires_at || null,
      revoked: false
    })
    .select()
    .single()

  if (error) throw error

  return { key: rawKey, keyData: data }
}

export async function listAPIKeys(companyId: string): Promise<APIKey[]> {
  const { data, error } = await supabase
    .from('api_keys')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function getAPIKeyById(keyId: string, companyId: string): Promise<APIKey | null> {
  const { data } = await supabase
    .from('api_keys')
    .select('*')
    .eq('id', keyId)
    .eq('company_id', companyId)
    .single()

  return data || null
}

export async function rotateAPIKey(
  keyId: string,
  companyId: string
): Promise<CreateAPIKeyResult> {
  const existing = await getAPIKeyById(keyId, companyId)
  if (!existing) throw new Error('API key not found')

  const rawKey = generateAPIKey()
  const keyHash = hashKey(rawKey)
  const keyPrefix = rawKey.substring(0, 16) + '...'

  const { error: revokeError } = await supabase
    .from('api_keys')
    .update({ revoked: true, revoked_at: new Date().toISOString(), is_active: false })
    .eq('id', keyId)

  if (revokeError) throw revokeError

  const { data, error } = await supabase
    .from('api_keys')
    .insert({
      company_id: companyId,
      user_id: existing.user_id,
      name: `${existing.name} (rotated)`,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      scopes: existing.scopes,
      permissions: existing.scopes,
      is_active: true,
      rate_limit: existing.rate_limit,
      usage_count: 0,
      expires_at: existing.expires_at,
      revoked: false
    })
    .select()
    .single()

  if (error) throw error
  return { key: rawKey, keyData: data }
}

export async function revokeAPIKey(keyId: string, companyId: string): Promise<boolean> {
  const { error } = await supabase
    .from('api_keys')
    .update({ revoked: true, revoked_at: new Date().toISOString(), is_active: false })
    .eq('id', keyId)
    .eq('company_id', companyId)

  return !error
}

export async function toggleAPIKey(keyId: string, companyId: string): Promise<boolean> {
  const existing = await getAPIKeyById(keyId, companyId)
  if (!existing) return false

  const { error } = await supabase
    .from('api_keys')
    .update({ is_active: !existing.is_active })
    .eq('id', keyId)
    .eq('company_id', companyId)

  return !error
}

export async function validateAPIKey(apiKey: string): Promise<{
  valid: boolean
  companyId?: string
  userId?: string
  scopes?: string[]
  rateLimit?: number
  keyId?: string
}> {
  const keyHash = hashKey(apiKey)

  const { data } = await supabase
    .from('api_keys')
    .select('id, company_id, user_id, scopes, rate_limit, is_active, revoked, expires_at, usage_count')
    .eq('key_hash', keyHash)
    .single()

  if (!data) return { valid: false }
  if (!data.is_active || data.revoked) return { valid: false }
  if (data.expires_at && new Date(data.expires_at) < new Date()) return { valid: false }

  // usage_count is incremented in the database, not by reading it here.
  //
  // The old code selected the row, then wrote `(data as any).usage_count + 1`
  // - but usage_count was never in that SELECT, so the value was undefined,
  // the sum was NaN, and it wrote NaN into an integer column.
  //
  // A single update with usage_count now selected (above) fixes the NaN
  // without needing a database function. It is still a read-then-write, so
  // two simultaneous requests can undercount by one; that is acceptable for
  // an advisory usage figure and avoids adding a SECURITY DEFINER function
  // to the schema just to increment a counter.
  await supabase
    .from('api_keys')
    .update({
      usage_count: ((data as any).usage_count ?? 0) + 1,
      last_used_at: new Date().toISOString()
    })
    .eq('id', data.id)

  return {
    valid: true,
    companyId: data.company_id,
    userId: data.user_id,
    scopes: data.scopes,
    rateLimit: data.rate_limit,
    keyId: data.id
  }
}

export async function trackAPIUsage(
  keyId: string,
  companyId: string,
  endpoint: string,
  method: string,
  statusCode: number,
  ip?: string
): Promise<void> {
  await supabase.from('api_usage').insert({
    api_key_id: keyId,
    company_id: companyId,
    endpoint,
    method,
    status_code: statusCode,
    ip_address: ip
  })
}
