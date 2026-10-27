/**
 * Client-side auth token utilities.
 *
 * WHY THERE IS NO TOKEN TO READ
 *
 * The session is an httpOnly cookie. Script cannot read it - that is what makes
 * it resistant to XSS token theft - so there is nothing here to get.
 *
 * This module used to return localStorage.getItem("auth_token"), and callers
 * built `Authorization: Bearer ${token}` from it. Two things followed from
 * that, both observed on production:
 *
 *  1. With no stored token, getAuthHeaders() returned {} and roughly 200 call
 *     sites skipped the request entirely, so pages silently showed empty data
 *     to a user who was correctly signed in.
 *
 *  2. Where a guard was missing, the template literal produced the literal
 *     string "Bearer null". The server tried to verify the string "null" and
 *     returned 500 rather than 401. Middleware now replaces a junk bearer with
 *     the cookie, so the failure is masked, but the string must never be sent.
 *
 * The cookie is attached by the browser because every call uses
 * `credentials: "include"`. Callers do not need to do anything for auth; they
 * only need to stop sending a header they cannot honestly produce.
 */

/** True when a bearer header would carry a placeholder rather than a token. */
export function isJunkBearer(value: string | null | undefined): boolean {
  if (!value) return true
  if (!value.startsWith('Bearer ')) return false
  const inner = value.slice(7).trim()
  return inner === '' || inner === 'null' || inner === 'undefined' || inner === 'NaN'
}

/**
 * A token for callers that still want one.
 *
 * Kept because 32 call sites use it, and removing an export that 32 files
 * depend on is a change with 32 chances to break a page. What changed is the
 * contract: this returns null in the normal browser case, because there is
 * nothing for script to read.
 *
 * A caller's `if (!token) return` now means "no legacy stored token", not "no
 * session" - so those guards must not be what decides whether to fetch. The
 * fetch itself is what authenticates, through the cookie.
 *
 * The guard that actually matters is the one against sending a placeholder:
 * isJunkBearer() below, and the same check in middleware.
 */
export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  const stored = window.localStorage.getItem('auth_token')
  // A stored value is only trusted if it looks like a JWT. Anything else is a
  // placeholder that would produce a header the server cannot verify.
  if (!stored || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(stored)) {
    return null
  }
  return stored
}

/**
 * Headers for an authenticated fetch.
 *
 * A header is added only when there is a real token to put in it. Returning {}
 * rather than a junk bearer is the point: the cookie authenticates the
 * request, and a placeholder header can only make it worse.
 */
export function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken()
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

/**
 * Credentials for an authenticated fetch.
 *
 * Use this. `credentials: 'include'` is what actually sends the httpOnly
 * session to the server; a bearer header built from localStorage never was.
 */
export function withCredentials(headers?: HeadersInit): RequestInit {
  return { credentials: 'include', headers }
}
