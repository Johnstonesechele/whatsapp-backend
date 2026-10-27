export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { whatsappSessionManager } from '@/backend/services/whatsapp-session-manager'
import { getJWTSecret } from "@/lib/jwt"

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: 'No token provided' },
        { status: 401 }
      )
    }

    const token = authHeader.split(' ')[1]
    const jwtSecret = getJWTSecret()

    let userInfo: any
    try {
      userInfo = jwt.verify(token, jwtSecret) as any
    } catch (error) {
      return NextResponse.json(
        { success: false, error: 'Invalid token' },
        { status: 401 }
      )
    }

    const userId = userInfo.userId || userInfo.id || userInfo.sub
    const companyId = userInfo.company_id || userInfo.companyId

    if (!userId || !companyId) {
      return NextResponse.json(
        { success: false, error: 'Invalid token: missing user or company ID' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { phoneNumber } = body

    if (!phoneNumber) {
      return NextResponse.json(
        { success: false, error: 'Phone number is required' },
        { status: 400 }
      )
    }

    const cleanPhoneNumber = phoneNumber.replace(/\D/g, '')
    if (cleanPhoneNumber.length < 7) {
      return NextResponse.json(
        { success: false, error: 'Phone number must be at least 7 digits' },
        { status: 400 }
      )
    }

    // Generate a new session ID
    const sessionId = `whatsapp_${userId}_${Date.now()}`

    // Register session
    whatsappSessionManager.registerSession(userId, companyId, sessionId, cleanPhoneNumber)

    // Seed Supabase so DB-fallback polling works
    try {
      const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
      const supabase = getSupabaseAdminClient()
      const now = new Date().toISOString()

      await supabase
        .from('whatsapp_settings')
        .upsert({
          company_id: companyId,
          user_id: userId,
          session_id: sessionId,
          connection_status: 'connecting',
          phone_number: cleanPhoneNumber,
          enable_whatsapp: true,
          use_whatsapp_web: true,
          updated_at: now
        }, { onConflict: 'company_id' })
    } catch (dbSeedError) {
      // Non-fatal
    }

    // Import WhatsApp service
    /**
     * Refuse plainly when this deployment cannot hold a WhatsApp session.
     *
     * Previously this called straight into createSession, which launches
     * Puppeteer and waits up to 60 seconds for a page that will never load.
     * Measured on production: HTTP 500 after ~90 seconds, with the message
     * "WhatsApp Web page did not load in time. Please try again."
     *
     * Two things were wrong with that response. It is a 500, so every retry
     * and monitor sees a transient server fault and the user is told to try
     * again - forever. And the message describes a timeout, when the real
     * answer is that the capability does not exist here.
     *
     * 501 Not Implemented is the honest status: this deployment cannot do this
     * thing. It is not a bug to retry, so a client that respects the status
     * stops trying. VERCEL is detected because serverless functions are frozen
     * between invocations and killed on idle, so a WebSocket-backed session
     * cannot survive regardless of configuration.
     */
    if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
      return NextResponse.json(
        {
          success: false,
          error: 'WhatsApp connection is not available on this deployment.',
          code: 'whatsapp_unavailable',
          detail:
            'Linking a WhatsApp number needs a continuously running process to ' +
            'hold the connection. Serverless hosts freeze the process between ' +
            'requests, so the session cannot survive. Contact support to have ' +
            'it enabled on a dedicated host.',
        },
        { status: 501 }
      )
    }

    let WhatsAppService
    try {
      const module = await import('@/backend/services/whatsapp-service')
      WhatsAppService = module.WhatsAppService
    } catch (importError) {
      return NextResponse.json(
        {
          success: false,
          error: 'WhatsApp service not available in this environment',
          code: 'whatsapp_unavailable',
        },
        { status: 501 }
      )
    }

    // Create the session (this initializes puppeteer + whatsapp-web.js client)
    const createResult = await WhatsAppService.createSession(sessionId, userId, companyId)

    if (!createResult.success) {
      return NextResponse.json(
        { success: false, error: createResult.error || 'Failed to create WhatsApp session' },
        { status: 500 }
      )
    }

    // The requestPairingCode method internally waits for the WhatsApp Web page to load
    // (the QR event signals the page is ready). It waits up to 60 seconds.
    // No need to poll here — just call it directly.
    const result = await WhatsAppService.requestPairingCode(sessionId, cleanPhoneNumber)

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Failed to generate pairing code' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      sessionId,
      pairingCode: result.code,
      message: 'Enter this code on your phone: WhatsApp > Settings > Linked Devices > Link a Device > Link with phone number instead'
    })

  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
