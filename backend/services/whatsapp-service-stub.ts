// WhatsApp Service Stub - Safe for Next.js builds
// This provides the same interface as the real WhatsApp service but without browser-incompatible dependencies

export class WhatsAppWebService {
  private clients: Map<string, any> = new Map()
  private sessions: Map<string, any> = new Map()

  async createSession(sessionId: string) {
    console.log('WhatsApp service is not available in this environment. Use a standalone Node.js server for WhatsApp functionality.')
    return {
      success: false,
      error: 'WhatsApp service not available in browser/build environment. Use a standalone Node.js server for WhatsApp functionality.'
    }
  }

  getSession(sessionId: string) {
    return null
  }

  getQRCode(sessionId: string) {
    return null
  }

  async sendMessage(sessionId: string, to: string, message: string) {
    console.log('WhatsApp message sending not available in this environment')
    return {
      success: false,
      error: 'WhatsApp service not available in browser/build environment'
    }
  }

  async generateQRCode(phoneNumber: string) {
    console.log('WhatsApp QR code generation not available in this environment')
    return {
      success: false,
      error: 'WhatsApp service not available in browser/build environment'
    }
  }

  async getSessionStatus(sessionId: string) {
    console.log('WhatsApp session status not available in this environment')
    return {
      success: false,
      error: 'WhatsApp service not available in browser/build environment'
    }
  }

  async disconnectSession(sessionId: string) {
    console.log('WhatsApp session disconnect not available in this environment')
    return {
      success: false,
      error: 'WhatsApp service not available in browser/build environment'
    }
  }

  async sendTestWhatsApp() {
    console.log('WhatsApp test not available in this environment')
    return {
      success: false,
      error: 'WhatsApp service not available in browser/build environment'
    }
  }

  async cleanupSessionFiles(sessionId: string) {
    console.log('WhatsApp cleanup not available in this environment')
  }
}

// Export singleton instance
export const WhatsAppService = new WhatsAppWebService()
