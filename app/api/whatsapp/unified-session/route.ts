import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { UnifiedWhatsAppService } from '@/backend/services/unified-whatsapp-service'

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
    
    let userInfo: any
    try {
      userInfo = jwt.verify(token, jwtSecret) as any
    } catch (error) {
      return NextResponse.json(
        { success: false, error: 'Invalid token' },
        { status: 401 }
      )
    }

    console.log(' Getting unified WhatsApp session status for user:', userInfo.userId)

    // Get user's unified session status
    const sessionStatus = await UnifiedWhatsAppService.getUserSessionStatus(userInfo.userId)

    return NextResponse.json({
      success: true,
      ...sessionStatus
    })

  } catch (error) {
    console.error(' Error getting unified session status:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to get session status' },
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
    const { action, phoneNumber, status } = body

    console.log(` Unified WhatsApp action: ${action} for user:`, userInfo.userId)

    switch (action) {
      case 'create_session':
        if (!phoneNumber) {
          return NextResponse.json(
            { success: false, error: 'Phone number is required' },
            { status: 400 }
          )
        }
        
        //  Pass userId, companyId, and phoneNumber
        const createResult = await UnifiedWhatsAppService.createUserSession(userInfo.userId, userInfo.company_id, phoneNumber)
        return NextResponse.json(createResult)

      case 'update_status':
        if (!status) {
          return NextResponse.json(
            { success: false, error: 'Status is required' },
            { status: 400 }
          )
        }
        
        const updateSuccess = UnifiedWhatsAppService.updateUserSessionStatus(userInfo.userId, status, phoneNumber)
        return NextResponse.json({
          success: updateSuccess,
          message: updateSuccess ? 'Status updated' : 'Failed to update status'
        })

      case 'disconnect':
        const disconnectSuccess = UnifiedWhatsAppService.disconnectUserSession(userInfo.userId)
        return NextResponse.json({
          success: disconnectSuccess,
          message: disconnectSuccess ? 'Session disconnected' : 'Failed to disconnect'
        })

      case 'get_status':
        const sessionStatus = await UnifiedWhatsAppService.getUserSessionStatus(userInfo.userId)
        return NextResponse.json({
          success: true,
          ...sessionStatus
        })

      default:
        return NextResponse.json(
          { success: false, error: 'Invalid action' },
          { status: 400 }
        )
    }

  } catch (error) {
    console.error(' Error in unified WhatsApp service:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
