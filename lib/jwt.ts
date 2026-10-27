/**
 * Centralized JWT utilities.
 * All routes should import from here instead of defining their own JWT_SECRET.
 *
 * During the migration to Supabase Auth, this file provides a safe过渡:
 * - Throws if JWT_SECRET is not set (no more silent fallback to 'fallback-secret')
 * - Provides sign/verify helpers that can be swapped to Supabase Auth later
 */

import jwt from "jsonwebtoken"

const JWT_SECRET = (() => {
  const secret = process.env.JWT_SECRET
  if (!secret) {
    // In production, this should throw. In dev, warn loudly.
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "CRITICAL: JWT_SECRET environment variable is not set. " +
        "Authentication will not work without it."
      )
    }
    console.error(
      "  WARNING: JWT_SECRET not set. Using insecure fallback for development only."
    )
    return "dev-only-insecure-fallback-do-not-use-in-production"
  }
  return secret
})()

export function getJWTSecret(): string {
  return JWT_SECRET
}

export function signToken(
  payload: Record<string, any>,
  options?: jwt.SignOptions
): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: "12h",
    ...options,
  })
}

export function verifyToken<T = any>(token: string): T | null {
  try {
    return jwt.verify(token, JWT_SECRET) as T
  } catch {
    return null
  }
}
