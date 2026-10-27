import jwt from 'jsonwebtoken'
import { getJWTSecret } from '@/lib/jwt'
import { NextResponse } from 'next/server'

/**
 * Resolve the caller's company for an authenticated API route.
 *
 * Every automations route previously did its own version of this: some read
 * company_id straight from the JWT, others looked the user up in the `users`
 * table. When those disagree, a route can silently read the wrong tenant's
 * automations or fail with a confusing 403. One helper, one rule:
 *
 *   company_id comes from the verified JWT, and from nowhere else.
 *
 * Returns either `{ companyId, userId }` or a NextResponse to return directly.
 */
export function resolveCompany(request: Request):
  | { companyId: string; userId: string }
  | { error: NextResponse } {

  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 }) }
  }

  const token = authHeader.slice('Bearer '.length)
  const secret = getJWTSecret()
  if (!secret) {
    return {
      error: NextResponse.json({ success: false, error: 'Server configuration error' }, { status: 500 }),
    }
  }

  let decoded: any
  try {
    decoded = jwt.verify(token, secret)
  } catch {
    return { error: NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 }) }
  }

  // company_id is accepted from the token only. It is never read from a
  // request body, query string or header a client controls.
  const companyId = decoded.company_id || decoded.companyId
  const userId = decoded.userId || decoded.id
  if (!companyId || !userId) {
    return { error: NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 }) }
  }

  return { companyId, userId }
}
