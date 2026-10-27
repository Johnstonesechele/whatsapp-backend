import { whatsappSessionManager } from '@/backend/services/whatsapp-session-manager'

// Unified WhatsApp service for cross-section session management
export class UnifiedWhatsAppService {
  
  // Get the current user's WhatsApp session status
  static async getUserSessionStatus(userId: string): Promise<{
    hasSession: boolean
    sessionId: string | null
    status: string
    phoneNumber: string
    connected: boolean
  }> {
    try {
      // Strategy 1: Check in-memory session manager
      const sessionId = whatsappSessionManager.getUserSession(userId)

      if (sessionId) {
        const sessionData = whatsappSessionManager.getSessionData(sessionId)
        if (sessionData) {
          const connected = sessionData.status === 'ready'
          return {
            hasSession: true,
            sessionId,
            status: sessionData.status,
            phoneNumber: sessionData.phoneNumber || '',
            connected
          }
        }
      }

      // Strategy 2: Fall back to DB — session may have survived a server restart
      // via LocalAuth persistent storage. The connection-status route handles
      // auto-restore, but this endpoint is used by the dashboard which needs
      // to show the correct state immediately.
      try {
        const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
        const supabase = getSupabaseAdminClient()
        const { data: user } = await supabase
          .from('users')
          .select('company_id')
          .eq('id', userId)
          .eq('active', true)
          .single()

        if (user?.company_id) {
          const { data: dbSettings } = await supabase
            .from('whatsapp_settings')
            .select('connection_status, phone_number, session_id')
            .eq('company_id', user.company_id)
            .maybeSingle()

          if (dbSettings?.session_id) {
            // Re-register in memory so subsequent calls are fast
            if (userId) {
              whatsappSessionManager.registerSession(
                userId,
                user.company_id,
                dbSettings.session_id,
                dbSettings.phone_number || undefined
              )
            }
            const connected = dbSettings.connection_status === 'ready'
            return {
              hasSession: true,
              sessionId: dbSettings.session_id,
              status: dbSettings.connection_status || 'unknown',
              phoneNumber: dbSettings.phone_number || '',
              connected
            }
          }
        }
      } catch (dbError) {
        console.warn('DB fallback for unified session failed:', dbError)
      }

      // No session found anywhere
      return {
        hasSession: false,
        sessionId: null,
        status: 'no_session',
        phoneNumber: '',
        connected: false
      }
    } catch (error) {
      console.error('Error getting user session status:', error)
      return {
        hasSession: false,
        sessionId: null,
        status: 'error',
        phoneNumber: '',
        connected: false
      }
    }
  }
  
  // Create a new session for a user (used by both WhatsApp and Settings sections)
  static async createUserSession(userId: string, companyId: string, phoneNumber: string): Promise<{
    success: boolean
    sessionId: string | null
    error?: string
  }> {
    try {
      // Clean up any existing sessions for this user
      whatsappSessionManager.cleanupUserSessions(userId)
      
      // Generate new session ID
      const sessionId = `unified_${userId}_${Date.now()}`
      
      // Register the new session with company_id
      whatsappSessionManager.registerSession(userId, companyId, sessionId, phoneNumber)
      
      return {
        success: true,
        sessionId
      }
      
    } catch (error) {
      console.error('Error creating user session:', error)
      return {
        success: false,
        sessionId: null,
        error: error instanceof Error ? error.message : 'Failed to create session'
      }
    }
  }
  
  // Update session status (used by both sections)
  static updateUserSessionStatus(userId: string, status: string, phoneNumber?: string): boolean {
    try {
      const sessionId = whatsappSessionManager.getUserSession(userId)
      
      if (!sessionId) {
        console.warn(`No session found for user ${userId}`)
        return false
      }
      
      whatsappSessionManager.updateSessionStatus(sessionId, status, phoneNumber)
      return true
      
    } catch (error) {
      console.error('Error updating user session status:', error)
      return false
    }
  }
  
  // Disconnect user session (used by both sections)
  static disconnectUserSession(userId: string): boolean {
    try {
      const sessionId = whatsappSessionManager.getUserSession(userId)
      
      if (!sessionId) {
        return true // Already disconnected
      }
      
      // Update status to disconnected
      whatsappSessionManager.updateSessionStatus(sessionId, 'disconnected')
      
      // Remove the session
      whatsappSessionManager.removeSession(sessionId)
      
      return true
      
    } catch (error) {
      console.error('Error disconnecting user session:', error)
      return false
    }
  }
  
  // Get all active sessions (for debugging)
  static getAllSessions() {
    return whatsappSessionManager.getAllSessions()
  }
}

export default UnifiedWhatsAppService
