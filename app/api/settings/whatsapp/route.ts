import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '@/backend/database/supabase-config'
import jwt from 'jsonwebtoken'

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: "Authorization required" }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    const jwtSecret = process.env.JWT_SECRET
    if (!jwtSecret) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
    }

    let decoded: any
    try {
      decoded = jwt.verify(token, jwtSecret)
    } catch (error) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    const supabase = getSupabaseAdminClient()
    
    // Get WhatsApp settings from Supabase
    const { data: settings, error } = await supabase
      .from('whatsapp_settings')
      .select('*')
      .eq('company_id', decoded.company_id)
      .single()

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
      console.error('Error fetching WhatsApp settings:', error)
      return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
    }

    // Return default settings if none exist
    if (!settings) {
      return NextResponse.json({
        settings: {
          provider: 'whatsapp_web',
          enableWhatsApp: false,
          useWhatsAppWeb: true,
          connectionStatus: 'disconnected'
        }
      })
    }
    
    // Don't send sensitive data in the response
    const safeSettings = {
      id: settings.id,
      provider: settings.provider,
      accountSid: settings.account_sid || '',
      authToken: settings.auth_token ? '****' : '',
      fromNumber: settings.from_number || '',
      phoneNumber: settings.phone_number || '',
      businessName: settings.business_name || '',
      businessDescription: settings.business_description || '',
      enableWhatsApp: settings.enable_whatsapp || false,
      useWhatsAppWeb: settings.use_whatsapp_web || false,
      sessionId: settings.session_id || '',
      qrCode: settings.qr_code || '',
      connectionStatus: settings.connection_status || 'disconnected',
      lastConnected: settings.last_connected,
      webhookUrl: settings.webhook_url || '',
      autoReplyEnabled: settings.auto_reply_enabled || false,
      autoReplyMessage: settings.auto_reply_message || '',
      commandNumber: settings.command_number || ''
    }

    return NextResponse.json({ settings: safeSettings })

  } catch (error) {
    console.error('Get WhatsApp settings error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch WhatsApp settings' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: "Authorization required" }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    const jwtSecret = process.env.JWT_SECRET
    if (!jwtSecret) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 })
    }

    let decoded: any
    try {
      decoded = jwt.verify(token, jwtSecret)
    } catch (error) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    const whatsappSettings = await request.json()
    const supabase = getSupabaseAdminClient()

    // Validate required fields
    if (whatsappSettings.enableWhatsApp && !whatsappSettings.useWhatsAppWeb && !whatsappSettings.accountSid) {
      return NextResponse.json(
        { error: 'Account SID is required when WhatsApp API is enabled' },
        { status: 400 }
      )
    }

    // Check if settings exist
    const { data: existingSettings } = await supabase
      .from('whatsapp_settings')
      .select('id, auth_token')
      .eq('company_id', decoded.company_id)
      .single()

    // Handle masked sensitive fields
    let authToken = whatsappSettings.authToken
    if (authToken === '****' && existingSettings?.auth_token) {
      authToken = existingSettings.auth_token
    }

    const settingsData = {
      company_id: decoded.company_id,
      user_id: decoded.userId,
      provider: whatsappSettings.provider || 'whatsapp_web',
      account_sid: whatsappSettings.accountSid || null,
      auth_token: authToken || null,
      from_number: whatsappSettings.fromNumber || null,
      phone_number: whatsappSettings.phoneNumber || null,
      business_name: whatsappSettings.businessName || null,
      business_description: whatsappSettings.businessDescription || null,
      enable_whatsapp: whatsappSettings.enableWhatsApp || false,
      use_whatsapp_web: whatsappSettings.useWhatsAppWeb !== undefined ? whatsappSettings.useWhatsAppWeb : true,
      session_id: whatsappSettings.sessionId || null,
      connection_status: whatsappSettings.connectionStatus || 'disconnected',
      webhook_url: whatsappSettings.webhookUrl || null,
      auto_reply_enabled: whatsappSettings.autoReplyEnabled || false,
      auto_reply_message: whatsappSettings.autoReplyMessage || null,
      command_number: whatsappSettings.commandNumber || null,
      updated_at: new Date().toISOString()
    }

    if (existingSettings) {
      // Update existing settings
      const { error } = await supabase
        .from('whatsapp_settings')
        .update(settingsData)
        .eq('company_id', decoded.company_id)

      if (error) {
        console.error('Error updating WhatsApp settings:', error)
        return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
      }
    } else {
      // Create new settings
      const { error } = await supabase
        .from('whatsapp_settings')
        .insert(settingsData)

      if (error) {
        console.error('Error creating WhatsApp settings:', error)
        return NextResponse.json({ error: 'Failed to create settings' }, { status: 500 })
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: 'WhatsApp settings saved successfully' 
    })

  } catch (error) {
    console.error('Save WhatsApp settings error:', error)
    return NextResponse.json(
      { error: 'Failed to save WhatsApp settings' },
      { status: 500 }
    )
  }
}
