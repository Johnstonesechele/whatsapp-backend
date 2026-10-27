/**
 * Server-side auth extraction utility for API routes.
 * Extracts and verifies JWT from either Authorization header or auth_token cookie.
 * Returns decoded user payload or throws appropriate error response.
 */

import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { getJWTSecret } from '@/lib/jwt'

export interface AuthUser {
  userId: string
  email: string
  role: string
  company_id: string
  [key: string]: any
}

export function extractAuthToken(request: NextRequest): string | null {
  // Try Authorization header first
  const authHeader = request.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7)
  }

  // Fallback to cookie
  const cookieToken = request.cookies.get('auth_token')?.value
  if (cookieToken) {
    return cookieToken
  }

  return null
}

export function verifyAuthToken(token: string): AuthUser | null {
  try {
    const decoded = jwt.verify(token, getJWTSecret()) as any
    return {
      userId: decoded.userId || decoded.user_id || decoded.id,
      email: decoded.email,
      role: decoded.role,
      company_id: decoded.company_id,
      ...decoded
    }
  } catch {
    return null
  }
}

export function getAuthUser(request: NextRequest): AuthUser | null {
  const token = extractAuthToken(request)
  if (!token) return null
  return verifyAuthToken(token)
}

export function requireAuth(request: NextRequest): { user: AuthUser } | { error: NextResponse } {
  const user = getAuthUser(request)
  if (!user) {
    return {
      error: NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }
  }
  return { user }
}
