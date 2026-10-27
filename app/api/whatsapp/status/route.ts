import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdminClient } from "@/backend/database/supabase-config"
import jwt from "jsonwebtoken"
import { getJWTSecret } from "@/lib/jwt"

const JWT_SECRET = getJWTSecret()

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "No token provided" }, { status: 401 })
    }

    const token = authHeader.substring(7)
    let decoded: any
    try {
      decoded = jwt.verify(token, JWT_SECRET)
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    const supabase = getSupabaseAdminClient()

    // Get user's company
    const { data: user } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', decoded.userId)
      .eq('active', true)
      .single()

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 403 })
    }

    // Get WhatsApp settings
    const { data: settings } = await supabase
      .from('whatsapp_settings')
      .select('*')
      .eq('company_id', user.company_id)
      .single()

    return NextResponse.json({
      success: true,
      status: settings?.connection_status || 'disconnected',
      phone_number: settings?.phone_number || null,
      settings: settings || null
    })
  } catch (error) {
    console.error("Get WhatsApp status error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
