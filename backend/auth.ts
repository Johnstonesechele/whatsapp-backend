import jwt, { SignOptions } from 'jsonwebtoken'
import { getJWTSecret } from "@/lib/jwt"


export function verifyToken(token: string): any | null {
  try {
    return jwt.verify(token, getJWTSecret())
  } catch (error) {
    console.error('Token verification failed:', error)
    return null
  }
}

export function generateToken(payload: any, expiresIn: string = '24h'): string {
  return jwt.sign(payload, getJWTSecret(), { expiresIn } as SignOptions)
}
