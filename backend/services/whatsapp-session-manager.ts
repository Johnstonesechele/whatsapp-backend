import '@/lib/log-buffer'
import { WhatsAppService } from '@/backend/services/whatsapp-service'
import crypto from 'crypto'
import { getJWTSecret } from "@/lib/jwt"

// Enhanced security for session management
class WhatsAppSessionManager {
  private userSessions = new Map<string, string>() // userId -> sessionId
  private sessionData = new Map<string, {
    userId: string,
    companyId: string,     //  Added company_id
    sessionId: string,
    phoneNumber: string,
    status: string,
    createdAt: Date,
    lastActivity: Date,
    securityHash: string, // Added for session security
    ipAddress?: string,    // Track IP for security
    userAgent?: string     // Track user agent for security
  }>()

  // Rate limiting for session creation
  private rateLimits = new Map<string, { count: number, resetTime: Date }>()

  // Generate secure session ID
  private generateSecureSessionId(): string {
    return crypto.randomBytes(32).toString('hex')
  }

  // Generate security hash for session validation
  private generateSecurityHash(userId: string, sessionId: string, timestamp: string): string {
    const secret = getJWTSecret()
    return crypto.createHmac('sha256', secret)
      .update(`${userId}:${sessionId}:${timestamp}`)
      .digest('hex')
  }

  // Check rate limits for session creation
  private checkRateLimit(userId: string): boolean {
    const now = new Date()
    const userLimit = this.rateLimits.get(userId)
    
    if (!userLimit || now > userLimit.resetTime) {
      // Reset or create new rate limit (5 sessions per hour)
      this.rateLimits.set(userId, {
        count: 1,
        resetTime: new Date(now.getTime() + 60 * 60 * 1000) // 1 hour
      })
      return true
    }
    
    if (userLimit.count >= 5) {
      console.warn(` Rate limit exceeded for user ${userId}`)
      return false
    }
    
    userLimit.count++
    return true
  }

  // Validate session security
  validateSession(sessionId: string, userId: string): boolean {
    const session = this.sessionData.get(sessionId)
    if (!session) return false
    
    // Check if session belongs to user
    if (session.userId !== userId) {
      console.warn(` Session security violation: ${sessionId} doesn't belong to user ${userId}`)
      return false
    }
    
    // Check session age (max 24 hours)
    const maxAge = 24 * 60 * 60 * 1000 // 24 hours
    if (Date.now() - session.createdAt.getTime() > maxAge) {
      console.warn(` Session expired: ${sessionId}`)
      this.removeSession(sessionId)
      return false
    }
    
    // Validate security hash
    const expectedHash = this.generateSecurityHash(userId, sessionId, session.createdAt.toISOString())
    if (session.securityHash !== expectedHash) {
      console.warn(` Session security hash mismatch: ${sessionId}`)
      this.removeSession(sessionId)
      return false
    }
    
    return true
  }

  // Register a session for a user with enhanced security
  registerSession(userId: string, companyId: string, sessionId?: string, phoneNumber?: string, metadata?: { ipAddress?: string, userAgent?: string }) {
    // Check rate limits
    if (!this.checkRateLimit(userId)) {
      throw new Error('Rate limit exceeded for session creation')
    }
    
    // Clean up any existing session for this user
    this.cleanupUserSessions(userId)
    
    // Generate secure session ID if not provided
    const secureSessionId = sessionId || this.generateSecureSessionId()
    //  Use the SAME Date object for both createdAt storage and hash generation.
    // If two separate new Date() calls are used, the millisecond can differ and
    // validateSession() will recompute a different hash → permanent mismatch loop.
    const createdAt = new Date()
    const timestamp = createdAt.toISOString()
    const securityHash = this.generateSecurityHash(userId, secureSessionId, timestamp)
    
    this.userSessions.set(userId, secureSessionId)
    this.sessionData.set(secureSessionId, {
      userId,
      companyId,           //  Store company_id
      sessionId: secureSessionId,
      phoneNumber: phoneNumber || '',
      status: 'initializing',
      createdAt,           // same Date instance used for hash
      lastActivity: new Date(),
      securityHash,
      ipAddress: metadata?.ipAddress,
      userAgent: metadata?.userAgent
    })
    
    console.log(` Registered secure WhatsApp session ${secureSessionId} for user ${userId}, company ${companyId}`)
    return secureSessionId
  }

  // Get the active session for a user with security validation
  getUserSession(userId: string): string | null {
    const sessionId = this.userSessions.get(userId)
    if (!sessionId) return null
    
    // Validate session security
    if (!this.validateSession(sessionId, userId)) {
      this.userSessions.delete(userId)
      return null
    }
    
    return sessionId
  }

  // Get session data with security validation
  getSessionData(sessionId: string, userId?: string) {
    const session = this.sessionData.get(sessionId)
    if (!session) return null
    
    // If userId provided, validate session ownership
    if (userId && !this.validateSession(sessionId, userId)) {
      return null
    }
    
    // Update last activity
    session.lastActivity = new Date()
    this.sessionData.set(sessionId, session)
    
    return session
  }

  // Get session data with fallback lookup strategies
  getSessionDataFallback(sessionId: string) {
    // Strategy 1: Direct lookup
    let session = this.sessionData.get(sessionId)
    if (session) return session
    
    // Strategy 2: Try to find by phone number pattern
    // Extract phone number from session ID if it follows pattern: whatsapp_{phone}_{timestamp}
    const phoneMatch = sessionId.match(/whatsapp_(\d+)_/)
    if (phoneMatch) {
      const phoneNumber = phoneMatch[1]
      console.log(` Trying to find session by phone: ${phoneNumber}`)
      
      // Search through all sessions for matching phone
      for (const [sid, data] of this.sessionData.entries()) {
        if (data.phoneNumber && data.phoneNumber.replace(/\D/g, '').includes(phoneNumber)) {
          console.log(` Found matching session by phone: ${sid}`)
          return data
        }
      }
    }
    
    // Strategy 3: Get the most recently active session
    let mostRecent: any = null
    let mostRecentTime = 0
    
    for (const [sid, data] of this.sessionData.entries()) {
      const lastActivityTime = data.lastActivity.getTime()
      if (lastActivityTime > mostRecentTime) {
        mostRecentTime = lastActivityTime
        mostRecent = data
      }
    }
    
    if (mostRecent) {
      console.log(` Using most recent session as fallback`)
      return mostRecent
    }
    
    return null
  }

  // Update session status
  updateSessionStatus(sessionId: string, status: string, phoneNumber?: string) {
    const session = this.sessionData.get(sessionId)
    if (session) {
      session.status = status
      session.lastActivity = new Date()
      if (phoneNumber) {
        session.phoneNumber = phoneNumber
      }
      this.sessionData.set(sessionId, session)
    }
  }

  // Clean up sessions for a specific user
  cleanupUserSessions(userId: string) {
    console.log(` Cleaning up sessions for user: ${userId}`)
    
    const sessionId = this.userSessions.get(userId)
    if (sessionId) {
      this.sessionData.delete(sessionId)
      this.userSessions.delete(userId)
      console.log(` Cleaned up session ${sessionId} for user ${userId}`)
    }
    
    // Also clean up any rate limits
    this.rateLimits.delete(userId)
  }

  // Clean up all expired sessions
  cleanupExpiredSessions() {
    const now = Date.now()
    const maxAge = 24 * 60 * 60 * 1000 // 24 hours
    
    console.log(' Cleaning up expired sessions...')
    let cleanedCount = 0
    
    for (const [sessionId, sessionData] of this.sessionData.entries()) {
      const age = now - sessionData.createdAt.getTime()
      
      if (age > maxAge) {
        this.sessionData.delete(sessionId)
        this.userSessions.delete(sessionData.userId)
        cleanedCount++
        console.log(` Cleaned up expired session ${sessionId} for user ${sessionData.userId}`)
      }
    }
    
    console.log(` Cleaned up ${cleanedCount} expired sessions`)
    return cleanedCount
  }

  // Remove a session completely
  removeSession(sessionId: string) {
    const session = this.sessionData.get(sessionId)
    if (session) {
      this.userSessions.delete(session.userId)
      this.sessionData.delete(sessionId)
      console.log(` Removed session ${sessionId}`)
    }
  }

  // Get all sessions (for debugging)
  getAllSessions() {
    return Array.from(this.sessionData.values())
  }

  // Get all user sessions (for debugging)
  getAllUserSessions(): Map<string, string> {
    return new Map(this.userSessions)
  }

  // Get session statistics
  getSessionStats() {
    return {
      totalSessions: this.sessionData.size,
      activeSessions: Array.from(this.sessionData.values()).filter(s => s.status === 'ready').length,
      userCount: this.userSessions.size,
      rateLimitedUsers: this.rateLimits.size
    }
  }
}

// ── GLOBAL SINGLETON ─────────────────────────────────────────────────────────
// In Next.js dev mode, HMR re-evaluates this module on every file save.
// A plain `new WhatsAppSessionManager()` would wipe all registered sessions.
// Storing on `global` keeps the same instance alive for the Node process lifetime.
declare const global: typeof globalThis & {
  _whatsappSessionManager?: WhatsAppSessionManager
  _whatsappSessionCleanupInterval?: ReturnType<typeof setInterval>
}
if (!global._whatsappSessionManager) {
  global._whatsappSessionManager = new WhatsAppSessionManager()
}
// Re-attach the latest prototype on every HMR cycle so method fixes apply immediately.
Object.setPrototypeOf(global._whatsappSessionManager, WhatsAppSessionManager.prototype)
if (!global._whatsappSessionCleanupInterval) {
  global._whatsappSessionCleanupInterval = setInterval(() => {
    global._whatsappSessionManager?.cleanupExpiredSessions()
  }, 60 * 60 * 1000)
}
export const whatsappSessionManager = global._whatsappSessionManager

// WhatsApp service wrapper with session management
export class WhatsAppSessionService {
  static async generateQRCode(userId: string, companyId: string, phoneNumber: string) {
    try {
      console.log(` Generating QR code for user ${userId}, company ${companyId} with phone ${phoneNumber}`)
      
      const result = await WhatsAppService.generateQRCode(phoneNumber)
      
      // Register the session with company_id
      whatsappSessionManager.registerSession(userId, companyId, result.sessionId, phoneNumber)
      
      return {
        success: true,
        sessionId: result.sessionId,
        qrCode: result.qrCode,
        expiresIn: 120
      }
    } catch (error) {
      console.error('Error generating QR code:', error)
      throw error
    }
  }

  static async getSessionStatus(userId: string) {
    try {
      const sessionId = whatsappSessionManager.getUserSession(userId)
      
      if (!sessionId) {
        return {
          success: true,
          connected: false,
          status: 'no_session',
          message: 'No active WhatsApp session'
        }
      }

      const sessionData = whatsappSessionManager.getSessionData(sessionId)
      if (!sessionData) {
        return {
          success: true,
          connected: false,
          status: 'no_session',
          message: 'Session data not found'
        }
      }

      // Get actual status from WhatsApp service
      const whatsappStatus = await WhatsAppService.getSessionStatus(sessionId)
      
      // Update our session data
      if (whatsappStatus.success) {
        whatsappSessionManager.updateSessionStatus(
          sessionId, 
          whatsappStatus.status, 
          whatsappStatus.phoneNumber || sessionData.phoneNumber
        )
      }

      const connected = whatsappStatus.status === 'ready'
      
      return {
        success: true,
        connected,
        status: whatsappStatus.status,
        message: whatsappStatus.message || sessionData.status,
        phoneNumber: whatsappStatus.phoneNumber || sessionData.phoneNumber,
        sessionId: sessionId,
        session: connected ? {
          id: sessionId,
          phoneNumber: whatsappStatus.phoneNumber || sessionData.phoneNumber,
          name: `WhatsApp ${whatsappStatus.phoneNumber || sessionData.phoneNumber}`,
          connected: true,
          lastSeen: sessionData.lastActivity.toLocaleString(),
          platform: 'WhatsApp Web'
        } : null
      }
    } catch (error) {
      console.error('Error getting session status:', error)
      return {
        success: false,
        connected: false,
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  static async disconnectSession(userId: string) {
    try {
      const sessionId = whatsappSessionManager.getUserSession(userId)
      
      if (!sessionId) {
        return {
          success: true,
          message: 'No active session to disconnect'
        }
      }

      const result = await WhatsAppService.disconnectSession(sessionId)
      
      // Remove from our session manager
      whatsappSessionManager.removeSession(sessionId)
      
      return result
    } catch (error) {
      console.error('Error disconnecting session:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  static async sendMessage(userId: string, to: string, message: string) {
    try {
      const sessionId = whatsappSessionManager.getUserSession(userId)
      
      if (!sessionId) {
        throw new Error('No active WhatsApp session')
      }

      const result = await WhatsAppService.sendMessage(sessionId, to, message)
      
      // Update last activity
      const sessionData = whatsappSessionManager.getSessionData(sessionId)
      if (sessionData) {
        sessionData.lastActivity = new Date()
        whatsappSessionManager.updateSessionStatus(sessionId, sessionData.status)
      }

      return result
    } catch (error) {
      console.error('Error sending message:', error)
      throw error
    }
  }

  static async cleanupSessions(userId: string) {
    try {
      whatsappSessionManager.cleanupUserSessions(userId)
      return {
        success: true,
        message: 'Sessions cleaned up successfully'
      }
    } catch (error) {
      console.error('Error cleaning up sessions:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }
}
