import { type NextRequest, NextResponse } from "next/server"
import jwt from "jsonwebtoken"
import { getSupabaseAdminClient } from "@/backend/database/supabase-config"
import { randomUUID } from "crypto"
import { getJWTSecret } from "@/lib/jwt"

const JWT_SECRET = getJWTSecret()

interface WhatsAppSession {
  id: string
  phoneNumber: string
  name: string
  connected: boolean
  lastSeen: string
  batteryLevel?: number
  platform?: string
  userId: string
  companyId: string
}

// GET - List WhatsApp sessions
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "No token provided" }, { status: 401 })
    }

    const token = authHeader.substring(7)
    let decoded: any
    try {
      decoded = jwt.verify(token, JWT_SECRET) as any
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    const userId = decoded.userId || decoded.id || decoded.sub
    const companyId = decoded.company_id || decoded.companyId

    if (!userId || !companyId) {
      return NextResponse.json({ error: "Missing user/company context" }, { status: 401 })
    }

    // Get user's WhatsApp sessions from Supabase
    const sessions = await getWhatsAppSessions(userId, companyId)
    
    return NextResponse.json({
      success: true,
      sessions
    })
  } catch (error) {
    console.error("Get WhatsApp sessions error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST - Create new WhatsApp session
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "No token provided" }, { status: 401 })
    }

    const token = authHeader.substring(7)
    let decoded: any
    try {
      decoded = jwt.verify(token, JWT_SECRET) as any
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    const userId = decoded.userId || decoded.id || decoded.sub
    const companyId = decoded.company_id || decoded.companyId

    if (!userId || !companyId) {
      return NextResponse.json({ error: "Missing user/company context" }, { status: 401 })
    }

    const body = await request.json()

    const session = await createWhatsAppSession({
      userId,
      companyId,
      phoneNumber: body.phoneNumber,
      name: body.name,
      platform: body.platform
    })
    
    return NextResponse.json({
      success: true,
      session
    })
  } catch (error) {
    console.error("Create WhatsApp session error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

async function getWhatsAppSessions(userId: string, companyId: string): Promise<WhatsAppSession[]> {
  try {
    const supabase = getSupabaseAdminClient()
    const { data: sessions, error } = await supabase
      .from('whatsapp_sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error("Error fetching WhatsApp sessions:", error)
      return []
    }

    return (sessions || []).map((session: any) => ({
      id: session.id,
      phoneNumber: session.phone_number,
      name: session.name,
      connected: Boolean(session.connected),
      lastSeen: session.last_seen,
      batteryLevel: session.battery_level,
      platform: session.platform,
      userId: session.user_id,
      companyId: session.company_id
    }))
  } catch (error) {
    console.error("Error getting WhatsApp sessions:", error)
    return []
  }
}

async function createWhatsAppSession(data: {
  userId: string
  companyId: string
  phoneNumber: string
  name: string
  platform?: string
}): Promise<WhatsAppSession> {
  const supabase = getSupabaseAdminClient()
  const sessionId = randomUUID()
  const now = new Date().toISOString()

  const { data: session, error } = await supabase
    .from('whatsapp_sessions')
    .insert({
      id: sessionId,
      user_id: data.userId,
      company_id: data.companyId,
      phone_number: data.phoneNumber,
      name: data.name,
      platform: data.platform || 'unknown',
      connected: true,
      created_at: now,
      last_seen: now
    })
    .select()
    .single()

  if (error) {
    console.error("Error creating WhatsApp session:", error)
    throw new Error("Failed to create WhatsApp session")
  }

  return {
    id: session.id,
    phoneNumber: session.phone_number,
    name: session.name,
    connected: Boolean(session.connected),
    lastSeen: session.last_seen,
    platform: session.platform,
    userId: session.user_id,
    companyId: session.company_id
  }
}
