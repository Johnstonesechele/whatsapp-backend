export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { saveWhatsAppSettings, getWhatsAppSettings } from '@/backend/database/db-api'
import { whatsappSessionManager } from '@/backend/services/whatsapp-session-manager'

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
      userInfo = jwt.verify(token, jwtSecret) as any
    } catch (error) {
      return NextResponse.json(
        { success: false, error: 'Invalid token' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { sessionId, status, phoneNumber } = body

    console.log(' Updating WhatsApp connection status:', { sessionId, status, phoneNumber })

    // Get current WhatsApp settings
    const currentSettings = await getWhatsAppSettings(userInfo.company_id)
    
    // Update settings with connection status and phone number
    const updatedSettings = {
      ...currentSettings,
      connectionStatus: status,
      sessionId: sessionId,
      phoneNumber: phoneNumber || currentSettings.phoneNumber,
      useWhatsAppWeb: true, // Mark as using WhatsApp Web when connected
      enableWhatsApp: status === 'ready', // Enable when connected
      lastConnected: status === 'ready' ? new Date().toISOString() : currentSettings.lastConnected
    }

    // Save updated settings to database
    await saveWhatsAppSettings(updatedSettings, userInfo.company_id)

    // Update session manager
    if (status === 'ready' && phoneNumber) {
      whatsappSessionManager.updateSessionStatus(sessionId, status, phoneNumber)
    }

    console.log(' WhatsApp connection status updated in database:', status)

    return NextResponse.json({
      success: true,
      message: 'Connection status updated',
      settings: {
        connectionStatus: status,
        phoneNumber: phoneNumber,
        connected: status === 'ready',
        lastConnected: updatedSettings.lastConnected
      }
    })
    
  } catch (error) {
    console.error(' Error updating connection status:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update connection status' },
      { status: 500 }
    )
  }
}
