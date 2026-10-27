"use client"

import { useCallback } from "react"

/**
 * Mapping from Next.js API route prefixes to Supabase Edge Function names.
 * Lightweight CRUD routes run at the edge (~30ms); everything else falls
 * through to the local Next.js API server.
 */
const EDGE_FUNCTION_MAP: Record<string, string> = {
  "/api/contacts": "contacts-crud",
  "/api/campaigns": "campaigns-crud",
  "/api/services": "services-crud",
  "/api/surveys": "surveys-crud",
  "/api/documents": "documents-crud",
  "/api/automations": "automations-crud",
  "/api/notifications": "notifications-crud",
  "/api/settings/company": "settings-crud",
  "/api/team-members": "team-management",
  "/api/security": "security-audit",
  "/api/whatsapp/connection-status": "whatsapp-connection",
}

function resolveEdgeFunction(path: string): string | null {
  // Check longest prefix first (e.g. /api/settings/company before /api/settings)
  const sorted = Object.keys(EDGE_FUNCTION_MAP).sort((a, b) => b.length - a.length)
  for (const prefix of sorted) {
    if (path === prefix || path.startsWith(prefix + "/") || path.startsWith(prefix + "?")) {
      return EDGE_FUNCTION_MAP[prefix]
    }
  }
  return null
}

/**
 * Get CSRF token from cookie
 */
function getCsrfToken(): string | null {
  if (typeof window === "undefined") return null
  const cookies = document.cookie.split(";")
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split("=")
    if (name === "csrf_token") return value
  }
  return null
}

/**
 * Hook that provides API methods with automatic auth token handling.
 * Routes lightweight CRUD requests to Supabase Edge Functions when configured,
 * falling back to local Next.js API routes for heavy operations.
 *
 * @example
 * const { get, post } = useApi()
 * const { data, error } = await get("/api/contacts")
 * const { data, error } = await post("/api/ai/chat", { messages })
 */
export function useApi() {
  const getToken = useCallback(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("auth_token")
      // A stored value that is not a JWT is a placeholder. Returning it would
      // produce the header "Bearer null", which the server cannot verify.
      if (!stored || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(stored)) {
        return null
      }
      return stored
    }
    return null
  }, [])

  const request = useCallback(
    async <T = any>(
      path: string,
      options: RequestInit = {}
    ): Promise<{ data: T | null; error: string | null }> => {
      // No early return on a missing token.
      //
      // The session is an httpOnly cookie, so there is no token for script to
      // read in the normal case. Bailing out here meant useApi - the hook behind
      // almost every dashboard request - returned "Not authenticated" WITHOUT
      // making the request, and the page rendered empty for a user who was
      // correctly signed in. The cookie authenticates it.
      const token = getToken()

      // Determine target URL: edge function or local Next.js API
      const functionsUrl = typeof window !== "undefined"
        ? (process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL || "").replace(/\/+$/, "")
        : ""

      let targetUrl: string
      const edgeFunction = functionsUrl ? resolveEdgeFunction(path) : null

      if (edgeFunction && functionsUrl) {
        // Route to edge function, preserving query string
        const qIndex = path.indexOf("?")
        const queryString = qIndex >= 0 ? path.substring(qIndex) : ""
        targetUrl = `${functionsUrl}/${edgeFunction}${queryString}`
      } else {
        targetUrl = path
      }

      const method = (options.method || "GET").toUpperCase()

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(options.headers as Record<string, string>),
      }
      if (token) headers.Authorization = `Bearer ${token}`

      // Add CSRF token for state-changing requests to local API routes
      if (!edgeFunction && method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
        const csrfToken = getCsrfToken()
        if (csrfToken) {
          headers["X-CSRF-Token"] = csrfToken
        }
      }

      // Supabase Edge Functions require the apikey header
      if (edgeFunction && functionsUrl) {
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        if (anonKey) {
          headers["apikey"] = anonKey
        }
      }

      try {
        const response = await fetch(targetUrl, {
        ...options,
        headers,
        // Without this the browser does not send the httpOnly session cookie at
        // all, and every request is anonymous. This is the single line that
        // makes cookie authentication work; the header above is only a
        // compatibility path for a legacy stored token.
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
    },
    [getToken]
  )

  return {
    get: <T = any>(path: string) => request<T>(path, { method: "GET" }),
    post: <T = any>(path: string, body: any) =>
      request<T>(path, { method: "POST", body: JSON.stringify(body) }),
    put: <T = any>(path: string, body: any) =>
      request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
    del: <T = any>(path: string, body?: any) =>
      request<T>(path, {
        method: "DELETE",
        body: body ? JSON.stringify(body) : undefined,
      }),
  }
}
