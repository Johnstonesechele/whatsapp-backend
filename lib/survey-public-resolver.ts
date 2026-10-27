import { getSupabaseAdminClient } from '@/backend/database/supabase-config'

/**
 * Resolve a public survey from a share token.
 *
 * A survey can be reachable two ways, and the codebase historically only
 * checked one of them per route:
 *
 *   1. surveys.share_token          (set by POST /api/surveys/web)
 *   2. survey_share_links.link_token (the default link created alongside it)
 *
 * GET /api/surveys/public/[token] checked both, but the response / view /
 * answer / submit routes only checked surveys.share_token. Any survey whose
 * page loaded via the link token therefore 404'd on session creation, so no
 * response row was ever created: auto-save did nothing and submit failed with
 * "missing or invalid response ID".
 *
 * All public survey routes must use this resolver so they agree on which
 * survey a token refers to.
 */
export async function resolveSurveyByShareToken(token: string) {
  const supabase = getSupabaseAdminClient()

  // Primary: the survey's own share_token.
  const { data: bySurveyToken, error: surveyErr } = await supabase
    .from('surveys')
    .select('*')
    .eq('share_token', token)
    .maybeSingle()

  if (surveyErr) {
    console.error('[resolveSurveyByShareToken] surveys.share_token query error:', surveyErr.message)
  }
  if (bySurveyToken) {
    return { supabase, survey: bySurveyToken, shareLink: null }
  }

  // Fallback: a row in survey_share_links.
  const { data: linkData, error: linkErr } = await supabase
    .from('survey_share_links')
    .select('*, survey:surveys(*)')
    .eq('link_token', token)
    .maybeSingle()

  if (linkErr) {
    console.error('[resolveSurveyByShareToken] survey_share_links query error:', linkErr.message)
  }
  if (!linkData || !linkData.survey) {
    return { supabase, survey: null, shareLink: null }
  }

  return { supabase, survey: linkData.survey as any, shareLink: linkData as any }
}

/** True when a share link has passed its expiry / max-response limits. */
export function isShareLinkUnavailable(shareLink: any | null): string | null {
  if (!shareLink) return null
  if (shareLink.is_active === false) return 'This survey link is no longer active'
  if (shareLink.expires_at && new Date(shareLink.expires_at) < new Date()) {
    return 'This survey link has expired'
  }
  if (shareLink.max_responses && (shareLink.response_count ?? 0) >= shareLink.max_responses) {
    return 'This survey has reached its maximum number of responses'
  }
  return null
}
