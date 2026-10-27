export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { WhatsAppSessionService } from '@/backend/services/whatsapp-session-manager'

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

    console.log(' QR Code generation requested by user:', userInfo.userId)

    // For qr-generate endpoint, no phone number in body - generate based on user
    const phoneNumber = `user_${userInfo.userId}_${Date.now()}`
    
    console.log(' Generating QR for session:', phoneNumber)
    
    try {
      //  Pass userId, companyId, and phoneNumber
      const result = await WhatsAppSessionService.generateQRCode(userInfo.userId, userInfo.company_id, phoneNumber)
      
      console.log(' QR Code result:', {
        sessionId: result.sessionId,
        hasQrCode: !!result.qrCode
      })

      return NextResponse.json({
        success: true,
        sessionId: result.sessionId,
        qrCode: result.qrCode,
        expiresIn: result.expiresIn
      })
    } catch (error) {
      console.error(' WhatsApp service error:', error)
      
      // Check if this is an environment issue
      if (error instanceof Error && error.message.includes('browser/build environment')) {
        return NextResponse.json({
          success: false,
          error: 'WhatsApp service is not available in this deployment environment. Please use a standalone Node.js server for WhatsApp functionality.',
          environmentError: true
        }, { status: 503 })
      }
      
      return NextResponse.json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate QR code'
      }, { status: 500 })
    }
    
  } catch (error) {
    console.error(' Error in QR generation endpoint:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
