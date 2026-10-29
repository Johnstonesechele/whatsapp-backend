import '@/lib/log-buffer'
// WhatsApp Web.js service - Environment-aware implementation
// This service is designed to work with whatsapp-web.js but avoids build issues in Next.js

// Interface for QR code generation results
interface QRCodeResult {
  sessionId: string;
  qrCode?: string;
  real?: boolean;
  mock?: boolean;
  fallback?: boolean;
  error?: boolean;
  message?: string;
  expiresIn?: number;    // Expiration time in seconds
  expiresAt?: number;    // Expiration timestamp
}

let Client: any = null
let LocalAuth: any = null

// Check if we're in a browser environment and disable WhatsApp if so
const isBrowser = typeof window !== 'undefined'

// Check if we're in development and on the server side
const isServerSide = typeof window === 'undefined'

// Enable WhatsApp if explicitly enabled via environment variable
// This allows WhatsApp to work in Docker/production environments
const isWhatsAppEnabled = isServerSide && process.env.ENABLE_WHATSAPP === 'true'

console.log('WhatsApp service environment check:', {
  isBrowser,
  isServerSide,
  enabledExplicitly: process.env.ENABLE_WHATSAPP === 'true',
  isWhatsAppEnabled
})

// Conditionally import whatsapp-web.js only in appropriate environments
const initWhatsAppDependencies = async () => {
  if (isBrowser) {
    throw new Error('WhatsApp Web.js is not available in browser environment')
  }
  
  if (!Client || !LocalAuth) {
    try {
      console.log(' Loading WhatsApp Web.js dependencies...')
      // Try to import in server environment (including Next.js API routes)
      const whatsappModule = await import('whatsapp-web.js')
      
      // WhatsApp Web.js has a mixed export structure
      Client = whatsappModule.Client || whatsappModule.default?.Client
      LocalAuth = whatsappModule.LocalAuth || whatsappModule.default?.LocalAuth
      
      console.log(' WhatsApp Web.js dependencies loaded successfully')
      console.log(' Dependency check:', {
        Client: !!Client,
        LocalAuth: !!LocalAuth,
        directClient: !!whatsappModule.Client,
        directLocalAuth: !!whatsappModule.LocalAuth,
        defaultClient: !!whatsappModule.default?.Client,
        defaultLocalAuth: !!whatsappModule.default?.LocalAuth
      })
      
      // Test that the dependencies are working
      if (!Client || !LocalAuth) {
        console.error(' WhatsApp components validation failed:', {
          Client: !!Client,
          LocalAuth: !!LocalAuth,
          availableKeys: Object.keys(whatsappModule),
          defaultKeys: whatsappModule.default ? Object.keys(whatsappModule.default) : 'no default'
        })
        throw new Error('WhatsApp Web.js components failed to load properly')
      }
      
      return true
    } catch (error) {
      console.error(' Failed to import WhatsApp dependencies:', error)
      
      if (error instanceof Error) {
        if (error.message.includes('Cannot find module')) {
          throw new Error(`WhatsApp Web.js is not installed. Run: npm install whatsapp-web.js\nOriginal error: ${error.message}`)
        } else if (error.message.includes('puppeteer')) {
          throw new Error(`Puppeteer dependency missing. Run: npm install puppeteer\nOriginal error: ${error.message}`)
        } else {
          throw new Error(`WhatsApp Web.js initialization failed: ${error.message}`)
        }
      }
      
      throw new Error('WhatsApp dependencies not available - make sure whatsapp-web.js is installed')
    }
  }
  
  return true
}

import QRCode from 'qrcode'

// Conditionally import puppeteer
let puppeteer: any = null
const initPuppeteer = async () => {
  if (isBrowser) {
    throw new Error('Puppeteer is not available in browser environment')
  }
  
  if (!puppeteer) {
    try {
      puppeteer = await import('puppeteer')
      console.log(' Puppeteer loaded successfully')
    } catch (error) {
      console.error('Failed to import Puppeteer:', error)
      throw new Error('Puppeteer not available - install with: npm install puppeteer')
    }
  }
}

class WhatsAppWebService {
  private clients: Map<string, any> = new Map()
  private sessions: Map<string, any> = new Map()
  // Prevents concurrent createSession calls for the same sessionId (race condition guard)
  private pendingCreations: Set<string> = new Set()
  // Chromium is resource-heavy on Render. Only one browser may initialize at a time.
  private activeInitializationSessionId: string | null = null
  // Prevents the ready event handler from running multiple times for the same sessionId
  private readyProcessed: Set<string> = new Set()

  // Automatically update database settings when connection status changes
  private async updateDatabaseStatus(sessionId: string, status: string, phoneNumber?: string) {
    try {
      console.log(` Auto-updating database status for session ${sessionId}:`, {status, phoneNumber})
      
      // Get user ID from session manager - try multiple lookup strategies
      const { whatsappSessionManager } = await import('@/backend/services/whatsapp-session-manager')
      let sessionData = whatsappSessionManager.getSessionData(sessionId)
      
      let userId: string | null = null
      let companyId: string | null = null
      
      // Strategy 1: Direct session lookup
      if (sessionData && sessionData.userId) {
        userId = sessionData.userId
        companyId = sessionData.companyId || null
        console.log(` Session data found (direct):`, {
          userId: sessionData.userId,
          companyId,
          sessionId: sessionData.sessionId
        })
      } else {
        // Strategy 2: Try fallback lookup in session manager
        console.log(` Attempting fallback lookup for session ${sessionId}...`)
        sessionData = whatsappSessionManager.getSessionDataFallback(sessionId)
        
        if (sessionData && sessionData.userId) {
          userId = sessionData.userId
          companyId = sessionData.companyId || null
          console.log(` Session data found (fallback):`, {
            userId: sessionData.userId,
            companyId,
            sessionId: sessionData.sessionId
          })
        } else {
          // Strategy 3: Database lookup as last resort
          console.log(` Attempting database lookup for recent active user...`)
          
          const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
          const supabase = getSupabaseAdminClient()
          
          // Get the most recent active user
          const { data: recentUser, error: userError } = await supabase
            .from('users')
            .select('id, company_id')
            .eq('active', true)
            .order('updated_at', { ascending: false })
            .limit(1)
            .single()
          
          if (recentUser && !userError) {
            userId = recentUser.id
            companyId = recentUser.company_id
            console.log(` User found via database:`, { userId, companyId })
          } else {
            console.error(` Could not find any user for session ${sessionId}`)
            return
          }
        }
      }
      
      // Get user's company ID if not already found
      if (!companyId && userId) {
        const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
        const supabase = getSupabaseAdminClient()
        
        const { data: user, error: companyError } = await supabase
          .from('users')
          .select('company_id')
          .eq('id', userId)
          .eq('active', true)
          .single()
        
        if (!user || companyError) {
          console.warn(` No company found for user ${userId}`)
          return
        }
        
        companyId = user.company_id
      }
      
      console.log(` User company: ${companyId}`)
      
      // Update using Supabase
      const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
      const supabase = getSupabaseAdminClient()
      const now = new Date().toISOString()
      
      // Check if settings exist
      const { data: existing, error: fetchError } = await supabase
        .from('whatsapp_settings')
        .select('id, phone_number')
        .eq('company_id', companyId)
        .single()
      
      if (existing && !fetchError) {
        console.log(` Updating existing whatsapp_settings for company ${companyId}`)
        
        const updateData: any = {
          connection_status: status,
          phone_number: phoneNumber || existing.phone_number,
          session_id: sessionId,
          user_id: userId,
          updated_at: now
        }
        
        // Only update last_connected if status is 'ready'
        if (status === 'ready') {
          updateData.last_connected = now
        }
        // Record disconnect time for frontend notification polling
        if (status === 'disconnected' || status === 'auth_failed') {
          updateData.last_disconnected = now
          // Don't wipe the phone_number — keep it so the frontend can show which number disconnected
        }
        
        const { error: updateError } = await supabase
          .from('whatsapp_settings')
          .update(updateData)
          .eq('company_id', companyId)
        
        if (updateError) {
          console.error(' Error updating whatsapp_settings:', updateError)
          return
        }
      } else {
        console.log(` Creating new whatsapp_settings for company ${companyId}`)
        
        const { error: insertError } = await supabase
          .from('whatsapp_settings')
          .insert({
            company_id: companyId,
            user_id: userId,
            connection_status: status,
            phone_number: phoneNumber || null,
            session_id: sessionId,
            last_connected: status === 'ready' ? now : null,
            created_at: now,
            updated_at: now
          })
        
        if (insertError) {
          console.error(' Error creating whatsapp_settings:', insertError)
          return
        }
      }
      
      // Verify the update
      const { data: updated, error: verifyError } = await supabase
        .from('whatsapp_settings')
        .select('connection_status, phone_number')
        .eq('company_id', companyId)
        .single()
      
      if (updated && !verifyError) {
        console.log(` WhatsApp settings updated in Supabase for company ${companyId}:`, {
          status: updated.connection_status,
          phoneNumber: updated.phone_number,
          verified: updated.connection_status === status
        })
      }
      
    } catch (error) {
      console.error(' Error updating database status:', error)
      if (error instanceof Error) {
        console.error('Error details:', error.message)
        console.error('Stack:', error.stack)
      }
    }
  }

  async createSession(sessionId: string, userId?: string, companyId?: string) {
    try {
      // Check if we're in an environment that supports WhatsApp Web.js
      if (isBrowser || !isWhatsAppEnabled) {
        console.log('WhatsApp service not available in this environment')
        return {
          success: false,
          error: 'WhatsApp service requires ENABLE_WHATSAPP=true. Please set this environment variable.'
        }
      }

      // Initialize WhatsApp dependencies
      await initWhatsAppDependencies()
      await initPuppeteer()

      console.log(` Creating WhatsApp session: ${sessionId}`, { userId, companyId })

      // ── DEDUPLICATION GUARD ─────────────────────────────────────────────
      // Prevents the race condition where multiple concurrent HTTP requests
      // (background polls all firing auto-restore) each call createSession
      // before any of them has set this.sessions, creating 3 puppeteer clients
      // and causing the ready event to fire 3 times.
      if (this.sessions.has(sessionId) || this.pendingCreations.has(sessionId)) {
        console.log(` Session ${sessionId} already exists or is being created, skipping duplicate`)
        const existingSession = this.sessions.get(sessionId)
        return {
          success: true,
          sessionId,
          status: existingSession?.status || 'initializing'
        }
      }
      if (this.activeInitializationSessionId && this.activeInitializationSessionId !== sessionId) {
        console.warn(
          ` WhatsApp initialization already in progress for ${this.activeInitializationSessionId}; ` +
          `rejecting concurrent session ${sessionId}`
        )
        return {
          success: false,
          sessionId,
          error: 'Another WhatsApp connection is still starting. Please wait and try again.'
        }
      }
      this.pendingCreations.add(sessionId)
      this.activeInitializationSessionId = sessionId
      
      // Get the browser executable path from puppeteer (or system chromium)
      let browserExecutablePath = puppeteer.executablePath()
      const fsSync = require('fs')
      const candidates = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/chromium-shell']
      for (const c of candidates) {
        try {
          if (fsSync.existsSync(c)) { browserExecutablePath = c; break }
        } catch {}
      }
      console.log(`Using browser at: ${browserExecutablePath}`)
      
      // Create a new client with session-specific authentication
      // Use persistent disk path for session storage in Docker/Render
      const sessionDataPath = process.env.WHATSAPP_SESSION_PATH || 
        (process.env.NODE_ENV === 'production' ? '/app/.wwebjs_auth' : '.wwebjs_auth')

      // Ensure the parent directory exists (Render disk mount may be empty
      // and LocalAuth only mkdirs the session subdir, not the parent).
      try {
        const fs = require('fs')
        fs.mkdirSync(sessionDataPath, { recursive: true })
      } catch (e) {
        console.warn('Could not ensure session data path:', e)
      }

      const client = new Client({
        authStrategy: new LocalAuth({
          clientId: sessionId,
          dataPath: sessionDataPath
        }),
        puppeteer: {
          headless: true,
          executablePath: browserExecutablePath,
          timeout: 120000, // 120 second launch timeout (Render cold start)
          protocolTimeout: 600000, // 10 min for slow Render Chromium startup
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
            '--disable-features=TranslateUI',
            '--disable-ipc-flooding-protection'
          ]
        }
      })

      // Create a promise that resolves when the WhatsApp Web page is loaded
      // The QR event fires when the page is ready
      let pageReadyResolve: (() => void) | null = null
      const pageReadyPromise = new Promise<void>((resolve) => {
        pageReadyResolve = resolve
      })

      // Store session info with user context
      this.sessions.set(sessionId, {
        sessionId,
        status: 'initializing',
        qrCode: null,
        pairingCode: null,
        phoneNumber: null,
        pageReadyPromise,
        createdAt: Date.now(),
        userId: userId || null,      //  Store userId for ready event
        companyId: companyId || null, //  Store companyId for ready event
        error: null
      })
      
      console.log(` Session ${sessionId} initialized with user context:`, {
        status: 'initializing',
        userId: userId || 'not provided',
        companyId: companyId || 'not provided'
      })

      let qrCodeData: string | null = null

      // Listen for QR code generation
      client.on('qr', async (qr: string) => {
        console.log(`QR code generated for session ${sessionId}`)
        try {
          qrCodeData = await QRCode.toDataURL(qr, {
            width: 256,
            margin: 2,
            color: {
              dark: '#000000',
              light: '#FFFFFF'
            }
          })
        } catch (e: any) {
          console.error(`QR toDataURL failed for ${sessionId}:`, e && e.message ? e.message : e)
          const s = this.sessions.get(sessionId)
          if (s) { s.status = 'error'; s.error = 'QR encode failed: ' + (e && e.message ? e.message : e); this.sessions.set(sessionId, s) }
          return
        }

        // Update session with QR code and resolve page ready promise
        const session = this.sessions.get(sessionId)
        if (session) {
          session.status = 'qr_ready'
          session.qrCode = qrCodeData
          this.sessions.set(sessionId, session)
        }
        // Signal that the page is loaded
        pageReadyResolve?.()
        pageReadyResolve = null
      })

      client.on('loading_screen', (percent: any, message: any) => {
        console.log(`Loading screen for ${sessionId}: ${percent}% ${message}`)
        // Pairing-code login does not have to emit a QR event. Loading at
        // 100% is the equivalent signal that requestPairingCode can run.
        if (Number(percent) >= 100) {
          pageReadyResolve?.()
          pageReadyResolve = null
        }
      })

      // Listen for pairing code (phone number login)
      client.on('code', (code: string) => {
        console.log(`Pairing code for session ${sessionId}: ${code}`)
        const session = this.sessions.get(sessionId)
        if (session) {
          session.pairingCode = code
          session.status = 'pairing_code_ready'
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
        // ── DEDUP: ignore if another instance of this client already processed ready ──
        if (this.readyProcessed.has(sessionId)) {
          console.log(` ready event for ${sessionId} already processed — ignoring duplicate`)
          return
        }
        this.readyProcessed.add(sessionId)

        console.log(` WhatsApp client ready for session ${sessionId}`)
        
        // Get session data which includes userId and companyId
        const session = this.sessions.get(sessionId)
        const sessionUserId = session?.userId
        const sessionCompanyId = session?.companyId
        
        console.log(` Session context at ready:`, {
          sessionId,
          userId: sessionUserId || 'not found',
          companyId: sessionCompanyId || 'not found',
          fullSession: session ? {
            status: session.status,
            hasClient: !!session.client,
            phoneNumber: session.phoneNumber,
            createdAt: session.createdAt
          } : 'session not in map'
        })
        
        console.log(` DEBUG: All sessions in memory:`, Array.from(this.sessions.keys()))
        console.log(` DEBUG: Looking for sessionId: "${sessionId}"`)
        console.log(` DEBUG: Session exists in map: ${this.sessions.has(sessionId)}`)
        
        // Get phone number info with multiple fallback methods
        const info = client.info
        console.log(` Client info available:`, {
          hasInfo: !!info,
          hasWid: !!info?.wid,
          widUser: info?.wid?.user,
          widServer: info?.wid?.server,
          widString: info?.wid?._serialized,
          me: info?.me,
          platform: info?.platform,
          pushname: info?.pushname
        })
        
        // Try multiple methods to extract phone number
        let phoneNumber: string | null = null
        let extractionMethod = 'unknown'
        
        // Method 1: wid.user (most reliable)
        if (info?.wid?.user) {
          phoneNumber = info.wid.user
          extractionMethod = 'wid.user'
        }
        // Method 2: wid._serialized (format: "123456789@c.us")
        else if (info?.wid?._serialized) {
          const match = info.wid._serialized.match(/^(\d+)@/)
          if (match) {
            phoneNumber = match[1]
            extractionMethod = 'wid._serialized'
          }
        }
        // Method 3: me property
        else if (info?.me) {
          if (typeof info.me === 'string') {
            const match = info.me.match(/^(\d+)@/)
            if (match) {
              phoneNumber = match[1]
              extractionMethod = 'me (string)'
            }
          } else if (info.me?.user) {
            phoneNumber = info.me.user
            extractionMethod = 'me.user'
          }
        }
        
        // Format phone number
        let fullPhoneNumber: string | null = null
        if (phoneNumber) {
          // Remove any non-digit characters
          phoneNumber = phoneNumber.replace(/\D/g, '')
          
          // Add + prefix if not present
          fullPhoneNumber = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`
          
          console.log(` Phone number extracted: ${fullPhoneNumber} (via ${extractionMethod})`)
        } else {
          console.warn(` Could not extract phone number from client info`)
          fullPhoneNumber = null
        }
        
        console.log(` WhatsApp connected - Phone: ${fullPhoneNumber || 'Unknown'}, Method: ${extractionMethod}`)
        
        // Update session status in memory
        if (session) {
          session.status = 'ready'
          session.phoneNumber = fullPhoneNumber
          session.connectedAt = new Date().toISOString()
          session.client = client // Store client reference for message handling
          this.sessions.set(sessionId, session)
          console.log(` In-memory session updated: ${sessionId} -> status: ready, phone: ${fullPhoneNumber}`)
        } else {
          console.warn(` Session ${sessionId} not found in memory, creating new entry`)
          this.sessions.set(sessionId, {
            sessionId,
            status: 'ready',
            phoneNumber: fullPhoneNumber,
            connectedAt: new Date().toISOString(),
            client,
            qrCode: null,
            userId: sessionUserId,
            companyId: sessionCompanyId
          })
        }

        //  FIX: Get userId and companyId from session data first, fallback to session manager
        let userId = sessionUserId
        let companyId = sessionCompanyId
        
        // If not in session data, try session manager
        if (!userId || !companyId) {
          console.log(` User context not in session data, checking session manager...`)
          try {
            const { whatsappSessionManager } = await import('@/backend/services/whatsapp-session-manager')
            const sessionData = whatsappSessionManager.getSessionData(sessionId)
            
            if (sessionData) {
              userId = userId || sessionData.userId
              companyId = companyId || sessionData.companyId
              console.log(` Session manager provided context:`, { userId, companyId })
            } else {
              console.warn(` Session manager has no data for ${sessionId}`)
            }
          } catch (error) {
            console.error('Failed to query session manager:', error)
          }
        }
        
        // Update session manager with connection status
        if (userId && companyId) {
          try {
            const { whatsappSessionManager } = await import('@/backend/services/whatsapp-session-manager')
            whatsappSessionManager.updateSessionStatus(sessionId, 'ready', fullPhoneNumber || undefined)
            console.log(` Session manager updated for ${sessionId}: status=ready, phone=${fullPhoneNumber}`)
          } catch (error) {
            console.error('Failed to update session manager:', error)
          }

          // Auto-update database with connection status
          await this.updateDatabaseStatus(sessionId, 'ready', fullPhoneNumber || undefined)
          console.log(` Database updated for ${sessionId}: status=ready, phone=${fullPhoneNumber}`)

          // Notify the CRM immediately. Store hydration and welcome messages
          // can take longer and must not block the user's connected state.
          await this.notifyFrontendConnection(sessionId, fullPhoneNumber)

          // ── CLEAN UP ZOMBIE SESSIONS ─────────────────────────────────────
          // If there are other sessions for this company still initializing/qr_ready,
          // they are orphaned (user connected via this session). Destroy them.
          for (const [id, s] of this.sessions.entries()) {
            if (id !== sessionId && s.companyId === companyId &&
                ['initializing', 'qr_ready', 'authenticated', 'connecting'].includes(s.status)) {
              console.log(` Destroying zombie session ${id} (superseded by ${sessionId})`)
              try { this.clients.get(id)?.destroy() } catch {}
              this.clients.delete(id)
              this.sessions.delete(id)
              this.readyProcessed.delete(id)
            }
          }

          // ── WAIT FOR WHATSAPP WEB STORE ──────────────────────────────────
          // The ready event fires when the page loads, but window.Store.Chat
          // may still be undefined. sendMessage will throw 'getChat' errors
          // unless we wait for the Store to be fully populated.
          console.log(`⏳ Waiting for WhatsApp Web Store to be ready...`)
          await this.waitForWhatsAppStore(client)

          // ── STABILIZATION DELAY ──────────────────────────────────────────
          // After QR scan, WhatsApp Web performs a post-auth page navigation
          // (redirect to the main chat view). This happens AFTER the 'ready'
          // event and AFTER the Store initialises. If we evaluate JS during
          // that navigation, puppeteer throws "Execution context was destroyed".
          // Waiting here lets the page fully settle before we attempt to send.
          console.log(`⏳ Waiting 15s for WhatsApp Web post-auth navigation to settle...`)
          await new Promise(resolve => setTimeout(resolve, 15000))
          // Re-check that the Store is still available after navigation
          await this.waitForWhatsAppStore(client)
          // Extra gate: wait until WhatsApp has loaded at least some chat data,
          // which signals that the account data (including Lid tables) is ready.
          await this.waitForChatsLoaded(client)
          console.log(` Page stable and chat data loaded — proceeding to send connection messages`)

          // Send connection success notification to user's phone
          try {
            if (phoneNumber) {
              console.log(` Attempting to send connection success message to ${phoneNumber}`)
              await this.sendConnectionSuccessMessage(client, phoneNumber)
              console.log(` Connection success message sent successfully`)
            } else {
              console.warn(` No phone number available to send connection success message`)
            }
          } catch (error) {
            console.error(' Failed to send connection success message:', error)
          }
          
          // Wait a moment between messages to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000))
          
          // Send welcome message with commands
          try {
            if (phoneNumber) {
              console.log(` Attempting to send welcome message to ${phoneNumber}`)
              await this.sendWelcomeMessage(client, phoneNumber)
              console.log(` Welcome message sent successfully`)
            } else {
              console.warn(` No phone number available to send welcome message`)
            }
          } catch (error) {
            console.error(' Failed to send welcome message:', error)
          }

          // Allow ready to fire again on future reconnects for this session
          this.readyProcessed.delete(sessionId)

          console.log(` All connection notifications sent for session ${sessionId}`)
        } else {
          console.error(` Cannot process ready event: missing userId (${userId}) or companyId (${companyId})`)
          console.log(` Session will be ready but notifications/messages will not be sent`)
          this.readyProcessed.delete(sessionId)
        }
      })

      // Listen for incoming messages
      client.on('message', async (message: any) => {
        try {
          await this.handleIncomingMessage(client, message, sessionId)
        } catch (error) {
          console.error('Error handling incoming message:', error)
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

        // Update database status to 'auth_failed'
        this.updateDatabaseStatus(sessionId, 'auth_failed')
      })

      // Listen for disconnection — fired by wweb.js when the phone logs out,
      // the phone app loses internet, or the WhatsApp session is revoked.
      client.on('disconnected', async (reason: any) => {
        console.log(` WhatsApp client disconnected for session ${sessionId}. Reason:`, reason)
        
        // Immediately mark DB as disconnected so the frontend poll detects it
        await this.updateDatabaseStatus(sessionId, 'disconnected')
        
        // Update in-memory session
        const session = this.sessions.get(sessionId)
        if (session) {
          session.status = 'disconnected'
          session.disconnectedAt = new Date().toISOString()
          session.disconnectReason = String(reason)
          this.sessions.set(sessionId, session)
        }
        
        // Update session manager
        try {
          const { whatsappSessionManager } = await import('@/backend/services/whatsapp-session-manager')
          const sessionData = whatsappSessionManager.getSessionData(sessionId)
          whatsappSessionManager.updateSessionStatus(sessionId, 'disconnected', undefined)
          
          // Delayed full cleanup (give 5 s for any inflight DB writes to finish)
          setTimeout(async () => {
            console.log(` Starting full cleanup for disconnected session ${sessionId}`)

            // Clean up session from manager
            if (sessionData?.userId) {
              whatsappSessionManager.cleanupUserSessions(sessionData.userId)
            }
            
            // Destroy Puppeteer client
            const clientToDestroy = this.clients.get(sessionId)
            if (clientToDestroy) {
              try { await clientToDestroy.destroy() } catch {}
            }
            this.clients.delete(sessionId)
            this.sessions.delete(sessionId)
            this.readyProcessed.delete(sessionId)
            
            // Remove LocalAuth files so a fresh QR scan is required next time
            try {
              const fs = await import('fs/promises')
              const path = await import('path')
              const sessionDataPath = process.env.WHATSAPP_SESSION_PATH || 
                (process.env.NODE_ENV === 'production' ? '/app/.wwebjs_auth' : '.wwebjs_auth')

              // Ensure the parent directory exists (Render disk mount may be empty
              // and LocalAuth only mkdirs the session subdir, not the parent).
              try {
                const fs = require('fs')
                fs.mkdirSync(sessionDataPath, { recursive: true })
              } catch (e) {
                console.warn('Could not ensure session data path:', e)
              }
              const authPath = path.join(sessionDataPath, 'session-' + sessionId)
              await fs.rm(authPath, { recursive: true, force: true })
              console.log(`Auth files removed for session ${sessionId}`)
            } catch {}
            
            console.log(` Session ${sessionId} fully cleaned up after disconnect`)
          }, 5000)
        } catch (error) {
          console.error('Failed to update session manager on disconnect:', error)
        }
      })

      // Add connection heartbeat to monitor status
      const heartbeatInterval = setInterval(async () => {
        try {
          const session = this.sessions.get(sessionId)
          if (!session || session.status !== 'ready') {
            clearInterval(heartbeatInterval)
            return
          }

          // Check if client is still connected
          const state = await client.getState()
          if (state !== 'CONNECTED') {
            console.log(` WhatsApp client state changed to ${state} for session ${sessionId}`)
            
            if (session) {
              session.status = 'disconnected'
              session.disconnectedAt = new Date().toISOString()
              this.sessions.set(sessionId, session)
            }

            // Update status in session manager and database
            const { whatsappSessionManager } = await import('@/backend/services/whatsapp-session-manager')
            whatsappSessionManager.updateSessionStatus(sessionId, 'disconnected', undefined)
            await this.updateDatabaseStatus(sessionId, 'disconnected')
            
            clearInterval(heartbeatInterval)
          }
        } catch (error) {
          console.error(`Heartbeat error for session ${sessionId}:`, error)
        }
      }, 30000) // Check every 30 seconds

      // Store the client
      this.clients.set(sessionId, client)

      // Register the error listener before initialize() so an early browser or
      // protocol error is recorded instead of leaving the session initializing.
      client.on('error', (error: any) => {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`WhatsApp client error for ${sessionId}:`, message)
        const session = this.sessions.get(sessionId)
        if (session && ['initializing', 'connecting', 'qr_ready'].includes(session.status)) {
          session.status = 'error'
          session.error = message
          this.sessions.set(sessionId, session)
          void this.updateDatabaseStatus(sessionId, 'error').catch(() => {})
        }
      })

      // Initialize the client
      console.log(` Initializing WhatsApp client for session ${sessionId}`)
      client.initialize()
        .catch(async (err: any) => {
          const msg = err && err.message ? err.message : String(err)
          console.error(`WhatsApp client.initialize failed for ${sessionId}:`, msg)
          const s = this.sessions.get(sessionId)
          if (s) {
            s.status = 'error'
            s.error = msg
            this.sessions.set(sessionId, s)
          }
          await this.updateDatabaseStatus(sessionId, 'error').catch(() => {})
          try {
            await client.destroy()
          } catch (destroyError) {
            console.warn(`Failed to destroy broken WhatsApp client ${sessionId}:`, destroyError)
          }
          this.clients.delete(sessionId)
        })
        .finally(() => {
          this.pendingCreations.delete(sessionId)
          if (this.activeInitializationSessionId === sessionId) {
            this.activeInitializationSessionId = null
          }
        })
      client.on('auth_failure', async (msg: any) => {
        const reason = msg instanceof Error ? msg.message : String(msg)
        console.error(`Auth failure for ${sessionId}:`, reason)
        const session = this.sessions.get(sessionId)
        if (session) {
          session.status = 'auth_failed'
          session.error = reason
          this.sessions.set(sessionId, session)
        }
        await this.updateDatabaseStatus(sessionId, 'auth_failed').catch(() => {})
      })
      client.on('disconnected', async (reason: any) => {
        console.warn(`Disconnected ${sessionId}:`, reason)
        await this.updateDatabaseStatus(sessionId, 'disconnected').catch(() => {})
      })
      client.on('change_state', (state: any) => {
        console.log(`WhatsApp state changed for ${sessionId}:`, state)
      })
      return {
        success: true,
        sessionId,
        status: 'initializing'
      }

    } catch (error) {
      this.pendingCreations.delete(sessionId)  // always clean up on error
      if (this.activeInitializationSessionId === sessionId) {
        this.activeInitializationSessionId = null
      }
      console.error(`Error creating WhatsApp session ${sessionId}:`, error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Wait until window.Store.Chat AND window.Store.SendMessage are available.
   * The 'ready' event fires when the page loads but the Store may not be fully
   * populated yet, causing sendMessage to silently return null.
   */
  private async waitForWhatsAppStore(client: any, maxWaitMs = 30000): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < maxWaitMs) {
      try {
        const storeReady = await client.pupPage.evaluate(() => {
          const w = window as any
          return !!(
            w.Store?.Chat &&
            w.Store?.SendMessage &&
            w.Store?.Contact &&
            w.Store?.LidUtils &&
            w.Store?.FindOrCreateChat &&
            w.WWebJS?.enforceLidAndPnRetrieval
          )
        })
        if (storeReady) {
          console.log(` WhatsApp Web Store is ready`)
          return
        }
      } catch {
        // pupPage not accessible yet — keep waiting
      }
      await new Promise(resolve => setTimeout(resolve, 1500))
    }
    console.warn(` WhatsApp Web Store not ready after ${maxWaitMs}ms — proceeding anyway`)
  }

  /**
   * Wait until WhatsApp has loaded at least some chat data in the Store.
   * This means the account data (contact list, Lid tables, etc.) has been
   * fetched from WhatsApp servers and is available for message routing.
   * We give it up to 30 s; after that we proceed anyway to avoid blocking forever.
   */
  private async waitForChatsLoaded(client: any, maxWaitMs = 30000): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < maxWaitMs) {
      try {
        const chatsReady = await client.pupPage.evaluate(() => {
          const w = window as any
          const chatCount = w.Store?.Chat?.getModelsArray?.()?.length ?? 0
          return chatCount > 0
        })
        if (chatsReady) {
          console.log(` WhatsApp chat data loaded (account ready)`)
          return
        }
      } catch {
        // pupPage not accessible yet — keep waiting
      }
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
    console.warn(` WhatsApp chats not loaded after ${maxWaitMs}ms — proceeding anyway`)
  }

  /**
   * Ensure the recipient's Lid (multi-device Linked Identity) and chat are
   * fully resolved before calling client.sendMessage().
   *
   * Root causes fixed here:
   *
   * 1. "Lid is missing in chat table"
   *    WhatsApp's multi-device routing needs a Lid for every recipient.
   *    The Lid is only cached after Store.QueryExist() contacts the server.
   *    window.WWebJS.enforceLidAndPnRetrieval() is the official wweb.js helper
   *    that calls LidUtils.getCurrentLid() and falls back to QueryExist() when
   *    the Lid is not yet in the local table.
   *
   * 2. Silent null from sendMessage for new contacts
   *    WWebJS.getChat() (called inside client.sendMessage) uses
   *    Store.FindOrCreateChat.findOrCreateLatestChat() — NOT Store.Chat.find().
   *    We pre-call getChat() here so the chat is already in cache with the
   *    correct Backbone model, preventing the null-return path.
   */
  private async ensureChatLoaded(client: any, chatId: string): Promise<void> {
    try {
      const loaded = await client.pupPage.evaluate(async (id: string) => {
        try {
          const w = window as any

          // Step 1: resolve Lid via the official wweb.js helper.
          // This calls Store.LidUtils.getCurrentLid(); if missing it calls
          // Store.QueryExist() which does a server round-trip and populates
          // the Lid table, fixing "Lid is missing in chat table".
          await w.WWebJS.enforceLidAndPnRetrieval(id)

          // Step 2: pre-load the chat using the same path sendMessage uses
          // (FindOrCreateChat.findOrCreateLatestChat, not Store.Chat.find).
          await w.WWebJS.getChat(id, { getAsModel: false })

          // Step 3: short settle for internal table writes to flush.
          await new Promise((r: any) => setTimeout(r, 300))

          return true
        } catch {
          return false
        }
      }, chatId)
      if (loaded) {
        console.log(` Chat loaded for ${chatId}`)
      } else {
        console.warn(` Could not pre-load chat for ${chatId} — send will proceed anyway`)
      }
    } catch (err) {
      console.warn(` ensureChatLoaded error (non-fatal):`, err instanceof Error ? err.message : err)
    }
  }

  /**
   * Send a text message entirely within a single pupPage.evaluate call.
   *
   * The root cause of "Lid is missing in chat table" is that our pre-call to
   * enforceLidAndPnRetrieval() runs in one evaluate context while client.sendMessage()
   * creates a SECOND evaluate context. WhatsApp's async Lid-resolution side-effects
   * (device session cache writes) may not have fully committed by the time the
   * second context queries the same tables.
   *
   * By running Lid resolution + chat load + WWebJS.sendMessage in a SINGLE evaluate,
   * they share the same JS microtask queue, so all async writes are visible to the
   * subsequent sendMessage call without any inter-evaluate boundary.
   */
  private async sendInPageContext(client: any, chatId: string, message: string): Promise<{ msgId: string } | null> {
    const result = await client.pupPage.evaluate(async (id: string, text: string) => {
      try {
        const w = window as any

        // Step 1: Resolve the recipient's Lid via the official wweb.js helper.
        // This calls Store.QueryExist() if the Lid isn't cached yet, which
        // does a server round-trip and writes the result into LidUtils tables.
        await w.WWebJS.enforceLidAndPnRetrieval(id)

        // Step 2: Load (or create) the chat object using the same path
        // client.sendMessage uses internally (FindOrCreateChat), so the same
        // object is returned in getChat() when sendMessage runs.
        const chat = await w.WWebJS.getChat(id, { getAsModel: false })
        if (!chat) return { error: 'Chat not found' }

        // Step 3: settle for LidUtils internal table writes to complete.
        // 2 s gives the async Store.QueryExist response time to propagate into
        // all internal tables before addAndSendMsgToChat reads them.
        await new Promise((r: any) => setTimeout(r, 2000))

        // Step 4: Send using WWebJS.sendMessage directly (same internal function
        // that client.sendMessage calls after its getChat pre-check). This runs
        // in THE SAME evaluate context as steps 1-3, so the Lid resolution is
        // still "hot" in the microtask queue.
        const msg = await w.WWebJS.sendMessage(chat, text, {
          linkPreview: true,
          sendSeen: false,
          mentionedJidList: [],
          groupMentions: [],
          waitUntilMsgSent: false,
          ignoreQuoteErrors: true,
        })

        if (!msg) return { error: 'sendMessage returned null' }
        return { msgId: msg?.id?.id ?? `sent_${Date.now()}` }
      } catch (e: any) {
        return { error: e?.message ?? String(e) }
      }
    }, chatId, message)

    if (result?.error) {
      throw new Error(`WhatsApp send failed for ${chatId}: ${result.error}`)
    }
    return result
  }

  getSession(sessionId: string) {
    if (isBrowser || !isWhatsAppEnabled) {
      return {
        status: 'unavailable',
        qrCode: null,
        phoneNumber: null,
        message: 'WhatsApp requires ENABLE_WHATSAPP=true',
        client: null
      }
    }

    const session = this.sessions.get(sessionId)
    if (!session) {
      return {
        status: 'not_found',
        qrCode: null,
        phoneNumber: null,
        message: 'Session not found',
        client: null
      }
    }

    // Get client reference for message handling
    const client = this.clients.get(sessionId) || session.client

    return {
      status: session.status,
      qrCode: session.qrCode,
      pairingCode: session.pairingCode || null,
      phoneNumber: session.phoneNumber,
      message: session.status === 'ready' ? 'WhatsApp connected and ready for messaging' : 'Waiting for connection',
      client: client || null,
      connectedAt: session.connectedAt,
      sessionData: session
    }
  }

  getQRCode(sessionId: string) {
    const session = this.sessions.get(sessionId)
    return session?.qrCode || null
  }

  getPairingCode(sessionId: string) {
    const session = this.sessions.get(sessionId)
    return session?.pairingCode || null
  }

  async requestPairingCode(sessionId: string, phoneNumber: string): Promise<{ success: boolean, code?: string, error?: string }> {
    try {
      if (isBrowser || !isWhatsAppEnabled) {
        throw new Error('WhatsApp requires ENABLE_WHATSAPP=true')
      }

      const client = this.clients.get(sessionId)
      if (!client) {
        throw new Error('Session not found - client not initialized')
      }

      const session = this.sessions.get(sessionId)
      if (!session) {
        throw new Error('Session not found')
      }

      // Wait for the WhatsApp Web page to fully load before requesting pairing code
      // The QR event fires when the page is ready - it resolves the pageReadyPromise
      if (session.pageReadyPromise) {
        let timeoutId: ReturnType<typeof setTimeout> | undefined
        try {
          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('WhatsApp Web page did not load in time. Please try again.')), 90000)
          })
          await Promise.race([session.pageReadyPromise, timeoutPromise])
        } finally {
          if (timeoutId) clearTimeout(timeoutId)
        }
      }

      // Strip any non-numeric characters from phone number
      const cleanNumber = phoneNumber.replace(/\D/g, '')

      let codeTimeoutId: ReturnType<typeof setTimeout> | undefined
      let code: string
      try {
        const codePromise = client.requestPairingCode(cleanNumber)
        const codeTimeout = new Promise<never>((_, reject) => {
          codeTimeoutId = setTimeout(() => reject(new Error('WhatsApp did not return a pairing code within 60 seconds. Please try again.')), 60000)
        })
        code = await Promise.race([codePromise, codeTimeout])
      } finally {
        if (codeTimeoutId) clearTimeout(codeTimeoutId)
      }

      session.pairingCode = code
      session.status = 'pairing_code_ready'
      session.error = null
      this.sessions.set(sessionId, session)

      return { success: true, code }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to request pairing code'
      const session = this.sessions.get(sessionId)
      if (session) {
        session.status = 'error'
        session.error = message
        this.sessions.set(sessionId, session)
        void this.updateDatabaseStatus(sessionId, 'error').catch(() => {})
      }
      return {
        success: false,
        error: message
      }
    }
  }

  async sendMessage(sessionId: string, to: string, message: string) {
    try {
      if (isBrowser || !isWhatsAppEnabled) {
        throw new Error('WhatsApp requires ENABLE_WHATSAPP=true')
      }

      const client = this.clients.get(sessionId)
      if (!client) {
        throw new Error('Session not found')
      }

      const session = this.sessions.get(sessionId)
      if (session?.status !== 'ready') {
        throw new Error('WhatsApp not connected')
      }

      // Format phone number for WhatsApp
      const formattedNumber = this.formatPhoneNumber(to)
      const chatId = `${formattedNumber.replace('+', '')}@c.us`

      const result = await this.sendInPageContext(client, chatId, message)

      if (!result) {
        throw new Error(`sendMessage returned null for ${chatId} — chat may not exist on WhatsApp`)
      }

      return {
        success: true,
        messageId: result.msgId ?? `sent_${Date.now()}`,
        to: formattedNumber,
        message
      }

    } catch (error) {
      console.error('Error sending WhatsApp message:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  async generateQRCode(phoneNumber: string, providedSessionId?: string, userId?: string, companyId?: string): Promise<QRCodeResult> {
    /**
     * Why the real client did not start, when it did not.
     *
     * Declared out here so the catch below and the mock fallback share it. The
     * failure used to be logged and dropped, leaving the caller with
     * "ensure dependencies are installed" - a guess, and a wrong one given the
     * Dockerfile already installs them. A connection that cannot be made must
     * be able to say what stopped it.
     */
    let fallbackReason: string | undefined

    try {
      console.log(' WhatsAppService.generateQRCode called with:', {
        phoneNumber,
        sessionId: providedSessionId || 'will generate',
        userId: userId || 'not provided',
        companyId: companyId || 'not provided'
      })
      
      // First, try to initialize real WhatsApp dependencies
      try {
        await initWhatsAppDependencies()
        console.log(' WhatsApp dependencies initialized, attempting real QR generation')
        
        // Use provided sessionId or create a new one
        const sessionId = providedSessionId || `whatsapp_${phoneNumber.replace(/[^a-zA-Z0-9]/g, '').slice(-10)}_${Date.now()}`
        console.log(' Creating real WhatsApp session:', sessionId, 'with user context:', { userId, companyId })
        
        //  Pass userId and companyId to createSession
        const result = await this.createSession(sessionId, userId, companyId)
        console.log(' Session creation result:', result)
        
        if (result.success) {
          // Wait for real QR code to be generated (up to 30 seconds with progress)
          let attempts = 0
          const maxAttempts = 150
          
          console.log('⏳ Waiting for real QR code generation...')
          while (attempts < maxAttempts) {
            const session = this.getSession(sessionId)
            console.log(` Attempt ${attempts + 1}/${maxAttempts}: Session status:`, session?.status, 'Has QR:', !!session?.qrCode)
            
            if (session && session.qrCode) {
              console.log(' Real QR code generated successfully!')
              
              // Store QR generation time for expiration tracking
              const sessionData = this.sessions.get(sessionId)
              if (sessionData) {
                sessionData.qrGeneratedAt = Date.now()
                sessionData.qrExpiresAt = Date.now() + (120 * 1000) // QR expires in 2 minutes
                this.sessions.set(sessionId, sessionData)
              }
              
              return {
                sessionId,
                qrCode: session.qrCode,
                real: true,
                mock: false,
                fallback: false,
                error: false,
                expiresIn: 120, // 2 minutes in seconds
                expiresAt: Date.now() + (120 * 1000),
                message: 'Real WhatsApp QR code generated successfully. Expires in 2 minutes.'
              }
            }
            
            // Check if session failed
            if (session && (session.status === 'auth_failed' || session.status === 'disconnected' || session.status === 'error')) {
              console.log(' Session failed:', session.status, session.error)
              if (session.error) fallbackReason = session.error
              break
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000))
            attempts++
          }
          
          console.log(' Real QR generation timeout, providing enhanced mock')
        } else {
          console.log(' Session creation failed:', result.error)
        }
      } catch (dependencyError) {
        /**
         * Keep the reason. Previously this was logged and discarded, which is
         * why "Render returns a mock QR" was undiagnosable from the outside:
         * the response said "ensure dependencies are installed", which is a
         * guess - and a wrong one, because the Dockerfile installs all of them.
         *
         * Recorded in a variable the mock branch below can quote, so the caller
         * learns what actually happened instead of a generic instruction.
         */
        fallbackReason = dependencyError instanceof Error
          ? dependencyError.message
          : String(dependencyError)
        console.error(' WhatsApp dependencies failed to load:', fallbackReason)
      }
      
      throw new Error(
        fallbackReason || 'WhatsApp Web did not produce a real QR code before the timeout.'
      )

      // Fallback QR generation is intentionally unreachable. A fake QR code
      // cannot authenticate a phone and must never be reported as success.
      console.log(' Generating enhanced mock QR code', { reason: fallbackReason })
      const sanitizedPhone = phoneNumber.replace(/[^a-zA-Z0-9]/g, '').slice(-10)
      //  FIX: Use the provided session ID so the frontend's polling session matches
      const sessionId = providedSessionId || `mock_session_${sanitizedPhone}_${Date.now()}`
      
      // Create a more realistic looking mock QR code
      const mockQRCode = `data:image/svg+xml;base64,${Buffer.from(`
        <svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
          <!-- QR Code border -->
          <rect width="256" height="256" fill="white" stroke="#000" stroke-width="2"/>
          
          <!-- Corner markers -->
          <rect x="8" y="8" width="48" height="48" fill="none" stroke="black" stroke-width="3"/>
          <rect x="16" y="16" width="32" height="32" fill="black"/>
          
          <rect x="200" y="8" width="48" height="48" fill="none" stroke="black" stroke-width="3"/>
          <rect x="208" y="16" width="32" height="32" fill="black"/>
          
          <rect x="8" y="200" width="48" height="48" fill="none" stroke="black" stroke-width="3"/>
          <rect x="16" y="208" width="32" height="32" fill="black"/>
          
          <!-- Random QR pattern -->
          ${Array.from({length: 20}, (_, i) => {
            const x = Math.floor(Math.random() * 15) * 8 + 64;
            const y = Math.floor(Math.random() * 15) * 8 + 64;
            return `<rect x="${x}" y="${y}" width="8" height="8" fill="black"/>`;
          }).join('')}
          
          <!-- WhatsApp branding -->
          <text x="128" y="140" text-anchor="middle" font-size="12" font-weight="bold" fill="black">WhatsApp Web</text>
          <text x="128" y="160" text-anchor="middle" font-size="10" fill="gray">Development QR Code</text>
          <text x="128" y="180" text-anchor="middle" font-size="8" fill="gray">Phone: ${phoneNumber}</text>
          <text x="128" y="195" text-anchor="middle" font-size="8" fill="orange">Install puppeteer for real QR</text>
        </svg>
      `).toString('base64')}`
      
      // Store mock session for potential "connection simulation"
      this.sessions.set(sessionId, {
        status: 'qr_ready',
        qrCode: mockQRCode,
        phoneNumber: phoneNumber,
        createdAt: Date.now(),
        qrGeneratedAt: Date.now(),
        qrExpiresAt: Date.now() + (300 * 1000), // Mock QR expires in 5 minutes
        isMock: true,
        userId: userId || null,
        companyId: companyId || null
      })
      
      //  FIX: Register mock session in session manager so status polling works
      if (userId && companyId) {
        try {
          const { whatsappSessionManager } = await import('@/backend/services/whatsapp-session-manager')
          // Only register if not already registered (avoid overwriting existing registration from qr-code/route.ts)
          const existing = whatsappSessionManager.getSessionData(sessionId)
          if (!existing) {
            whatsappSessionManager.registerSession(userId, companyId, sessionId, phoneNumber)
            console.log(` Mock session ${sessionId} registered in session manager`)
          }
        } catch (smError) {
          console.warn('Could not register mock session in session manager:', smError)
        }
      }
      
      // Simulate connection after 30 seconds for demo purposes
      setTimeout(async () => {
        const session = this.sessions.get(sessionId)
        if (session && session.isMock) {
          session.status = 'ready'
          session.phoneNumber = phoneNumber
          session.connectedAt = new Date().toISOString()
          this.sessions.set(sessionId, session)
          console.log(` Mock session ${sessionId} simulated successful connection`)
          
          //  FIX: Also update session manager so polling endpoint sees the change
          try {
            const { whatsappSessionManager } = await import('@/backend/services/whatsapp-session-manager')
            whatsappSessionManager.updateSessionStatus(sessionId, 'ready', phoneNumber)
            console.log(` Mock session ${sessionId} updated in session manager: status=ready`)
          } catch (smError) {
            console.warn('Could not update session manager for mock connection:', smError)
          }
          
          // Update database status for mock connection
          this.updateDatabaseStatus(sessionId, 'ready', phoneNumber)
        }
      }, 30000) // 30 seconds
      
      /**
       * Report the real reason rather than a guess.
       *
       * This returned "Development QR code generated... ensure dependencies
       * are installed" on a production host that has the dependencies
       * installed. It is the same message a developer sees locally, on a
       * container, where the fix is genuinely to install something - so it
       * sends whoever reads it in the wrong direction.
       *
       * The cause is whatever stopped the real client above, captured in
       * fallbackReason. If nothing was captured the real attempt simply timed
       * out, and that is what it says.
       */
      return {
        sessionId,
        qrCode: mockQRCode,
        real: false,
        mock: true,
        fallback: true,
        error: true,
        reason: fallbackReason || 'WhatsApp did not produce a QR code within the timeout.',
        expiresIn: 300, // 5 minutes in seconds
        expiresAt: Date.now() + (300 * 1000),
        message: fallbackReason
          ? `Could not start a WhatsApp session: ${fallbackReason}`
          : 'Could not start a WhatsApp session: the client did not produce a QR code in time.',
      }
      
    } catch (error) {
      console.error('Error in generateQRCode:', error)
      
      const message = error instanceof Error ? error.message : String(error)
      // Never return a fake QR code as success. The caller must receive the
      // actual failure so it can stop polling and offer a retry.
      const sanitizedPhone = phoneNumber ? phoneNumber.replace(/[^a-zA-Z0-9]/g, '').slice(-10) : 'unknown'
      //  FIX: Use provided session ID so frontend polling works even on error
      const sessionId = providedSessionId || `fallback_session_${sanitizedPhone}_${Date.now()}`
      const errorQRCode = `data:image/svg+xml;base64,${Buffer.from(`
        <svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
          <rect width="256" height="256" fill="#fee" stroke="red" stroke-width="2"/>
          <circle cx="128" cy="80" r="30" fill="none" stroke="red" stroke-width="3"/>
          <text x="128" y="90" text-anchor="middle" font-size="24" fill="red">!</text>
          <text x="128" y="140" text-anchor="middle" font-size="16" fill="red">QR Generation Error</text>
          <text x="128" y="165" text-anchor="middle" font-size="12" fill="red">Fallback QR Code</text>
          <text x="128" y="185" text-anchor="middle" font-size="10" fill="gray">Check server logs</text>
          <text x="128" y="200" text-anchor="middle" font-size="8" fill="red">Error: ${(error instanceof Error ? error.message : String(error)).substring(0, 40)}</text>
        </svg>
      `).toString('base64')}`
      
      return {
        sessionId,
        qrCode: undefined,
        real: false,
        mock: false,
        fallback: true,
        error: true,
        expiresIn: 60, // 1 minute
        expiresAt: Date.now() + (60 * 1000),
        message: `QR code generation failed: ${message}`
      }
    }
  }

  async getSessionStatus(sessionId: string) {
    try {
      // ── ACTIVE CLIENT PROBE ─────────────────────────────────────────────
      // Don't rely solely on the 'ready' event having fired.
      // If the wweb.js client object exists and client.info.wid is populated,
      // the session IS authenticated and ready RIGHT NOW — update everything.
      const liveClient = this.clients.get(sessionId)
      if (liveClient) {
        try {
          const info = (liveClient as any).info
          if (info && info.wid && info.wid.user) {
            const rawPhone = info.wid.user.replace(/\D/g, '')
            const phoneNumber = rawPhone ? `+${rawPhone}` : null
            const memSession = this.sessions.get(sessionId)
            if (memSession && memSession.status !== 'ready') {
              console.log(` Active probe: client.info.wid=${info.wid.user} but status=${memSession.status} — promoting to ready`)
              memSession.status = 'ready'
              memSession.phoneNumber = phoneNumber
              memSession.connectedAt = new Date().toISOString()
              memSession.client = liveClient
              this.sessions.set(sessionId, memSession)
              // Fire-and-forget DB sync — don't block the status response
              this.updateDatabaseStatus(sessionId, 'ready', phoneNumber || undefined).catch(() => {})
            }
            return {
              success: true,
              status: 'ready',
              phoneNumber: phoneNumber || memSession?.phoneNumber,
              message: 'WhatsApp connected and ready (live probe)',
              connected: true,
              isConnected: true,
              pairingCode: memSession?.pairingCode || null
            }
          }
        } catch (probeErr) {
          // client.info not yet available — still initializing, fall through
        }
      }

      const session = this.getSession(sessionId)
      
      console.log(` getSessionStatus called for ${sessionId}:`, {
        status: session.status,
        phoneNumber: session.phoneNumber,
        hasClient: !!session.client,
        connectedAt: (session as any).connectedAt
      })
      
      // Check Supabase to detect status mismatch (e.g. after server restart)
      try {
        const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
        const supabase = getSupabaseAdminClient()
        
        const { data: dbStatus } = await supabase
          .from('whatsapp_settings')
          .select('connection_status, phone_number')
          .eq('session_id', sessionId)
          .maybeSingle()
        
        if (dbStatus) {
          console.log(` Supabase status for ${sessionId}:`, {
            dbStatus: dbStatus.connection_status,
            dbPhone: dbStatus.phone_number
          })

          const MEANINGFUL_DB = new Set([
            'ready', 'authenticated', 'qr_ready', 'initializing',
            'connecting', 'auth_failed', 'disconnected'
          ])

          // If memory is empty/not_found but DB has any meaningful status, return DB status
          if ((session.status === 'not_found' || !this.sessions.has(sessionId)) &&
              dbStatus.connection_status && MEANINGFUL_DB.has(dbStatus.connection_status)) {
            console.log(` Session not in memory; returning DB status: ${dbStatus.connection_status}`)
            const isReady = dbStatus.connection_status === 'ready'
            return {
              success: true,
              status: dbStatus.connection_status,
              phoneNumber: dbStatus.phone_number,
              message: `Session ${dbStatus.connection_status} (db)`,
              connected: isReady,
              isConnected: isReady
            }
          }

          // If Supabase says ready but memory doesn't, sync memory
          if (dbStatus.connection_status === 'ready' && session.status !== 'ready') {
            console.log(` Status mismatch! DB=ready, Memory=${session.status}. Syncing memory...`)
            const memSession = this.sessions.get(sessionId)
            if (memSession) {
              memSession.status = 'ready'
              memSession.phoneNumber = dbStatus.phone_number
              this.sessions.set(sessionId, memSession)
              console.log(` In-memory status synced to ready from Supabase`)
            }
            return {
              success: true,
              status: 'ready',
              phoneNumber: dbStatus.phone_number,
              message: 'WhatsApp connected and ready (db sync)',
              connected: true,
              isConnected: true
            }
          }
        }
      } catch (dbError) {
        console.warn('Could not check Supabase status (non-fatal):', dbError instanceof Error ? dbError.message : dbError)
      }
      
      return {
        success: true,
        status: session.status,
        phoneNumber: session.phoneNumber,
        pairingCode: session.pairingCode || null,
        error: session.error || null,
        message: (session as any).message,
        connected: session.status === 'ready',
        isConnected: session.status === 'ready'
      }
    } catch (error) {
      console.error('Error getting session status:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        status: 'error',
        connected: false,
        isConnected: false
      }
    }
  }

  async disconnectSession(sessionId: string) {
    try {
      if (isBrowser || !isWhatsAppEnabled) {
        throw new Error('WhatsApp requires ENABLE_WHATSAPP=true')
      }

      const client = this.clients.get(sessionId)
      if (client) {
        await client.destroy()
        this.clients.delete(sessionId)
      }

      this.sessions.delete(sessionId)
      this.cleanupSessionFiles(sessionId)

      return {
        success: true,
        message: 'Session disconnected'
      }
    } catch (error) {
      console.error('Error disconnecting session:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  async cleanupSessionFiles(sessionId: string) {
    // This would clean up any session files created by whatsapp-web.js
    console.log(`Cleaning up session files for ${sessionId}`)
    try {
      const fs = await import('fs')
      const path = await import('path')

      // WhatsApp Web.js stores sessions in .wwebjs_auth directory
      const sessionDataPath = process.env.WHATSAPP_SESSION_PATH || 
        (process.env.NODE_ENV === 'production' ? '/app/.wwebjs_auth' : '.wwebjs_auth')

      // Ensure the parent directory exists (Render disk mount may be empty
      // and LocalAuth only mkdirs the session subdir, not the parent).
      try {
        const fs = require('fs')
        fs.mkdirSync(sessionDataPath, { recursive: true })
      } catch (e) {
        console.warn('Could not ensure session data path:', e)
      }
      const sessionPath = path.join(sessionDataPath, `session-${sessionId}`)

      if (fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { recursive: true, force: true })
        console.log(`Cleaned up session files for ${sessionId}`)
      }
    } catch (error) {
      console.log('Could not clean up session files:', error)
    }
  }

  cleanupSessions() {
    // Clean up old sessions (older than 24 hours)
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.createdAt < oneDayAgo && session.status !== 'ready') {
        console.log(` Cleaning up old session: ${sessionId}`)
        this.disconnectSession(sessionId)
      }
    }
  }

  private formatPhoneNumber(phone: string): string {
    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, '')
    
    // Handle US/Canada numbers (10 digits)
    if (cleaned.length === 10) {
      return `+1${cleaned}`
    } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `+${cleaned}`
    }
    
    // Return as-is if already formatted or international
    return phone.startsWith('+') ? phone : `+${cleaned}`
  }

  private isValidPhoneNumber(phone: string): boolean {
    // Basic phone number validation
    const phoneRegex = /^\+?[1-9]\d{1,14}$/
    const cleaned = phone.replace(/\s|-|\(|\)/g, '')
    return phoneRegex.test(cleaned)
  }

  // Welcome message when user connects
  private async sendWelcomeMessage(client: any, phoneNumber: string) {
    try {
      // Ensure phone number is properly formatted
      const cleanPhone = phoneNumber.replace(/\D/g, '') // Remove all non-digits
      const chatId = `${cleanPhone}@c.us`
      
      console.log(` Sending welcome message to ${chatId}`)
      
      const welcomeText = ` *Welcome to Union!*

You are now successfully connected to Union — your sales acceleration platform.

 *Available Commands:*

* Analytics & Reports*
• *stats* - View your business statistics
• *reports* - Generate custom reports
• *leads* - View recent leads
• *contacts* - Manage your contacts

* Communication*
• *broadcast [message]* - Send message to all contacts
• *campaign [name]* - Create marketing campaign
• *template [name]* - Use message template

* Management*
• *settings* - View account settings
• *help* - Show this menu
• *disconnect* - Disconnect from WhatsApp

* AI Features*
• *insights* - Get AI-powered insights
• *analyze [data]* - Analyze business data
• *predict* - Revenue predictions

Just type any command to get started! 

Type *help* anytime to see this menu again.`

      //  FIX: Retry logic with Store re-wait on navigation errors
      let retries = 3
      let sent = false
      
      while (retries > 0 && !sent) {
        try {
          // sendInPageContext resolves the Lid + loads chat + sends in ONE evaluate call
          // so there is no inter-evaluate boundary where the Lid state can be lost.
          const welResult = await this.sendInPageContext(client, chatId, welcomeText)
          console.log(` Welcome message sent to ${chatId} — msgId: ${welResult?.msgId}`)
          sent = true
        } catch (sendError: any) {
          retries--
          const errMsg = sendError instanceof Error ? sendError.message : String(sendError)
          console.error(` Failed to send welcome message via sendInPageContext (retries left: ${retries}):`, errMsg)
          if (retries > 0) {
            if (errMsg.includes('context was destroyed') || errMsg.includes('navigation')) {
              console.log(` Page navigation detected — re-waiting for WhatsApp Store before retry...`)
              await this.waitForWhatsAppStore(client, 30000)
            } else {
              await new Promise(resolve => setTimeout(resolve, 3000))
            }
          } else {
            // All sendInPageContext retries exhausted — fall back to client.sendMessage()
            console.log(` Falling back to client.sendMessage() for welcome message...`)
            try {
              await client.sendMessage(chatId, welcomeText)
              console.log(` Welcome message sent via client.sendMessage() fallback`)
              sent = true
            } catch (fbError: any) {
              console.error(` client.sendMessage() fallback also failed:`, fbError instanceof Error ? fbError.message : String(fbError))
              throw fbError
            }
          }
        }
      }
      
      // Store welcome message in database
      const sessionId = this.getSessionIdByPhoneNumber(phoneNumber)
      if (sessionId) {
        await this.storeMessage(sessionId, client.info?.wid?.user || 'system', chatId, welcomeText, 'text', 'outgoing', 'Welcome Message')
      } else {
        console.warn(` Could not find sessionId for phone ${phoneNumber} to store message`)
      }
    } catch (error) {
      console.error(` Failed to send welcome message to ${phoneNumber}:`, error)
      throw error // Re-throw so caller knows it failed
    }
  }

  // Send connection success notification
  private async sendConnectionSuccessMessage(client: any, phoneNumber: string) {
    try {
      // Ensure phone number is properly formatted (digits only for chatId)
      const cleanPhone = phoneNumber.replace(/\D/g, '')
      const chatId = `${cleanPhone}@c.us`
      
      // Format for display (with + prefix)
      const displayPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${cleanPhone}`
      
      console.log(` Sending connection success message to ${chatId}`)
      
      const successMessage = ` *WhatsApp connected to Union!*

Your phone is now linked to Union — Sales Acceleration Platform.

 Type *help* to see everything you can do.

 Connection details:
• Phone: ${displayPhone}
• Connected: ${new Date().toLocaleString()}`

      //  FIX: Retry logic with Store re-wait on navigation errors
      let retries = 3
      let sent = false
      
      while (retries > 0 && !sent) {
        try {
          // sendInPageContext resolves the Lid + loads chat + sends in ONE evaluate call
          // so there is no inter-evaluate boundary where the Lid state can be lost.
          const sucResult = await this.sendInPageContext(client, chatId, successMessage)
          console.log(` Connection success message sent to ${chatId} — msgId: ${sucResult?.msgId}`)
          sent = true
        } catch (sendError: any) {
          retries--
          const errMsg = sendError instanceof Error ? sendError.message : String(sendError)
          console.error(` Failed to send connection success message via sendInPageContext (retries left: ${retries}):`, errMsg)
          if (retries > 0) {
            if (errMsg.includes('context was destroyed') || errMsg.includes('navigation')) {
              console.log(` Page navigation detected — re-waiting for WhatsApp Store before retry...`)
              await this.waitForWhatsAppStore(client, 30000)
            } else {
              await new Promise(resolve => setTimeout(resolve, 3000))
            }
          } else {
            // All sendInPageContext retries exhausted — fall back to client.sendMessage()
            console.log(` Falling back to client.sendMessage() for connection success message...`)
            try {
              await client.sendMessage(chatId, successMessage)
              console.log(` Connection success message sent via client.sendMessage() fallback`)
              sent = true
            } catch (fbError: any) {
              console.error(` client.sendMessage() fallback also failed:`, fbError instanceof Error ? fbError.message : String(fbError))
              throw fbError
            }
          }
        }
      }
      
      // Store the success message in database
      const sessionId = this.getSessionIdByPhoneNumber(cleanPhone)
      if (sessionId) {
        await this.storeMessage(sessionId, 'system', chatId, successMessage, 'text', 'outgoing', 'Connection Success')
      } else {
        console.warn(` Could not find sessionId for phone ${cleanPhone} to store message`)
      }
    } catch (error) {
      console.error(` Failed to send connection success message to ${phoneNumber}:`, error)
      throw error // Re-throw so caller knows it failed
    }
  }

  // Notify frontend about successful connection
  private async notifyFrontendConnection(sessionId: string, phoneNumber: string | null) {
    try {
      console.log(` Notifying frontend of connection: ${sessionId} -> ${phoneNumber}`)
      
      // Get user and company info from session manager
      const { whatsappSessionManager } = await import('@/backend/services/whatsapp-session-manager')
      const sessionData = whatsappSessionManager.getSessionData(sessionId)
      
      let userId: string | null = null
      let companyId: string | null = null
      
      if (sessionData && sessionData.userId && sessionData.companyId) {
        userId = sessionData.userId
        companyId = sessionData.companyId
        console.log(` Session data found for frontend notification:`, {
          userId,
          companyId,
          sessionId
        })
      } else {
        console.warn(` No session data found for ${sessionId}, attempting fallback lookup for frontend notification...`)
        
        // Fallback: Try to find the user from whatsapp_settings (which was just updated)
        const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
        const supabase = getSupabaseAdminClient()
        
        // Get the settings that were just updated for this session
        const { data: settings, error: settingsError } = await supabase
          .from('whatsapp_settings')
          .select('company_id, user_id')
          .eq('session_id', sessionId)
          .single()
        
        if (settings && !settingsError && settings.company_id) {
          userId = settings.user_id
          companyId = settings.company_id
          console.log(` Found company and user via whatsapp_settings:`, { userId, companyId })
        } else {
          // Last resort: Get the most recent active user
          const { data: recentUser, error: userError } = await supabase
            .from('users')
            .select('id, company_id')
            .eq('active', true)
            .order('updated_at', { ascending: false })
            .limit(1)
            .single()
          
          if (recentUser && !userError) {
            userId = recentUser.id
            companyId = recentUser.company_id
            console.log(` Found user via fallback:`, { userId, companyId })
          } else {
            console.error(` Could not find any user/company for frontend notification ${sessionId}`)
            return
          }
        }
      }
      
      // Update WhatsApp settings in Supabase with connection status
      const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
      const supabase = getSupabaseAdminClient()
      const now = new Date().toISOString()
      
      const { error } = await supabase
        .from('whatsapp_settings')
        .upsert({
          company_id: companyId,
          user_id: userId,
          session_id: sessionId,
          connection_status: 'ready',
          phone_number: phoneNumber,
          last_connected: now,
          enable_whatsapp: true,      //  Use existing column
          use_whatsapp_web: true,     //  Use existing column
          updated_at: now
        }, {
          onConflict: 'company_id'
        })
      
      if (error) {
        console.error(' Error updating WhatsApp settings in Supabase:', error)
        return
      }
      
      console.log(` Frontend notification database update complete for company ${companyId}: status=ready, phone=${phoneNumber}`)

      const { publishWhatsAppConnection } = await import('./whatsapp-events')
      publishWhatsAppConnection({
        userId: userId || '',
        companyId: companyId || '',
        sessionId,
        phoneNumber
      })
      console.log(` Frontend connection event published for company ${companyId}`)
      
    } catch (error) {
      console.error(' Error notifying frontend of connection:', error)
    }
  }

  // Handle incoming messages and commands
  private async handleIncomingMessage(client: any, message: any, sessionId: string) {
    try {
      const from = message.from
      const body = message.body?.trim()

      // Guard: ignore empty bodies (e.g. image-only messages with no caption)
      if (!body) return

      console.log(` [handleIncomingMessage] session=${sessionId} from=${from} body="${body.substring(0, 60)}"`)

      // Try to get contact info, but handle WhatsApp Web.js API changes gracefully
      let contact: any
      let name = 'User'
      
      try {
        contact = await message.getContact()
        name = contact.name || contact.pushname || contact.shortName || 'User'
      } catch (contactError: any) {
        // Handle WhatsApp Web.js internal errors (getIsMyContact, etc.)
        console.log(` Could not fetch contact info (WhatsApp Web API change), using fallback`)
        // Try to extract name from message metadata
        name = message._data?.notifyName || message._data?.from || 'User'
      }
      
      console.log(` Message from ${name} (${from}): ${body}`)

      // Store incoming message in database
      await this.storeMessage(sessionId, from, client.info?.wid?.user || 'system', body, 'text', 'incoming', name)

      // Skip group messages and status updates
      if (message.from.includes('@g.us') || message.from.includes('status@')) {
        return
      }

      // ── COMMAND-NUMBER CHECK ─────────────────────────────────────────────
      // If a command_number is configured in whatsapp_settings, only that number
      // gets full admin command access. Any other sender gets a public-facing
      // response. If no command_number is set, everyone gets full access
      // (backward-compatible default).
      let isAdminSender = true
      try {
        const session = this.sessions.get(sessionId)
        // Lazily load commandNumber into session the first time
        if (session && session.commandNumber === undefined) {
          const companyId = await this.getCompanyIdFromSession(sessionId)
          const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
          const supabase = getSupabaseAdminClient()
          const { data: ws } = await supabase
            .from('whatsapp_settings')
            .select('command_number')
            .eq('company_id', companyId)
            .single()
          session.commandNumber = ws?.command_number ? ws.command_number.replace(/\D/g, '') : null
          this.sessions.set(sessionId, session)
        }
        const commandNumber = session?.commandNumber || null
        if (commandNumber) {
          const fromClean = from.replace(/[^0-9]/g, '')
          isAdminSender = fromClean.endsWith(commandNumber) || commandNumber.endsWith(fromClean)
        }
      } catch {}

      // Handle commands
      let response = ''
      const bodyLower = body.toLowerCase().trim()

      // ── NON-ADMIN PATH ───────────────────────────────────────────────────
      // When a command_number is configured, messages from other numbers get
      // a customer-facing reply instead of admin CRM access.
      if (!isAdminSender) {
        if (/^(hi|hello|hey|howdy|good (morning|afternoon|evening))/.test(bodyLower)) {
          response = ` Hi ${name}! Thanks for reaching out.\n\nA team member will get back to you shortly. Have a great day! `
        } else if (/price|pricing|cost|quote|how much/.test(bodyLower)) {
          response = ` Thanks for your interest in our pricing!\n\nOur team will prepare a personalised quote for you. Please share:\n• Your company name\n• Number of users\n• Key features needed\n\nWe'll get back to you within 1 business day.`
        } else if (/support|help|issue|problem|error/.test(bodyLower)) {
          response = ` Thanks for reaching out about support!\n\nPlease describe your issue in detail and we'll get back to you as soon as possible.\n\nFor urgent matters, email us directly at support@unionapp.co`
        } else {
          response = ` Message received! Thanks for contacting us, ${name}.\n\nOne of our team members will review your message and respond shortly.`
        }
        if (response) {
          // Use message.reply() — Lid is already resolved from the received-message context
          try {
            await message.reply(response)
          } catch {
            await client.sendMessage(from, response)
          }
          await this.storeMessage(sessionId, client.info?.wid?.user || 'system', from, response, 'text', 'outgoing')
        }
        return
      }

      // ── ADMIN COMMAND PATH ───────────────────────────────────────────────
      console.log(` [cmd] from=${from} isAdmin=${isAdminSender} command="${bodyLower}"`)
      try {
        switch (bodyLower) {
          case 'help':
          case 'menu':
            response = this.getHelpMenu()
            break

          case 'stats':
          case 'statistics':
            response = await this.getBusinessStats(sessionId)
            break

          case 'reports':
            response = await this.generateReports(sessionId)
            break

          case 'leads':
            response = await this.getRecentLeads(sessionId)
            break

          case 'top leads':
            response = await this.getTopLeads(sessionId)
            break

          case 'contacts':
            response = await this.getContactSummary(sessionId)
            break

          case 'deals':
            response = await this.getRecentDeals(sessionId)
            break

          case 'pipeline':
            response = await this.getPipelineSummary(sessionId)
            break

          case 'customers':
            response = await this.getRecentCustomers(sessionId)
            break

          case 'today':
            response = await this.getTodaySummary(sessionId)
            break

          case 'overdue':
            response = await this.getOverdueTasks(sessionId)
            break

          case 'revenue':
            response = await this.getRevenueSummary(sessionId)
            break

          case 'settings':
            response = await this.getSettingsInfo(sessionId)
            break

          case 'insights':
            response = await this.getAIInsights(sessionId)
            break

          case 'predict':
          case 'prediction':
            response = await this.getRevenuePredictions(sessionId)
            break

      case 'disconnect':
            response = ' Disconnecting from Union. Goodbye!'
            try { await message.reply(response) } catch { await client.sendMessage(from, response) }
            await this.storeMessage(sessionId, client.info?.wid?.user || 'system', from, response, 'text', 'outgoing')
            this.disconnectSession(sessionId)
            return

          default:
            if (bodyLower.startsWith('broadcast ')) {
              response = await this.handleBroadcast(body.substring(10), sessionId, client)
            } else if (bodyLower.startsWith('send campaign ')) {
              response = await this.handleSendCampaign(body.substring(14).trim(), sessionId, client, from)
            } else if (bodyLower === 'campaigns') {
              response = await this.handleListCampaigns(sessionId)
            } else if (bodyLower.startsWith('pause campaign ')) {
              response = await this.handlePauseCampaign(body.substring(15).trim(), sessionId)
            } else if (bodyLower.startsWith('resume campaign ')) {
              response = await this.handleResumeCampaign(body.substring(16).trim(), sessionId)
            } else if (bodyLower.startsWith('delete campaign ')) {
              response = await this.handleDeleteCampaign(body.substring(16).trim(), sessionId)
            } else if (bodyLower.startsWith('campaign ')) {
              response = await this.handleCampaign(body.substring(9), sessionId)
            } else if (bodyLower.startsWith('report')) {
              const fmt = bodyLower.replace('report', '').trim() || 'pdf'
              response = await this.handleReportExport(fmt, sessionId, client, from)
              // file already sent as attachment inside handleReportExport; response is a summary text
            } else if (bodyLower.startsWith('template ')) {
              response = await this.handleTemplate(body.substring(9), sessionId)
            } else if (bodyLower.startsWith('analytics ')) {
              response = await this.handleAnalyticsReport(body.substring(10).trim(), sessionId, client, from)
            } else if (bodyLower === 'analytics') {
              response = await this.handleAnalyticsReport('full', sessionId, client, from)
            } else if (bodyLower.startsWith('analyze ')) {
              response = await this.handleAnalysis(body.substring(8), sessionId)
            } else if (bodyLower.startsWith('add lead ')) {
              response = await this.handleAddLead(body.substring(9), sessionId)
            } else if (bodyLower.startsWith('add contact ')) {
              response = await this.handleAddContact(body.substring(12), sessionId)
            } else if (bodyLower.startsWith('search ')) {
              response = await this.handleSearch(body.substring(7), sessionId)
            } else if (bodyLower.startsWith('deal ')) {
              response = await this.handleDealLookup(body.substring(5), sessionId)
            } else if (bodyLower.startsWith('contact ')) {
              response = await this.handleContactLookup(body.substring(8), sessionId)
            } else if (bodyLower.startsWith('close ')) {
              response = await this.handleCloseDeal(body.substring(6), sessionId)
            } else if (bodyLower.startsWith('note ')) {
              response = await this.handleAddNote(body.substring(5), sessionId)
            } else if (bodyLower.startsWith('revenue ')) {
              response = await this.getRevenueSummary(sessionId, body.substring(8).trim())
            } else {
              response = ` Unknown command: "${body}"\n\nType \`help\` to see all available commands.`
            }
            break
        }
      } catch (cmdError) {
        console.error(` Command handler error for "${bodyLower}":`, cmdError)
        response = ` Something went wrong handling "${bodyLower}". Please try again.\n\nType \`help\` to see available commands.`
      }

      // Use message.reply() so the Lid is already resolved from the received-message
      // context. This avoids "Lid not found" failures when sending to contacts the
      // bot hasn't previously messaged. Fall back to sendMessage if reply fails.
      if (response) {
        try {
          await message.reply(response)
          console.log(` Response sent to ${name} (${from})`)
          await this.storeMessage(sessionId, client.info?.wid?.user || 'system', from, response, 'text', 'outgoing')
        } catch (sendError) {
          console.error(` message.reply() failed for ${name}, trying sendMessage:`, sendError)
          try {
            await client.sendMessage(from, response)
            console.log(` Response sent via sendMessage to ${name} (${from})`)
            await this.storeMessage(sessionId, client.info?.wid?.user || 'system', from, response, 'text', 'outgoing')
          } catch (fallbackError) {
            console.error(` Both reply() and sendMessage() failed for ${name}:`, fallbackError)
            if (fallbackError instanceof Error && (
              fallbackError.message.includes('session') ||
              fallbackError.message.includes('disconnected') ||
              fallbackError.message.includes('timeout')
            )) {
              await this.updateDatabaseStatus(sessionId, 'disconnected')
            }
          }
        }
      }

    } catch (error) {
      console.error('Error handling message:', error)
      
      // Log error but don't crash - graceful degradation
      // Note: 'from' may not be available if error occurred before message parsing
    }
  }

  private getHelpMenu(): string {
    return ` *Union Command Centre*

* Analytics & Stats*
• \`stats\` – Business snapshot
• \`revenue\` – Revenue summary (add month e.g. jan 2026)
• \`pipeline\` – Sales pipeline
• \`top leads\` – Top 5 leads by value
• \`insights\` – AI insights
• \`predict\` – Revenue prediction
• \`today\` – Today's summary

* Analytics PDF Reports*
• \`analytics\` – Full analytics report (PDF)
• \`analytics leads\` – Lead analytics report
• \`analytics deals\` – Deal pipeline report
• \`analytics revenue\` – Revenue report
• \`analytics contacts\` – Contact analytics
• \`analytics campaigns\` – Campaign report
• \`analytics team\` – Team performance

* Contacts & Leads*
• \`leads\` – Recent leads
• \`contacts\` – Contact summary
• \`customers\` – Recent customers
• \`search [name]\` – Find contacts/leads
• \`contact [name]\` – Contact details
• \`add contact [name]/[phone]\` – Add contact
• \`add lead [name]/[phone]/[value]\` – Add lead

* Deals*
• \`deals\` – Recent deals
• \`deal [name]\` – Deal details
• \`close [name]\` – Mark deal won
• \`note [contact] [text]\` – Add note

* Reports & Export*
• \`reports\` – Full text report
• \`report pdf\` – Export as PDF
• \`report csv\` – Export as CSV
• \`report excel\` – Export as Excel

* Campaigns*
• \`campaigns\` – List all campaigns
• \`campaign [name]\` – Create campaign
• \`send campaign [name]\` – Send to contacts
• \`pause campaign [name]\` – Pause campaign
• \`resume campaign [name]\` – Resume campaign
• \`delete campaign [name]\` – Delete campaign
• \`broadcast [message]\` – Message all contacts
• \`template [name]\` – Use template

* System*
• \`overdue\` – Overdue follow-ups
• \`settings\` – Account settings
• \`help\` – This menu
• \`disconnect\` – Disconnect session

Type any command to get started! `
  }

  private async generateReports(sessionId: string): Promise<string> {
    try {
      const companyId = await this.getCompanyIdFromSession(sessionId)
      const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
      const supabase = getSupabaseAdminClient()
      
      // Get data for comprehensive report
      const now = new Date()
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      
      // Monthly performance - this month
      const { data: thisMonthDeals, error: thisMonthError } = await supabase
        .from('deals')
        .select('status, value')
        .eq('company_id', companyId)
        .gte('created_at', thisMonth.toISOString())
      
      const thisMonthStats = {
        won_deals: thisMonthDeals?.filter(d => d.status === 'won').length || 0,
        revenue: thisMonthDeals?.filter(d => d.status === 'won').reduce((sum, d) => sum + (d.value || 0), 0) || 0,
        total_deals: thisMonthDeals?.length || 0
      }
      
      // Monthly performance - last month
      const { data: lastMonthDeals, error: lastMonthError } = await supabase
        .from('deals')
        .select('status, value')
        .eq('company_id', companyId)
        .gte('created_at', lastMonth.toISOString())
        .lt('created_at', thisMonth.toISOString())
      
      const lastMonthStats = {
        won_deals: lastMonthDeals?.filter(d => d.status === 'won').length || 0,
        revenue: lastMonthDeals?.filter(d => d.status === 'won').reduce((sum, d) => sum + (d.value || 0), 0) || 0
      }
      
      // Lead sources performance
      const { data: leads, error: leadsError } = await supabase
        .from('leads')
        .select('source')
        .eq('company_id', companyId)
        .gte('created_at', thisMonth.toISOString())
      
      // Count by source
      const sourceCounts: { [key: string]: number } = {}
      leads?.forEach(lead => {
        const source = lead.source || 'Unknown'
        sourceCounts[source] = (sourceCounts[source] || 0) + 1
      })
      
      const topSources = Object.entries(sourceCounts)
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3)
      
      // Campaign performance
      const { data: campaigns, error: campaignsError } = await supabase
        .from('campaigns')
        .select('status')
        .eq('company_id', companyId)
      
      const campaignStats = {
        active: campaigns?.filter(c => c.status === 'active').length || 0,
        completed: campaigns?.filter(c => c.status === 'completed').length || 0,
        total: campaigns?.length || 0
      }
      
      // Team performance
      const { data: teamLeads, error: teamError } = await supabase
        .from('leads')
        .select('assigned_to, status')
        .eq('company_id', companyId)
        .not('assigned_to', 'is', null)
      
      // Group by assigned_to
      const teamCounts: { [key: string]: { total: number, converted: number } } = {}
      teamLeads?.forEach(lead => {
        const assignee = lead.assigned_to
        if (!teamCounts[assignee]) {
          teamCounts[assignee] = { total: 0, converted: 0 }
        }
        teamCounts[assignee].total++
        if (lead.status === 'qualified' || lead.status === 'converted') {
          teamCounts[assignee].converted++
        }
      })
      
      const teamStats = Object.entries(teamCounts)
        .map(([assigned_to, counts]) => ({
          assigned_to,
          total_leads: counts.total,
          converted: counts.converted
        }))
        .sort((a, b) => b.converted - a.converted)
        .slice(0, 3)
      
      // Calculate growth
      const revenueGrowth = lastMonthStats?.revenue > 0
        ? Math.round(((thisMonthStats?.revenue - lastMonthStats?.revenue) / lastMonthStats?.revenue) * 100)
        : 0
      
      const dealsGrowth = lastMonthStats?.won_deals > 0
        ? Math.round(((thisMonthStats?.won_deals - lastMonthStats?.won_deals) / lastMonthStats?.won_deals) * 100)
        : 0

      let report = ` *Union Business Report*
Generated: ${now.toLocaleString()}

━━━━━━━━━━━━━━━━
 *MONTHLY PERFORMANCE*
━━━━━━━━━━━━━━━━

*This Month:*
• Revenue: $${(thisMonthStats?.revenue || 0).toLocaleString()}
• Deals Won: ${thisMonthStats?.won_deals || 0}
• Conversion: ${thisMonthStats?.total_deals > 0 ? Math.round((thisMonthStats.won_deals / thisMonthStats.total_deals) * 100) : 0}%

*vs Last Month:*
• Revenue: ${revenueGrowth >= 0 ? '' : ''} ${Math.abs(revenueGrowth)}%
• Deals: ${dealsGrowth >= 0 ? '' : ''} ${Math.abs(dealsGrowth)}%

━━━━━━━━━━━━━━━━
 *TOP LEAD SOURCES*
━━━━━━━━━━━━━━━━
`
      
      if (topSources.length > 0) {
        topSources.forEach((source, idx) => {
          report += `${idx + 1}. ${source.source || 'Unknown'}: ${source.count} leads\n`
        })
      } else {
        report += 'No data available\n'
      }
      
      report += `
━━━━━━━━━━━━━━━━
 *CAMPAIGN OVERVIEW*
━━━━━━━━━━━━━━━━
• Active: ${campaignStats?.active || 0}
• Completed: ${campaignStats?.completed || 0}
• Total: ${campaignStats?.total || 0}

━━━━━━━━━━━━━━━━
 *TOP PERFORMERS*
━━━━━━━━━━━━━━━━
`
      
      if (teamStats.length > 0) {
        teamStats.forEach((member, idx) => {
          const convRate = member.total_leads > 0 
            ? Math.round((member.converted / member.total_leads) * 100)
            : 0
          report += `${idx + 1}. ${member.assigned_to}: ${member.converted}/${member.total_leads} (${convRate}%)\n`
        })
      } else {
        report += 'No team data available\n'
      }
      
      report += `
━━━━━━━━━━━━━━━━

 For detailed analytics, visit your Union dashboard.`

      return report

    } catch (error) {
      console.error('Error generating reports:', error)
      return ' Error generating reports. Please try again later.'
    }
  }

  private async getBusinessStats(sessionId: string): Promise<string> {
    try {
      // Get company ID from session
      const companyId = await this.getCompanyIdFromSession(sessionId)
      
      // Fetch data from Supabase
      const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
      const supabase = getSupabaseAdminClient()
      
      // Get total contacts
      const { count: totalContacts } = await supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .is('deleted_at', null)
      
      // Get total active leads
      const { count: totalLeads } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .neq('status', 'closed')
      
      // Get won deals and revenue
      const { data: wonDeals, error: dealsError } = await supabase
        .from('deals')
        .select('value')
        .eq('company_id', companyId)
        .eq('status', 'won')
      
      const totalDeals = wonDeals?.length || 0
      const totalRevenue = wonDeals?.reduce((sum, deal) => sum + (deal.value || 0), 0) || 0
      
      // Calculate conversion rate
      const conversionRate = totalLeads && totalLeads > 0
        ? Math.round((totalDeals / totalLeads) * 100) 
        : 0
      
      // Get active campaigns
      const { count: activeCampaigns } = await supabase
        .from('campaigns')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('status', 'active')

      return ` *Business Statistics*

 *Contacts:* ${totalContacts || 0}
 *Leads:* ${totalLeads || 0}
 *Deals Won:* ${totalDeals}
 *Conversion Rate:* ${conversionRate}%
 *Total Revenue:* $${totalRevenue.toLocaleString()}
 *Active Campaigns:* ${activeCampaigns || 0}

Updated: ${new Date().toLocaleString()}`

    } catch (error) {
      console.error('Error fetching business stats:', error)
      return ' Error fetching business statistics. Please try again later.'
    }
  }

  private async getRecentLeads(sessionId: string): Promise<string> {
    try {
      // Fetch leads from Supabase
      const companyId = await this.getCompanyIdFromSession(sessionId)
      const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
      const supabase = getSupabaseAdminClient()
      
      const { data: leads, error } = await supabase
        .from('leads')
        .select('name, status, value, source, created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(10)

      if (!leads || leads.length === 0) {
        return ' *Recent Leads*\n\nNo leads found. Start adding leads in your dashboard!'
      }

      let response = ' *Recent Leads*\n\n'
      
      leads.forEach((lead, index) => {
        const value = lead.value ? `$${parseFloat(lead.value).toLocaleString()}` : 'N/A'
        const date = new Date(lead.created_at).toLocaleDateString()
        
        response += `${index + 1}. *${lead.name}*\n`
        response += `   Status: ${lead.status || 'new'}\n`
        response += `   Value: ${value}\n`
        response += `   Source: ${lead.source || 'Unknown'}\n`
        response += `   Date: ${date}\n\n`
      })

      response += `Total: ${leads.length} leads shown\nLast updated: ${new Date().toLocaleString()}`

      return response

    } catch (error) {
      console.error('Error fetching recent leads:', error)
      return ' Error fetching recent leads. Please try again later.'
    }
  }

  private async getContactSummary(sessionId: string): Promise<string> {
    try {
      // Fetch contact data from Supabase
      const companyId = await this.getCompanyIdFromSession(sessionId)
      const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
      const supabase = getSupabaseAdminClient()
      
      // Total contacts
      const { count: total } = await supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .is('deleted_at', null)
      
      // Contacts by status
      const { data: allContacts } = await supabase
        .from('contacts')
        .select('status')
        .eq('company_id', companyId)
        .is('deleted_at', null)
      
      const statusCounts: any = {}
      allContacts?.forEach(contact => {
        const status = contact.status || 'unknown'
        statusCounts[status] = (statusCounts[status] || 0) + 1
      })
      
      // New contacts this week
      const oneWeekAgo = new Date()
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
      
      const { count: newThisWeek } = await supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('created_at', oneWeekAgo.toISOString())

      return ` *Contact Summary*

 *Total Contacts:* ${total || 0}
 *Active:* ${statusCounts.active || 0}
⏸ *Inactive:* ${statusCounts.inactive || 0}
⭐ *Lead:* ${statusCounts.lead || 0}
 *Customer:* ${statusCounts.customer || 0}
🆕 *New This Week:* ${newThisWeek || 0}

Last updated: ${new Date().toLocaleString()}`

    } catch (error) {
      console.error('Error fetching contact summary:', error)
      return ' Error fetching contact summary. Please try again later.'
    }
  }

  private async getSettingsInfo(sessionId: string): Promise<string> {
    try {
      const companyId = await this.getCompanyIdFromSession(sessionId)
      const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
      const supabase = getSupabaseAdminClient()

      const { data: settings } = await supabase
        .from('settings')
        .select('key, value')
        .eq('company_id', companyId)

      const settingsMap: Record<string, any> = {}
      if (settings) {
        for (const s of settings) {
          try { settingsMap[s.key] = JSON.parse(s.value) } catch { settingsMap[s.key] = s.value }
        }
      }

      const emailEnabled = settingsMap?.email_settings?.enabled ?? false
      const smsEnabled = settingsMap?.sms_settings?.enabled ?? false
      const whatsappEnabled = settingsMap?.whatsapp_settings?.enabled ?? false

      return ` *Account Settings*

 *WhatsApp:* ${whatsappEnabled ? ' Enabled' : ' Disabled'}
 *Email:* ${emailEnabled ? ' Enabled' : ' Disabled'}
 *SMS:* ${smsEnabled ? ' Enabled' : ' Disabled'}
 *Analytics:* Active
 *AI Features:* Enabled

To change settings, visit the Union settings page.`
    } catch {
      return ` *Account Settings*

 *WhatsApp:* Connected
 *Analytics:* Active
 *AI Features:* Enabled

To change settings, visit the Union settings page.`
    }
  }

  private async getAIInsights(sessionId: string): Promise<string> {
    try {
      // Fetch data from Supabase for AI insights
      const companyId = await this.getCompanyIdFromSession(sessionId)
      const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
      const supabase = getSupabaseAdminClient()
      
      // Get this month vs last month lead quality
      const thisMonth = new Date()
      thisMonth.setDate(1)
      const lastMonth = new Date(thisMonth)
      lastMonth.setMonth(lastMonth.getMonth() - 1)
      
      // This month's leads
      const { count: thisMonthCount } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .gte('created_at', thisMonth.toISOString())
      
      // Last month's leads
      const { count: lastMonthCount } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .gte('created_at', lastMonth.toISOString())
        .lt('created_at', thisMonth.toISOString())
      
      const growthRate = lastMonthCount && lastMonthCount > 0
        ? Math.round(((thisMonthCount! - lastMonthCount) / lastMonthCount) * 100)
        : 0
      
      // Get top conversion source
      const { data: qualifiedLeads } = await supabase
        .from('leads')
        .select('source')
        .eq('company_id', companyId)
        .in('status', ['qualified', 'converted'])
      
      // Count by source
      const sourceCounts: { [key: string]: number } = {}
      qualifiedLeads?.forEach(lead => {
        const source = lead.source || 'Unknown'
        sourceCounts[source] = (sourceCounts[source] || 0) + 1
      })
      
      const topSource = Object.entries(sourceCounts)
        .sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown'
      
      // Get leads ready for follow-up (qualified but not contacted in 3+ days)
      const threeDaysAgo = new Date()
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
      
      const { count: followUpCount } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('status', 'qualified')
        .or(`last_contact_date.is.null,last_contact_date.lt.${threeDaysAgo.toISOString()}`)
      
      // Get campaigns needing optimization (low conversion rate)
      const { data: campaigns } = await supabase
        .from('campaigns')
        .select('conversion_rate')
        .eq('company_id', companyId)
        .eq('status', 'active')
      
      const campaignsToOptimize = campaigns?.filter(c => 
        !c.conversion_rate || c.conversion_rate < 0.05
      ).length || 0
      
      const growthText = growthRate > 0 ? `improved ${growthRate}%` : growthRate < 0 ? `decreased ${Math.abs(growthRate)}%` : 'remained stable'

      return ` *AI Insights*

 *Trend Analysis:*
• Lead quality has ${growthText} this month
• This month: ${thisMonthCount || 0} leads
• Last month: ${lastMonthCount || 0} leads
• Top conversion source: ${topSource}

 *Recommendations:*
${topSource !== 'Unknown' ? `• Focus more on ${topSource} campaigns\n` : ''}${followUpCount && followUpCount > 0 ? `• Follow up with ${followUpCount} qualified leads\n` : ''}• Schedule follow-ups during business hours
• Consider A/B testing your messaging

 *Opportunities:*
${followUpCount && followUpCount > 0 ? `• ${followUpCount} leads ready for follow-up\n` : ''}${campaignsToOptimize > 0 ? `• ${campaignsToOptimize} campaigns ready for optimization\n` : ''}• Analyze high-performing campaigns for patterns

Generated: ${new Date().toLocaleString()}`

    } catch (error) {
      console.error('Error generating AI insights:', error)
      return ' Error generating AI insights. Please try again later.'
    }
  }

  private async getRevenuePredictions(sessionId: string): Promise<string> {
    try {
      // Fetch revenue data from Supabase for predictions
      const companyId = await this.getCompanyIdFromSession(sessionId)
      const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
      const supabase = getSupabaseAdminClient()
      
      // Get this month's closed deals
      const thisMonth = new Date()
      thisMonth.setDate(1)
      
      const { data: thisMonthDeals } = await supabase
        .from('deals')
        .select('value')
        .eq('company_id', companyId)
        .eq('status', 'won')
        .gte('closed_date', thisMonth.toISOString())
      
      const thisMonthRevenue = thisMonthDeals?.reduce((sum, d) => sum + (d.value || 0), 0) || 0
      const thisMonthDealsCount = thisMonthDeals?.length || 0
      
      // Get pipeline value (deals in progress)
      const { data: pipelineDeals } = await supabase
        .from('deals')
        .select('value')
        .eq('company_id', companyId)
        .in('status', ['proposal', 'negotiation', 'qualified'])
      
      const pipelineValue = pipelineDeals?.reduce((sum, d) => sum + (d.value || 0), 0) || 0
      const pipelineCount = pipelineDeals?.length || 0
      
      // Get average deal size
      const { data: wonDeals } = await supabase
        .from('deals')
        .select('value')
        .eq('company_id', companyId)
        .eq('status', 'won')
        .gt('value', 0)
      
      const averageDeal = wonDeals && wonDeals.length > 0
        ? wonDeals.reduce((sum, d) => sum + d.value, 0) / wonDeals.length
        : 5000
      
      // Calculate conversion rate
      const { data: allDeals } = await supabase
        .from('deals')
        .select('status')
        .eq('company_id', companyId)
      
      const wonCount = allDeals?.filter(d => d.status === 'won').length || 0
      const totalCount = allDeals?.length || 0
      const conversionRate = totalCount > 0 ? (wonCount / totalCount) : 0.30
      
      // Get last 3 months average for trend
      const threeMonthsAgo = new Date()
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
      
      const { data: recentDeals } = await supabase
        .from('deals')
        .select('value, closed_date')
        .eq('company_id', companyId)
        .eq('status', 'won')
        .gte('closed_date', threeMonthsAgo.toISOString())
      
      // Calculate monthly averages
      const monthlyRevenues: { [key: string]: number } = {}
      recentDeals?.forEach(deal => {
        if (deal.closed_date && deal.value) {
          const month = deal.closed_date.substring(0, 7) // YYYY-MM
          monthlyRevenues[month] = (monthlyRevenues[month] || 0) + deal.value
        }
      })
      
      const historicalAvg = Object.values(monthlyRevenues).length > 0
        ? Object.values(monthlyRevenues).reduce((a, b) => a + b, 0) / Object.values(monthlyRevenues).length
        : thisMonthRevenue || 10000
      
      // Project next month (current pipeline * conversion rate)
      const projectedNext = Math.round(
        pipelineValue * conversionRate + 
        (historicalAvg * 0.1) // Add 10% of historical average for new opportunities
      )
      
      // Project quarter (current + projected * 2)
      const projectedQuarter = Math.round(thisMonthRevenue + (projectedNext * 2))
      
      // Calculate growth rate
      const growthRate = historicalAvg > 0
        ? Math.round(((projectedNext - historicalAvg) / historicalAvg) * 100)
        : 0
      
      // Calculate confidence based on pipeline size and historical data
      const pipelineRatio = pipelineValue > 0 && averageDeal > 0
        ? Math.min(((pipelineValue / averageDeal) / 10) * 100, 95)
        : 60
      const confidence = Math.round(pipelineRatio)

      return ` *Revenue Predictions*

 *This Month:* $${thisMonthRevenue.toLocaleString()} (actual)
 *Next Month:* $${projectedNext.toLocaleString()} (${growthRate >= 0 ? '+' : ''}${growthRate}%)
 *Quarter Projection:* $${projectedQuarter.toLocaleString()}

 *Key Factors:*
• Current pipeline: $${pipelineValue.toLocaleString()}
• Pipeline deals: ${pipelineCount}
• Conversion rate: ${Math.round(conversionRate * 100)}%
• Average deal size: $${Math.round(averageDeal).toLocaleString()}

 *AI Confidence:* ${confidence}%

Based on ${totalCount} historical deals and current pipeline.
Generated: ${new Date().toLocaleString()}`

    } catch (error) {
      console.error('Error generating predictions:', error)
      return ' Error generating predictions. Please try again later.'
    }
  }

  private async handleBroadcast(message: string, sessionId: string, client: any): Promise<string> {
    if (!message.trim()) {
      return ' Please provide a message to broadcast.\n\nUsage: `broadcast Your message here`'
    }

    try {
      const companyId = await this.getCompanyIdFromSession(sessionId)
      const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
      const supabase = getSupabaseAdminClient()

      // Get active contacts with phone numbers
      const { data: contacts, error: contactError } = await supabase
        .from('contacts')
        .select('id, name, phone')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .not('phone', 'is', null)
        .neq('phone', '')
        .in('status', ['active', 'customer', 'lead'])
        .limit(100)

      if (contactError || !contacts || contacts.length === 0) {
        return ' No active contacts with phone numbers found.\n\nAdd contacts with phone numbers to your database first.'
      }

      let sent = 0
      let failed = 0
      const batchLimit = 50

      for (const contact of contacts.slice(0, batchLimit)) {
        try {
          const rawPhone = (contact.phone as string).replace(/\D/g, '')
          if (rawPhone.length < 7) { failed++; continue }
          const chatId = `${rawPhone}@c.us`
          const personalizedMessage = message
            .replace(/\{name\}/gi, contact.name || 'there')
            .replace(/\{first_name\}/gi, (contact.name || 'there').split(' ')[0])
          await client.sendMessage(chatId, personalizedMessage)
          await this.storeMessage(sessionId, client.info?.wid?.user || 'system', rawPhone, personalizedMessage, 'text', 'outgoing', contact.name || undefined)
          sent++
          await new Promise(resolve => setTimeout(resolve, 1200))
        } catch (sendErr) {
          console.error(` Failed to broadcast to ${contact.phone}:`, sendErr)
          failed++
        }
      }

      const remaining = contacts.length > batchLimit ? contacts.length - batchLimit : 0

      return ` *Broadcast Complete*

Message: "${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"
 Sent: ${sent} contacts
${failed > 0 ? ` Failed: ${failed} contacts\n` : ''}${remaining > 0 ? `⏳ Remaining: ${remaining} contacts (limit per batch)\n` : ''}Use \`send campaign [name]\` for larger targeted campaigns.`

    } catch (error) {
      console.error('Error broadcasting:', error)
      return ' Error broadcasting message. Please try again later.'
    }
  }

  private async handleCampaign(campaignName: string, sessionId: string): Promise<string> {
    if (!campaignName.trim()) {
      return ' Please provide a campaign name.\n\nUsage: `campaign Campaign Name`'
    }
    try {
      const companyId = await this.getCompanyIdFromSession(sessionId)
      const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
      const supabase = getSupabaseAdminClient()
      const campaignId = `wa_campaign_${Date.now()}`
      const now = new Date().toISOString()
      const { error } = await supabase
        .from('campaigns')
        .insert({
          id: campaignId,
          company_id: companyId,
          name: campaignName,
          type: 'whatsapp',
          status: 'draft',
          created_at: now,
          updated_at: now
        })
      if (error) {
        console.error('Error creating campaign:', error)
        return ' Error creating campaign. Please try again later.'
      }
      return ` *Campaign Created*\n\nName: "${campaignName}"\nType: WhatsApp\nStatus: Draft\nCreated: ${new Date().toLocaleString()}\n\nVisit the Union dashboard to configure targets and schedule your campaign.`
    } catch (error) {
      console.error('Error creating campaign:', error)
      return ' Error creating campaign. Please try again later.'
    }
  }

  private async handleListCampaigns(sessionId: string): Promise<string> {
    try {
      const companyId = await this.getCompanyIdFromSession(sessionId)
      const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
      const supabase = getSupabaseAdminClient()

      const { data: campaigns, error } = await supabase
        .from('campaigns')
        .select('id, name, status, type, created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) throw error

      if (!campaigns || campaigns.length === 0) {
        return ' *No Campaigns Found*\n\nCreate your first campaign with:\n• `campaign Campaign Name`'
      }

      const statusEmoji: Record<string, string> = {
        active: '🟢', completed: '', draft: '', scheduled: '', paused: '⏸'
      }

      let response = ` *Your Campaigns* (${campaigns.length})\n\n`
      campaigns.forEach((c, i) => {
        const emoji = statusEmoji[c.status] || ''
        const date = c.created_at ? new Date(c.created_at).toLocaleDateString() : 'Unknown'
        response += `${i + 1}. ${emoji} *${c.name}*\n   Status: ${c.status} | Type: ${c.type || 'whatsapp'} | ${date}\n`
      })

      response += '\n*Commands:*\n• `send campaign [name]` – Send campaign\n• `pause campaign [name]` – Pause\n• `resume campaign [name]` – Resume\n• `delete campaign [name]` – Delete'

      return response
    } catch (error) {
      console.error('Error listing campaigns:', error)
      return ' Error fetching campaigns. Please try again later.'
    }
  }

  private async handlePauseCampaign(campaignName: string, sessionId: string): Promise<string> {
    if (!campaignName.trim()) {
      return ' Please provide a campaign name.\n\nUsage: `pause campaign Campaign Name`'
    }
    try {
      const companyId = await this.getCompanyIdFromSession(sessionId)
      const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
      const supabase = getSupabaseAdminClient()

      const { data: campaigns, error: findError } = await supabase
        .from('campaigns')
        .select('id, name, status')
        .eq('company_id', companyId)
        .ilike('name', `%${campaignName}%`)
        .limit(5)

      if (findError || !campaigns || campaigns.length === 0) {
        return ` No campaign found matching *"${campaignName}"*\n\nUse \`campaigns\` to see all campaigns.`
      }

      const campaign = campaigns[0]
      if (campaign.status === 'paused') {
        return ` Campaign *"${campaign.name}"* is already paused.`
      }

      const { error } = await supabase
        .from('campaigns')
        .update({ status: 'paused', updated_at: new Date().toISOString() })
        .eq('id', campaign.id)

      if (error) throw error

      return `⏸ *Campaign Paused*\n\nCampaign: "${campaign.name}"\nPrevious status: ${campaign.status}\n\nUse \`resume campaign ${campaign.name}\` to resume.`
    } catch (error) {
      console.error('Error pausing campaign:', error)
      return ' Error pausing campaign. Please try again later.'
    }
  }

  private async handleResumeCampaign(campaignName: string, sessionId: string): Promise<string> {
    if (!campaignName.trim()) {
      return ' Please provide a campaign name.\n\nUsage: `resume campaign Campaign Name`'
    }
    try {
      const companyId = await this.getCompanyIdFromSession(sessionId)
      const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
      const supabase = getSupabaseAdminClient()

      const { data: campaigns, error: findError } = await supabase
        .from('campaigns')
        .select('id, name, status')
        .eq('company_id', companyId)
        .ilike('name', `%${campaignName}%`)
        .limit(5)

      if (findError || !campaigns || campaigns.length === 0) {
        return ` No campaign found matching *"${campaignName}"*\n\nUse \`campaigns\` to see all campaigns.`
      }

      const campaign = campaigns[0]
      if (campaign.status !== 'paused') {
        return ` Campaign *"${campaign.name}"* is not paused (current status: ${campaign.status}).`
      }

      const { error } = await supabase
        .from('campaigns')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', campaign.id)

      if (error) throw error

      return `▶ *Campaign Resumed*\n\nCampaign: "${campaign.name}"\nStatus: Active\n\nUse \`send campaign ${campaign.name}\` to send.`
    } catch (error) {
      console.error('Error resuming campaign:', error)
      return ' Error resuming campaign. Please try again later.'
    }
  }

  private async handleDeleteCampaign(campaignName: string, sessionId: string): Promise<string> {
    if (!campaignName.trim()) {
      return ' Please provide a campaign name.\n\nUsage: `delete campaign Campaign Name`'
    }
    try {
      const companyId = await this.getCompanyIdFromSession(sessionId)
      const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
      const supabase = getSupabaseAdminClient()

      const { data: campaigns, error: findError } = await supabase
        .from('campaigns')
        .select('id, name, status')
        .eq('company_id', companyId)
        .ilike('name', `%${campaignName}%`)
        .limit(5)

      if (findError || !campaigns || campaigns.length === 0) {
        return ` No campaign found matching *"${campaignName}"*\n\nUse \`campaigns\` to see all campaigns.`
      }

      const campaign = campaigns[0]
      const { error } = await supabase
        .from('campaigns')
        .delete()
        .eq('id', campaign.id)

      if (error) throw error

      return ` *Campaign Deleted*\n\nCampaign: "${campaign.name}"\nStatus was: ${campaign.status}\n\nThis action cannot be undone.`
    } catch (error) {
      console.error('Error deleting campaign:', error)
      return ' Error deleting campaign. Please try again later.'
    }
  }

  private async handleTemplate(templateName: string, sessionId: string): Promise<string> {
    if (!templateName.trim()) {
      return ' Please provide a template name.\n\nUsage: `template Template Name`'
    }

    try {
      const companyId = await this.getCompanyIdFromSession(sessionId)
      const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
      const supabase = getSupabaseAdminClient()
      
      // Try to find matching template
      const { data: templates, error: templatesError } = await supabase
        .from('message_templates')
        .select('id, name, category, language, content, status')
        .eq('company_id', companyId)
        .eq('status', 'active')
      
      if (templatesError) {
        console.error('Error fetching templates:', templatesError)
        return ' Error fetching templates. Please try again later.'
      }
      
      // Find matching template by name or category (case-insensitive)
      const searchTerm = templateName.toLowerCase()
      const template = templates?.find(t => 
        t.name?.toLowerCase().includes(searchTerm) || 
        t.category?.toLowerCase().includes(searchTerm)
      )
      
      if (template) {
        return ` *Template: ${template.name}*

Category: ${template.category || 'General'}
Language: ${template.language || 'English'}

━━━━━━━━━━━━━━━━
${template.content}
━━━━━━━━━━━━━━━━

To use this template:
• \`broadcast ${(template.content || '').substring(0, 50)}...\`

Or visit your dashboard to customize and send.`
      }
      
      // If no template found, list available templates
      if (!templates || templates.length === 0) {
        return ` *No Templates Found*

Template "${templateName}" not found, and no templates exist yet.

Create templates in your Union dashboard to use them here.

Example templates:
• Welcome message
• Follow-up reminder
• Special offer
• Meeting confirmation`
      }
      
      let response = ` *Template Not Found*

"${templateName}" doesn't match any template.

*Available Templates:*
`
      templates.slice(0, 5).forEach((t, idx) => {
        response += `${idx + 1}. ${t.name} (${t.category || 'General'})\n`
      })
      
      response += `\nUsage: \`template [name]\``
      
      return response

    } catch (error) {
      console.error('Error fetching template:', error)
      return ' Error fetching template. Please try again later.'
    }
  }

  private async handleAnalysis(data: string, sessionId: string): Promise<string> {
    if (!data.trim()) {
      return ' Please provide what to analyze.\n\nUsage: `analyze leads` | `analyze sales` | `analyze campaigns`'
    }
    try {
      const companyId = await this.getCompanyIdFromSession(sessionId)
      const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
      const supabase = getSupabaseAdminClient()
      const q = data.toLowerCase()

      if (q.includes('lead')) {
        const { data: leads } = await supabase.from('leads').select('status, source, value').eq('company_id', companyId)
        const total = leads?.length || 0
        const byStatus: Record<string, number> = {}
        const bySource: Record<string, number> = {}
        let totalValue = 0
        leads?.forEach(l => {
          const s = l.status || 'new'; byStatus[s] = (byStatus[s] || 0) + 1
          const src = l.source || 'Unknown'; bySource[src] = (bySource[src] || 0) + 1
          totalValue += l.value || 0
        })
        const topSource = Object.entries(bySource).sort((a, b) => b[1] - a[1])[0]
        const statusLines = Object.entries(byStatus).map(([s, c]) => `• ${s}: ${c}`).join('\n')
        return ` *Lead Analysis*\n\nTotal: ${total}\nPipeline value: $${totalValue.toLocaleString()}\nTop source: ${topSource ? topSource[0] + ' (' + topSource[1] + ')' : 'N/A'}\n\n*By Status:*\n${statusLines}\n\nGenerated: ${new Date().toLocaleString()}`
      }

      if (q.includes('campaign')) {
        const { data: campaigns } = await supabase.from('campaigns').select('status, type, conversion_rate').eq('company_id', companyId)
        const total = campaigns?.length || 0
        const active = campaigns?.filter(c => c.status === 'active').length || 0
        const draft = campaigns?.filter(c => c.status === 'draft').length || 0
        const completed = campaigns?.filter(c => c.status === 'completed').length || 0
        const avgConv = total > 0 ? (campaigns!.reduce((s, c) => s + (c.conversion_rate || 0), 0) / total * 100).toFixed(1) : '0'
        return ` *Campaign Analysis*\n\nTotal: ${total}\n• Active: ${active}\n• Draft: ${draft}\n• Completed: ${completed}\nAvg conversion: ${avgConv}%\n\nGenerated: ${new Date().toLocaleString()}`
      }

      if (q.includes('sale') || q.includes('deal') || q.includes('revenue')) {
        const { data: deals } = await supabase.from('deals').select('status, value').eq('company_id', companyId)
        const won = deals?.filter(d => d.status === 'won') || []
        const pipeline = deals?.filter(d => !['won', 'lost'].includes(d.status)) || []
        const wonRevenue = won.reduce((s, d) => s + (d.value || 0), 0)
        const pipValue = pipeline.reduce((s, d) => s + (d.value || 0), 0)
        const winRate = deals?.length ? Math.round(won.length / deals.length * 100) : 0
        return ` *Sales Analysis*\n\nDeals won: ${won.length}\nRevenue closed: $${wonRevenue.toLocaleString()}\nPipeline value: $${pipValue.toLocaleString()}\nWin rate: ${winRate}%\nTotal deals: ${deals?.length || 0}\n\nGenerated: ${new Date().toLocaleString()}`
      }

      // Generic fallback
      const [{ count: contacts }, { count: leadsCount }, { count: dealsCount }] = await Promise.all([
        supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('company_id', companyId).is('deleted_at', null),
        supabase.from('leads').select('*', { count: 'exact', head: true }).eq('company_id', companyId),
        supabase.from('deals').select('*', { count: 'exact', head: true }).eq('company_id', companyId)
      ])
      return ` *Analysis: "${data}"*\n\nSnapshot:\n• Contacts: ${contacts || 0}\n• Leads: ${leadsCount || 0}\n• Deals: ${dealsCount || 0}\n\nTry a focused query:\n• \`analyze leads\`\n• \`analyze campaigns\`\n• \`analyze sales\`\n\nGenerated: ${new Date().toLocaleString()}`
    } catch (error) {
      console.error('Error performing analysis:', error)
      return ' Error performing analysis. Please try again later.'
    }
  }

  private async handleReportExport(format: string, sessionId: string, client: any, from: string): Promise<string> {
    try {
      const companyId = await this.getCompanyIdFromSession(sessionId)
      const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
      const supabase = getSupabaseAdminClient()

      // Gather report data
      const [
        { data: leads },
        { data: deals },
        { count: contactCount },
        { data: campaigns }
      ] = await Promise.all([
        supabase.from('leads').select('name, status, source, value, created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(100),
        supabase.from('deals').select('name, status, value, created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(100),
        supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('company_id', companyId).is('deleted_at', null),
        supabase.from('campaigns').select('name, status, type, created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(50)
      ])

      const wonDeals = deals?.filter(d => d.status === 'won') || []
      const totalRevenue = wonDeals.reduce((s, d) => s + (d.value || 0), 0)
      const pipelineValue = deals?.filter(d => !['won', 'lost'].includes(d.status)).reduce((s, d) => s + (d.value || 0), 0) || 0

      const normalizedFormat = format.toLowerCase().trim()

      // Generate CSV content
      const generateCSV = (): string => {
        const rows: string[] = []
        rows.push('UNION SALES REPORT')
        rows.push(`Generated: ${new Date().toLocaleString()}`)
        rows.push('')
        rows.push('SUMMARY')
        rows.push(`Contacts,${contactCount || 0}`)
        rows.push(`Total Leads,${leads?.length || 0}`)
        rows.push(`Total Deals,${deals?.length || 0}`)
        rows.push(`Won Deals,${wonDeals.length}`)
        rows.push(`Total Revenue,$${totalRevenue.toLocaleString()}`)
        rows.push(`Pipeline Value,$${pipelineValue.toLocaleString()}`)
        rows.push('')
        rows.push('LEADS')
        rows.push('Name,Status,Source,Value,Created')
        leads?.forEach(l => {
          rows.push(`"${l.name || ''}","${l.status || ''}","${l.source || ''}","${l.value || 0}","${l.created_at ? new Date(l.created_at).toLocaleDateString() : ''}"`)
        })
        rows.push('')
        rows.push('DEALS')
        rows.push('Name,Status,Value,Created')
        deals?.forEach(d => {
          rows.push(`"${d.name || ''}","${d.status || ''}","${d.value || 0}","${d.created_at ? new Date(d.created_at).toLocaleDateString() : ''}"`)
        })
        rows.push('')
        rows.push('CAMPAIGNS')
        rows.push('Name,Status,Type,Created')
        campaigns?.forEach(c => {
          rows.push(`"${c.name || ''}","${c.status || ''}","${c.type || ''}","${c.created_at ? new Date(c.created_at).toLocaleDateString() : ''}"`)
        })
        return rows.join('\n')
      }

      let mimeType: string
      let filename: string
      let fileBuffer: Buffer

      if (normalizedFormat === 'pdf') {
        try {
          // Use jspdf to generate PDF
          const { jsPDF } = await import('jspdf')
          const autoTable = (await import('jspdf-autotable')).default
          const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

          doc.setFontSize(18)
          doc.text('Union Sales Report', 14, 20)
          doc.setFontSize(10)
          doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28)
          doc.setFontSize(12)
          doc.text('Summary', 14, 38)

          autoTable(doc, {
            startY: 42,
            head: [['Metric', 'Value']],
            body: [
              ['Contacts', String(contactCount || 0)],
              ['Total Leads', String(leads?.length || 0)],
              ['Total Deals', String(deals?.length || 0)],
              ['Won Deals', String(wonDeals.length)],
              ['Total Revenue', `$${totalRevenue.toLocaleString()}`],
              ['Pipeline Value', `$${pipelineValue.toLocaleString()}`]
            ],
            theme: 'grid'
          })

          const afterSummary = (doc as any).lastAutoTable.finalY + 8
          doc.text('Leads', 14, afterSummary)
          autoTable(doc, {
            startY: afterSummary + 4,
            head: [['Name', 'Status', 'Source', 'Value']],
            body: (leads || []).slice(0, 30).map(l => [l.name || '', l.status || '', l.source || '', `$${l.value || 0}`]),
            theme: 'striped'
          })

          const afterLeads = (doc as any).lastAutoTable.finalY + 8
          doc.text('Deals', 14, afterLeads)
          autoTable(doc, {
            startY: afterLeads + 4,
            head: [['Name', 'Status', 'Value']],
            body: (deals || []).slice(0, 30).map(d => [d.name || '', d.status || '', `$${d.value || 0}`]),
            theme: 'striped'
          })

          const pdfOutput = doc.output('arraybuffer')
          fileBuffer = Buffer.from(pdfOutput)
          mimeType = 'application/pdf'
          filename = `union-report-${Date.now()}.pdf`
        } catch (pdfError) {
          console.error(' jsPDF failed, falling back to CSV:', pdfError)
          fileBuffer = Buffer.from(generateCSV(), 'utf-8')
          mimeType = 'text/csv'
          filename = `union-report-${Date.now()}.csv`
        }
      } else if (normalizedFormat === 'excel') {
        fileBuffer = Buffer.from(generateCSV(), 'utf-8')
        mimeType = 'application/vnd.ms-excel'
        filename = `union-report-${Date.now()}.csv`
      } else {
        // Default: CSV
        fileBuffer = Buffer.from(generateCSV(), 'utf-8')
        mimeType = 'text/csv'
        filename = `union-report-${Date.now()}.csv`
      }

      // Send as document attachment
      const whatsappModule = await import('whatsapp-web.js')
      const MessageMedia = whatsappModule.MessageMedia || whatsappModule.default?.MessageMedia
      const media = new MessageMedia(mimeType, fileBuffer.toString('base64'), filename)
      await client.sendMessage(from, media, { sendMediaAsDocument: true })

      const formatLabel = normalizedFormat === 'excel' ? 'Excel (CSV)' : normalizedFormat.toUpperCase()
      return ` *Report Exported*\n\nFormat: ${formatLabel}\nFile: ${filename}\nLeads: ${leads?.length || 0}\nDeals: ${deals?.length || 0}\nRevenue: $${totalRevenue.toLocaleString()}\n\nThe report has been sent as a document above.`
    } catch (error) {
      console.error(' Error generating report:', error)
      return ` Error generating report: ${error instanceof Error ? error.message : 'Please try again.'}\n\nUsage:\n• \`report pdf\`\n• \`report csv\`\n• \`report excel\``
    }
  }

  private async handleAnalyticsReport(type: string, sessionId: string, client: any, from: string): Promise<string> {
    try {
      const companyId = await this.getCompanyIdFromSession(sessionId)
      const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
      const supabase = getSupabaseAdminClient()
      const now = new Date()
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)

      const { jsPDF } = await import('jspdf')
      const autoTable = (await import('jspdf-autotable')).default
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

      const addHeader = (title: string): number => {
        doc.setFontSize(18)
        doc.text(title, 14, 20)
        doc.setFontSize(10)
        doc.text(`Union  |  Generated: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`, 14, 28)
        doc.setDrawColor(70, 130, 255)
        doc.line(14, 31, 196, 31)
        return 35
      }

      const addSummaryTable = (data: [string, string][]): number => {
        autoTable(doc, {
          startY: 35,
          head: [['Metric', 'Value']],
          body: data,
          theme: 'grid',
          headStyles: { fillColor: [9, 24, 63] },
          styles: { fontSize: 10 }
        })
        return (doc as any).lastAutoTable.finalY + 8
      }

      const addDataTable = (startY: number, title: string, head: string[], rows: string[][]): number => {
        doc.setFontSize(12)
        doc.text(title, 14, startY)
        autoTable(doc, {
          startY: startY + 4,
          head: [head],
          body: rows,
          theme: 'striped',
          headStyles: { fillColor: [9, 24, 63] },
          styles: { fontSize: 9 }
        })
        return (doc as any).lastAutoTable.finalY + 8
      }

      let reportTitle = ''
      let summaryData: [string, string][] = []
      let sections: (() => number | void)[] = []

      // Fetch all data
      const [leadsRes, dealsRes, contactsRes, campaignsRes, usersRes] = await Promise.all([
        supabase.from('leads').select('name, status, source, value, assigned_to, created_at, stage').eq('company_id', companyId).order('created_at', { ascending: false }),
        supabase.from('deals').select('name, status, value, stage, assigned_to, created_at, company').eq('company_id', companyId).order('created_at', { ascending: false }),
        supabase.from('contacts').select('name, email, phone, status, company, created_at').eq('company_id', companyId).is('deleted_at', null),
        supabase.from('campaigns').select('name, status, type, created_at').eq('company_id', companyId).order('created_at', { ascending: false }),
        supabase.from('users').select('name, role, created_at, last_login').eq('company_id', companyId)
      ])

      const leads = leadsRes.data || []
      const deals = dealsRes.data || []
      const contacts = contactsRes.data || []
      const campaigns = campaignsRes.data || []
      const users = usersRes.data || []

      const wonDeals = deals.filter(d => d.status === 'won')
      const lostDeals = deals.filter(d => d.status === 'lost')
      const activeDeals = deals.filter(d => !['won', 'lost'].includes(d.status))
      const totalRevenue = wonDeals.reduce((s, d) => s + (d.value || 0), 0)
      const pipelineValue = activeDeals.reduce((s, d) => s + (d.value || 0), 0)
      const thisMonthLeads = leads.filter(l => new Date(l.created_at) >= thisMonth)
      const lastMonthLeads = leads.filter(l => { const d = new Date(l.created_at); return d >= lastMonth && d < thisMonth })

      switch (type) {
        case 'leads': {
          reportTitle = ' Lead Analytics Report'

          summaryData = [
            ['Total Leads', String(leads.length)],
            ['This Month', String(thisMonthLeads.length)],
            ['Last Month', String(lastMonthLeads.length)],
            ['Conversion Rate', leads.length > 0 ? `${((wonDeals.length / leads.length) * 100).toFixed(1)}%` : '0%'],
            ['Avg Lead Value', leads.length > 0 ? `$${(leads.reduce((s, l) => s + (l.value || 0), 0) / leads.length).toFixed(0)}` : '$0'],
          ]

          let y = addHeader(reportTitle)
          y = addSummaryTable(summaryData)

          const leadsByStatus: Record<string, number> = {}
          leads.forEach(l => { leadsByStatus[l.status || 'unknown'] = (leadsByStatus[l.status || 'unknown'] || 0) + 1 })
          y = addDataTable(y, 'Leads by Status', ['Status', 'Count'], Object.entries(leadsByStatus).map(([k, v]) => [k, String(v)]))

          const leadsBySource: Record<string, number> = {}
          leads.forEach(l => { leadsBySource[l.source || 'unknown'] = (leadsBySource[l.source || 'unknown'] || 0) + 1 })
          y = addDataTable(y, 'Leads by Source', ['Source', 'Count'], Object.entries(leadsBySource).map(([k, v]) => [k, String(v)]))

          addDataTable(y, 'Recent Leads (Top 20)', ['Name', 'Status', 'Source', 'Value', 'Date'],
            leads.slice(0, 20).map(l => [l.name || '', l.status || '', l.source || '', `$${l.value || 0}`, l.created_at ? new Date(l.created_at).toLocaleDateString() : '']))
          break
        }

        case 'deals': {
          reportTitle = ' Deal Pipeline Report'

          summaryData = [
            ['Total Deals', String(deals.length)],
            ['Active Pipeline', String(activeDeals.length)],
            ['Won Deals', String(wonDeals.length)],
            ['Lost Deals', String(lostDeals.length)],
            ['Total Revenue', `$${totalRevenue.toLocaleString()}`],
            ['Pipeline Value', `$${pipelineValue.toLocaleString()}`],
            ['Win Rate', deals.length > 0 ? `${((wonDeals.length / deals.length) * 100).toFixed(1)}%` : '0%'],
          ]

          let y = addHeader(reportTitle)
          y = addSummaryTable(summaryData)

          const dealsByStage: Record<string, { count: number; value: number }> = {}
          deals.forEach(d => {
            const stage = d.stage || d.status || 'unknown'
            if (!dealsByStage[stage]) dealsByStage[stage] = { count: 0, value: 0 }
            dealsByStage[stage].count++
            dealsByStage[stage].value += d.value || 0
          })
          y = addDataTable(y, 'Pipeline by Stage', ['Stage', 'Count', 'Value'],
            Object.entries(dealsByStage).map(([k, v]) => [k, String(v.count), `$${v.value.toLocaleString()}`]))

          addDataTable(y, 'Won Deals', ['Name', 'Value', 'Company', 'Date'],
            wonDeals.slice(0, 20).map(d => [d.name || '', `$${d.value || 0}`, d.company || '', d.created_at ? new Date(d.created_at).toLocaleDateString() : '']))
          break
        }

        case 'revenue': {
          reportTitle = ' Revenue Analytics Report'

          const monthlyRevenue: Record<string, number> = {}
          wonDeals.forEach(d => {
            const month = d.created_at ? new Date(d.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short' }) : 'Unknown'
            monthlyRevenue[month] = (monthlyRevenue[month] || 0) + (d.value || 0)
          })

          summaryData = [
            ['Total Revenue', `$${totalRevenue.toLocaleString()}`],
            ['Won Deals', String(wonDeals.length)],
            ['Avg Deal Value', wonDeals.length > 0 ? `$${(totalRevenue / wonDeals.length).toFixed(0)}` : '$0'],
            ['Pipeline Value', `$${pipelineValue.toLocaleString()}`],
            ['Projected Revenue', `$${(totalRevenue + pipelineValue * 0.3).toFixed(0)}`],
          ]

          let y = addHeader(reportTitle)
          y = addSummaryTable(summaryData)

          y = addDataTable(y, 'Revenue by Month', ['Month', 'Revenue'],
            Object.entries(monthlyRevenue).map(([k, v]) => [k, `$${v.toLocaleString()}`]))

          addDataTable(y, 'Top Revenue Deals', ['Name', 'Value', 'Status', 'Date'],
            wonDeals.sort((a, b) => (b.value || 0) - (a.value || 0)).slice(0, 15).map(d => [d.name || '', `$${d.value || 0}`, d.status || '', d.created_at ? new Date(d.created_at).toLocaleDateString() : '']))
          break
        }

        case 'contacts': {
          reportTitle = ' Contact Analytics Report'

          const contactsByStatus: Record<string, number> = {}
          contacts.forEach(c => { contactsByStatus[c.status || 'active'] = (contactsByStatus[c.status || 'active'] || 0) + 1 })

          const thisWeekContacts = contacts.filter(c => {
            const d = new Date(c.created_at)
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
            return d >= weekAgo
          })

          summaryData = [
            ['Total Contacts', String(contacts.length)],
            ['New This Week', String(thisWeekContacts.length)],
            ['New This Month', String(contacts.filter(c => new Date(c.created_at) >= thisMonth).length)],
          ]

          let y = addHeader(reportTitle)
          y = addSummaryTable(summaryData)

          y = addDataTable(y, 'Contacts by Status', ['Status', 'Count'],
            Object.entries(contactsByStatus).map(([k, v]) => [k, String(v)]))

          addDataTable(y, 'Recent Contacts (Top 20)', ['Name', 'Email', 'Phone', 'Status', 'Date'],
            contacts.slice(0, 20).map(c => [c.name || '', c.email || '', c.phone || '', c.status || '', c.created_at ? new Date(c.created_at).toLocaleDateString() : '']))
          break
        }

        case 'campaigns': {
          reportTitle = ' Campaign Analytics Report'

          const campaignsByStatus: Record<string, number> = {}
          campaigns.forEach(c => { campaignsByStatus[c.status || 'unknown'] = (campaignsByStatus[c.status || 'unknown'] || 0) + 1 })
          const activeCampaigns = campaigns.filter(c => c.status === 'active')

          summaryData = [
            ['Total Campaigns', String(campaigns.length)],
            ['Active', String(activeCampaigns.length)],
            ['Completed', String(campaigns.filter(c => c.status === 'completed').length)],
            ['Drafts', String(campaigns.filter(c => c.status === 'draft').length)],
          ]

          let y = addHeader(reportTitle)
          y = addSummaryTable(summaryData)

          y = addDataTable(y, 'Campaigns by Status', ['Status', 'Count'],
            Object.entries(campaignsByStatus).map(([k, v]) => [k, String(v)]))

          addDataTable(y, 'All Campaigns', ['Name', 'Status', 'Type', 'Date'],
            campaigns.slice(0, 30).map(c => [c.name || '', c.status || '', c.type || '', c.created_at ? new Date(c.created_at).toLocaleDateString() : '']))
          break
        }

        case 'team': {
          reportTitle = ' Team Performance Report'

          summaryData = [
            ['Team Members', String(users.length)],
            ['Active Users', String(users.filter(u => u.last_login).length)],
          ]

          let y = addHeader(reportTitle)
          y = addSummaryTable(summaryData)

          const userDealCounts: Record<string, { count: number; value: number }> = {}
          deals.forEach(d => {
            const assignee = d.assigned_to || 'Unassigned'
            if (!userDealCounts[assignee]) userDealCounts[assignee] = { count: 0, value: 0 }
            userDealCounts[assignee].count++
            userDealCounts[assignee].value += d.value || 0
          })
          y = addDataTable(y, 'Deals by Team Member', ['Member', 'Deals', 'Total Value'],
            Object.entries(userDealCounts).map(([k, v]) => [k, String(v.count), `$${v.value.toLocaleString()}`]))

          addDataTable(y, 'Team Members', ['Name', 'Role', 'Last Login', 'Joined'],
            users.map(u => [u.name || '', u.role || '', u.last_login ? new Date(u.last_login).toLocaleDateString() : 'Never', u.created_at ? new Date(u.created_at).toLocaleDateString() : '']))
          break
        }

        default: {
          // Full analytics report
          reportTitle = ' Full Analytics Report'

          summaryData = [
            ['Contacts', String(contacts.length)],
            ['Leads', String(leads.length)],
            ['Deals', String(deals.length)],
            ['Won Deals', String(wonDeals.length)],
            ['Total Revenue', `$${totalRevenue.toLocaleString()}`],
            ['Pipeline Value', `$${pipelineValue.toLocaleString()}`],
            ['Campaigns', String(campaigns.length)],
            ['Team Members', String(users.length)],
          ]

          let y = addHeader(reportTitle)
          y = addSummaryTable(summaryData)

          const leadsByStatus: Record<string, number> = {}
          leads.forEach(l => { leadsByStatus[l.status || 'unknown'] = (leadsByStatus[l.status || 'unknown'] || 0) + 1 })
          y = addDataTable(y, 'Leads by Status', ['Status', 'Count'], Object.entries(leadsByStatus).map(([k, v]) => [k, String(v)]))

          const dealsByStage: Record<string, { count: number; value: number }> = {}
          deals.forEach(d => {
            const stage = d.stage || d.status || 'unknown'
            if (!dealsByStage[stage]) dealsByStage[stage] = { count: 0, value: 0 }
            dealsByStage[stage].count++
            dealsByStage[stage].value += d.value || 0
          })
          y = addDataTable(y, 'Deals by Stage', ['Stage', 'Count', 'Value'],
            Object.entries(dealsByStage).map(([k, v]) => [k, String(v.count), `$${v.value.toLocaleString()}`]))

          y = addDataTable(y, 'Top 10 Leads', ['Name', 'Status', 'Value', 'Source'],
            leads.slice(0, 10).map(l => [l.name || '', l.status || '', `$${l.value || 0}`, l.source || '']))

          addDataTable(y, 'Recent Deals', ['Name', 'Status', 'Value'],
            deals.slice(0, 15).map(d => [d.name || '', d.status || '', `$${d.value || 0}`]))
          break
        }
      }

      // Generate PDF and send
      const pdfOutput = doc.output('arraybuffer')
      const fileBuffer = Buffer.from(pdfOutput)
      const filename = `union-${type}-analytics-${Date.now()}.pdf`

      const whatsappModule = await import('whatsapp-web.js')
      const MessageMedia = whatsappModule.MessageMedia || whatsappModule.default?.MessageMedia
      const media = new MessageMedia('application/pdf', fileBuffer.toString('base64'), filename)
      await client.sendMessage(from, media, { sendMediaAsDocument: true })

      return ` *${reportTitle}*\n\nThe full ${type} analytics report has been sent as a PDF document above.\n\nTip: Try \`analytics [type]\` where type is: leads, deals, revenue, contacts, campaigns, team, or full`

    } catch (error) {
      console.error(' Error generating analytics:', error)
      return ` Error generating analytics report: ${error instanceof Error ? error.message : 'Please try again.'}\n\nAvailable commands:\n• \`analytics leads\` – Lead analytics\n• \`analytics deals\` – Deal pipeline\n• \`analytics revenue\` – Revenue report\n• \`analytics contacts\` – Contact analytics\n• \`analytics campaigns\` – Campaign report\n• \`analytics team\` – Team performance\n• \`analytics\` – Full report`
    }
  }

  private async handleSendCampaign(campaignName: string, sessionId: string, client: any, from: string): Promise<string> {
    if (!campaignName.trim()) {
      return ' Please provide a campaign name.\n\nUsage: `send campaign [name]`'
    }
    try {
      const companyId = await this.getCompanyIdFromSession(sessionId)
      const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
      const supabase = getSupabaseAdminClient()

      // Find campaign by name (case-insensitive partial match)
      const { data: campaigns, error: campaignError } = await supabase
        .from('campaigns')
        .select('id, name, status, message_template, type')
        .eq('company_id', companyId)
        .ilike('name', `%${campaignName}%`)
        .limit(5)

      if (campaignError) {
        console.error('Error fetching campaign:', campaignError)
        return ' Error finding campaign. Please try again later.'
      }

      if (!campaigns || campaigns.length === 0) {
        return ` No campaign found matching *"${campaignName}"*\n\nCreate one first:\n• \`campaign ${campaignName}\`\n\nOr list campaigns by visiting the Union dashboard.`
      }

      const campaign = campaigns[0]

      if (!campaign.message_template) {
        return ` Campaign *"${campaign.name}"* has no message template.\n\nVisit the Union dashboard to set up the campaign message before sending.`
      }

      // Get contacts with phone numbers
      const { data: contacts, error: contactError } = await supabase
        .from('contacts')
        .select('id, name, phone')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .not('phone', 'is', null)
        .neq('phone', '')
        .in('status', ['active', 'customer', 'lead'])
        .limit(100)

      if (contactError || !contacts || contacts.length === 0) {
        return ` No active contacts with phone numbers found.\n\nAdd contacts with phone numbers in your Union dashboard first.`
      }

      // Update campaign status to active
      await supabase
        .from('campaigns')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', campaign.id)

      // Send campaign message to each contact
      let sent = 0
      let failed = 0
      const batchLimit = 50 // Safety limit per session

      for (const contact of contacts.slice(0, batchLimit)) {
        try {
          const rawPhone = (contact.phone as string).replace(/\D/g, '')
          if (rawPhone.length < 7) { failed++; continue }
          const chatId = `${rawPhone}@c.us`
          const personalizedMessage = (campaign.message_template as string)
            .replace(/\{name\}/gi, contact.name || 'there')
            .replace(/\{first_name\}/gi, (contact.name || 'there').split(' ')[0])
          await client.sendMessage(chatId, personalizedMessage)
          // Store outgoing message
          await this.storeMessage(sessionId, client.info?.wid?.user || 'system', rawPhone, personalizedMessage, 'text', 'outgoing', contact.name || undefined)
          sent++
          // 1.2s delay between messages to respect WhatsApp rate limits
          await new Promise(resolve => setTimeout(resolve, 1200))
        } catch (sendErr) {
          console.error(` Failed to send campaign message to ${contact.phone}:`, sendErr)
          failed++
        }
      }

      const remaining = contacts.length > batchLimit ? contacts.length - batchLimit : 0

      return ` *Campaign Sent Successfully*

 Campaign: *${campaign.name}*
 Sent: ${sent} messages
 Failed: ${failed}${remaining > 0 ? `\n⏳ Queued: ${remaining} more (use dashboard to send remaining)` : ''}

Campaign status updated to *Active*.
Visit the Union dashboard to monitor delivery and responses.`

    } catch (error) {
      console.error(' Error sending campaign:', error)
      return ` Error sending campaign: ${error instanceof Error ? error.message : 'Please try again.'}`
    }
  }

  // ── NEW COMMAND HANDLERS ────────────────────────────────────────────────

  private async getTopLeads(sessionId: string): Promise<string> {
    try {
      const companyId = await this.getCompanyIdFromSession(sessionId)
      const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
      const supabase = getSupabaseAdminClient()
      const { data: leads } = await supabase
        .from('leads').select('name, status, source, value, phone').eq('company_id', companyId)
        .not('value', 'is', null).order('value', { ascending: false }).limit(5)
      if (!leads || leads.length === 0) return ' *Top Leads*\n\nNo leads with values found. Add values to your leads in the dashboard.'
      let r = ' *Top 5 Leads by Value*\n\n'
      leads.forEach((l, i) => {
        r += `${i + 1}. *${l.name}* — $${parseFloat(l.value).toLocaleString()}\n   Status: ${l.status || 'new'} | Source: ${l.source || '?'}\n`
      })
      return r + `\nGenerated: ${new Date().toLocaleString()}`
    } catch (e) { return ' Error fetching top leads.' }
  }

  private async getRecentDeals(sessionId: string): Promise<string> {
    try {
      const companyId = await this.getCompanyIdFromSession(sessionId)
      const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
      const supabase = getSupabaseAdminClient()
      const { data: deals } = await supabase
        .from('deals').select('name, status, value, created_at').eq('company_id', companyId)
        .order('created_at', { ascending: false }).limit(10)
      if (!deals || deals.length === 0) return ' *Recent Deals*\n\nNo deals found. Start adding deals to your pipeline!'
      let r = ' *Recent Deals*\n\n'
      deals.forEach((d, i) => {
        const val = d.value ? `$${parseFloat(d.value).toLocaleString()}` : 'N/A'
        r += `${i + 1}. *${d.name || 'Unnamed'}* — ${val}\n   Status: ${d.status || '?'} | ${new Date(d.created_at).toLocaleDateString()}\n`
      })
      return r + `\nUpdated: ${new Date().toLocaleString()}`
    } catch (e) { return ' Error fetching deals.' }
  }

  private async getPipelineSummary(sessionId: string): Promise<string> {
    try {
      const companyId = await this.getCompanyIdFromSession(sessionId)
      const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
      const supabase = getSupabaseAdminClient()
      const { data: deals } = await supabase.from('deals').select('name, status, value').eq('company_id', companyId)
      if (!deals) return ' Could not fetch pipeline data.'
      const pipeline = deals.filter(d => !['won', 'lost'].includes(d.status || ''))
      const won = deals.filter(d => d.status === 'won')
      const lost = deals.filter(d => d.status === 'lost')
      const pipeVal = pipeline.reduce((s, d) => s + (d.value || 0), 0)
      const wonVal = won.reduce((s, d) => s + (d.value || 0), 0)
      const byStage: Record<string, { count: number; value: number }> = {}
      pipeline.forEach(d => {
        const s = d.status || 'new'; if (!byStage[s]) byStage[s] = { count: 0, value: 0 }
        byStage[s].count++; byStage[s].value += d.value || 0
      })
      const stageLines = Object.entries(byStage)
        .map(([s, v]) => `  • ${s}: ${v.count} deals ($${v.value.toLocaleString()})`).join('\n')
      return ` *Sales Pipeline*

 Pipeline Value: *$${pipeVal.toLocaleString()}* (${pipeline.length} deals)
 Won: ${won.length} deals ($${wonVal.toLocaleString()})
 Lost: ${lost.length} deals
Win rate: ${deals.length > 0 ? Math.round(won.length / deals.length * 100) : 0}%

*By Stage:*
${stageLines || '  No active stages'}

Generated: ${new Date().toLocaleString()}`
    } catch (e) { return ' Error fetching pipeline.' }
  }

  private async getRecentCustomers(sessionId: string): Promise<string> {
    try {
      const companyId = await this.getCompanyIdFromSession(sessionId)
      const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
      const supabase = getSupabaseAdminClient()
      const { data: contacts } = await supabase
        .from('contacts').select('name, email, phone, created_at')
        .eq('company_id', companyId).eq('status', 'customer').is('deleted_at', null)
        .order('created_at', { ascending: false }).limit(10)
      if (!contacts || contacts.length === 0) return ' *Recent Customers*\n\nNo customers yet. Convert some leads into customers!'
      let r = ' *Recent Customers*\n\n'
      contacts.forEach((c, i) => {
        r += `${i + 1}. *${c.name}*\n    ${c.email || 'N/A'} |  ${c.phone || 'N/A'}\n   Added: ${new Date(c.created_at).toLocaleDateString()}\n`
      })
      return r + `\nUpdated: ${new Date().toLocaleString()}`
    } catch (e) { return ' Error fetching customers.' }
  }

  private async getTodaySummary(sessionId: string): Promise<string> {
    try {
      const companyId = await this.getCompanyIdFromSession(sessionId)
      const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
      const supabase = getSupabaseAdminClient()
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
      const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999)
      const [
        { count: newLeads }, { count: newDeals }, { count: newContacts },
        { data: wonToday }, { count: activeCampaigns }
      ] = await Promise.all([
        supabase.from('leads').select('*', { count: 'exact', head: true }).eq('company_id', companyId).gte('created_at', todayStart.toISOString()),
        supabase.from('deals').select('*', { count: 'exact', head: true }).eq('company_id', companyId).gte('created_at', todayStart.toISOString()),
        supabase.from('contacts').select('*', { count: 'exact', head: true }).eq('company_id', companyId).is('deleted_at', null).gte('created_at', todayStart.toISOString()),
        supabase.from('deals').select('value').eq('company_id', companyId).eq('status', 'won').gte('updated_at', todayStart.toISOString()),
        supabase.from('campaigns').select('*', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'active')
      ])
      const todayRevenue = wonToday?.reduce((s, d) => s + (d.value || 0), 0) || 0
      return ` *Today's Summary — ${new Date().toLocaleDateString()}*

 New Leads: ${newLeads || 0}
 New Deals: ${newDeals || 0}
 New Contacts: ${newContacts || 0}
 Revenue Closed: $${todayRevenue.toLocaleString()}
 Active Campaigns: ${activeCampaigns || 0}

Generated: ${new Date().toLocaleTimeString()}`
    } catch (e) { return ' Error getting today\'s summary.' }
  }

  private async getOverdueTasks(sessionId: string): Promise<string> {
    try {
      const companyId = await this.getCompanyIdFromSession(sessionId)
      const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
      const supabase = getSupabaseAdminClient()
      const now = new Date().toISOString()
      // Leads that are qualified but not recently contacted (overdue follow-up)
      const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      const { data: staleLeads } = await supabase
        .from('leads').select('name, status, phone, created_at').eq('company_id', companyId)
        .in('status', ['new', 'qualified', 'contacted']).lte('created_at', sevenDaysAgo.toISOString()).limit(10)
      // Deals stuck in pipeline for >14 days
      const fourteenDaysAgo = new Date(); fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)
      const { data: stuckDeals } = await supabase
        .from('deals').select('name, status, value').eq('company_id', companyId)
        .not('status', 'in', '("won","lost")').lte('updated_at', fourteenDaysAgo.toISOString()).limit(10)
      let r = '⏰ *Overdue Follow-ups*\n\n'
      if (staleLeads && staleLeads.length > 0) {
        r += `*Stale Leads (7+ days):*\n`
        staleLeads.forEach((l, i) => r += `${i + 1}. ${l.name} — ${l.status} | ${new Date(l.created_at).toLocaleDateString()}\n`)
        r += '\n'
      }
      if (stuckDeals && stuckDeals.length > 0) {
        r += `*Stuck Deals (14+ days):*\n`
        stuckDeals.forEach((d, i) => r += `${i + 1}. ${d.name || 'Unnamed'} — ${d.status} ${ d.value ? `($${d.value})` : ''}\n`)
      }
      if ((!staleLeads || staleLeads.length === 0) && (!stuckDeals || stuckDeals.length === 0)) {
        r += ' No overdue items — you\'re all caught up!'
      }
      return r + `\nChecked: ${new Date().toLocaleString()}`
    } catch (e) { return ' Error fetching overdue tasks.' }
  }

  private async getRevenueSummary(sessionId: string, period?: string): Promise<string> {
    try {
      const companyId = await this.getCompanyIdFromSession(sessionId)
      const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
      const supabase = getSupabaseAdminClient()
      let startDate: Date, endDate: Date = new Date()
      // Parse period like "jan 2026", "this month", "last month", "2025"
      if (period) {
        const p = period.toLowerCase()
        if (p.includes('last month')) { startDate = new Date(); startDate.setMonth(startDate.getMonth() - 1); startDate.setDate(1); endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0) }
        else if (p.includes('this month') || !p) { startDate = new Date(); startDate.setDate(1) }
        else {
          const monthNames = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
          const monthIdx = monthNames.findIndex(m => p.includes(m))
          const yearMatch = p.match(/\d{4}/)
          const year = yearMatch ? parseInt(yearMatch[0]) : new Date().getFullYear()
          if (monthIdx >= 0) {
            startDate = new Date(year, monthIdx, 1)
            endDate = new Date(year, monthIdx + 1, 0, 23, 59, 59)
          } else if (yearMatch) {
            startDate = new Date(year, 0, 1); endDate = new Date(year, 11, 31, 23, 59, 59)
          } else { startDate = new Date(); startDate.setDate(1) }
        }
      } else { startDate = new Date(); startDate.setDate(1) }
      const { data: deals } = await supabase.from('deals').select('value, status, name')
        .eq('company_id', companyId).eq('status', 'won')
        .gte('updated_at', startDate.toISOString()).lte('updated_at', endDate.toISOString())
      const total = deals?.reduce((s, d) => s + (d.value || 0), 0) || 0
      const label = period || `${startDate.toLocaleString('default', { month: 'long', year: 'numeric' })}`
      return ` *Revenue — ${label}*

Deals Won: ${deals?.length || 0}
Total Revenue: *$${total.toLocaleString()}*
Average Deal: $${deals && deals.length > 0 ? Math.round(total / deals.length).toLocaleString() : 0}

Period: ${startDate.toLocaleDateString()} → ${endDate.toLocaleDateString()}
Generated: ${new Date().toLocaleString()}`
    } catch (e) { return ' Error fetching revenue summary.' }
  }

  private async handleAddLead(params: string, sessionId: string): Promise<string> {
    // Format: name/phone/value  OR  name / value  OR  just name
    if (!params.trim()) return ' Usage: `add lead [name]/[phone]/[value]`\nExample: `add lead John Doe/+1234567890/5000`'
    try {
      const parts = params.split('/').map(p => p.trim())
      const name = parts[0]; const phone = parts[1] || null; const value = parts[2] ? parseFloat(parts[2].replace(/[^0-9.]/g, '')) : null
      if (!name) return ' Please provide at least a name. Usage: `add lead [name]/[phone]/[value]`'
      const companyId = await this.getCompanyIdFromSession(sessionId)
      const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
      const supabase = getSupabaseAdminClient()
      const now = new Date().toISOString()
      const { data, error } = await supabase.from('leads').insert({ company_id: companyId, name, phone: phone || null, value: value || null, status: 'new', source: 'whatsapp', created_at: now, updated_at: now }).select('id').single()
      if (error) { console.error('add lead error:', error); return ` Could not add lead: ${error.message}` }
      return ` *Lead Added*\n\nName: ${name}\nPhone: ${phone || 'N/A'}\nValue: ${value ? '$' + value.toLocaleString() : 'N/A'}\nStatus: New\nSource: WhatsApp\n\nVisit your dashboard to add more details.`
    } catch (e) { return ` Error adding lead: ${e instanceof Error ? e.message : 'Please try again.'}` }
  }

  private async handleAddContact(params: string, sessionId: string): Promise<string> {
    if (!params.trim()) return ' Usage: `add contact [name]/[phone]`\nExample: `add contact Jane Doe/+1234567890`'
    try {
      const parts = params.split('/').map(p => p.trim())
      const name = parts[0]; const phone = parts[1] || null
      if (!name) return ' Please provide a name. Usage: `add contact [name]/[phone]`'
      const companyId = await this.getCompanyIdFromSession(sessionId)
      const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
      const supabase = getSupabaseAdminClient()
      const now = new Date().toISOString()
      const { data, error } = await supabase.from('contacts').insert({ company_id: companyId, name, phone: phone || null, status: 'active', source: 'whatsapp', created_at: now, updated_at: now }).select('id').single()
      if (error) { console.error('add contact error:', error); return ` Could not add contact: ${error.message}` }
      return ` *Contact Added*\n\nName: ${name}\nPhone: ${phone || 'N/A'}\nStatus: Active\nSource: WhatsApp`
    } catch (e) { return ` Error adding contact: ${e instanceof Error ? e.message : 'Please try again.'}` }
  }

  private async handleSearch(query: string, sessionId: string): Promise<string> {
    if (!query.trim()) return ' Usage: `search [name or phone]`'
    try {
      const companyId = await this.getCompanyIdFromSession(sessionId)
      const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
      const supabase = getSupabaseAdminClient()
      const q = query.trim()
      const [{ data: contacts }, { data: leads }, { data: deals }] = await Promise.all([
        supabase.from('contacts').select('name, email, phone, status').eq('company_id', companyId).is('deleted_at', null).or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`).limit(5),
        supabase.from('leads').select('name, status, value, phone').eq('company_id', companyId).or(`name.ilike.%${q}%,phone.ilike.%${q}%`).limit(5),
        supabase.from('deals').select('name, status, value').eq('company_id', companyId).ilike('name', `%${q}%`).limit(5)
      ])
      let r = ` *Search: "${q}"*\n\n`
      if (contacts && contacts.length > 0) { r += `*Contacts (${contacts.length}):*\n`; contacts.forEach((c, i) => r += `${i + 1}. ${c.name} | ${c.phone || c.email || '?'} | ${c.status}\n`); r += '\n' }
      if (leads && leads.length > 0) { r += `*Leads (${leads.length}):*\n`; leads.forEach((l, i) => r += `${i + 1}. ${l.name} | ${l.status}${l.value ? ` | $${l.value}` : ''}\n`); r += '\n' }
      if (deals && deals.length > 0) { r += `*Deals (${deals.length}):*\n`; deals.forEach((d, i) => r += `${i + 1}. ${d.name || 'Unnamed'} | ${d.status}${d.value ? ` | $${d.value}` : ''}\n`) }
      if (!contacts?.length && !leads?.length && !deals?.length) r += 'No results found for your search.'
      return r
    } catch (e) { return ' Error performing search.' }
  }

  private async handleDealLookup(name: string, sessionId: string): Promise<string> {
    if (!name.trim()) return ' Usage: `deal [name]`'
    try {
      const companyId = await this.getCompanyIdFromSession(sessionId)
      const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
      const supabase = getSupabaseAdminClient()
      const { data: deals } = await supabase.from('deals').select('name, status, value, description, created_at').eq('company_id', companyId).ilike('name', `%${name.trim()}%`).limit(3)
      if (!deals || deals.length === 0) return ` No deal found matching *"${name}"*\n\nUse \`deals\` to see all recent deals.`
      let r = ` *Deal Details*\n\n`
      deals.forEach((d, i) => {
        r += `*${i + 1}. ${d.name || 'Unnamed'}*\nStatus: ${d.status || '?'}\nValue: ${d.value ? '$' + parseFloat(d.value).toLocaleString() : 'N/A'}\nCreated: ${new Date(d.created_at).toLocaleDateString()}\n${d.description ? `Note: ${d.description}\n` : ''}\n`
      })
      return r.trim()
    } catch (e) { return ' Error looking up deal.' }
  }

  private async handleContactLookup(name: string, sessionId: string): Promise<string> {
    if (!name.trim()) return ' Usage: `contact [name]`'
    try {
      const companyId = await this.getCompanyIdFromSession(sessionId)
      const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
      const supabase = getSupabaseAdminClient()
      const { data: contacts } = await supabase.from('contacts').select('name, email, phone, status, company, notes, created_at').eq('company_id', companyId).is('deleted_at', null).ilike('name', `%${name.trim()}%`).limit(3)
      if (!contacts || contacts.length === 0) return ` No contact found matching *"${name}"*\n\nUse \`contacts\` to see all contacts.`
      let r = ` *Contact Details*\n\n`
      contacts.forEach((c, i) => {
        r += `*${i + 1}. ${c.name}*\nStatus: ${c.status || '?'}\nEmail: ${c.email || 'N/A'}\nPhone: ${c.phone || 'N/A'}\nCompany: ${c.company || 'N/A'}\nAdded: ${new Date(c.created_at).toLocaleDateString()}\n${c.notes ? `Notes: ${c.notes}\n` : ''}\n`
      })
      return r.trim()
    } catch (e) { return ' Error looking up contact.' }
  }

  private async handleCloseDeal(name: string, sessionId: string): Promise<string> {
    if (!name.trim()) return ' Usage: `close [deal name]`\nExample: `close Acme Corp Deal`'
    try {
      const companyId = await this.getCompanyIdFromSession(sessionId)
      const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
      const supabase = getSupabaseAdminClient()
      const { data: deals } = await supabase.from('deals').select('id, name, value, status').eq('company_id', companyId).ilike('name', `%${name.trim()}%`).not('status', 'in', '("won","lost")').limit(1)
      if (!deals || deals.length === 0) return ` No open deal found matching *"${name}"*\n\nUse \`deals\` to see your pipeline.`
      const deal = deals[0]
      const { error } = await supabase.from('deals').update({ status: 'won', updated_at: new Date().toISOString() }).eq('id', deal.id)
      if (error) return ` Could not update deal: ${error.message}`
      return ` *Deal Won!*\n\n*${deal.name}*\nValue: ${deal.value ? '$' + parseFloat(deal.value).toLocaleString() : 'N/A'}\nStatus:  Won\nClosed: ${new Date().toLocaleString()}\n\nCongratulations! `
    } catch (e) { return ' Error closing deal.' }
  }

  private async handleAddNote(params: string, sessionId: string): Promise<string> {
    // Format: [contact name] [note text]
    if (!params.trim()) return ' Usage: `note [contact name] [note text]`\nExample: `note John Doe Called about renewal`'
    try {
      const companyId = await this.getCompanyIdFromSession(sessionId)
      const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
      const supabase = getSupabaseAdminClient()
      // First word(s) are searched as contact name, rest is the note
      const words = params.trim().split(' ')
      let contactName = '', noteText = ''
      // Try to match first 1-3 words as contact name
      for (let n = Math.min(3, words.length - 1); n >= 1; n--) {
        const candidate = words.slice(0, n).join(' ')
        const { data } = await supabase.from('contacts').select('id, name').eq('company_id', companyId).ilike('name', `%${candidate}%`).limit(1).single()
        if (data) { contactName = data.name; noteText = words.slice(n).join(' '); break }
      }
      if (!contactName || !noteText) {
        // Fallback: assume everything is the note, attached to the closest-matching contact
        noteText = params.trim()
        const { data: anyContact } = await supabase.from('contacts').select('id, name').eq('company_id', companyId).is('deleted_at', null).limit(1).single()
        if (anyContact) contactName = anyContact.name
      }
      const { data: contacts } = await supabase.from('contacts').select('id, name, notes').eq('company_id', companyId).ilike('name', `%${contactName.split(' ')[0]}%`).limit(1)
      if (!contacts || contacts.length === 0) return ` No contact found for *"${contactName}"*\n\nTry \`search ${contactName}\` to find the correct name.`
      const c = contacts[0]
      const existingNotes = c.notes || ''
      const newNotes = existingNotes ? `${existingNotes}\n[${new Date().toLocaleDateString()}] ${noteText}` : `[${new Date().toLocaleDateString()}] ${noteText}`
      const { error } = await supabase.from('contacts').update({ notes: newNotes, updated_at: new Date().toISOString() }).eq('id', c.id)
      if (error) return ` Could not save note: ${error.message}`
      return ` *Note Added*\n\nContact: ${c.name}\nNote: ${noteText}\nDate: ${new Date().toLocaleString()}`
    } catch (e) { return ' Error adding note.' }
  }

  private async getCompanyIdFromSession(sessionId: string): Promise<string> {
    try {
      // Try to get from session manager first (fastest - in-memory with companyId)
      const { whatsappSessionManager } = await import('@/backend/services/whatsapp-session-manager')
      const sessionData = whatsappSessionManager.getSessionData(sessionId)
      
      //  NEW: Check companyId directly from session data
      if (sessionData && sessionData.companyId) {
        console.log(` Found company ID from session manager: ${sessionData.companyId}`)
        return sessionData.companyId
      }
      
      // Fallback 1: Get from whatsapp_settings via Supabase
      const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
      const supabase = getSupabaseAdminClient()
      
      const { data: settings, error } = await supabase
        .from('whatsapp_settings')
        .select('company_id')
        .eq('session_id', sessionId)
        .single()
      
      if (settings && !error && settings.company_id) {
        console.log(` Found company ID from whatsapp_settings: ${settings.company_id}`)
        return settings.company_id
      }
      
      // Fallback 2: If session data has userId, get company from user
      if (sessionData && sessionData.userId) {
        const { data: user, error: userError } = await supabase
          .from('users')
          .select('company_id')
          .eq('id', sessionData.userId)
          .single()
        
        if (user && !userError && user.company_id) {
          console.log(` Found company ID from user: ${user.company_id}`)
          return user.company_id
        }
      }
      
      // Last resort: Get the first available company (valid UUID)
      console.warn(` Could not find company for session ${sessionId}, querying for first available company`)
      const { data: firstCompany, error: companyError } = await supabase
        .from('companies')
        .select('id')
        .limit(1)
        .single()
      
      if (firstCompany && !companyError && firstCompany.id) {
        console.warn(` Using fallback company: ${firstCompany.id}`)
        return firstCompany.id
      }
      
      // If no company exists at all, throw an error instead of using invalid UUID
      throw new Error(`No valid company found for session ${sessionId} and no companies exist in database`)
    } catch (error) {
      console.error(' Error getting company ID from session:', error)
      throw new Error(`Failed to get company ID for session ${sessionId}: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // Store messages in database
  private async storeMessage(sessionId: string, fromNumber: string, toNumber: string, messageBody: string, messageType: string = 'text', direction: 'incoming' | 'outgoing', contactName?: string) {
    try {
      // Get company ID from session (this will throw if no valid company found)
      const companyId = await this.getCompanyIdFromSession(sessionId)
      
      console.log(` Storing ${direction} message for company ${companyId}, session ${sessionId}`)
      
      // Store in Supabase
      const { getSupabaseAdminClient } = await import('@/backend/database/supabase-config')
      const supabase = getSupabaseAdminClient()
      
      const { error } = await supabase
        .from('whatsapp_messages')
        .insert({
          company_id: companyId,
          session_id: sessionId, // Store the actual session ID string (TEXT column, not UUID)
          from_number: fromNumber,
          to_number: toNumber,
          message_body: messageBody,
          message_type: messageType,
          direction: direction, // DB CHECK constraint accepts 'incoming'/'outgoing'
          contact_name: contactName || null,
          timestamp: new Date().toISOString(),
          status: 'delivered',
          created_at: new Date().toISOString()
        })
      
      if (error) {
        console.error(' Error storing message in Supabase:', {
          error,
          companyId,
          sessionId,
          direction,
          fromNumber,
          toNumber
        })
        return
      }
      
      console.log(` Message stored in Supabase: ${direction} from ${fromNumber} to ${toNumber}`)
    } catch (error) {
      console.error(' Error storing message:', {
        error: error instanceof Error ? error.message : error,
        sessionId,
        fromNumber,
        toNumber,
        direction
      })
      // Don't rethrow - message storage failure should not break the WhatsApp connection
    }
  }



  private getSessionIdByPhoneNumber(phoneNumber: string): string | null {
    // Normalize input phone number (remove all non-digits)
    const cleanInput = phoneNumber.replace(/\D/g, '')
    
    for (const [sessionId, session] of this.sessions.entries()) {
      if (!session.phoneNumber) continue
      
      // Normalize session phone number
      const cleanSession = session.phoneNumber.replace(/\D/g, '')
      
      // Compare cleaned numbers
      if (cleanSession === cleanInput) {
        return sessionId
      }
    }
    return null
  }
}

// ── GLOBAL SINGLETON ────────────────────────────────────────────────────────
// In Next.js dev mode, Hot Module Replacement re-evaluates every module on
// each file save. A plain module-level `new WhatsAppWebService()` would create
// a fresh instance each time, losing all running puppeteer clients and session
// state, causing zombie sessions and repeated auto-restore loops.
// Storing on `global` ensures one instance for the lifetime of the Node process.
declare const global: typeof globalThis & {
  _whatsappWebService?: WhatsAppWebService
  _whatsappCleanupInterval?: ReturnType<typeof setInterval>
}
if (!global._whatsappWebService) {
  global._whatsappWebService = new WhatsAppWebService()
}
// Re-attach the latest class prototype on every HMR cycle.
// This preserves the instance's data (sessions/clients Maps) while ensuring
// all method fixes compiled since the last restart take immediate effect.
Object.setPrototypeOf(global._whatsappWebService, WhatsAppWebService.prototype)
if (!global._whatsappCleanupInterval) {
  global._whatsappCleanupInterval = setInterval(() => {
    global._whatsappWebService?.cleanupSessions()
  }, 5 * 60 * 1000)
}
export const whatsappWebService = global._whatsappWebService

// Export singleton instance as main service (multiple alias names for compatibility)
export const WhatsAppService = whatsappWebService
export const whatsappService = whatsappWebService
