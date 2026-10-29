export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdminClient } from "@/backend/database/supabase-config"
import { randomUUID } from "crypto"
import jwt from 'jsonwebtoken'
import { whatsappSessionManager } from '@/backend/services/whatsapp-session-manager'
import { getJWTSecret } from "@/lib/jwt"

interface WhatsAppDBStatus {
  connection_status: string
  phone_number: string | null
  session_id: string
  last_connected: string | null
}

// Use the compatible WhatsApp service
const getWhatsAppService = async () => {
  try {
    // Try to use the real service first
    const { whatsappWebService } = await import('@/backend/services/whatsapp-service')
    return whatsappWebService
  } catch (error) {
    console.warn('Real WhatsApp service not available, using compatible version:', error)
    // Fallback to compatible service
    const { whatsappWebService } = await import('@/backend/services/whatsapp-service-compatible')
    return whatsappWebService
  }
}

export async function GET(request: NextRequest) {
  try {
    // Check authentication
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

    console.log(' Checking WhatsApp connection status for user:', userInfo.userId, 'company:', userInfo.company_id)

    // STRATEGY: Always look up by company_id first (most reliable)
    // This ensures we find the session even if sessionId changed during connection
    let sessionId: string | null = null
    let dbStatus: WhatsAppDBStatus | null = null
    
    // 1. Check database by company_id (primary method)
    console.log(' Looking up session by company_id:', userInfo.company_id)
    try {
      const supabase = getSupabaseAdminClient()
      
      const { data: dbSettings, error: dbError } = await supabase
        .from('whatsapp_settings')
        .select('session_id, connection_status, phone_number, user_id, last_connected')
        .eq('company_id', userInfo.company_id)
        .order('last_connected', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle()
      
      if (dbSettings && !dbError) {
        sessionId = dbSettings.session_id
        dbStatus = {
          connection_status: dbSettings.connection_status,
          phone_number: dbSettings.phone_number,
          session_id: dbSettings.session_id,
          last_connected: dbSettings.last_connected
        }
        console.log(` Found session in database: ${sessionId}, status: ${dbSettings.connection_status}`)
        
        // Re-register in memory if not already there
        if (sessionId && dbSettings.user_id) {
          const memorySession = whatsappSessionManager.getUserSession(dbSettings.user_id)
          if (!memorySession || memorySession !== sessionId) {
            whatsappSessionManager.registerSession(
              dbSettings.user_id,
              userInfo.company_id,
              sessionId,
              dbSettings.phone_number || undefined
            )
            console.log(` Re-registered session in memory: ${sessionId}`)
          }
        }
      } else {
        console.warn(' No session found in database for company:', userInfo.company_id)
      }
    } catch (dbLookupError) {
      console.error(' Error looking up session from database:', dbLookupError)
    }
    
    // 2. Fallback: Check memory by userId (secondary method)
    if (!sessionId) {
      console.log(' Trying memory lookup by userId...')
      sessionId = whatsappSessionManager.getUserSession(userInfo.userId)
      console.log(' Memory lookup result:', sessionId || 'NOT_FOUND')
    }
    
    if (!sessionId) {
      console.warn(' No session found anywhere for user:', userInfo.userId, 'company:', userInfo.company_id)
      
      return NextResponse.json({
        success: true,
        connected: false,
        status: 'no_session',
        message: 'No active WhatsApp session'
      })
    }

    // Get session data from session manager (might not exist if server restarted)
    const sessionData = whatsappSessionManager.getSessionData(sessionId)
    
    // Get session status from WhatsApp service
    const whatsappWebService = await getWhatsAppService()
    // Use the service status probe rather than the raw session map. The probe
    // checks the live WhatsApp client and promotes authenticated clients to
    // ready, including persisting that state to Supabase.
    const sessionStatus = await whatsappWebService.getSessionStatus(sessionId)
    
    console.log(` Session ${sessionId} status:`, sessionStatus.status)
    console.log(` Database status:`, dbStatus?.connection_status)

    // ── AUTO-RESTORE ────────────────────────────────────────────────────────
    // If the session is not in memory but DB shows it was connecting/authenticated,
    // the server likely restarted after the user scanned the QR code.
    // LocalAuth persists credentials to disk, so calling createSession() again
    // will reconnect WITHOUT needing a new QR code. Fire-and-forget so the
    // ready event updates the DB when it fires.
    const sessionNotInMemory = sessionStatus.status === 'not_found' || sessionStatus.status === 'unavailable'
    const dbHasActiveSession = dbStatus?.connection_status &&
      ['connecting', 'authenticated', 'qr_ready'].includes(dbStatus.connection_status)

    if (sessionNotInMemory && dbHasActiveSession && sessionId) {
      console.log(` Auto-restoring session ${sessionId} from LocalAuth (server restart recovery)...`)
      // Non-blocking — ready event will update DB when wweb.js reconnects
      const userId = userInfo.userId?.toString()
      const companyId = userInfo.company_id
      getWhatsAppService().then(svc => {
        if (svc) {
          svc.createSession(sessionId, userId, companyId).catch((err: Error) => {
            console.warn(` Auto-restore failed for ${sessionId}:`, err.message)
          })
        }
      }).catch(() => {})
    }

    // Effective live status — prefer live service status except when it says
    // 'not_found'/'unavailable' (session not in this process's memory).
    const LIVE_MEANINGFUL = new Set(['ready', 'authenticated', 'qr_ready', 'initializing', 'connecting', 'auth_failed', 'disconnected'])
    const effectiveStatus: string = LIVE_MEANINGFUL.has(sessionStatus.status)
      ? sessionStatus.status
      : (dbStatus?.connection_status || sessionStatus.status)

    const connected = effectiveStatus === 'ready' ||
      sessionStatus.connected === true ||
      sessionStatus.status === 'ready' ||
      dbStatus?.connection_status === 'ready'

    // ── ZOMBIE CLEANUP ──────────────────────────────────────────────────────
    // When the company already has a ready session, destroy any other in-memory
    // sessions for the same company that are still initializing / generating QR
    // codes (left over from HMR restarts or duplicate auto-restore calls).
    if (connected && userInfo.company_id) {
      try {
        const svc = await getWhatsAppService()
        if (svc && typeof (svc as any).sessions !== 'undefined') {
          const sessions: Map<string, any> = (svc as any).sessions
          const clients: Map<string, any> = (svc as any).clients
          const companyId: string = userInfo.company_id
          for (const [id, s] of sessions.entries()) {
            if (
              id !== sessionId &&
              s.companyId === companyId &&
              ['initializing', 'qr_ready', 'authenticated', 'connecting'].includes(s.status)
            ) {
              console.log(` connection-status: destroying zombie session ${id} for company ${companyId}`)
              try { clients.get(id)?.destroy() } catch {}
              clients.delete(id)
              sessions.delete(id)
            }
          }
        }
      } catch (zombieErr) {
        // non-fatal
      }
    }
    let qrExpired = false
    if (!connected) {
      if (sessionStatus.status === 'auth_failed' || sessionStatus.status === 'disconnected') {
        qrExpired = true
      }
      if (sessionData && Date.now() - sessionData.createdAt.getTime() > 5 * 60 * 1000) {
        qrExpired = true
      }
    }

    // Only update session manager when we have a meaningful live status
    if (LIVE_MEANINGFUL.has(sessionStatus.status)) {
      whatsappSessionManager.updateSessionStatus(sessionId, sessionStatus.status, sessionStatus.phoneNumber)
    }

    const response = {
      success: true,
      connected,
      isConnected: connected,
      status: connected ? 'ready' : effectiveStatus,
      phoneNumber: sessionStatus.phoneNumber || dbStatus?.phone_number,
      sessionId: sessionId,
      message: connected ? 'WhatsApp is connected and ready' : `Session ${effectiveStatus}`,
      qrExpired,
      session: connected ? {
        id: sessionId,
        phoneNumber: sessionStatus.phoneNumber || (sessionData?.phoneNumber) || dbStatus?.phone_number || 'Unknown',
        name: sessionStatus.phoneNumber ? `WhatsApp ${sessionStatus.phoneNumber}` : 'WhatsApp Session',
        connected: true,
        lastSeen: new Date().toLocaleString(),
        platform: 'WhatsApp Web'
      } : null
    }

    console.log(` Sending connection status response:`, {
      connected: response.connected,
      status: response.status,
      phoneNumber: response.phoneNumber
    })

    return NextResponse.json(response)
    
  } catch (error) {
    console.error(' Error checking connection status:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to check connection status' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication
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

    const body = await request.json()
    const { sessionId, action } = body

    if (action === 'register_session') {
      // Register the session for this user using session manager (correct parameter order)
      whatsappSessionManager.registerSession(
        userInfo.userId, 
        userInfo.company_id,  //  Fix: Pass company_id, not sessionId
        sessionId,
        'user_session'        // phoneNumber
      )
      console.log(` Registered session ${sessionId} for user ${userInfo.userId}, company ${userInfo.company_id}`)
      
      return NextResponse.json({
        success: true,
        message: 'Session registered'
      })
    }

    return NextResponse.json(
      { success: false, error: 'Invalid action' },
      { status: 400 }
    )
    
  } catch (error) {
    console.error(' Error in connection status POST:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
