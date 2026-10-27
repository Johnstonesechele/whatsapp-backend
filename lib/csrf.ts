/**
 * CSRF Protection using Double-Submit Cookie Pattern.
 *
 * How it works:
 * 1. Server generates a random CSRF token and sets it as a cookie
 * 2. Client reads the cookie and includes the token in X-CSRF-Token header
 * 3. Server verifies that the header value matches the cookie value
 *
 * This is safe because an attacker on a different origin cannot read cookies
 * (due to SameSite) or set custom headers (due to CORS).
 *
 * Uses Web Crypto API for Edge runtime compatibility.
 */
import { NextRequest, NextResponse } from 'next/server'

const CSRF_COOKIE_NAME = 'csrf_token'
const CSRF_HEADER_NAME = 'x-csrf-token'
const CSRF_TOKEN_LENGTH = 32

/**
 * Generate a random hex string using Web Crypto API (Edge-compatible).
 */
function generateRandomHex(length: number): string {
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Generate a new CSRF token and set it as a cookie on the response.
 */
export function setCsrfCookie(response: NextResponse): NextResponse {
  const token = generateRandomHex(CSRF_TOKEN_LENGTH)
  response.cookies.set(CSRF_COOKIE_NAME, token, {
    httpOnly: false, // Must be readable by JavaScript to include in header
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60, // 1 hour
  })
  return response
}

/**
 * Verify that the CSRF token in the request header matches the cookie.
 * Returns true if valid, false if missing or mismatched.
 */
export function verifyCsrfToken(request: NextRequest): boolean {
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value
  const headerToken = request.headers.get(CSRF_HEADER_NAME)

  if (!cookieToken || !headerToken) return false

  // Simple string comparison (timing-safe comparison not critical for CSRF)
  // since the token is in a cookie the attacker can't read anyway
  return cookieToken === headerToken
}

/**
 * Middleware helper: verify CSRF for state-changing requests.
 * Returns null if valid, or a 403 response if invalid.
 */
export function requireCsrf(request: NextRequest): NextResponse | null {
  const method = request.method.toUpperCase()

  // Only check CSRF for state-changing methods
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return null
  }

  if (!verifyCsrfToken(request)) {
    return NextResponse.json(
      { error: 'Invalid or missing CSRF token' },
      { status: 403 }
    )
  }

  return null
}

export const CSRF_COOKIE = CSRF_COOKIE_NAME
export const CSRF_HEADER = CSRF_HEADER_NAME
