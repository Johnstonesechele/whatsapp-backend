import { getSupabaseAdminClient } from '@/backend/database/supabase-config'
import { EmailService } from '@/lib/email-service'

export async function createNotification(
  userId: string,
  title: string,
  message: string,
  type: string = 'general',
  entityType?: string,
  entityId?: string,
  sendEmail: boolean = true
) {
  const supabase = getSupabaseAdminClient()
  
  // 1. Create in-app notification
  const { error: dbError } = await supabase.from('notifications').insert({
    user_id: userId,
    title,
    message,
    type,
    entity_type: entityType,
    entity_id: entityId,
    read: false,
    created_at: new Date().toISOString()
  })
  if (dbError) console.error('Failed to create notification:', dbError)

  // 2. Send email notification
  if (sendEmail) {
    try {
      const { data: user } = await supabase
        .from('users')
        .select('email, name')
        .eq('id', userId)
        .single()
      
      if (user?.email) {
        const { data: emailSettings } = await supabase
          .from('email_settings')
          .select('*')
          .eq('company_id', 'system')
          .single()
        
        if (emailSettings) {
          const emailService = new EmailService()
          await emailService.initialize({
            smtp_host: emailSettings.smtp_host,
            smtp_port: emailSettings.smtp_port,
            smtp_secure: emailSettings.smtp_secure,
            smtp_user: emailSettings.smtp_user,
            smtp_pass: emailSettings.smtp_pass,
            from_email: emailSettings.from_email,
            from_name: emailSettings.from_name
          })
          
          const emailBody = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #1e40af;">${title}</h2>
              <p>Hello ${user.name},</p>
              <p>${message}</p>
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
              <p style="color: #6b7280; font-size: 12px;">
                <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard" style="color: #1e40af;">View in app</a> | 
                <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/settings" style="color: #1e40af;">Manage notifications</a>
              </p>
            </div>
          `
          
          await emailService.sendCustomEmail(
            user.email,
            `[Union CRM] ${title}`,
            emailBody
          )
        }
      }
    } catch (emailError) {
      console.error('Failed to send notification email:', emailError)
    }
  }
}
