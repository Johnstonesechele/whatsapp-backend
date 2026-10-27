import { DatabaseUtils } from '../database/db-api'
import { IncomingEmailService } from './incoming-email-service'
import Imap from 'imap'
import { simpleParser } from 'mailparser'

export class EmailMonitorService {
  private static imapConnection: any = null
  private static isMonitoring = false
  private static monitoringInterval: NodeJS.Timeout | null = null

  /**
   * companyId is required. A mailbox belongs to a company, and an unscoped
   * getEmailSettings() would attach the IMAP connection to whichever company's
   * row the database answered with - so a user could read another tenant's mail,
   * or the monitor silently never connects once there is more than one tenant.
   * Neither is a thing to guess at, so it is refused instead.
   */
  static async startEmailMonitoring(companyId: string): Promise<boolean> {
    try {
      if (!companyId) {
        console.error('startEmailMonitoring requires a companyId; not attaching to an unspecified mailbox')
        return false
      }
      if (this.isMonitoring) {
        console.log(' Email monitoring already running')
        return true
      }

      const emailSettings = await DatabaseUtils.getEmailSettings(companyId)
      
      if (!emailSettings.enableEmail || !emailSettings.senderEmail || !emailSettings.appPassword) {
        console.log(' Email monitoring skipped - email not configured')
        return false
      }

      // Record which company this mailbox belongs to, so the import-time
      // auto-start knows what it is allowed to attach to.
      const current = await DatabaseUtils.getEmailMonitoringSettings()
      await DatabaseUtils.saveEmailMonitoringSettings({ ...current, companyId })

      // Update monitoring settings to indicate monitoring is starting
      const monitoringSettings = await DatabaseUtils.getEmailMonitoringSettings()
      await DatabaseUtils.saveEmailMonitoringSettings({
        ...monitoringSettings,
        isEnabled: true,
        lastStartedAt: new Date().toISOString()
      })

      // Set up IMAP connection for monitoring
      const imapConfig = {
        user: emailSettings.senderEmail,
        password: emailSettings.appPassword,
        host: 'imap.gmail.com', // Gmail IMAP
        port: 993,
        tls: true,
        tlsOptions: { rejectUnauthorized: false },
        authTimeout: 10000,
        connTimeout: 10000
      }

      console.log(' Starting email monitoring for:', emailSettings.senderEmail)

      // Start monitoring with periodic checks
      const checkInterval = monitoringSettings.checkInterval || 30000
      this.monitoringInterval = setInterval(() => {
        this.checkForNewEmails(imapConfig, companyId).catch(console.error)
      }, checkInterval) // Use configured interval

      // Initial check
      await this.checkForNewEmails(imapConfig, companyId)

      this.isMonitoring = true
      console.log(' Email monitoring started successfully')
      return true

    } catch (error) {
      console.error(' Failed to start email monitoring:', error)
      
      // Update settings to indicate monitoring failed to start
      try {
        const monitoringSettings = await DatabaseUtils.getEmailMonitoringSettings()
        await DatabaseUtils.saveEmailMonitoringSettings({
          ...monitoringSettings,
          isEnabled: false,
          lastStoppedAt: new Date().toISOString()
        })
      } catch (settingsError) {
        console.error(' Failed to update monitoring settings:', settingsError)
      }
      
      return false
    }
  }

  static async stopEmailMonitoring(): Promise<void> {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = null
    }

    if (this.imapConnection) {
      this.imapConnection.end()
      this.imapConnection = null
    }

    this.isMonitoring = false
    
    // Update monitoring settings to indicate monitoring stopped
    try {
      const monitoringSettings = await DatabaseUtils.getEmailMonitoringSettings()
      await DatabaseUtils.saveEmailMonitoringSettings({
        ...monitoringSettings,
        isEnabled: false,
        lastStoppedAt: new Date().toISOString()
      })
    } catch (error) {
      console.error(' Failed to update monitoring settings:', error)
    }
    
    console.log(' Email monitoring stopped')
  }

  private static async checkForNewEmails(imapConfig: any, companyId?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const imap = new Imap(imapConfig)

      imap.once('ready', () => {
        console.log(' IMAP connection established')
        
        imap.openBox('INBOX', false, (err: any, box: any) => {
          if (err) {
            console.error(' Failed to open INBOX:', err)
            imap.end()
            return reject(err)
          }

          console.log(` INBOX opened - Total messages: ${box.messages.total}, Unread: ${box.messages.new}`)

          // Only search for unread emails - no fallback to recent emails
          imap.search(['UNSEEN'], (err: any, results: any) => {
            if (err) {
              console.error(' Email search failed:', err)
              imap.end()
              return reject(err)
            }

            console.log(` Search results: ${results ? results.length : 0} unread emails found`)

            if (!results || results.length === 0) {
              console.log(' No new emails found')
              imap.end()
              return resolve()
            }

            this.processEmailResults(imap, results, resolve, reject, companyId)
          })
        })
      })

      imap.once('error', (err: any) => {
        console.error(' IMAP connection error:', err)
        reject(err)
      })

      imap.once('end', () => {
        console.log(' IMAP connection ended')
      })

      imap.connect()
    })
  }

  private static processEmailResults(imap: any, results: any[], resolve: Function, reject: Function, companyId?: string): void {
    console.log(` Processing ${results.length} emails`)

    const fetch = imap.fetch(results, { 
      bodies: '',
      markSeen: false, // Don't mark as seen yet
      struct: true 
    })
    
    let processedCount = 0
    const totalEmails = results.length
    
    fetch.on('message', (msg: any, seqno: number) => {
      let emailData: any = {}
      let emailParsed = false
      
      console.log(` Processing email ${seqno}...`)
      
      msg.on('body', (stream: any, info: any) => {
        simpleParser(stream, async (err: any, parsed: any) => {
          if (err) {
            console.error(' Failed to parse email:', err)
            emailParsed = true
            return
          }

          emailData = {
            from: parsed.from?.text || 'unknown@unknown.com',
            to: parsed.to?.text || '',
            subject: parsed.subject || 'No Subject',
            content: parsed.text || parsed.html || 'No content',
            messageId: parsed.messageId,
            inReplyTo: parsed.inReplyTo,
            receivedAt: parsed.date || new Date()
          }

          console.log(` Email parsed - From: ${emailData.from}, Subject: ${emailData.subject}`)
          emailParsed = true
        })
      })

      msg.once('end', async () => {
        // Wait for email parsing to complete
        while (!emailParsed) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }

        try {
          // Process the incoming email
          if (emailData.from && emailData.from !== 'unknown@unknown.com') {
            console.log(` Processing email from: ${emailData.from}`)
            
            // Check if we've already processed this specific email (by messageId only)
            const existingEmail = await this.checkIfEmailAlreadyProcessed(emailData.messageId)
            if (existingEmail) {
              console.log(` Email ${emailData.messageId} already processed, skipping...`)
            } else {
              console.log(` New email detected, calling IncomingEmailService.processIncomingEmail...`)
              await IncomingEmailService.processIncomingEmail(emailData, companyId)
              console.log(` IncomingEmailService.processIncomingEmail completed`)
              
              // Mark as read to avoid reprocessing
              imap.addFlags(seqno, ['\\Seen'], (err: any) => {
                if (err) console.error(' Failed to mark email as read:', err)
                else console.log(` Email ${seqno} marked as read`)
              })
            }
          } else {
            console.log(` Skipping email with invalid from address: ${emailData.from}`)
          }
          
          processedCount++
          if (processedCount === totalEmails) {
            console.log(' Finished processing all emails')
            imap.end()
            resolve()
          }
        } catch (error) {
          console.error(' Failed to process incoming email:', error)
          processedCount++
          if (processedCount === totalEmails) {
            imap.end()
            resolve()
          }
        }
      })
    })

    fetch.once('error', (err: any) => {
      console.error(' Email fetch error:', err)
      imap.end()
      reject(err)
    })
  }

  private static async checkIfEmailAlreadyProcessed(messageId: string): Promise<boolean> {
    try {
      if (!messageId) {
        console.log(' No messageId provided, treating as new email')
        return false
      }
      
      // Query the incoming_emails table to check if this SPECIFIC message ID exists
      const emails = await DatabaseUtils.getIncomingEmailsFromDB(500)
      
      // Check for exact messageId match - this is the ONLY check we need
      // Each unique email should get an auto-reply, regardless of sender history
      const messageIdExists = emails.some((email: any) => 
        email.messageId === messageId || email.message_id === messageId
      )
      
      if (messageIdExists) {
        console.log(` Email with messageId ${messageId} already processed`)
        return true
      }
      
      console.log(` Email with messageId ${messageId} is new, will process`)
      return false
      
    } catch (error) {
      console.error(' Error checking if email already processed:', error)
      return false
    }
  }

  static async getMonitoringStatus(): Promise<{ isMonitoring: boolean; lastCheck: Date | null; settings: any }> {
    try {
      const settings = await DatabaseUtils.getEmailMonitoringSettings()
      return {
        isMonitoring: this.isMonitoring,
        lastCheck: settings.lastStartedAt ? new Date(settings.lastStartedAt) : null,
        settings
      }
    } catch (error) {
      console.error(' Failed to get monitoring settings:', error)
      return {
        isMonitoring: this.isMonitoring,
        lastCheck: null,
        settings: {
          isEnabled: false,
          lastStartedAt: null,
          lastStoppedAt: null,
          autoReplyEnabled: true,
          checkInterval: 30000
        }
      }
    }
  }

  // Auto-start monitoring based on persisted settings when the module is loaded
  static async initializeFromSettings(): Promise<void> {
    try {
      const settings = await DatabaseUtils.getEmailMonitoringSettings()
      // The monitoring flag is one global row with no company on it, so it used
      // to auto-start against an unspecified mailbox - which, with more than one
      // tenant, means no mailbox at all. The company that enabled monitoring is
      // recorded alongside the flag, and auto-start happens only for that one.
      const owner = settings.companyId || settings.company_id
      if (settings.isEnabled && owner && !this.isMonitoring) {
        console.log(' Auto-starting email monitoring from persisted settings...')
        await this.startEmailMonitoring(owner)
      }
    } catch (error) {
      console.error(' Failed to initialize email monitoring from settings:', error)
    }
  }
}

// Auto-start monitoring when the module is loaded (if it was previously enabled)
EmailMonitorService.initializeFromSettings().catch(console.error)
