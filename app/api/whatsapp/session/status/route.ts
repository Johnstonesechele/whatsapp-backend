export const dynamic = 'force-dynamic'
import { type NextRequest, NextResponse } from "next/server"
import jwt from 'jsonwebtoken'

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

    // This endpoint checks WhatsApp session status
    // For now, we'll return a basic status since WhatsApp Web.js integration 
    // might not be fully initialized in test environment
    
    const sessionStatus = {
      isConnected: false,
      sessionState: 'DISCONNECTED',
      qrCode: null,
      lastActivity: null,
      clientInfo: null
    }
    
    // TODO: Integrate with actual WhatsApp Web.js client when available
    // const client = getWhatsAppClient()
    // if (client) {
    //   sessionStatus.isConnected = client.isReady
    //   sessionStatus.sessionState = client.state
    // }
    
    return NextResponse.json({
      success: true,
      status: sessionStatus
    })
  } catch (error) {
    console.error('WhatsApp session status error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to get WhatsApp session status',
      status: {
        isConnected: false,
        sessionState: 'ERROR',
        qrCode: null,
        lastActivity: null,
        clientInfo: null
      }
    }, { status: 500 })
  }
}
