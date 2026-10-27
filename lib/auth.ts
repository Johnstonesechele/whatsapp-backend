import jwt from 'jsonwebtoken'
import { getJWTSecret } from "@/lib/jwt"


export function verifyAuth(token: string): { userId: string } | null {
  try {
    const decoded = jwt.verify(token, getJWTSecret()) as any
    return { userId: decoded.userId }
  } catch (error) {
    return null
  }
}

export function signAuth(payload: { userId: string }): string {
  return jwt.sign(payload, getJWTSecret(), { expiresIn: '7d' })
}
