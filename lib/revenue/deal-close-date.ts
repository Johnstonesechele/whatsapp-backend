/**
 * When did a deal actually close?
 *
 * Historical rows predate the fix that stamps `actual_close_date` on close,
 * so most won deals have it NULL. Several revenue endpoints fell back to
 * `updated_at` to compensate, which is wrong: editing a deal for any reason
 * - a note, a stage nudge, a correction - silently moved it into the month
 * it was last touched, so July revenue appeared in August and forecasting
 * buckets drifted.
 *
 * The order below is deliberate:
 *   1. actual_close_date - written on close, authoritative
 *   2. won_at            - written on close by the cascade path
 *   3. created_at        - when the deal was created; the closest real signal
 *                          for legacy rows, and stable under later edits
 *
 * `updated_at` is intentionally NOT used. It changes whenever the row is
 * touched, which is exactly the bug this replaces.
 */
export function getDealCloseDate(deal: {
  actual_close_date?: string | null
  won_at?: string | null
  created_at?: string | null
}): Date | null {
  const raw = deal.actual_close_date || deal.won_at || deal.created_at
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Has this row ever been closed with a recorded date?
 *
 * A deal can be `closed_won` while having no date at all (created before the
 * fix, or created with no timestamps). Callers that need to be honest about
 * uncertainty - rather than silently placing the deal in a month - should
 * check this and report the deal as undated.
 */
export function hasRecordedCloseDate(deal: {
  actual_close_date?: string | null
  won_at?: string | null
}): boolean {
  return Boolean(deal.actual_close_date || deal.won_at)
}
