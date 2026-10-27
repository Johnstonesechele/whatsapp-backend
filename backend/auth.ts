import jwt, { SignOptions } from 'jsonwebtoken'
import { getJWTSecret } from "@/lib/jwt"

const JWT_SECRET = getJWTSecret()

export function verifyToken(token: string): any | null {
  try {
    return jwt.verify(token, JWT_SECRET)
  } catch (error) {
    console.error('Token verification failed:', error)
    return null
  }
}

export function generateToken(payload: any, expiresIn: string = '24h'): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn } as SignOptions)
}
