import crypto from 'crypto'
import { getSupabaseAdminClient } from '@/backend/database/supabase-config'

/**
 * Invitation token lifecycle.
 *
 * The problem this fixes
 *
 * Invitations were issued with a 7-day expiry, but "resend" reused the ORIGINAL
 * token. So once a link expired, every resend mailed the same dead link - the
 * invitee could never onboard, and the admin had no way to fix it short of
 * deleting the user and inviting again.
 *
 * The reminder route also never looked at invitation_expires_at at all, so it
 * cheerfully mailed an expired link and reported success.
 *
 * The rule here: issuing a token always produces a FRESH one. There is no
 * "resend the same link" path, because that is exactly the failure being fixed.
 */

const INVITE_TTL_DAYS = 7

export type InviteSubject = {
  userId: string
  email: string
  name: string | null
  role: string | null
  previousToken: string | null
  expiresAt: string | null
}

export type TokenResult =
  | { ok: true; token: string; expiresAt: string; isNew: boolean }
  | { ok: false; status: number; error: string }

/** Fresh token plus a fresh expiry. Always a new value - never reused. */
export function generateInvitation(): { token: string; expiresAt: string } {
  const token = crypto.randomBytes(32).toString('hex')
  const expires = new Date()
  expires.setDate(expires.getDate() + INVITE_TTL_DAYS)
  return { token, expiresAt: expires.toISOString() }
}

export function invitationUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return `${base}/invitation/accept?token=${token}`
}

/** Has this invitation lapsed? Null expiry means no deadline was recorded. */
export function isExpired(expiresAt: string | null | undefined): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt).getTime() < Date.now()
}

/** Whole days left, floored at 0. */
export function daysUntilExpiry(expiresAt: string | null | undefined): number {
  if (!expiresAt) return INVITE_TTL_DAYS
  const ms = new Date(expiresAt).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / 86_400_000))
}

/**
 * Load an invitee by id, scoped to the company that owns them.
 *
 * Scoping matters: the reminder route is reachable by any admin, and without
 * the company filter an admin could mint a fresh link for somebody else's
 * invitee and mail it to an address of their choosing.
 */
export async function loadInvitee(
  userId: string,
  companyId: string
): Promise<{ ok: true; invitee: InviteSubject } | { ok: false; status: number; error: string }> {
  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase
    .from('users')
    .select('id, email, name, role, invitation_token, invitation_expires_at, active')
    .eq('id', userId)
    .eq('company_id', companyId)
    .maybeSingle()

  if (error) {
    console.error('loadInvitee failed:', error)
    return { ok: false, status: 500, error: 'Failed to load invitation' }
  }
  if (!data) {
    return { ok: false, status: 404, error: 'Invitation not found' }
  }
  return {
    ok: true,
    invitee: {
      userId: data.id,
      email: data.email,
      name: data.name,
      role: data.role,
      previousToken: data.invitation_token ?? null,
      expiresAt: data.invitation_expires_at ?? null,
    },
  }
}

/**
 * Mint a new token for an invitee and persist it.
 *
 * `onlyIfExpired` is used by the reminder route: a reminder for a still-valid
 * invitation re-issues anyway (so the emailed link is the one that works), but
 * an admin explicitly re-sending knows what they are doing. The distinction is
 * reported back so the caller can word the email honestly.
 */
export async function reissueInvitation(
  userId: string,
  companyId: string
): Promise<TokenResult> {
  const loaded = await loadInvitee(userId, companyId)
  if (!loaded.ok) return { ok: false, status: loaded.status, error: loaded.error }

  if (!loaded.invitee.previousToken) {
    return {
      ok: false,
      status: 400,
      error: 'This invitation has already been accepted',
    }
  }

  const wasExpired = isExpired(loaded.invitee.expiresAt)
  const { token, expiresAt } = generateInvitation()

  const supabase = getSupabaseAdminClient()
  const { error } = await supabase
    .from('users')
    .update({ invitation_token: token, invitation_expires_at: expiresAt, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .eq('company_id', companyId)

  if (error) {
    console.error('reissueInvitation failed:', error)
    return { ok: false, status: 500, error: 'Failed to reissue invitation' }
  }

  return { ok: true, token, expiresAt, isNew: wasExpired }
}
