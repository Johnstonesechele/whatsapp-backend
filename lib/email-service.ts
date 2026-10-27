import nodemailer from 'nodemailer'

interface EmailConfig {
  smtp_host: string
  smtp_port: number
  smtp_secure: boolean
  smtp_user: string
  smtp_pass: string
  from_email: string
  from_name: string
}

interface LeadAssignmentData {
  assignedUser: {
    name: string
    email: string
  }
  assignedBy: {
    name: string
    email: string
  }
  leads: Array<{
    id: string
    name: string
    email: string
    company: string
    value: number
    stage: string
  }>
  companyName: string
}

interface InvitationData {
  invitedUser: {
    name: string
    email: string
    role: string
  }
  invitedBy: {
    name: string
    email: string
  }
  companyName: string
  invitationToken: string
  invitationUrl: string
}

export class EmailService {
  private transporter: nodemailer.Transporter | null = null
  private config: EmailConfig | null = null

  async initialize(config: EmailConfig) {
    this.config = config
    this.transporter = nodemailer.createTransport({
      host: config.smtp_host,
      port: config.smtp_port,
      secure: config.smtp_secure,
      auth: {
        user: config.smtp_user,
        pass: config.smtp_pass,
      },
    })
  }

  async sendLeadAssignmentNotification(data: LeadAssignmentData): Promise<boolean> {
    if (!this.transporter || !this.config) {
      console.error('Email service not initialized')
      return false
    }

    try {
      const subject = `New Lead${data.leads.length > 1 ? 's' : ''} Assigned to You`
      
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Lead Assignment Notification</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #1e40af; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
            .lead-card { background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 15px 0; }
            .lead-header { font-size: 18px; font-weight: bold; color: #1e40af; margin-bottom: 10px; }
            .lead-detail { margin: 8px 0; }
            .lead-detail strong { color: #374151; }
            .value { color: #059669; font-weight: bold; }
            .stage { background: #dbeafe; color: #1e40af; padding: 4px 8px; border-radius: 4px; font-size: 12px; }
            .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #6b7280; }
            .btn { background: #1e40af; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 10px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Lead Assignment Notification</h1>
              <p>You have been assigned new lead${data.leads.length > 1 ? 's' : ''}</p>
            </div>
            <div class="content">
              <p>Hello <strong>${data.assignedUser.name}</strong>,</p>
              <p>${data.assignedBy.name} has assigned ${data.leads.length} lead${data.leads.length > 1 ? 's' : ''} to you in ${data.companyName}.</p>
              
              ${data.leads.map(lead => `
                <div class="lead-card">
                  <div class="lead-header">${lead.name}</div>
                  <div class="lead-detail"><strong>Company:</strong> ${lead.company || 'Not specified'}</div>
                  <div class="lead-detail"><strong>Email:</strong> ${lead.email || 'Not provided'}</div>
                  <div class="lead-detail"><strong>Value:</strong> <span class="value">$${lead.value.toLocaleString()}</span></div>
                  <div class="lead-detail"><strong>Stage:</strong> <span class="stage">${lead.stage}</span></div>
                </div>
              `).join('')}

              <p>Please log in to your Union account to view and manage these leads.</p>
              <div style="text-align: center;">
                <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/leads" class="btn">View Leads</a>
              </div>
            </div>
            <div class="footer">
              <p>This is an automated message from ${data.companyName} Union System</p>
              <p>If you have any questions, please contact ${data.assignedBy.name} at ${data.assignedBy.email}</p>
            </div>
          </div>
        </body>
        </html>
      `

      const textContent = `
        Lead Assignment Notification
        
        Hello ${data.assignedUser.name},
        
        ${data.assignedBy.name} has assigned ${data.leads.length} lead${data.leads.length > 1 ? 's' : ''} to you in ${data.companyName}.
        
        Lead Details:
        ${data.leads.map(lead => `
        - ${lead.name}
          Company: ${lead.company || 'Not specified'}
          Email: ${lead.email || 'Not provided'}
          Value: $${lead.value.toLocaleString()}
          Stage: ${lead.stage}
        `).join('\n')}
        
        Please log in to your Union account to view and manage these leads.
        
        Login at: ${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/leads
        
        If you have any questions, please contact ${data.assignedBy.name} at ${data.assignedBy.email}
        
        This is an automated message from ${data.companyName} Union System
      `

      await this.transporter.sendMail({
        from: `"${this.config.from_name}" <${this.config.from_email}>`,
        to: data.assignedUser.email,
        subject: subject,
        text: textContent,
        html: htmlContent,
      })

      return true
    } catch (error) {
      console.error('Failed to send lead assignment email:', error)
      return false
    }
  }

  async sendUserInvitation(data: InvitationData): Promise<boolean> {
    if (!this.transporter || !this.config) {
      console.error('Email service not initialized')
      return false
    }

    try {
      const subject = `Invitation to join ${data.companyName} Union`
      
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Union Invitation</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #1e40af; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; }
            .btn { background: #1e40af; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 20px 0; }
            .role-badge { background: #dbeafe; color: #1e40af; padding: 4px 12px; border-radius: 20px; font-size: 14px; }
            .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0; color: #6b7280; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>You're Invited!</h1>
              <p>Join ${data.companyName} Team</p>
            </div>
            <div class="content">
              <p>Hello <strong>${data.invitedUser.name}</strong>,</p>
              <p>${data.invitedBy.name} has invited you to join <strong>${data.companyName}</strong> as a <span class="role-badge">${data.invitedUser.role}</span>.</p>
              
              <p>You'll have access to Union where you can:</p>
              <ul>
                <li>Manage contacts and leads</li>
                <li>Create and track campaigns</li>
                <li>View analytics and reports</li>
                <li>Collaborate with your team</li>
              </ul>

              <div style="text-align: center;">
                <a href="${data.invitationUrl}" class="btn">Accept Invitation</a>
              </div>

              <p><strong>Note:</strong> This invitation will expire in 7 days. If you don't accept it within this time, please contact ${data.invitedBy.name} for a new invitation.</p>
            </div>
            <div class="footer">
              <p>This invitation was sent by ${data.invitedBy.name} (${data.invitedBy.email})</p>
              <p>If you believe this was sent in error, please ignore this email.</p>
            </div>
          </div>
        </body>
        </html>
      `

      const textContent = `
        Invitation to join ${data.companyName} Union
        
        Hello ${data.invitedUser.name},
        
        ${data.invitedBy.name} has invited you to join ${data.companyName} as a ${data.invitedUser.role}.
        
        You'll have access to Union where you can:
        - Manage contacts and leads
        - Create and track campaigns
        - View analytics and reports
        - Collaborate with your team
        
        Accept your invitation at: ${data.invitationUrl}
        
        Note: This invitation will expire in 7 days. If you don't accept it within this time, please contact ${data.invitedBy.name} for a new invitation.
        
        This invitation was sent by ${data.invitedBy.name} (${data.invitedBy.email})
        If you believe this was sent in error, please ignore this email.
      `

      await this.transporter.sendMail({
        from: `"${this.config.from_name}" <${this.config.from_email}>`,
        to: data.invitedUser.email,
        subject: subject,
        text: textContent,
        html: htmlContent,
      })

      return true
    } catch (error) {
      console.error('Failed to send invitation email:', error)
      return false
    }
  }

  /**
   * Send a custom email with provided HTML content
   * @param to Recipient email address
   * @param subject Email subject
   * @param html HTML content of the email
   * @returns Promise<boolean> Success status
   */
  async sendCustomEmail(to: string, subject: string, html: string): Promise<boolean> {
    if (!this.transporter || !this.config) {
      console.error('Email service not initialized')
      return false
    }

    try {
      await this.transporter.sendMail({
        from: `"${this.config.from_name}" <${this.config.from_email}>`,
        to: to,
        subject: subject,
        html: html,
      })

      return true
    } catch (error) {
      console.error('Failed to send custom email:', error)
      return false
    }
  }
}

export const emailService = new EmailService()
