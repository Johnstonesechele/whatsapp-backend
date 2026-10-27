import { NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '@/backend/database/supabase-config'

/**
 * Confirm a record belongs to the caller's company before acting on it.
 *
 * WHY
 *
 * A route that loads a record by id and then updates or deletes it must first
 * establish ownership. Verifying the JWT only proves WHO is calling; it says
 * nothing about WHICH COMPANY the record belongs to.
 *
 * Found in app/api/leads/[id], where all four handlers skipped that check:
 *   GET    served another company's lead, name/email/phone, HTTP 200
 *   PATCH  wrote notes onto another company's lead
 *   PUT    overwrote another company's lead
 *   DELETE deleted another company's lead
 * The token was verified in every one. That is the failure mode - auth
 * without authorisation - and no foreign key or RLS policy would catch it,
 * because the database was being asked to perform a legitimate write.
 *
 * The refusal is 404, not 403. A 403 confirms the id exists somewhere, which
 * is itself a small leak and lets a caller enumerate valid ids across
 * tenants. A record you do not own should be indistinguishable from one that
 * does not exist.
 */
export async function assertSameCompany(
  recordId: string,
  companyId: string,
  table: string,
  idColumn = 'id'
): Promise<NextResponse | null> {
  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase
    .from(table)
    .select('id, company_id')
    .eq(idColumn, recordId)
    .maybeSingle()

  if (error) {
    console.error(`Ownership check failed on ${table}:`, error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
  if (!data || data.company_id !== companyId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return null
}

/**
 * The caller's own company_id, from their verified JWT subject.
 *
 * Returns null when the user no longer exists, so a deleted account cannot
 * keep operating on a stale token.
 */
export async function getCallerCompany(
  userId: string
): Promise<string | null> {
  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase
    .from('users')
    .select('company_id')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    console.error('Caller company lookup failed:', error)
    return null
  }
  return data?.company_id ?? null
}
