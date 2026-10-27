import nodemailer from 'nodemailer'
import { getSupabaseAdminClient } from '@/backend/database/supabase-config'

/**
 * Email Service for Supabase
 * Handles email sending with proper Supabase field mapping
 */
export class EmailServiceSupabase {
  
  /**
   * Create nodemailer transporter with Supabase email settings
   */
  static async createTransporter(companyId: string) {
    const supabase = getSupabaseAdminClient()
    
    // Get email settings from Supabase
    const { data: emailSettings, error } = await supabase
      .from('email_settings')
      .select('*')
      .eq('company_id', companyId)
      .single()
    
    if (error || !emailSettings) {
      throw new Error('Email settings not found for company')
    }
    
    // Check if email is enabled (handle both field names)
    const isEnabled = emailSettings.enable_email || emailSettings.enabled
    
    if (!isEnabled) {
      throw new Error('Email is not enabled. Please enable in Settings → Email Settings')
    }
    
    // Get credentials from database fields
    const fromEmail = emailSettings.from_email
    const smtpPassword = emailSettings.smtp_password || emailSettings.app_password
    const smtpUsername = emailSettings.smtp_username || fromEmail
    const smtpHost = emailSettings.smtp_host || 'smtp.gmail.com'
    const smtpPort = emailSettings.smtp_port || 587
    
    if (!fromEmail) {
      throw new Error('Sender email not configured')
    }
    
    if (!smtpPassword) {
      throw new Error('SMTP password not configured')
    }

    console.log(` Creating email transporter for ${fromEmail}`)

    return nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: emailSettings.smtp_secure || smtpPort === 465,
      auth: {
        user: smtpUsername,
        pass: smtpPassword,
      },
      connectionTimeout: 10000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
    })
  }

  /**
   * Send email
   */
  static async sendEmail(
    to: string | string[], 
    subject: string, 
    content: string, 
    attachments?: any[], 
    templateId?: string, 
    isHtml?: boolean,
    companyId?: string
  ) {
    try {
      if (!companyId) {
        throw new Error('Company ID is required to send email')
      }

      const transporter = await this.createTransporter(companyId)
      const supabase = getSupabaseAdminClient()
      
      // Get email settings for from address
      const { data: emailSettings } = await supabase
        .from('email_settings')
        .select('*')
        .eq('company_id', companyId)
        .single()
      
      if (!emailSettings) {
        throw new Error('Email settings not found')
      }

      const fromEmail = emailSettings.from_email
      const fromName = emailSettings.from_name || 'CRM System'

      // Process template if provided
      let finalContent = content
      let finalSubject = subject
      let useHTML = isHtml !== undefined ? isHtml : true
      
      if (templateId) {
        const { data: template } = await supabase
          .from('email_templates')
          .select('*')
          .eq('id', templateId)
          .single()
          
        if (template) {
          finalSubject = template.subject || subject
          finalContent = template.body || content
          useHTML = template.is_html || true
        }
      }

      // Auto-wrap HTML if needed
      if (useHTML && !finalContent.includes('<html')) {
        finalContent = this.wrapHtmlForEmail(finalContent, finalSubject, fromName)
      }

      const mailOptions = {
        from: fromName ? `"${fromName}" <${fromEmail}>` : fromEmail,
        to: Array.isArray(to) ? to.join(', ') : to,
        subject: finalSubject,
        [useHTML ? 'html' : 'text']: finalContent,
        attachments: attachments || []
      }

      console.log(` Sending email to: ${mailOptions.to}`)
      console.log(`   Subject: ${finalSubject}`)

      const info = await transporter.sendMail(mailOptions)
      
      console.log(` Email sent successfully: ${info.messageId}`)

      return {
        success: true,
        messageId: info.messageId,
        to: mailOptions.to,
        subject: finalSubject
      }

    } catch (error) {
      console.error(' Email send error:', error)
      throw error
    }
  }

  /**
   * Wrap HTML content in email template
   */
  private static wrapHtmlForEmail(content: string, subject: string, senderName: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #f8f9fa; padding: 20px; border-radius: 5px;">
    <h2 style="color: #2563eb; margin-top: 0;">${subject}</h2>
    <div style="background: white; padding: 20px; border-radius: 5px; margin: 20px 0;">
      ${content}
    </div>
    <p style="color: #666; font-size: 12px; margin-top: 20px;">
      Sent by ${senderName}
    </p>
  </div>
</body>
</html>
    `.trim()
  }
}

export default EmailServiceSupabase
