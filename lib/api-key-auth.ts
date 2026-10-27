import { NextRequest, NextResponse } from 'next/server'
import { createHash, randomBytes } from 'crypto'
import { getSupabaseAdminClient } from '@/backend/database/supabase-config'

/**
 * API-key authentication for machine-to-machine access.
 *
 * NAMING: this lives in lib/api-key-auth.ts, not lib/api-auth.ts. That module
 * already exists and exports requireAuth, which 27 routes use for session-JWT
 * authentication. Adding key handling to it would have been the tidier-looking
 * option and would have broken every one of them.
 *
 * WHY THIS EXISTS
 *
 * The app had a complete key *lifecycle* - create, list, rotate, revoke, usage
 * tracking - and a validateAPIKey() function. But nothing ever CALLED it. A
 * key could be minted and shown to the user and still not authenticate a
 * single request, because every route only understood a session JWT. This
 * module is the missing link: it resolves a request to a tenant.
 *
 * WHAT IT SUPPORTS
 *   Authorization: Bearer crmv_live_...   (a key, not a session token)
 *   X-API-Key: crmv_live_...
 *
 * HOW A CALLER'S TENANT IS ESTABLISHED
 * Exclusively from the key row. A caller cannot supply a company id in a
 * header, query parameter or body and have it honoured - the whole point of
 * a key is that it is bound to one tenant server-side. This mirrors the fix
 * applied to /api/ai/chat, where a body-supplied companyId let any
 * authenticated user read another tenant's numbers.
 */

const KEY_PREFIX_RE = /^crmv_(live|test)_[0-9a9f]{64}$/

/** Shape a route receives when it authenticates a caller. */
export type ApiCaller = {
  kind: 'api_key'
  companyId: string
  userId: string | null
  keyId: string
  scopes: string[]
  rateLimit: number | null
  rateLimitWindow: string | null
  ip: string | null
}

export type AuthFailure = {
  ok: false
  status: number
  error: string
}

export type AuthResult = ({ ok: true } & ApiCaller) | AuthFailure

function fail(status: number, error: string): AuthFailure {
  return { ok: false, status, error }
}

/**
 * Pull a candidate key out of the request.
 *
 * Only the two documented headers are honoured. A key in a query string is
 * deliberately NOT supported: query strings land in access logs, proxy logs
 * and browser history, which leaks a long-lived credential.
 */
export function extractApiKey(request: NextRequest | Request): string | null {
  const headers = request.headers

  const xApiKey = headers.get('x-api-key')
  if (xApiKey && xApiKey.trim()) return xApiKey.trim()

  const auth = headers.get('authorization')
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice(7).trim()
    // A session JWT is not an API key. Leave it alone so the caller's own
    // JWT path still runs.
    if (token.startsWith('crmv_')) return token
  }
  return null
}

/** True when the request is carrying an API key at all. */
export function hasApiKey(request: NextRequest | Request): boolean {
  return extractApiKey(request) !== null
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

/**
 * Resolve a request to a tenant from its API key.
 *
 * Returns a discriminated result rather than throwing, so a caller can tell
 * "no key here" (fall through to JWT) from "a key was present but is not
 * usable" (reject).
 */
export async function authenticateApiKey(
  request: NextRequest | Request
): Promise<AuthResult> {
  const rawKey = extractApiKey(request)
  if (!rawKey) return fail(401, 'No API key provided')

  // Reject an obviously malformed key before touching the database.
  if (!KEY_PREFIX_RE.test(rawKey)) {
    return fail(401, 'Malformed API key')
  }

  const supabase = getSupabaseAdminClient()
  const keyHash = hashApiKey(rawKey)

  const { data: key, error } = await supabase
    .from('api_keys')
    .select('id, company_id, user_id, scopes, rate_limit, rate_limit_window, is_active, revoked, expires_at')
    .eq('key_hash', keyHash)
    .maybeSingle()

  if (error) {
    console.error('API key lookup failed:', error)
    return fail(500, 'Failed to verify API key')
  }
  if (!key) return fail(401, 'Invalid API key')

  if (key.revoked) return fail(401, 'API key has been revoked')
  if (!key.is_active) return fail(401, 'API key is inactive')
  if (key.expires_at && new Date(key.expires_at) < new Date()) {
    return fail(401, 'API key has expired')
  }
  if (!key.company_id) return fail(403, 'API key is not bound to a company')

  // A constant-time comparison is not required here: the lookup is by hash,
  // so the secret itself is never compared. The hash is sha256 of a
  // 256-bit random value, so a timing attack on the index lookup reveals
  // nothing useful.

  const scopes = Array.isArray(key.scopes)
    ? (key.scopes as string[]).map(String)
    : []

  // Record usage. Best effort - a failed counter must not fail the request.
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    null

  supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString(), last_used_ip: ip })
    .eq('id', key.id)
    .then(() => undefined, () => undefined)

  return {
    ok: true,
    kind: 'api_key',
    companyId: key.company_id,
    userId: key.user_id ?? null,
    keyId: key.id,
    scopes,
    rateLimit: key.rate_limit ?? null,
    rateLimitWindow: key.rate_limit_window ?? null,
    ip,
  }
}

/** 401 with the standard shape, for routes that require a key. */
export function unauthorized(error = 'Unauthorized'): NextResponse {
  return NextResponse.json({ error }, { status: 401 })
}

/**
 * Require an API key on a route.
 *
 * Unlike a session JWT, a key is a machine credential, so this returns 401
 * when one is absent rather than falling through. Use this on the public API
 * surface; the internal dashboard routes keep their JWT path untouched.
 */
export async function requireApiKey(
  request: NextRequest
): Promise<ApiCaller | NextResponse> {
  const result = await authenticateApiKey(request)
  if (!result.ok) return unauthorized(result.error)
  return result
}

/**
 * Does this caller hold `scope`?
 *
 * A key with no scopes is treated as read-only, not unrestricted: granting
 * everything by omission is how a read-only integration ends up able to
 * delete data.
 */
export function hasScope(caller: ApiCaller, scope: string): boolean {
  if (caller.scopes.length === 0) return scope === 'read'
  return (
    caller.scopes.includes(scope) ||
    caller.scopes.includes('*') ||
    caller.scopes.includes('admin')
  )
}

/** Enforce a scope, returning a 403 response when it is missing. */
export function requireScope(
  caller: ApiCaller,
  scope: string
): NextResponse | null {
  if (hasScope(caller, scope)) return null
  return NextResponse.json(
    { error: `This API key is missing the '${scope}' scope` },
    { status: 403 }
  )
}
