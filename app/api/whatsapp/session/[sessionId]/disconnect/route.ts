export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { getSupabaseAdminClient } from '@/backend/database/supabase-config'
import { whatsappSessionManager } from '@/backend/services/whatsapp-session-manager'
import { getJWTSecret } from "@/lib/jwt"

// Dynamic import of WhatsApp service to avoid bundling issues
const getWhatsAppService = async () => {
  try {
    const { WhatsAppService } = await import('../../../../../../backend/services/whatsapp-service')
    return WhatsAppService
  } catch (error) {
    console.error('Failed to import WhatsApp service:', error)
    return null
  }
}

interface SessionParams {
  params: Promise<{
    sessionId: string
  }>
}

export async function POST(request: NextRequest, context: SessionParams) {
  const params = await context.params
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

    const { sessionId } = await params

    if (!sessionId) {
      return NextResponse.json(
        { success: false, message: 'Session ID is required' },
        { status: 400 }
      )
    }

    const userId = userInfo.userId || userInfo.id || userInfo.sub
    const companyId = userInfo.company_id || userInfo.companyId

    console.log(` Disconnecting WhatsApp session ${sessionId} for user ${userId}, company ${companyId}`)

    // 1. Disconnect from wweb.js service (non-fatal if unavailable)
    try {
      const WhatsAppService = await getWhatsAppService()
      if (WhatsAppService) {
        await WhatsAppService.disconnectSession(sessionId)
        console.log(` wweb.js session disconnected: ${sessionId}`)
      }
    } catch (serviceError) {
      console.warn('WhatsApp service disconnect warning (non-fatal):', serviceError instanceof Error ? serviceError.message : serviceError)
    }

    // 2. Clean up session manager
    try {
      if (userId) {
        whatsappSessionManager.cleanupUserSessions(userId)
        console.log(` Session manager cleaned up for user ${userId}`)
      }
    } catch (managerError) {
      console.warn('Session manager cleanup warning (non-fatal):', managerError)
    }

    // 3. Update Supabase — set status to disconnected
    if (companyId) {
      try {
        const supabase = getSupabaseAdminClient()
        const { error: updateError } = await supabase
          .from('whatsapp_settings')
          .update({
            connection_status: 'disconnected',
            session_id: '',
            updated_at: new Date().toISOString()
          })
          .eq('company_id', companyId)

        if (updateError) {
          console.error('Error updating whatsapp_settings on disconnect:', updateError)
        } else {
          console.log(` Supabase whatsapp_settings updated to disconnected for company ${companyId}`)
        }
      } catch (dbError) {
        console.error('DB update error on disconnect (non-fatal):', dbError)
      }
    }

    return NextResponse.json({
      success: true,
      message: 'WhatsApp session disconnected successfully',
      connectionStatus: 'disconnected'
    })

  } catch (error) {
    console.error('Error disconnecting session:', error)
    return NextResponse.json(
      { success: false, message: 'Failed to disconnect session' },
      { status: 500 }
    )
  }
}

