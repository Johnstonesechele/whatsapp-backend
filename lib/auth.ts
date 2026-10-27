import jwt from 'jsonwebtoken'
import { getJWTSecret } from "@/lib/jwt"

const JWT_SECRET = getJWTSecret()

export function verifyAuth(token: string): { userId: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any
    return { userId: decoded.userId }
  } catch (error) {
    return null
  }
}

export function signAuth(payload: { userId: string }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' })
}
