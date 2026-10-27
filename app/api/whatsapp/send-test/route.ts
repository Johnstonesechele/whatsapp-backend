import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'

// Dynamic import of WhatsApp service to avoid bundling issues
const getWhatsAppService = async () => {
  try {
    const { WhatsAppService } = await import('../../../../backend/services/whatsapp-service')
    return WhatsAppService
  } catch (error) {
    console.error('Failed to import WhatsApp service:', error)
    throw new Error('WhatsApp service not available')
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
    const jwtSecret = process.env.JWT_SECRET
    if (!jwtSecret) {
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
        { status: 500 }
      )
    }
    
    try {
      jwt.verify(token, jwtSecret)
    } catch (error) {
      return NextResponse.json(
        { success: false, error: 'Invalid token' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { sessionId, to, message } = body
    
    if (!sessionId || !to || !message) {
      return NextResponse.json(
        { success: false, message: 'Session ID, recipient, and message are required' },
        { status: 400 }
      )
    }
    
    // Clean phone number format
    const cleanTo = to.replace(/\D/g, '')
    
    // Get WhatsApp service dynamically
    const WhatsAppService = await getWhatsAppService()
    const result = await WhatsAppService.sendMessage(sessionId, cleanTo, message)
    
    if (!result.success) {
      return NextResponse.json(
        { success: false, message: result.error || 'Failed to send message' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      message: 'Test message sent successfully'
    })
    
  } catch (error) {
    console.error('Error sending test message:', error)
    return NextResponse.json(
      { success: false, message: 'Failed to send test message' },
      { status: 500 }
    )
  }
}
