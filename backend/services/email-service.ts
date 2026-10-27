import nodemailer from 'nodemailer'
import { DatabaseUtils } from '@/backend/database/db-api'

export class EmailService {
  /**
   * companyId is REQUIRED, not optional.
   *
   * getEmailSettings() with no argument runs `.single()` across EVERY company's
   * settings row. With one tenant that happens to work. With two or more,
   * `.single()` errors because it matched more than one row, and the accessor
   * silently returns disabled defaults - so createTransporter throws
   * "Email settings are not properly configured".
   *
   * That is what was happening on production: /api/settings/email/test passed,
   * because the test route scopes its own query by company_id, while every
   * campaign failed with that exact message. The settings WERE configured.
   *
   * It is also a tenant-scoping defect, not only a reliability one: without the
   * company, which company's mailbox a message is sent from was decided by
   * whichever row the database happened to return.
   */
  static async createTransporter(companyId: string) {
    if (!companyId) {
      throw new Error(
        'EmailService.createTransporter requires a companyId: settings are per-company and an unscoped lookup is both unreliable and cross-tenant'
      )
    }
    const emailSettings = await DatabaseUtils.getEmailSettings(companyId)

    if (!emailSettings.enableEmail || !emailSettings.senderEmail || !emailSettings.appPassword) {
      throw new Error('Email settings are not properly configured for this company')
    }

    return nodemailer.createTransport({
      host: emailSettings.smtpHost,
      port: emailSettings.smtpPort,
      secure: emailSettings.smtpPort === 465, // true for 465 (SSL), false for other ports (TLS)
      auth: {
        user: emailSettings.senderEmail,
        pass: emailSettings.appPassword,
      },
      connectionTimeout: 10000, // 10 seconds
      greetingTimeout: 5000, // 5 seconds
      socketTimeout: 10000, // 10 seconds
    })
  }

  static async sendEmail(companyId: string, to: string | string[], subject: string, content: string, attachments?: any[], templateId?: string, isHtml?: boolean) {
    try {
      const transporter = await this.createTransporter(companyId)
      const emailSettings = await DatabaseUtils.getEmailSettings(companyId)

      // Use template if provided
      let finalContent = content
      let finalSubject = subject
      let useHTML = false
      
      if (templateId) {
        const templates = await DatabaseUtils.getEmailTemplates()
        const template = templates.find((t: any) => t.id === templateId)
        if (template) {
          // Use template subject if it exists, otherwise use provided subject
          finalSubject = template.subject || subject
          
          // Use template content and process variables
          if (template.body) {
            // Prepare default template variables
            const templateVars = { 
              subject: finalSubject,
              title: finalSubject,
              greeting: "Hello,",
              message: content,
              highlight_content: "Important information from your CRM system.",
              cta_text: "",
              cta_link: "",
              closing_message: "Thank you for your attention.",
              sender_name: emailSettings.senderName || "CRM System",
              company_name: "Your Company",
              company_address: "Your Business Address",
              date: new Date().toLocaleDateString(),
              time: new Date().toLocaleTimeString(),
              name: "Valued Customer",
              email: Array.isArray(to) ? to[0] : to
            }
            
            // Process template content with variables
            finalContent = this.processTemplate(template.body, templateVars)
            
            // Use template's HTML setting
            useHTML = template.is_html || true
          }

          // Increment template usage count
          try {
            const currentUsageCount = template.usage_count || 0
            await DatabaseUtils.updateEmailTemplate(templateId, {
              usage_count: currentUsageCount + 1
            })
            console.log(`Template usage incremented for template ${templateId}: ${currentUsageCount + 1}`)
          } catch (error) {
            console.error('Failed to increment template usage:', error)
            // Don't fail the email send if usage tracking fails
          }
        }
      } else {
        // Auto-detect HTML content or use explicit isHtml parameter
        useHTML = isHtml || this.isHtmlContent(content)
        
        // If content is HTML but not wrapped in proper email structure, wrap it
        if (useHTML && !content.includes('<html')) {
          finalContent = this.wrapHtmlForEmail(content, finalSubject, emailSettings.senderName || "CRM System")
        }
      }

      const mailOptions = {
        from: emailSettings.senderName 
          ? `"${emailSettings.senderName}" <${emailSettings.senderEmail}>`
          : emailSettings.senderEmail,
        to: Array.isArray(to) ? to.join(', ') : to,
        subject: finalSubject,
        [useHTML ? 'html' : 'text']: finalContent,
        attachments: attachments || []
      }

      const result = await transporter.sendMail(mailOptions)
      console.log('Email sent successfully:', result.messageId)
      return result
    } catch (error) {
      console.error('Failed to send email:', error)
      throw error
    }
  }

  static async sendTestEmail(companyId: string) {
    const emailSettings = await DatabaseUtils.getEmailSettings(companyId)
    
    const testEmailContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #2563eb;">Email Configuration Test</h2>
      <p>Congratulations! Your email configuration is working correctly.</p>
      <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <h3>Configuration Details:</h3>
        <ul>
          <li><strong>SMTP Host:</strong> ${emailSettings.smtpHost}</li>
          <li><strong>SMTP Port:</strong> ${emailSettings.smtpPort}</li>
          <li><strong>Sender Email:</strong> ${emailSettings.senderEmail}</li>
          <li><strong>Test Time:</strong> ${new Date().toLocaleString()}</li>
        </ul>
      </div>
      <p>Your CRM system is now ready to send automated emails, notifications, and campaigns.</p>
      <hr style="border: none; height: 1px; background-color: #e5e7eb; margin: 20px 0;">
      <p style="font-size: 12px; color: #6b7280;">
        This is an automated test email from your CRM system.
      </p>
    </div>
    `

    return await this.sendEmail(
      emailSettings.senderEmail, 
      ' Email Configuration Test - Success!', 
      testEmailContent,
      [], // attachments
      undefined, // templateId
      true // isHtml
    )
  }

  static isHtmlContent(content: string): boolean {
    // Simple HTML detection - check for common HTML tags
    const htmlPattern = /<\s*\w+[^>]*>/i
    return htmlPattern.test(content)
  }

  static processTemplate(template: string, variables: Record<string, any>): string {
    let processed = template
    
    // Replace template variables with {{variable}} syntax
    Object.keys(variables).forEach(key => {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g')
      processed = processed.replace(regex, variables[key] || '')
    })
    
    // Handle conditional blocks {{#if variable}} ... {{/if}}
    processed = processed.replace(/\{\{\#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, variable, content) => {
      return variables[variable] ? content : ''
    })
    
    // Handle conditional blocks {{#unless variable}} ... {{/unless}}
    processed = processed.replace(/\{\{\#unless\s+(\w+)\}\}([\s\S]*?)\{\{\/unless\}\}/g, (match, variable, content) => {
      return !variables[variable] ? content : ''
    })
    
    // Remove any remaining template syntax that wasn't processed
    processed = processed.replace(/\{\{.*?\}\}/g, '')
    
    return processed
  }

  static async sendBulkEmail(companyId: string, recipients: string[], subject: string, content: string, templateId?: string, isHtml?: boolean) {
    const results = []
    
    for (const recipient of recipients) {
      try {
        const result = await this.sendEmail(recipient, subject, content, [], templateId, isHtml)
        results.push({ email: recipient, success: true, messageId: result.messageId })
      } catch (error) {
        results.push({ email: recipient, success: false, error: (error as Error).message })
      }
    }
    
    return results
  }

  static async sendCampaignEmail(companyId: string, campaignId: string, contactId: string, subject: string, content: string) {
    try {
      // Get contact info
      const contact = await DatabaseUtils.getContact(contactId)
      if (!contact || !contact.email) {
        throw new Error('Contact not found or no email address')
      }

      // Send email
      const result = await this.sendEmail(contact.email, subject, content, [], undefined, this.isHtmlContent(content))
      
      // Log campaign activity
      await DatabaseUtils.logActivity({
        action: 'campaign_email_sent',
        description: `Campaign email sent to ${contact.email}`,
        resource: 'campaign',
        resource_id: campaignId,
        metadata: {
          campaignId,
          contactId,
          subject,
          messageId: result.messageId
        }
      })

      return result
    } catch (error) {
      console.error('Failed to send campaign email:', error)
      throw error
    }
  }

  static async sendWelcomeEmail(companyId: string, userEmail: string, userName: string) {
    const welcomeContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #2563eb;">Welcome to Our CRM System!</h2>
      <p>Hello ${userName},</p>
      <p>Welcome to our Customer Relationship Management system. We're excited to have you on board!</p>
      <div style="background-color: #f0f9ff; padding: 15px; border-left: 4px solid #2563eb; margin: 20px 0;">
        <p><strong>Getting Started:</strong></p>
        <ul>
          <li>Complete your profile setup</li>
          <li>Explore the dashboard features</li>
          <li>Import your existing contacts</li>
          <li>Set up your first campaign</li>
        </ul>
      </div>
      <p>If you have any questions or need assistance, don't hesitate to reach out to our support team.</p>
      <p>Best regards,<br>The CRM Team</p>
    </div>
    `

    return await this.sendEmail(userEmail, 'Welcome to CRM System', welcomeContent, [], undefined, true)
  }

  static async sendPasswordResetEmail(companyId: string, userEmail: string, resetToken: string) {
    const resetLink = `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset-password?token=${resetToken}`
    
    const resetContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #dc2626;">Password Reset Request</h2>
      <p>You have requested to reset your password for your CRM account.</p>
      <p>Click the button below to reset your password:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetLink}" 
           style="background-color: #dc2626; color: white; padding: 12px 24px; 
                  text-decoration: none; border-radius: 6px; display: inline-block;">
          Reset Password
        </a>
      </div>
      <p style="font-size: 14px; color: #6b7280;">
        If you didn't request this password reset, please ignore this email. 
        This link will expire in 1 hour for security reasons.
      </p>
      <p style="font-size: 12px; color: #6b7280; word-break: break-all;">
        Or copy and paste this link: ${resetLink}
      </p>
    </div>
    `

    return await this.sendEmail(userEmail, 'Password Reset Request', resetContent, [], undefined, true)
  }

  static wrapHtmlForEmail(content: string, subject: string, senderName: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>${subject}</title>
    <!--[if mso]>
    <noscript>
        <xml>
            <o:OfficeDocumentSettings>
                <o:PixelsPerInch>96</o:PixelsPerInch>
            </o:OfficeDocumentSettings>
        </xml>
    </noscript>
    <![endif]-->
    <style type="text/css">
        /* Reset styles for better email client compatibility */
        body, table, td, p, a, li, blockquote {
            -webkit-text-size-adjust: 100%;
            -ms-text-size-adjust: 100%;
        }
        table, td {
            mso-table-lspace: 0pt;
            mso-table-rspace: 0pt;
        }
        img {
            -ms-interpolation-mode: bicubic;
            border: 0;
            height: auto;
            line-height: 100%;
            outline: none;
            text-decoration: none;
        }
        
        /* Main email styles */
        body {
            margin: 0 !important;
            padding: 0 !important;
            background-color: #f4f4f4;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, Arial, sans-serif;
            color: #333333;
        }
        
        .email-wrapper {
            width: 100%;
            background-color: #f4f4f4;
            padding: 20px 0;
        }
        
        .email-container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        
        .email-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
            text-align: center;
        }
        
        .email-header h1 {
            color: #ffffff;
            margin: 0;
            font-size: 24px;
            font-weight: 600;
        }
        
        .email-content {
            padding: 30px;
            line-height: 1.6;
        }
        
        .email-content h1, .email-content h2, .email-content h3 {
            color: #333333;
            margin-top: 0;
        }
        
        .email-content p {
            margin: 0 0 16px 0;
            color: #555555;
            font-size: 16px;
        }
        
        .email-content a {
            color: #667eea;
            text-decoration: none;
        }
        
        .email-content a:hover {
            text-decoration: underline;
        }
        
        .email-footer {
            background-color: #f8f9fa;
            padding: 20px;
            text-align: center;
            border-top: 1px solid #e9ecef;
        }
        
        .email-footer p {
            margin: 0;
            color: #6c757d;
            font-size: 14px;
        }
        
        /* Responsive styles */
        @media only screen and (max-width: 600px) {
            .email-container {
                width: 100% !important;
                margin: 0 !important;
                border-radius: 0 !important;
            }
            .email-content {
                padding: 20px !important;
            }
            .email-header {
                padding: 15px !important;
            }
        }
    </style>
</head>
<body>
    <div class="email-wrapper">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
                <td>
                    <div class="email-container">
                        <div class="email-header">
                            <h1>${subject}</h1>
                        </div>
                        <div class="email-content">
                            ${content}
                        </div>
                        <div class="email-footer">
                            <p>Best regards,<br><strong>${senderName}</strong></p>
                            <p style="margin-top: 10px; font-size: 12px;">This email was sent from your CRM system.</p>
                        </div>
                    </div>
                </td>
            </tr>
        </table>
    </div>
</body>
</html>`
  }
}
