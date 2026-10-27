import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { whatsappSessionManager } from '@/backend/services/whatsapp-session-manager'

// Use the compatible WhatsApp service
const getWhatsAppService = async () => {
  try {
    // Try to use the real service first
    const { WhatsAppService } = await import('@/backend/services/whatsapp-service')
    return WhatsAppService
  } catch (error) {
    console.warn('Real WhatsApp service not available, using compatible version:', error)
    // Fallback to compatible service
    const { WhatsAppService } = await import('@/backend/services/whatsapp-service-compatible')
    return WhatsAppService
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
    
    let userInfo: any
    try {
      userInfo = jwt.verify(token, jwtSecret) as any
    } catch (error) {
      return NextResponse.json(
        { success: false, error: 'Invalid token' },
        { status: 401 }
      )
    }

    console.log(' QR Code generation requested by user:', userInfo.userId, 'company:', userInfo.company_id)
    console.log(' JWT userInfo FULL:', JSON.stringify(userInfo, null, 2))

    // Extract user ID - handle different JWT formats
    const userId = userInfo.userId || userInfo.id || userInfo.sub
    const companyId = userInfo.company_id || userInfo.companyId
    
    if (!userId) {
      console.error(' No userId found in JWT token:', userInfo)
      return NextResponse.json(
        { success: false, error: 'Invalid token: missing user ID' },
        { status: 401 }
      )
    }
    
    if (!companyId) {
      console.error(' No companyId found in JWT token:', userInfo)
      return NextResponse.json(
        { success: false, error: 'Invalid token: missing company ID' },
        { status: 401 }
      )
    }
    
    console.log(' Extracted from JWT:', { userId, companyId })

    // Get phone number from request body
    const body = await request.json().catch(() => ({}))
    const phoneNumber = body.phoneNumber || `user_${userId}_${Date.now()}`
    
    // Generate a session ID based on user and phone number  
    const sessionId = `whatsapp_${userId}_${Date.now()}`
    
    console.log(' Generating QR for session:', sessionId, 'phone:', phoneNumber, 'company:', companyId)
    console.log(' Registering session with:', { userId, companyId, sessionId, phoneNumber })
    
    // Register session with session manager (include company_id)
    whatsappSessionManager.registerSession(userId, companyId, sessionId, phoneNumber)
    
    console.log(' Session registered in session manager for userId:', userId)
    
    try {
      const WhatsAppService = await getWhatsAppService()
      //  Pass sessionId, userId, and companyId to generateQRCode
      const result: any = await WhatsAppService.generateQRCode(phoneNumber, sessionId, userId, companyId)
      
      // Update session status
      whatsappSessionManager.updateSessionStatus(sessionId, 'qr_generated')
      
      console.log(' QR Code result:', {
        sessionId: sessionId,
        hasQrCode: !!result.qrCode
      })

      /**
       * A QR that pairs with nothing must not be reported as a success.
       *
       * success was the literal true, sitting beside mock: result.mock with
       * nothing linking the two. Verified on production: the endpoint returned
       * HTTP 200 with success:true, mock:true, and the message "Development QR
       * code generated. Will simulate connection in 30 seconds."
       *
       * That is the worst possible failure for a connection flow. The user scans
       * a code belonging to no WhatsApp account, every monitor and retry treats
       * the call as healthy, and the status then flips to connected with no
       * number attached. Nothing reports a fault anywhere.
       *
       * So success is derived from whether the QR is real, and a simulated one
       * is a 503 carrying a code the client can branch on - "not available on
       * this deployment" is a capability statement, not a transient error worth
       * retrying.
       */
      const isReal = result.real === true
      return NextResponse.json({
        success: isReal,
        sessionId: sessionId,
        qrCode: isReal ? result.qrCode : null,
        expiresIn: result.expiresIn || 120, // Default 2 minutes
        expiresAt: result.expiresAt || (Date.now() + 120000),
        real: isReal,
        mock: result.mock === true,
        fallback: result.fallback === true,
        error: result.error === true || !isReal,
        code: isReal ? undefined : 'whatsapp_unavailable',
        /**
         * Forwarded so the caller learns what actually stopped the session
         * rather than a generic instruction. Kept separate from `message` so
         * the UI can show a human sentence and a log can show the raw cause.
         */
        reason: isReal ? undefined : result.reason,
        message: result.message || 'QR code generated successfully'
      }, { status: isReal ? 200 : 503 })
    } catch (error) {
      console.error(' WhatsApp service error:', error)
      
      // Check if this is an environment issue
      if (error instanceof Error && (
        error.message.includes('browser/build environment') || 
        error.message.includes('not available in this environment') ||
        error.message.includes('standalone Node.js server')
      )) {
        return NextResponse.json({
          success: false,
          error: 'WhatsApp functionality requires a standalone Node.js server environment. In development, ensure you\'re running with Node.js and set ENABLE_WHATSAPP=true if needed.',
          environmentError: true,
          suggestion: 'For production WhatsApp functionality, deploy a separate Node.js service for WhatsApp Web.js integration.'
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
