/**
 * The session cookie options, in one place.
 *
 * WHY NOT HARDCODE secure: true
 *
 * A cookie with the Secure attribute is only stored over HTTPS. That is
 * correct - and required - in production, where the cookie carries the session
 * and must never cross a plaintext connection.
 *
 * It also means the cookie is silently DISCARDED on http://localhost, so a
 * developer signing in locally appears to be signed out: the network panel
 * shows a 201 with Set-Cookie, and the browser drops it. This was verified:
 * after a successful signup the only cookie present was csrf_token, and every
 * protected route redirected to /login.
 *
 * So the flag follows the environment rather than being an assumption.
 */
export function sessionCookieOptions(maxAgeSeconds = 12 * 60 * 60) {
  return {
    httpOnly: true,
    // Secure cookies are refused over plain http, which includes localhost.
    // Detection is by request protocol, not NODE_ENV, because a preview
    // deployment is NODE_ENV=production but may sit behind plain http.
    secure: true,
    sameSite: 'strict' as const,
    maxAge: maxAgeSeconds,
    path: '/',
  }
}

/** Same options, with Secure dropped for a request that arrived over http. */
export function sessionCookieOptionsFor(protocol?: string | null) {
  const opts = sessionCookieOptions()
  if (protocol && protocol !== 'https:') {
    return { ...opts, secure: false }
  }
  return opts
}
