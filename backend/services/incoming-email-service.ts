import { DatabaseUtils } from '../database/db-api'
import { EmailService } from './email-service'

export interface IncomingEmail {
  id: string
  serialNumber: string
  from: string
  to: string
  subject: string
  content: string
  receivedAt: Date
  processed: boolean
  autoReplySent: boolean
  messageId?: string
  inReplyTo?: string
}

export class IncomingEmailService {
  private static serialCounter = 1000000 // Start from 1 million for better formatting

  static async generateSerialNumber(): Promise<string> {
    this.serialCounter++
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
    return `IEM-${timestamp}-${this.serialCounter.toString().padStart(7, '0')}`
  }

  static async saveIncomingEmail(emailData: Omit<IncomingEmail, 'id' | 'serialNumber' | 'processed' | 'autoReplySent'>): Promise<IncomingEmail> {
    const serialNumber = await this.generateSerialNumber()
    const id = `incoming_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    const incomingEmail: IncomingEmail = {
      id,
      serialNumber,
      processed: false,
      autoReplySent: false,
      ...emailData
    }

    // Save to database
    await DatabaseUtils.saveIncomingEmailToDB({
      serialNumber,
      from: emailData.from,
      to: emailData.to,
      subject: emailData.subject,
      content: emailData.content,
      messageId: emailData.messageId,
      inReplyTo: emailData.inReplyTo,
      receivedAt: emailData.receivedAt,
      processed: false,
      autoReplySent: false
    })

    // Also log activity
    await DatabaseUtils.logActivity({
      action: 'incoming_email_received',
      description: `Incoming email received from ${emailData.from}`,
      resource: 'email',
      resource_id: id,
      metadata: {
        serialNumber,
        from: emailData.from,
        subject: emailData.subject,
        messageId: emailData.messageId
      }
    })

    console.log(` Incoming email saved with serial: ${serialNumber}`)
    return incomingEmail
  }

  static async sendAutoReply(incomingEmail: IncomingEmail, companyId: string): Promise<boolean> {
    try {
      if (!companyId) {
        // Sending without a company picks whichever mailbox the database
        // answers with, which is another tenant's.
        console.error('sendAutoReply requires a companyId; not replying')
        return false
      }
      console.log(` Starting auto-reply process for: ${incomingEmail.serialNumber}`)
      
      const emailSettings = await DatabaseUtils.getEmailSettings(companyId)
      if (!emailSettings.enableEmail) {
        console.log(' Auto-reply skipped - email not enabled in settings')
        return false
      }

      console.log(` Email settings retrieved - sender: ${emailSettings.senderEmail}`)

      // Create a fancy auto-reply message
      const autoReplySubject = `Re: ${incomingEmail.subject} [Auto-Reply - Ref: ${incomingEmail.serialNumber}]`
      
      console.log(` Preparing auto-reply email with subject: ${autoReplySubject}`)
      
      const autoReplyContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Auto-Reply Confirmation</title>
          <style>
              body {
                  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                  margin: 0;
                  padding: 0;
                  background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%);
                  line-height: 1.6;
              }
              .container {
                  max-width: 600px;
                  margin: 20px auto;
                  background: #1e3a8a;
                  border-radius: 15px;
                  overflow: hidden;
                  box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                  border: 2px solid #1d4ed8;
              }
              .header {
                  background: linear-gradient(135deg, #1e40af 0%, #2563eb 100%);
                  color: white;
                  padding: 40px 30px;
                  text-align: center;
                  border-bottom: 3px solid #3b82f6;
              }
              .header h1 {
                  margin: 0;
                  font-size: 28px;
                  font-weight: 700;
                  text-shadow: 0 2px 4px rgba(0,0,0,0.3);
              }
              .header p {
                  margin: 10px 0 0 0;
                  font-size: 16px;
                  opacity: 0.9;
                  color: #dbeafe;
              }
              .content {
                  padding: 40px 30px;
                  background: #1e3a8a;
                  color: #e0e7ff;
              }
              .status-badge {
                  display: inline-block;
                  background: linear-gradient(135deg, #059669 0%, #10b981 100%);
                  color: white;
                  padding: 8px 20px;
                  border-radius: 25px;
                  font-weight: 600;
                  font-size: 14px;
                  margin-bottom: 20px;
                  box-shadow: 0 4px 8px rgba(0,0,0,0.2);
              }
              .info-box {
                  background: #1e40af;
                  border: 2px solid #3b82f6;
                  border-radius: 10px;
                  padding: 25px;
                  margin: 25px 0;
                  box-shadow: 0 4px 8px rgba(0,0,0,0.2);
              }
              .info-row {
                  display: flex;
                  justify-content: space-between;
                  align-items: center;
                  padding: 8px 0;
                  border-bottom: 1px solid #3b82f6;
              }
              .info-row:last-child {
                  border-bottom: none;
              }
              .info-label {
                  font-weight: 600;
                  color: #bfdbfe;
                  flex: 1;
              }
              .info-value {
                  color: #e0e7ff;
                  text-align: right;
                  flex: 2;
                  word-break: break-all;
              }
              .serial-highlight {
                  background: linear-gradient(135deg, #f59e0b 0%, #f97316 100%);
                  color: white;
                  padding: 12px 20px;
                  border-radius: 8px;
                  font-weight: 700;
                  text-align: center;
                  font-size: 18px;
                  margin: 20px 0;
                  border: 2px solid #fb923c;
                  box-shadow: 0 4px 8px rgba(0,0,0,0.2);
                  text-shadow: 0 1px 2px rgba(0,0,0,0.3);
              }
              .response-timeline {
                  background: #1d4ed8;
                  border-left: 4px solid #60a5fa;
                  padding: 20px;
                  margin: 20px 0;
                  border-radius: 0 8px 8px 0;
                  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
              }
              .timeline-item {
                  display: flex;
                  align-items: center;
                  margin: 10px 0;
                  color: #dbeafe;
              }
              .timeline-icon {
                  background: #3b82f6;
                  color: white;
                  width: 24px;
                  height: 24px;
                  border-radius: 50%;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  margin-right: 15px;
                  font-size: 12px;
                  font-weight: bold;
                  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
              }
              .footer {
                  background: #1e293b;
                  color: #94a3b8;
                  text-align: center;
                  padding: 30px;
                  font-size: 14px;
                  border-top: 2px solid #334155;
              }
              .footer a {
                  color: #60a5fa;
                  text-decoration: none;
              }
              .contact-info {
                  background: #1d4ed8;
                  border: 2px solid #3b82f6;
                  border-radius: 8px;
                  padding: 20px;
                  margin: 20px 0;
                  text-align: center;
                  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
              }
              .contact-info h3 {
                  color: #dbeafe;
                  margin-top: 0;
              }
              .contact-info p {
                  color: #bfdbfe;
              }
              .contact-info a {
                  color: #60a5fa;
                  text-decoration: none;
              }
              @media only screen and (max-width: 600px) {
                  .container {
                      margin: 10px;
                      border-radius: 10px;
                  }
                  .header, .content {
                      padding: 25px 20px;
                  }
                  .info-row {
                      flex-direction: column;
                      align-items: flex-start;
                  }
                  .info-value {
                      text-align: left;
                      margin-top: 5px;
                  }
              }
          </style>
      </head>
      <body>
          <div class="container">
              <div class="header">
                  <h1> Auto-Reply Confirmation</h1>
                  <p>Your message has been received and processed by our CRM system</p>
              </div>
              
              <div class="content">
                  <div class="status-badge"> Message Received Successfully</div>
                  
                  <p>Dear Valued Customer,</p>
                  
                  <p>Thank you for contacting us! This is an automated confirmation that your email has been successfully received and processed by our Customer Relationship Management system.</p>
                  
                  <div class="serial-highlight">
                      Reference Number: ${incomingEmail.serialNumber}
                  </div>
                  
                  <div class="info-box">
                      <h3 style="margin-top: 0; color: #dbeafe;"> Message Details</h3>
                      <div class="info-row">
                          <div class="info-label"> From:</div>
                          <div class="info-value">${incomingEmail.from}</div>
                      </div>
                      <div class="info-row">
                          <div class="info-label"> Subject:</div>
                          <div class="info-value">${incomingEmail.subject}</div>
                      </div>
                      <div class="info-row">
                          <div class="info-label">⏰ Received:</div>
                          <div class="info-value">${incomingEmail.receivedAt.toLocaleString()}</div>
                      </div>
                      <div class="info-row">
                          <div class="info-label"> Status:</div>
                          <div class="info-value">Processed & Logged</div>
                      </div>
                  </div>
                  
                  <div class="response-timeline">
                      <h3 style="margin-top: 0; color: #dbeafe;"> What Happens Next?</h3>
                      <div class="timeline-item">
                          <div class="timeline-icon">1</div>
                          <div>Your message has been automatically categorized and assigned to our team</div>
                      </div>
                      <div class="timeline-item">
                          <div class="timeline-icon">2</div>
                          <div>A team member will review your inquiry within 24 hours</div>
                      </div>
                      <div class="timeline-item">
                          <div class="timeline-icon">3</div>
                          <div>You'll receive a personalized response with detailed information</div>
                      </div>
                  </div>
                  
                  <div class="contact-info">
                      <h3> Need Immediate Assistance?</h3>
                      <p>If your matter is urgent, please contact us directly:</p>
                      <p><strong>Email:</strong> <a href="mailto:${emailSettings.senderEmail}">${emailSettings.senderEmail}</a></p>
                      <p><strong>Response Time:</strong> Typically within 2-4 hours during business hours</p>
                  </div>
                  
                  <p><strong>Important:</strong> Please keep the reference number <code style="background: #1d4ed8; padding: 2px 6px; border-radius: 4px; color: #fbbf24;">${incomingEmail.serialNumber}</code> for your records. Include it in any follow-up communications for faster processing.</p>
                  
                  <p>We appreciate your business and look forward to assisting you!</p>
                  
                  <p>Best regards,<br>
                  <strong style="color: #dbeafe;">Customer Service Team</strong><br>
                  <em style="color: #bfdbfe;">Automated CRM System</em></p>
              </div>
              
              <div class="footer">
                  <p><strong> CRM Auto-Reply System</strong></p>
                  <p>This is an automated message. Please do not reply directly to this email.</p>
                  <p>Reference: ${incomingEmail.serialNumber} | Generated: ${new Date().toLocaleString()}</p>
                  <p>© ${new Date().getFullYear()} CRM System. All rights reserved.</p>
              </div>
          </div>
      </body>
      </html>
      `

      console.log(` Sending auto-reply to: ${incomingEmail.from}`)

      // Send the auto-reply
      const result = await EmailService.sendEmail(
        companyId,
        incomingEmail.from,
        autoReplySubject,
        autoReplyContent,
        [], // attachments
        undefined, // templateId
        true // isHtml
      )

      console.log(` Auto-reply email sent successfully with messageId: ${result.messageId}`)

      // Log the auto-reply
      await DatabaseUtils.logActivity({
        action: 'auto_reply_sent',
        description: `Auto-reply sent to ${incomingEmail.from} for email ${incomingEmail.serialNumber}`,
        resource: 'email',
        resource_id: incomingEmail.id,
        metadata: {
          originalSerial: incomingEmail.serialNumber,
          replyTo: incomingEmail.from,
          replySubject: autoReplySubject,
          messageId: result.messageId
        }
      })

      // Update database record
      await DatabaseUtils.updateIncomingEmailStatus(incomingEmail.serialNumber, {
        autoReplySent: true,
        autoReplyMessageId: result.messageId
      })

      console.log(` Auto-reply sent for ${incomingEmail.serialNumber} to ${incomingEmail.from}`)
      return true

    } catch (error: unknown) {
      console.error(' Failed to send auto-reply:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error(' Error details:', errorMessage)
      return false
    }
  }

  static async processIncomingEmail(emailData: {
    from: string
    to: string
    subject: string
    content: string
    messageId?: string
    inReplyTo?: string
  }, companyId: string): Promise<IncomingEmail> {
    console.log(` Starting to process incoming email from: ${emailData.from}`)
    
    // Save the incoming email
    const incomingEmail = await this.saveIncomingEmail({
      ...emailData,
      receivedAt: new Date()
    })

    console.log(` Incoming email saved with serial: ${incomingEmail.serialNumber}`)

    // Send auto-reply
    console.log(` Attempting to send auto-reply for: ${incomingEmail.serialNumber}`)
    const autoReplySent = await this.sendAutoReply(incomingEmail, companyId)
    
    if (autoReplySent) {
      console.log(` Auto-reply sent successfully for: ${incomingEmail.serialNumber}`)
    } else {
      console.log(` Auto-reply failed for: ${incomingEmail.serialNumber}`)
    }

    // Update the record
    incomingEmail.processed = true
    incomingEmail.autoReplySent = autoReplySent

    // Update database
    await DatabaseUtils.updateIncomingEmailStatus(incomingEmail.serialNumber, {
      processed: true,
      autoReplySent: autoReplySent
    })

    console.log(` Processed incoming email: ${incomingEmail.serialNumber} (Auto-reply: ${autoReplySent ? 'YES' : 'NO'})`)
    
    return incomingEmail
  }

  static async getIncomingEmails(limit: number = 50): Promise<any[]> {
    try {
      // Get incoming emails from dedicated table
      const emails = await DatabaseUtils.getIncomingEmailsFromDB(limit)
      return emails.map((email: any) => ({
        id: email.id,
        serialNumber: email.serial_number,
        from: email.from_email,
        to: email.to_email,
        subject: email.subject,
        content: email.content,
        receivedAt: email.received_at,
        processed: email.processed === 1,
        autoReplySent: email.auto_reply_sent === 1,
        messageId: email.message_id,
        status: email.status,
        assignedTo: email.assigned_to
      }))
    } catch (error: unknown) {
      console.error(' Failed to get incoming emails:', error)
      return []
    }
  }
}
