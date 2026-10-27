export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdminClient } from "@/backend/database/supabase-config"
import jwt from 'jsonwebtoken'
import { getJWTSecret } from "@/lib/jwt"

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdminClient()
    
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

    const body = await request.json()
    const { sessionId, fromNumber, toNumber, messageBody, messageType = 'text', direction, contactName } = body
    
    if (!sessionId || !fromNumber || !toNumber || !messageBody || !direction) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Store message in Supabase
    const { data, error } = await supabase
      .from('whatsapp_messages')
      .insert({
        company_id: userInfo.company_id,
        session_id: sessionId,
        from_number: fromNumber,
        to_number: toNumber,
        message_body: messageBody,
        message_type: messageType,
        direction: direction,
        contact_name: contactName,
        timestamp: new Date().toISOString(),
        status: 'delivered',
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    if (error) {
      console.error(' Error storing message in Supabase:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to store message' },
        { status: 500 }
      )
    }

    console.log(` WhatsApp message stored: ${direction} message from ${fromNumber} to ${toNumber}`)

    return NextResponse.json({
      success: true,
      messageId: data?.id,
      message: 'Message stored successfully'
    })

  } catch (error) {
    console.error(' Error storing WhatsApp message:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to store message' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdminClient()
    
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

    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('sessionId')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Build Supabase query
    let query = supabase
      .from('whatsapp_messages')
      .select('*', { count: 'exact' })
      .eq('company_id', userInfo.company_id)
      .order('timestamp', { ascending: false })
      .range(offset, offset + limit - 1)

    if (sessionId) {
      query = query.eq('session_id', sessionId)
    }

    const { data: messages, error, count } = await query

    if (error) {
      console.error(' Error fetching messages from Supabase:', error)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch messages' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      // Normalise any legacy 'inbound'/'outbound' rows that may exist from
      // earlier migration attempts so the frontend filters always see
      // 'incoming'/'outgoing'.
      messages: (messages || []).map((m: any) => ({
        ...m,
        direction: m.direction === 'inbound' ? 'incoming'
                 : m.direction === 'outbound' ? 'outgoing'
                 : m.direction
      })),
      total: count || 0,
      limit,
      offset,
      hasMore: (offset + (messages?.length || 0)) < (count || 0)
    })

  } catch (error) {
    console.error(' Error fetching WhatsApp messages:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch messages' },
      { status: 500 }
    )
  }
}