import twilio from 'twilio'
import { DatabaseUtils } from '@/backend/database/db-api'

export class SMSService {
  /**
   * companyId is REQUIRED.
   *
   * getSMSSettings() with no argument falls through to the DEFAULT settings
   * object - enableSMS false, empty account SID, empty auth token - so
   * createClient throws "SMS settings are not properly configured" even when
   * Twilio is configured perfectly well.
   *
   * Verified on production: Twilio was configured (account SID and auth token
   * present, enableSMS true, a from number set) and every campaign SMS failed
   * with exactly that message. It is the same defect that broke email, fixed in
   * a2ea65ca, and it was never applied here.
   */
  static async createClient(companyId: string) {
    if (!companyId) {
      throw new Error(
        'SMSService.createClient requires a companyId: settings are per-company and an unscoped lookup returns empty defaults'
      )
    }
    const smsSettings = await DatabaseUtils.getSMSSettings(companyId)

    if (!smsSettings.enableSMS || !smsSettings.accountSid || !smsSettings.authToken) {
      throw new Error('SMS settings are not properly configured for this company')
    }

    return twilio(smsSettings.accountSid, smsSettings.authToken)
  }

  static async sendSMS(companyId: string, to: string | string[], message: string) {
    try {
      const client = await this.createClient(companyId)
      const smsSettings = await DatabaseUtils.getSMSSettings(companyId)

      const recipients = Array.isArray(to) ? to : [to]
      const results = []

      for (const phoneNumber of recipients) {
        try {
          const result = await client.messages.create({
            body: message,
            from: smsSettings.fromNumber,
            to: this.formatPhoneNumber(phoneNumber)
          })
          
          results.push({ 
            phone: phoneNumber, 
            status: 'sent', 
            messageId: result.sid 
          })
          console.log('SMS sent successfully:', result.sid)
        } catch (error) {
          console.error(`Failed to send SMS to ${phoneNumber}:`, error)
          results.push({ 
            phone: phoneNumber, 
            status: 'failed', 
            error: error instanceof Error ? error.message : 'Unknown error' 
          })
        }

        // Small delay between messages
        if (recipients.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }

      return results
    } catch (error) {
      console.error('SMS service error:', error)
      throw error
    }
  }

  static async sendTestSMS(companyId: string) {
    const smsSettings = await DatabaseUtils.getSMSSettings(companyId)
    
    const testMessage = `Test SMS from CRM System\n\nThis is a test message to verify your SMS configuration.\n\nSent at: ${new Date().toLocaleString()}`

    // For testing, we'll send to a default test number or the configured number
    const testNumber = smsSettings.fromNumber || '+1234567890' // You should configure a test number
    
    return this.sendSMS(companyId, testNumber, testMessage)
  }

  static async sendScheduledSMS(companyId: string, scheduledMessage: any, recipients: string[]) {
    try {
      const phoneNumbers = recipients.filter(phone => this.isValidPhoneNumber(phone))
      
      if (phoneNumbers.length === 0) {
        throw new Error('No valid phone numbers found')
      }

      const message = `${scheduledMessage.title}\n\n${scheduledMessage.message}`
      const results = await this.sendSMS(companyId, phoneNumbers, message)

      return results
    } catch (error) {
      console.error('Failed to send scheduled SMS:', error)
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
