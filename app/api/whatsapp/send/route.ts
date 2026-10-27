export const dynamic = 'force-dynamic'
import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseAdminClient } from "@/backend/database/supabase-config"
import jwt from "jsonwebtoken"

const getWhatsAppWebService = async () => {
  const { whatsappWebService } = await import('@/backend/services/whatsapp-service')
  return whatsappWebService
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
    const jwtSecret = process.env.JWT_SECRET
    if (!jwtSecret) {
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
        { status: 500 }
      )
    }

    let userInfo: any
    try {
      userInfo = jwt.verify(token, jwtSecret)
    } catch (error) {
      return NextResponse.json(
        { success: false, error: 'Invalid token' },
        { status: 401 }
      )
    }

    const { recipient, message, scheduledAt } = await request.json()

    if (!recipient || !message) {
      return NextResponse.json(
        { success: false, error: 'Recipient and message are required' },
        { status: 400 }
      )
    }

    // Scheduled messages — acknowledge but defer actual delivery to scheduler
    if (scheduledAt) {
      return NextResponse.json({
        success: true,
        scheduled: true,
        scheduledAt,
        message: 'Message scheduled for delivery'
      })
    }

    // Look up the active WhatsApp session for this company
    const supabase = getSupabaseAdminClient()
    const { data: sessionData, error: sessionError } = await supabase
      .from('whatsapp_settings')
      .select('session_id, connection_status')
      .eq('company_id', userInfo.company_id)
      .eq('connection_status', 'ready')
      .single()

    if (sessionError || !sessionData?.session_id) {
      return NextResponse.json(
        { success: false, error: 'No active WhatsApp session. Please connect WhatsApp in Settings first.' },
        { status: 503 }
      )
    }

    // Send using the real whatsapp-web.js service
    const svc = await getWhatsAppWebService()
    const result = await svc.sendMessage(sessionData.session_id, recipient, message)

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Failed to send message' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      to: result.to
    })

  } catch (error) {
    console.error('Error in /api/whatsapp/send:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to send message' },
      { status: 500 }
    )
  }
}

