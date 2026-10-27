export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdminClient } from "@/backend/database/supabase-config"
import jwt from 'jsonwebtoken'
import { getJWTSecret } from "@/lib/jwt"

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: 'No token provided' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    const jwtSecret = getJWTSecret()
    
    let userInfo: any
    try {
      userInfo = jwt.verify(token, jwtSecret) as any
    } catch (error) {
      return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 })
    }

    console.log(' Cleanup-sessions called for user:', userInfo.userId)

    const { whatsappSessionManager } = await import('@/backend/services/whatsapp-session-manager')
    
    // Get session ID BEFORE cleaning in-memory state
    const sessionId = whatsappSessionManager.getUserSession(userInfo.userId)
    console.log(` Session to clean up: ${sessionId || 'none'}`)

    // ── GUARD: Never destroy an already-connected (ready) session ────────────
    // This endpoint is called from the browser's `beforeunload` handler when
    // the settings page unloads (refresh / tab close). If the user scanned the
    // QR code and is now fully connected we must NOT tear down the live session —
    // only clean up sessions that are still in the QR-scanning / connecting phase.
    const supabase = getSupabaseAdminClient()
    const { data: user } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', userInfo.userId)
      .eq('active', true)
      .single()

    if (user?.company_id) {
      const { data: ws } = await supabase
        .from('whatsapp_settings')
        .select('connection_status')
        .eq('company_id', user.company_id)
        .maybeSingle()

      if (ws?.connection_status === 'ready') {
        console.log(` Session is already connected (ready) — skipping cleanup for company ${user.company_id}`)
        return NextResponse.json({ success: true, message: 'Session is active — no cleanup needed' })
      }
    }

    // Session is not ready (still connecting or failed) — safe to clean up.
    
    // 1. Disconnect the actual wweb.js client for this session (graceful)
    if (sessionId) {
      try {
        const { WhatsAppService } = await import('@/backend/services/whatsapp-service')
        await WhatsAppService.disconnectSession(sessionId)
        console.log(` WhatsApp client disconnected for session: ${sessionId}`)
      } catch (error) {
        console.warn('WhatsApp client disconnect (non-fatal):', error instanceof Error ? error.message : 'Unknown')
      }
    }
    
    // 2. Remove from in-memory session manager
    whatsappSessionManager.cleanupUserSessions(userInfo.userId)
    console.log(` In-memory session cleaned for user: ${userInfo.userId}`)
    
    // 3. Mark Supabase as disconnected
    if (user?.company_id) {
      const { error: updateError } = await supabase
        .from('whatsapp_settings')
        .update({
          connection_status: 'disconnected',
          session_id: '',
          updated_at: new Date().toISOString()
        })
        .eq('company_id', user.company_id)
      
      if (!updateError) {
        console.log(` Supabase set to disconnected for company: ${user.company_id}`)
      } else {
        console.error('Error updating whatsapp_settings:', updateError)
      }
    }

    return NextResponse.json({ success: true, message: 'Sessions cleaned up successfully' })
    
  } catch (error) {
    console.error(' Error cleaning up sessions:', error)
    return NextResponse.json({ success: false, error: 'Failed to cleanup sessions' }, { status: 500 })
  }
}
