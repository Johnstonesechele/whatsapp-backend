import { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'
import { getJWTSecret } from '@/lib/jwt'
import { subscribeToWhatsAppConnections } from '@/backend/services/whatsapp-events'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const cookieToken = request.cookies.get('auth_token')?.value
  const authHeader = request.headers.get('authorization')
  const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  const token = cookieToken || headerToken

  if (!token) {
    return new Response(JSON.stringify({ success: false, error: 'No token provided' }), {
      status: 401,
      headers: { 'content-type': 'application/json' }
    })
  }

  let claims: { userId?: string; company_id?: string; companyId?: string }
  try {
    claims = jwt.verify(token, getJWTSecret()) as typeof claims
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Invalid token' }), {
      status: 401,
      headers: { 'content-type': 'application/json' }
    })
  }

  const companyId = claims.company_id || claims.companyId
  if (!companyId) {
    return new Response(JSON.stringify({ success: false, error: 'Invalid token: missing company ID' }), {
      status: 401,
      headers: { 'content-type': 'application/json' }
    })
  }

  const encoder = new TextEncoder()
  let unsubscribe = () => {}
  let heartbeat: ReturnType<typeof setInterval> | undefined

  const stream = new ReadableStream({
    start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`event: whatsapp-connection\ndata: ${JSON.stringify(payload)}\n\n`))
      }

      controller.enqueue(encoder.encode(': listening\n\n'))
      unsubscribe = subscribeToWhatsAppConnections((event) => {
        if (event.companyId === companyId) send({ status: 'ready', ...event })
      })
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'))
        } catch {
          if (heartbeat) clearInterval(heartbeat)
        }
      }, 15000)
    },
    cancel() {
      unsubscribe()
      if (heartbeat) clearInterval(heartbeat)
    }
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive'
    }
  })
}
