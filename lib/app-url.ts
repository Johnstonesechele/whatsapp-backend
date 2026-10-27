/**
 * The canonical origin for building absolute URLs in API routes.
 *
 * Why this exists
 *
 * Routes that hand a URL to a third party - PayPal return/cancel links, OAuth
 * callbacks, invitation emails, share links - need an absolute origin. They
 * were each reading `process.env.NEXT_PUBLIC_APP_URL` directly, and that
 * variable is not set in the deployed environment. Two different failures came
 * out of the same missing value:
 *
 *   setup-intent built `undefined/subscription?payment=success`
 *   checkout/session fell back to the literal `http://localhost:3000`
 *
 * The second is the dangerous one. It is a valid URL, so nothing errors: PayPal
 * happily accepts it as the return_url and, after a real approval, sends the
 * customer to `localhost:3000` - their own machine - instead of back to the
 * app. The payment still succeeds, so the failure is silent and looks like a
 * bug in the app rather than a missing environment variable.
 *
 * Resolution order
 *
 *   1. NEXT_PUBLIC_APP_URL - the explicit, correct answer when it is set.
 *   2. VERCEL_PROJECT_PRODUCTION_URL - Vercel injects this automatically for
 *      the production deployment, so it is the right production origin even
 *      with no configuration at all.
 *   3. VERCEL_URL - the host for this specific deployment, including preview
 *      builds, so a preview never leaks the production origin into a callback.
 *   4. The request's own Origin / Host headers - correct on any host, and the
 *      only source that works on a custom domain behind a proxy.
 *   5. http://localhost:3000 - last resort, so local development still works.
 *      This is only reachable when nothing above is present, i.e. genuinely
 *      local, and never on Vercel where 2-4 always resolve.
 *
 * Server-side callers that have a request in hand should pass it, so an
 * unrecognised host still produces a correct absolute URL instead of silently
 * falling through to localhost.
 */

const FALLBACK = 'http://localhost:3000'

function normalise(origin: string | null | undefined): string | null {
  if (!origin) return null
  const trimmed = origin.trim().replace(/\/+$/, '')
  if (!trimmed) return null

  /**
   * Treat the literal string 'undefined' as unset.
   *
   * next.config.mjs lists NEXT_PUBLIC_APP_URL under `env`, which inlines
   * NEXT_PUBLIC_* values into the bundle at BUILD time. When the variable is
   * absent from the environment, Next bakes in the string "undefined" rather
   * than omitting it - so process.env.NEXT_PUBLIC_APP_URL is the truthy string
   * "undefined", not undefined. A naive check accepts it as a real value and
   * every absolute URL in the app becomes "undefined/path".
   *
   * The same applies to the literal 'null', which some deployment setups write.
   */
  if (trimmed === 'undefined' || trimmed === 'null') return null

  // Vercel exposes bare hosts without a scheme.
  if (!/^https?:\/\//i.test(trimmed)) {
    // A preview deployment host is always https.
    return `https://${trimmed}`
  }
  return trimmed
}

/**
 * Resolve the app origin.
 *
 * @param request Optional incoming request. When provided, its Host/Origin
 *   headers are consulted before the hardcoded fallback, which keeps
 *   preview and custom-domain deployments correct.
 */
export function getAppUrl(request?: Request | { headers: Headers } | null): string {
  const candidates: Array<string | null | undefined> = [
    process.env.NEXT_PUBLIC_APP_URL,
    // Vercel-provided, always correct on Vercel and never needing config.
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
  ]

  if (request?.headers) {
    const headers = request.headers as Headers
    // Origin is the scheme+host the browser used; prefer it, then Host.
    const origin = headers.get('origin')
    const host = headers.get('host')
    const forwardedHost = headers.get('x-forwarded-host')
    const forwardedProto = headers.get('x-forwarded-proto')

    if (origin) candidates.push(origin)
    if (host) {
      const proto = forwardedProto || (host.includes('localhost') || host.startsWith('127.') ? 'http' : 'https')
      candidates.push(`${proto}://${host}`)
    }
    if (forwardedHost) {
      const proto = forwardedProto || 'https'
      candidates.push(`${proto}://${forwardedHost}`)
    }
  }

  for (const candidate of candidates) {
    const url = normalise(candidate)
    if (url) return url
  }

  return FALLBACK
}

/**
 * Build an absolute URL against the resolved origin.
 *
 * Keeps the path join honest: `appUrl('/subscription?x=1')` and
 * `appUrl('subscription', { x: '1' })` both work, and a leading slash on the
 * path is never doubled.
 */
export function appUrl(path = '', request?: Request | { headers: Headers } | null): string {
  const base = getAppUrl(request).replace(/\/+$/, '')
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  return `${base}${cleanPath}`
}
