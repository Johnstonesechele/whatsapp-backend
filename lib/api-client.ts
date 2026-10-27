/**
 * API Client helper for making authenticated requests with CSRF protection.
 * Use this for direct fetch calls outside of the useApi hook.
 */

/**
 * Get CSRF token from cookie
 */
export function getCsrfToken(): string | null {
  if (typeof window === "undefined") return null
  const cookies = document.cookie.split(";")
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split("=")
    if (name === "csrf_token") return value
  }
  return null
}

/**
 * A legacy stored token, if there is a real one.
 *
 * The session is an httpOnly cookie, so this is normally null: script cannot
 * read the session, and the cookie authenticates every request. The shape check
 * matters because a stored value that is not a JWT is a placeholder, and
 * interpolating one produces the literal header "Bearer null" - which the
 * server cannot verify, and which returned 500 rather than 401 on production.
 */
export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null
  const stored = localStorage.getItem("auth_token")
  if (!stored || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(stored)) {
    return null
  }
  return stored
}

/**
 * Make an authenticated API request with CSRF protection
 */
export async function apiRequest<T = any>(
  url: string,
  options: RequestInit = {}
): Promise<{ data: T | null; error: string | null }> {
  // No early return on a missing token.
  //
  // This bailed out before making the request whenever localStorage had no
  // token, which is the normal state for an httpOnly session: every request
  // returned "Not authenticated" without ever reaching the server, and the
  // caller rendered an empty page for a user who was correctly signed in.
  //
  // The cookie authenticates the request. An Authorization header is added
  // only when a genuine token exists to put in it.
  const token = getAuthToken()

  const method = (options.method || "GET").toUpperCase()

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  }
  if (token) headers.Authorization = `Bearer ${token}`

  // Add CSRF token for state-changing requests
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
    const csrfToken = getCsrfToken()
    if (csrfToken) {
      headers["X-CSRF-Token"] = csrfToken
    }
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      // The httpOnly session cookie is only sent when the request opts in.
      // Without this the browser treats the call as cross-site and drops it,
      // and the request is anonymous however valid the session is.
      credentials: options.credentials ?? "include",
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: "Failed" }))
      return { data: null, error: err.error || `HTTP ${response.status}` }
    }
    return { data: await response.json(), error: null }
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : "Network error" }
  }
}
