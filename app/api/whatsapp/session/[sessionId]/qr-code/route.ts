export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from "next/server"
import jwt from "jsonwebtoken"

interface WhatsAppSession {
  id: string
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
  qrCode?: string
  lastActivity?: string
}

// Mock WhatsApp session storage - in production this would be Redis or database
const sessions = new Map<string, WhatsAppSession>()

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const resolvedParams = await params
  try {
    const authHeader = request.headers.get("authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "No token provided" }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const jwtSecret = process.env.JWT_SECRET
    if (!jwtSecret) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
    }
    
    const decoded = jwt.verify(token, jwtSecret) as any
    const { sessionId } = resolvedParams

    if (!sessionId) {
      return NextResponse.json({ error: "Session ID is required" }, { status: 400 })
    }

    // Validate session ID format (prevent path traversal)
    if (!/^[a-zA-Z0-9-_]+$/.test(sessionId)) {
      return NextResponse.json({ error: "Invalid session ID format" }, { status: 400 })
    }

    const session = sessions.get(sessionId)
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 })
    }

    // Generate a mock QR code for demonstration
    if (session.status === 'connecting' && !session.qrCode) {
      session.qrCode = `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="white"/><text x="50%" y="50%" text-anchor="middle" dy=".3em">QR Code for ${sessionId}</text></svg>`
    }

    return NextResponse.json({
      success: true,
      sessionId,
      status: session.status,
      qrCode: session.qrCode || null,
      message: session.status === 'connected' ? 'WhatsApp connected successfully' : 
               session.status === 'connecting' ? 'Scan QR code to connect' : 
               'Session not active'
    })
  } catch (error) {
    console.error("WhatsApp QR code error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const resolvedParams = await params
  try {
    const authHeader = request.headers.get("authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "No token provided" }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const jwtSecret = process.env.JWT_SECRET
    if (!jwtSecret) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
    }
    
    const decoded = jwt.verify(token, jwtSecret) as any
    const { sessionId } = resolvedParams

    if (!sessionId) {
      return NextResponse.json({ error: "Session ID is required" }, { status: 400 })
    }

    // Validate session ID format
    if (!/^[a-zA-Z0-9-_]+$/.test(sessionId)) {
      return NextResponse.json({ error: "Invalid session ID format" }, { status: 400 })
    }

    // Create or reset session
    const newSession: WhatsAppSession = {
      id: sessionId,
      status: 'connecting',
      lastActivity: new Date().toISOString()
    }
    
    sessions.set(sessionId, newSession)

    return NextResponse.json({
      success: true,
      sessionId,
      status: newSession.status,
      message: 'Session created, waiting for QR scan'
    })
  } catch (error) {
    console.error("WhatsApp session creation error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const resolvedParams = await params
  try {
    const authHeader = request.headers.get("authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "No token provided" }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const jwtSecret = process.env.JWT_SECRET
    if (!jwtSecret) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
    }
    
    const decoded = jwt.verify(token, jwtSecret) as any
    const { sessionId } = resolvedParams

    if (!sessionId) {
      return NextResponse.json({ error: "Session ID is required" }, { status: 400 })
    }

    // Validate session ID format
    if (!/^[a-zA-Z0-9-_]+$/.test(sessionId)) {
      return NextResponse.json({ error: "Invalid session ID format" }, { status: 400 })
    }

    const deleted = sessions.delete(sessionId)
    
    return NextResponse.json({
      success: true,
      sessionId,
      message: deleted ? 'Session deleted successfully' : 'Session not found'
    })
  } catch (error) {
    console.error("WhatsApp session deletion error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
