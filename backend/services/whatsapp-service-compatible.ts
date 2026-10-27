// WhatsApp Web.js service - Next.js compatible version
// This version uses mock data for development when whatsapp-web.js can't be loaded

interface WhatsAppSession {
  status: string
  qrCode: string | null
  phoneNumber: string | null
  message: string
  createdAt: number
}

class NextJSCompatibleWhatsAppService {
  private sessions: Map<string, WhatsAppSession> = new Map()
  private mockMode = true

  async createSession(sessionId: string) {
    console.log(` Creating WhatsApp session: ${sessionId}`)
    
    // For Next.js compatibility, we'll use mock data
    // In a real deployment, this would be handled by a separate Node.js service
    
    const session: WhatsAppSession = {
      status: 'initializing',
      qrCode: null,
      phoneNumber: null,
      message: 'Initializing WhatsApp session...',
      createdAt: Date.now()
    }

    this.sessions.set(sessionId, session)

    // Simulate QR code generation after a delay
    setTimeout(() => {
      const updatedSession = this.sessions.get(sessionId)
      if (updatedSession) {
        updatedSession.status = 'qr_ready'
        updatedSession.qrCode = this.generateMockQRCode()
        updatedSession.message = 'QR code ready - scan with WhatsApp'
        this.sessions.set(sessionId, updatedSession)
      }
    }, 2000)

    return {
      success: true,
      sessionId,
      status: 'initializing'
    }
  }

  getSession(sessionId: string) {
    const session = this.sessions.get(sessionId)
    if (!session) {
      return {
        status: 'not_found',
        qrCode: null,
        phoneNumber: null,
        message: 'Session not found'
      }
    }

    return {
      status: session.status,
      qrCode: session.qrCode,
      phoneNumber: session.phoneNumber,
      message: session.message
    }
  }

  async generateQRCode(phoneNumber: string) {
    const sessionId = `session_${phoneNumber}_${Date.now()}`
    
    const result = await this.createSession(sessionId)
    
    if (!result.success) {
      throw new Error('Failed to create session')
    }
    
    // Wait for QR code to be ready (mock)
    return new Promise((resolve, reject) => {
      let attempts = 0
      const maxAttempts = 30
      
      const checkQR = () => {
        attempts++
        const session = this.getSession(sessionId)
        
        if (session && session.qrCode) {
          resolve({
            sessionId,
            qrCode: session.qrCode
          })
          return
        }
        
        if (attempts >= maxAttempts) {
          reject(new Error('QR code generation timeout'))
          return
        }
        
        setTimeout(checkQR, 1000)
      }
      
      setTimeout(checkQR, 1000)
    })
  }

  async getSessionStatus(sessionId: string) {
    const session = this.getSession(sessionId)
    return {
      success: true,
      status: session.status,
      phoneNumber: session.phoneNumber,
      message: session.message
    }
  }

  async sendMessage(sessionId: string, to: string, message: string) {
    const session = this.sessions.get(sessionId)
    
    if (!session) {
      return {
        success: false,
        error: 'Session not found'
      }
    }

    if (session.status !== 'ready') {
      return {
        success: false,
        error: 'WhatsApp not connected'
      }
    }

    // Mock message sending
    return {
      success: true,
      messageId: `msg_${Date.now()}`,
      to,
      message,
      mock: true
    }
  }

  async disconnectSession(sessionId: string) {
    this.sessions.delete(sessionId)
    return {
      success: true,
      message: 'Session disconnected'
    }
  }

  async cleanupSessionFiles(sessionId: string) {
    console.log(`Mock cleanup for session ${sessionId}`)
  }

  cleanupSessions() {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.createdAt < oneDayAgo && session.status !== 'ready') {
        console.log(` Cleaning up old session: ${sessionId}`)
        this.disconnectSession(sessionId)
      }
    }
  }

  private generateMockQRCode(): string {
    // Generate a mock QR code as a data URL
    const canvas = this.createQRCodeCanvas()
    return canvas
  }

  private createQRCodeCanvas(): string {
    // Create a simple SVG QR code pattern for display
    const qrSvg = `
    <svg width="256" height="256" xmlns="http://www.w3.org/2000/svg">
      <rect width="256" height="256" fill="white"/>
      <g fill="black">
        <!-- Mock QR code pattern -->
        <rect x="0" y="0" width="64" height="64"/>
        <rect x="192" y="0" width="64" height="64"/>
        <rect x="0" y="192" width="64" height="64"/>
        <rect x="96" y="96" width="64" height="64"/>
        <!-- Add more mock pattern elements -->
        <rect x="32" y="32" width="32" height="32" fill="white"/>
        <rect x="224" y="32" width="32" height="32" fill="white"/>
        <rect x="32" y="224" width="32" height="32" fill="white"/>
        <rect x="128" y="128" width="32" height="32" fill="white"/>
      </g>
      <text x="128" y="140" text-anchor="middle" font-family="Arial" font-size="12" fill="gray">
        DEMO QR CODE
      </text>
    </svg>`
    
    return `data:image/svg+xml;base64,${btoa(qrSvg)}`
  }
}

// Export singleton instance
export const whatsappWebService = new NextJSCompatibleWhatsAppService()
export const WhatsAppService = whatsappWebService

// Clean up sessions every 5 minutes
if (typeof window === 'undefined') {
  setInterval(() => {
    whatsappWebService.cleanupSessions()
  }, 5 * 60 * 1000)
}
