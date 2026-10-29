// WhatsApp Web.js service - Environment-aware implementation
// This service is designed to work with whatsapp-web.js but avoids build issues in Next.js

let Client: any = null
let LocalAuth: any = null

// Check if we're in a browser environment and disable WhatsApp if so
const isBrowser = typeof window !== 'undefined'
const isNextJSBuild = process.env.NODE_ENV === 'production' && process.env.NEXT_RUNTIME === undefined

// Conditionally import whatsapp-web.js only in appropriate environments
const initWhatsAppDependencies = async () => {
  if (isBrowser || isNextJSBuild) {
    throw new Error('WhatsApp Web.js is not available in browser/build environment')
  }
  
  if (!Client || !LocalAuth) {
    try {
      const whatsappModule = await import('whatsapp-web.js')
      Client = whatsappModule.Client
      LocalAuth = whatsappModule.LocalAuth
    } catch (error) {
      console.error('Failed to import WhatsApp dependencies:', error)
      throw new Error('WhatsApp dependencies not available - this is expected in Next.js builds')
    }
  }
}

import QRCode from 'qrcode'

// Conditionally import puppeteer
let puppeteer: any = null
const initPuppeteer = async () => {
  if (isBrowser || isNextJSBuild) {
    throw new Error('Puppeteer is not available in browser/build environment')
  }
  
  if (!puppeteer) {
    try {
      puppeteer = await import('puppeteer')
    } catch (error) {
      console.error('Failed to import Puppeteer:', error)
      throw new Error('Puppeteer not available - this is expected in Next.js builds')
    }
  }
}

class WhatsAppWebService {
  private clients: Map<string, any> = new Map()
  private sessions: Map<string, any> = new Map()

  async createSession(sessionId: string) {
    try {
      // Check if we're in an environment that supports WhatsApp Web.js
      if (isBrowser || isNextJSBuild) {
        console.log('WhatsApp service not available in this environment')
        return {
          success: false,
          error: 'WhatsApp service not available in browser/build environment. Use a standalone Node.js server for WhatsApp functionality.'
        }
      }

      // Initialize WhatsApp dependencies
      await initWhatsAppDependencies()
      await initPuppeteer()

      console.log(` Creating WhatsApp session: ${sessionId}`)
      
      // Check if session already exists
      if (this.sessions.has(sessionId)) {
        console.log(` Session ${sessionId} already exists, returning existing`)
        const existingSession = this.sessions.get(sessionId)
        return {
          success: true,
          sessionId,
          status: existingSession.status
        }
      }
      
      // Get the browser executable path from puppeteer
      const browserExecutablePath = puppeteer.executablePath()
      console.log(`Using browser at: ${browserExecutablePath}`)
      
      // Create a new client with session-specific authentication
      const client = new Client({
        authStrategy: new LocalAuth({
          clientId: sessionId
        }),
        puppeteer: {
          headless: true,
          executablePath: browserExecutablePath,
          timeout: 60000, // 60 second timeout
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--disable-gpu',
            '--disable-features=VizDisplayCompositor',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--no-default-browser-check',
            '--disable-default-apps',
            '--disable-extensions',
            '--disable-features=TranslateUI'
          ]
        }
      })

      // Store session info
      this.sessions.set(sessionId, {
        status: 'initializing',
        qrCode: null,
        phoneNumber: null,
        createdAt: Date.now()
      })
      
      console.log(` Session ${sessionId} initialized with status: initializing`)

      let qrCodeData: string | null = null

      // Listen for QR code generation
      client.on('qr', async (qr: string) => {
        console.log(`QR code generated for session ${sessionId}`)
        
        // Generate QR code as data URL
        qrCodeData = await QRCode.toDataURL(qr, {
          width: 256,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        })

        // Update session with QR code
        const session = this.sessions.get(sessionId)
        if (session) {
          session.status = 'qr_ready'
          session.qrCode = qrCodeData
          this.sessions.set(sessionId, session)
        }
      })

      // Listen for authentication
      client.on('authenticated', () => {
        console.log(`Client authenticated for session ${sessionId}`)
        const session = this.sessions.get(sessionId)
        if (session) {
          session.status = 'authenticated'
          this.sessions.set(sessionId, session)
        }
      })

      // Listen for ready state
      client.on('ready', async () => {
        console.log(`Client ready for session ${sessionId}`)
        
        // Get phone number info
        const info = client.info
        const phoneNumber = info?.wid?.user
        
        const session = this.sessions.get(sessionId)
        if (session) {
          session.status = 'ready'
          session.phoneNumber = phoneNumber ? `+${phoneNumber}` : null
          this.sessions.set(sessionId, session)
        }
      })

      // Listen for authentication failure
      client.on('auth_failure', (msg: any) => {
        console.log(`Authentication failed for session ${sessionId}:`, msg)
        const session = this.sessions.get(sessionId)
        if (session) {
          session.status = 'auth_failed'
          session.error = msg
          this.sessions.set(sessionId, session)
        }
      })

      // Listen for disconnection
      client.on('disconnected', (reason: any) => {
        console.log(`Client disconnected for session ${sessionId}:`, reason)
        const session = this.sessions.get(sessionId)
        if (session) {
          session.status = 'disconnected'
          session.disconnectReason = reason
          this.sessions.set(sessionId, session)
        }
        // Clean up client
        this.clients.delete(sessionId)
        
        // Attempt to clean up session files if they're locked
        this.cleanupSessionFiles(sessionId)
      })

      // Listen for loading screen
      client.on('loading_screen', (percent: number, message: string) => {
        console.log(`Loading for session ${sessionId}: ${percent}% - ${message}`)
      })

      // Store client
      this.clients.set(sessionId, client)

      // Initialize the client with timeout
      const initTimeout = setTimeout(() => {
        console.log(`Initialization timeout for session ${sessionId}`)
        const session = this.sessions.get(sessionId)
        if (session && session.status === 'initializing') {
          session.status = 'timeout'
          session.error = 'Initialization timeout'
          this.sessions.set(sessionId, session)
        }
      }, 30000) // 30 second timeout

      console.log(`Initializing WhatsApp client for session ${sessionId}`)
      await client.initialize()
      
      clearTimeout(initTimeout)

      return {
        success: true,
        sessionId,
        status: 'initializing'
      }

    } catch (error) {
      console.error(`Error creating WhatsApp session ${sessionId}:`, error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  getSession(sessionId: string) {
    return this.sessions.get(sessionId)
  }

  getQRCode(sessionId: string) {
    const session = this.sessions.get(sessionId)
    return session?.qrCode || null
  }

  async sendMessage(sessionId: string, to: string, message: string) {
    try {
      const client = this.clients.get(sessionId)
      const session = this.sessions.get(sessionId)

      console.log(` Attempting to send message via session ${sessionId}`)
      console.log(`Session status: ${session?.status}`)
      console.log(`Client exists: ${!!client}`)

      if (!client) {
        console.log(` No client found for session ${sessionId}`)
        return {
          success: false,
          error: 'WhatsApp client not found. Please reconnect.'
        }
      }

      if (!session) {
        console.log(` No session data found for ${sessionId}`)
        return {
          success: false,
          error: 'Session data not found. Please reconnect.'
        }
      }

      // Allow sending if client is ready or authenticated (more permissive)
      if (session.status !== 'ready' && session.status !== 'authenticated') {
        console.log(` Session ${sessionId} not ready. Status: ${session.status}`)
        return {
          success: false,
          error: `Session not ready. Current status: ${session.status}. Please ensure WhatsApp is connected.`
        }
      }

      // Format phone number (remove + and add country code if needed)
      let formattedNumber = to.replace(/[^\d]/g, '')
      
      // Add @c.us suffix if not present
      if (!formattedNumber.includes('@')) {
        formattedNumber = `${formattedNumber}@c.us`
      }

      console.log(` Sending message to ${formattedNumber}`)

      // Check if client is still connected
      const state = await client.getState()
      console.log(`Client state: ${state}`)

      if (state !== 'CONNECTED') {
        console.log(` Client not connected. State: ${state}`)
        return {
          success: false,
          error: `WhatsApp not connected. State: ${state}. Please reconnect.`
        }
      }

      const result = await client.sendMessage(formattedNumber, message)
      console.log(` Message sent successfully:`, result.id)

      return {
        success: true,
        messageId: result.id._serialized || `msg_${Date.now()}`,
        timestamp: new Date().toISOString()
      }

    } catch (error) {
      console.error(` Error sending message in session ${sessionId}:`, error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred while sending message'
      }
    }
  }

  async destroySession(sessionId: string) {
    try {
      const client = this.clients.get(sessionId)
      
      if (client) {
        await client.destroy()
        this.clients.delete(sessionId)
      }
      
      this.sessions.delete(sessionId)

      return {
        success: true,
        message: 'Session destroyed successfully'
      }

    } catch (error) {
      console.error(`Error destroying session ${sessionId}:`, error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  // Clean up expired sessions (older than 10 minutes)
  cleanupSessions() {
    const expireTime = Date.now() - (10 * 60 * 1000)
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.createdAt < expireTime && session.status !== 'ready') {
        console.log(`Cleaning up expired session: ${sessionId}`)
        this.destroySession(sessionId)
      }
    }
  }

  // Method to clean up session files when there are locking issues
  private async cleanupSessionFiles(sessionId: string) {
    try {
      const fs = require('fs').promises
      const path = require('path')
      const sessionPath = path.join(process.cwd(), '.wwebjs_auth', `session-${sessionId}`)
      
      // Wait a bit before cleanup to allow file handles to close
      setTimeout(async () => {
        try {
          // Try to remove the lockfile specifically
          const lockfilePath = path.join(sessionPath, 'lockfile')
          try {
            await fs.unlink(lockfilePath)
            console.log(` Cleaned up lockfile for session ${sessionId}`)
          } catch (error) {
            // Lockfile might not exist or already be removed
            console.log(` Lockfile cleanup for ${sessionId}: ${error instanceof Error ? error.message : 'Unknown error'}`)
          }
        } catch (error) {
          console.log(` Session cleanup for ${sessionId} failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      }, 2000) // Wait 2 seconds before cleanup
    } catch (error) {
      console.error(` Error in cleanup for session ${sessionId}:`, error)
    }
  }
}

// Create singleton instance
export const whatsappWebService = new WhatsAppWebService()

// Clean up sessions every 5 minutes
setInterval(() => {
  whatsappWebService.cleanupSessions()
}, 5 * 60 * 1000)

// Keep the old Twilio-based service for backward compatibility
import twilio from 'twilio'
import { DatabaseUtils, WhatsAppMenu, WhatsAppMenuOption } from '@/backend/database/db-api'

export class WhatsAppService {
  static async createClient() {
    const whatsappSettings = await DatabaseUtils.getWhatsAppSettings()
    
    if (!whatsappSettings.enableWhatsApp || !whatsappSettings.accountSid || !whatsappSettings.authToken) {
      throw new Error('WhatsApp settings are not properly configured')
    }

    return twilio(whatsappSettings.accountSid, whatsappSettings.authToken)
  }

  static async sendWhatsAppMessage(to: string | string[], message: string, menuId?: string) {
    try {
      const client = await this.createClient()
      const whatsappSettings = await DatabaseUtils.getWhatsAppSettings()

      const recipients = Array.isArray(to) ? to : [to]
      const results = []

      // Add menu if specified
      let messageContent = message
      if (menuId) {
        const menu = await this.getMenuById(menuId)
        if (menu) {
          messageContent = this.formatMessageWithMenu(message, menu)
        }
      }

      for (const phoneNumber of recipients) {
        try {
          const result = await client.messages.create({
            body: messageContent,
            from: `whatsapp:${whatsappSettings.fromNumber}`,
            to: `whatsapp:${this.formatPhoneNumber(phoneNumber)}`
          })
          
          results.push({ 
            phone: phoneNumber, 
            status: 'sent', 
            messageId: result.sid 
          })
          console.log('WhatsApp message sent successfully:', result.sid)
        } catch (error) {
          console.error(`Failed to send WhatsApp message to ${phoneNumber}:`, error)
          results.push({ 
            phone: phoneNumber, 
            status: 'failed', 
            error: error instanceof Error ? error.message : 'Unknown error' 
          })
        }

        // Small delay between messages
        if (recipients.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }

      return results
    } catch (error) {
      console.error('WhatsApp service error:', error)
      throw error
    }
  }

  static async sendTestWhatsApp() {
    const whatsappSettings = await DatabaseUtils.getWhatsAppSettings()
    
    const testMessage = ` *WhatsApp Test Message*\n\nThis is a test message from your CRM system to verify WhatsApp integration.\n\n Sent at: ${new Date().toLocaleString()}`

    // For testing, send to the configured number
    const testNumber = whatsappSettings.fromNumber || '+1234567890'
    
    return this.sendWhatsAppMessage(testNumber, testMessage)
  }

  static async sendScheduledWhatsApp(scheduledMessage: any, recipients: string[]) {
    try {
      const phoneNumbers = recipients.filter(phone => this.isValidPhoneNumber(phone))
      
      if (phoneNumbers.length === 0) {
        throw new Error('No valid phone numbers found')
      }

      const results = await this.sendWhatsAppMessage(
        phoneNumbers, 
        scheduledMessage.message,
        scheduledMessage.whatsappMenuId
      )

      return results
    } catch (error) {
      console.error('Failed to send scheduled WhatsApp message:', error)
      throw error
    }
  }

  static async getMenuById(menuId: string): Promise<WhatsAppMenu | null> {
    const menus = await DatabaseUtils.getWhatsAppMenus()
    return menus.find(menu => menu.id === menuId) || null
  }

  static formatMessageWithMenu(originalMessage: string, menu: WhatsAppMenu): string {
    let formattedMessage = `*${menu.title}*\n\n${originalMessage}\n\n`
    
    // Add description as welcome message if available
    if (menu.description) {
      formattedMessage += ` *${menu.description}*\n\n`
    }
    
    return formattedMessage
  }

  static async handleMenuResponse(phoneNumber: string, response: string, menuId: string): Promise<string> {
    try {
      const menu = await this.getMenuById(menuId)
      if (!menu) {
        return "Sorry, the menu is no longer available."
      }

      // Get menu options from database
      const options = await DatabaseUtils.getWhatsAppMenuOptions(menuId)
      const selectedOption = options.find(option => option.optionKey === response.trim())
      
      if (!selectedOption) {
        const validOptions = options.map(opt => opt.optionKey).join(', ')
        return ` Invalid selection. Please choose from: ${validOptions}`
      }

      return selectedOption.message || "No response configured for this option."
    } catch (error) {
      console.error('Error handling menu response:', error)
      return "Sorry, there was an error processing your selection. Please try again."
    }
  }

  // New WhatsApp Web.js integration methods
  static async generateQRCode(phoneNumber: string) {
    try {
      console.log(' WhatsAppService.generateQRCode called with:', phoneNumber)
      const sessionId = `session_${phoneNumber}_${Date.now()}`
      console.log(' Creating session:', sessionId)
      
      const result = await whatsappWebService.createSession(sessionId)
      console.log(' Session creation result:', result)
      
      if (!result.success) {
        throw new Error(result.error)
      }
      
      // Wait for QR code to be generated (up to 30 seconds)
      let attempts = 0
      const maxAttempts = 30
      
      console.log('⏳ Waiting for QR code generation...')
      while (attempts < maxAttempts) {
        const session = whatsappWebService.getSession(sessionId)
        console.log(` Attempt ${attempts + 1}: Session status:`, session?.status, 'Has QR:', !!session?.qrCode)
        
        if (session && session.qrCode) {
          console.log(' QR code generated successfully')
          return {
            sessionId,
            qrCode: session.qrCode
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000))
        attempts++
      }
      
      throw new Error('QR code generation timeout')
    } catch (error) {
      console.error('Error generating QR code:', error)
      throw error
    }
  }

  static async getSessionStatus(sessionId: string) {
    try {
      console.log(' WhatsAppService.getSessionStatus called with:', sessionId)
      const session = whatsappWebService.getSession(sessionId)
      console.log(' Session found:', !!session, 'Status:', session?.status)
      
      if (!session) {
        console.log(' Session not found or expired')
        return {
          status: 'disconnected',
          message: 'Session not found or expired',
          phoneNumber: null
        }
      }

      let message = ''
      switch (session.status) {
        case 'initializing':
          message = 'Initializing WhatsApp session...'
          break
        case 'qr_ready':
          message = 'QR code ready - please scan with your phone'
          break
        case 'authenticated':
          message = 'Authentication successful - connecting...'
          break
        case 'ready':
          message = 'WhatsApp connected successfully'
          break
        case 'auth_failed':
          message = 'Authentication failed - please try again'
          break
        case 'disconnected':
          message = 'WhatsApp session disconnected'
          break
        default:
          message = 'Unknown session status'
      }

      return {
        status: session.status,
        message,
        phoneNumber: session.phoneNumber
      }
    } catch (error) {
      console.error('Error getting session status:', error)
      return {
        status: 'error',
        message: 'Failed to get session status',
        phoneNumber: null
      }
    }
  }

  static async disconnectSession(sessionId: string) {
    try {
      await whatsappWebService.destroySession(sessionId)
      return {
        success: true,
        message: 'Session disconnected successfully'
      }
    } catch (error) {
      console.error('Error disconnecting session:', error)
      throw error
    }
  }

  static async sendMessage(sessionId: string, to: string, message: string) {
    try {
      const result = await whatsappWebService.sendMessage(sessionId, to, message)
      
      if (!result.success) {
        throw new Error(result.error)
      }
      
      return {
        messageId: result.messageId,
        timestamp: result.timestamp
      }
    } catch (error) {
      console.error('Error sending message:', error)
      throw error
    }
  }

  private static formatPhoneNumber(phone: string): string {
    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, '')
    
    // Add country code if not present (assuming US +1 for example)
    if (cleaned.length === 10) {
      return `+1${cleaned}`
    } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `+${cleaned}`
    }
    
    // Return as-is if already formatted or international
    return phone.startsWith('+') ? phone : `+${cleaned}`
  }

  private static isValidPhoneNumber(phone: string): boolean {
    // Basic phone number validation
    const phoneRegex = /^\+?[1-9]\d{1,14}$/
    const cleaned = phone.replace(/\s|-|\(|\)/g, '')
    return phoneRegex.test(cleaned)
  }
}
