export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { whatsappSessionManager } from '@/backend/services/whatsapp-session-manager'
import { getJWTSecret } from "@/lib/jwt"

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
      console.log(' JWT Debug - Verification successful for user:', userInfo.userId)
    } catch (error) {
      console.log(' JWT Debug - Verification failed:', error instanceof Error ? error.message : error)
      return NextResponse.json(
        { success: false, error: 'Invalid token' },
        { status: 401 }
      )
    }

    console.log(' QR Code generation requested by user:', userInfo.userId)
    console.log(' JWT userInfo FULL:', JSON.stringify(userInfo, null, 2))

    // Extract user ID and company ID - handle different JWT formats
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

    const body = await request.json()
    const { phoneNumber } = body
    
    console.log(' Phone number:', phoneNumber)
    
    if (!phoneNumber) {
      return NextResponse.json(
        { success: false, message: 'Phone number is required' },
        { status: 400 }
      )
    }
    
    // Clean phone number format
    const cleanPhoneNumber = phoneNumber.replace(/\D/g, '')
    console.log(' Cleaned phone number:', cleanPhoneNumber)
    
    // Generate a new session ID for this user
    const sessionId = `whatsapp_${userId}_${Date.now()}`
    
    console.log(' Generating QR for session:', sessionId, 'phone:', cleanPhoneNumber, 'company:', companyId)
    console.log(' Registering session with:', { userId, companyId, sessionId, phoneNumber: cleanPhoneNumber })
    
    try {
      // Register the session with correct parameters: userId, companyId, sessionId, phoneNumber
      whatsappSessionManager.registerSession(
        userId, 
        companyId,  //  Use extracted companyId
        sessionId, 
        cleanPhoneNumber
      )
      
      console.log(' Session registered in session manager for userId:', userId)
      
      //  CRITICAL: Immediately seed Supabase so DB-fallback polling always finds the row
      // This persists the session across server restarts / HMR reloads
      try {
        const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
        const supabase = getSupabaseAdminClient()
        const now = new Date().toISOString()
        
        await supabase
          .from('whatsapp_settings')
          .upsert({
            company_id: companyId,
            user_id: userId,
            session_id: sessionId,
            connection_status: 'connecting',   // Will be updated to 'ready' when phone connects
            phone_number: cleanPhoneNumber,
            enable_whatsapp: true,
            use_whatsapp_web: true,
            updated_at: now
          }, { onConflict: 'company_id' })
        
        console.log(` Session seeded to Supabase: session=${sessionId} company=${companyId} status=connecting`)
      } catch (dbSeedError) {
        // Non-fatal: log but continue — in-memory session manager is still registered
        console.warn(' Could not seed session to Supabase (non-fatal):', dbSeedError instanceof Error ? dbSeedError.message : dbSeedError)
      }
      
      // Import WhatsApp service dynamically to handle environment issues
      let WhatsAppService
      try {
        const module = await import('@/backend/services/whatsapp-service')
        WhatsAppService = module.WhatsAppService
      } catch (importError) {
        console.error('Failed to import WhatsApp service:', importError)
        throw new Error('WhatsApp service not available in this environment')
      }
      
      //  Pass sessionId, userId, and companyId to generateQRCode
      const result = await WhatsAppService.generateQRCode(cleanPhoneNumber, sessionId, userId, companyId)
      
      // Update session status
      whatsappSessionManager.updateSessionStatus(sessionId, 'qr_generated')
      
      console.log(' QR Code result:', {
        sessionId: result.sessionId || sessionId,
        hasQrCode: !!result.qrCode,
        isMock: result.mock || result.fallback || result.error,
        message: result.message
      })

      return NextResponse.json({
        success: true,
        sessionId: result.sessionId || sessionId,
        qrCode: result.qrCode,
        expiresIn: result.real ? 120000 : 300000, // Real QR expires in 2 min, mock in 5 min
        real: result.real || false,
        mock: result.mock || false,
        error: result.error || false,
        message: result.message || (
          result.real ? 'Real WhatsApp QR code generated! Scan with WhatsApp mobile app.' :
          result.mock ? 'Mock QR code generated for development/demo purposes.' : 
          'QR code generated successfully'
        )
      })
    } catch (error) {
      console.error(' WhatsApp service error:', error)
      
      // Check if this is an environment issue
      if (error instanceof Error && error.message.includes('browser/build environment')) {
        // Generate a simple mock QR code as fallback
        const mockQRCode = `data:image/svg+xml;base64,${Buffer.from(`
          <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
            <rect width="200" height="200" fill="white"/>
            <rect x="20" y="20" width="160" height="160" fill="none" stroke="black" stroke-width="2"/>
            <text x="100" y="110" text-anchor="middle" font-size="16" fill="black">WhatsApp QR</text>
            <text x="100" y="130" text-anchor="middle" font-size="12" fill="gray">Environment Error</text>
            <text x="100" y="150" text-anchor="middle" font-size="10" fill="gray">Mock QR Code</text>
          </svg>
        `).toString('base64')}`
        
        return NextResponse.json({
          success: true,
          sessionId: sessionId,
          qrCode: mockQRCode,
          mock: true,
          environmentError: true,
          message: 'WhatsApp service not available in this environment. Showing mock QR code for demonstration.'
        })
      }
      
      // For other errors, still try to provide a mock QR code
      const errorQRCode = `data:image/svg+xml;base64,${Buffer.from(`
        <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
          <rect width="200" height="200" fill="white"/>
          <text x="100" y="100" text-anchor="middle" font-size="14" fill="red">QR Generation Failed</text>
          <text x="100" y="120" text-anchor="middle" font-size="12" fill="gray">Mock QR Code</text>
          <text x="100" y="140" text-anchor="middle" font-size="10" fill="gray">Please try again</text>
        </svg>
      `).toString('base64')}`
      
      return NextResponse.json({
        success: true, // Still return success with mock QR
        sessionId: sessionId,
        qrCode: errorQRCode,
        mock: true,
        error: true,
        message: `QR code generation failed: ${error instanceof Error ? error.message : 'Unknown error'}. Showing mock QR code.`
      })
    }
    
  } catch (error) {
    console.error(' Error in QR generation endpoint:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
