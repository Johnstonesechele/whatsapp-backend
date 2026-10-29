export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { whatsappSessionManager } from '@/backend/services/whatsapp-session-manager'
import { getSupabaseAdminClient } from '@/backend/database/supabase-config'
import { getJWTSecret } from "@/lib/jwt"

interface SessionParams {
  params: Promise<{ sessionId: string }>
}

const getWhatsAppService = async () => {
  try {
    const { WhatsAppService } = await import('@/backend/services/whatsapp-service')
    return WhatsAppService
  } catch {
    return null
  }
}

/**
 * "Meaningful" live statuses — any value outside this set (not_found, unavailable,
 * no_session) means the in-process service couldn't answer and we should
 * fall through to the next source rather than returning a garbage status.
 */
const MEANINGFUL = new Set([
  'ready', 'authenticated', 'qr_ready', 'initializing',
  'connecting', 'pairing_code_ready', 'auth_failed', 'disconnected', 'error'
])

export async function GET(request: NextRequest, context: SessionParams) {
  const params = await context.params
  try {
    const cookieToken = request.cookies.get('auth_token')?.value
    const authHeader = request.headers.get('authorization')
    const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
    const token = cookieToken || headerToken
    if (!token) {
      return NextResponse.json({ success: false, error: 'No token provided' }, { status: 401 })
    }

    const jwtSecret = getJWTSecret()

    let userInfo: any
    try {
      userInfo = jwt.verify(token, jwtSecret) as any
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 })
    }

    const { sessionId } = params
    const companyId: string | null = userInfo.company_id || userInfo.companyId || null
    console.log(` Session status: ${sessionId} | company: ${companyId}`)

    // ─────────────────────────────────────────────────────────────────────
    // STEP 1 — Supabase by company_id (most authoritative, always persisted)
    //   Written by updateDatabaseStatus / notifyFrontendConnection when the
    //   wweb.js 'ready' event fires.
    // ─────────────────────────────────────────────────────────────────────
    let dbStatus: string | null = null
    let dbPhone: string | null = null
    let dbSessionId: string | null = null

    if (companyId) {
      try {
        const supabase = getSupabaseAdminClient()
        const { data: row } = await supabase
          .from('whatsapp_settings')
          .select('connection_status, phone_number, session_id')
          .eq('company_id', companyId)
          .maybeSingle()

        if (row) {
          dbStatus    = row.connection_status
          dbPhone     = row.phone_number
          dbSessionId = row.session_id
          console.log(` DB→company ${companyId}: ${dbStatus}`)
        }
      } catch (dbErr) {
        console.warn('Supabase lookup failed (non-fatal):', dbErr instanceof Error ? dbErr.message : dbErr)
      }
    }

    // DB says ready → return immediately, no need to check in-process state
    if (dbStatus === 'ready') {
      const sid = dbSessionId || sessionId
      try { whatsappSessionManager.updateSessionStatus(sid, 'ready', dbPhone || undefined) } catch {}
      console.log(` DB says ready`)
      return NextResponse.json({
        success: true, status: 'ready', connected: true, isConnected: true,
        phoneNumber: dbPhone, sessionId: sid, message: 'WhatsApp connected and ready'
      })
    }

    // ─────────────────────────────────────────────────────────────────────
    // STEP 2 — In-process WhatsApp service.
    //   Catches the race condition: wweb.js 'ready' event has fired and set
    //   this.sessions[sessionId].status='ready' but the async DB write hasn't
    //   completed yet.
    // ─────────────────────────────────────────────────────────────────────
    try {
      const WhatsAppService = await getWhatsAppService()
      if (WhatsAppService) {
        const live = await WhatsAppService.getSessionStatus(sessionId)
        const liveSt: string = live.status || ''
        console.log(` Live service→${sessionId}: ${liveSt}`)

        if (MEANINGFUL.has(liveSt)) {
          // Sync session manager
          try { whatsappSessionManager.updateSessionStatus(sessionId, liveSt, live.phoneNumber) } catch {}

          const isReady = liveSt === 'ready'
            || (live as any).connected === true
            || (live as any).isConnected === true

          if (isReady && companyId) {
            // Proactively flush 'ready' to DB so the NEXT poll skips in-process entirely
            try {
              const supabase = getSupabaseAdminClient()
              await supabase.from('whatsapp_settings').update({
                connection_status: 'ready',
                phone_number: live.phoneNumber || dbPhone,
                session_id: sessionId,
                last_connected: new Date().toISOString(),
                updated_at: new Date().toISOString()
              }).eq('company_id', companyId)
              console.log(` Flushed ready→DB for company ${companyId}`)
            } catch {}
          }

          return NextResponse.json({
            success: true,
            status: isReady ? 'ready' : liveSt,
            connected: isReady,
            isConnected: isReady,
            phoneNumber: live.phoneNumber || dbPhone,
            sessionId,
            pairingCode: live.pairingCode || null,
            error: live.error || null,
            message: isReady ? 'Connected (live)' : `Session ${liveSt}`
          })
        }
        // Non-meaningful status (not_found / unavailable / error) → fall through
        console.log(` Live service returned non-meaningful status "${liveSt}", falling through`)
      }
    } catch (serviceErr) {
      console.warn('Live service check failed (non-fatal):', serviceErr instanceof Error ? serviceErr.message : serviceErr)
    }

    // ─────────────────────────────────────────────────────────────────────
    // STEP 3 — In-memory session manager (set during registerSession / updateSessionStatus)
    // ─────────────────────────────────────────────────────────────────────
    const sessionData = whatsappSessionManager.getSessionData(sessionId)
    if (sessionData) {
      const isReady = sessionData.status === 'ready'
      console.log(` Session manager→${sessionId}: ${sessionData.status}`)
      return NextResponse.json({
        success: true, status: sessionData.status, connected: isReady, isConnected: isReady,
        phoneNumber: sessionData.phoneNumber || dbPhone, sessionId,
        message: `Session ${sessionData.status} (cached)`
      })
    }

    // ─────────────────────────────────────────────────────────────────────
    // STEP 4 — Return whatever DB had (connecting / qr_ready / disconnected…)
    //   so the frontend shows the correct persisted state rather than an error.
    // ─────────────────────────────────────────────────────────────────────
    if (dbStatus) {
      console.log(` DB fallback→${dbStatus}`)
      return NextResponse.json({
        success: true, status: dbStatus, connected: false, isConnected: false,
        phoneNumber: dbPhone, sessionId: dbSessionId || sessionId,
        message: `Session ${dbStatus} (db)`
      })
    }

    return NextResponse.json({
      success: true, status: 'no_session', connected: false, isConnected: false,
      phoneNumber: null, sessionId, message: 'No session found'
    })

  } catch (error) {
    console.error(' Error checking session status:', error)
    return NextResponse.json({ success: false, status: 'error', error: 'Failed to check session status' }, { status: 500 })
  }
}
