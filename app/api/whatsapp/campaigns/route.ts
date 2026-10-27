export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdminClient } from "@/backend/database/supabase-config"
import jwt from 'jsonwebtoken'
import { getJWTSecret } from "@/lib/jwt"

// Dynamic import to avoid bundling issues
const getWhatsAppService = async () => {
  try {
    const { WhatsAppService } = await import('../../../../backend/services/whatsapp-service')
    return WhatsAppService
  } catch (error) {
    console.error('Failed to import WhatsApp service:', error)
    throw new Error('WhatsApp service not available')
  }
}

// Create and send a WhatsApp campaign
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdminClient()
    
    // Check authentication
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: 'No token provided' },
        { status: 401 }
      )
    }

    const token = authHeader.split(' ')[1]
    const jwtSecret = getJWTSecret()
    
    let userInfo: any
    try {
      userInfo = jwt.verify(token, jwtSecret) as any
    } catch (error) {
      return NextResponse.json(
        { success: false, error: 'Invalid token' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const {
      name,
      message,
      sourceType,
      filters,
      recipients,
      scheduledAt,
      mediaUrl
    } = body

    // The whatsapp_campaigns.source_type CHECK allows only
    // 'leads' | 'contacts' | 'deals' | 'manual' (30_whatsapp_tables.sql), but
    // the campaign UI's source dropdown also offers services_contacts,
    // services_leads and services_deals. Selecting any of those and creating a
    // campaign failed with a 500:
    //   violates check constraint "whatsapp_campaigns_source_type_check"
    // The serviceId is already carried in source_filters, so the "services_"
    // prefix is a UI-only distinction — collapse it to the base type the CHECK
    // accepts. Nothing is lost.
    const normalizedSourceType = String(sourceType || 'manual').replace(/^services_/, '')

    // Validate required fields
    if (!name || !message) {
      return NextResponse.json(
        { success: false, error: 'Campaign name and message are required' },
        { status: 400 }
      )
    }

    if (!recipients || recipients.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one recipient is required' },
        { status: 400 }
      )
    }

    // Create campaign record
    const { data: campaign, error: campaignError } = await supabase
      .from('whatsapp_campaigns')
      .insert({
        company_id: userInfo.company_id,
        name,
        message_template: message,
        source_type: normalizedSourceType,
        source_filters: filters || {},
        recipient_count: recipients.length,
        status: scheduledAt ? 'scheduled' : 'sending',
        scheduled_at: scheduledAt || null,
        started_at: scheduledAt ? null : new Date().toISOString(),
        created_by: userInfo.userId
      })
      .select()
      .single()

    if (campaignError) {
      console.error('Error creating campaign:', campaignError)
      // Surface the real cause. A bare "Failed to create campaign" left
      // neither the user nor a developer any way to tell a constraint
      // violation (e.g. a status outside the CHECK) from a missing column or
      // a bad FK. The message and code are not secrets.
      return NextResponse.json(
        { success: false, error: 'Failed to create campaign', details: campaignError.message || String(campaignError) },
        { status: 500 }
      )
    }

    // Insert campaign recipients
    const recipientRecords = recipients.map((r: any) => ({
      campaign_id: campaign.id,
      phone_number: r.phone,
      contact_name: r.name,
      source_id: r.sourceId,
      source_type: r.sourceType,
      status: 'pending'
    }))

    const { error: recipientsError } = await supabase
      .from('whatsapp_campaign_recipients')
      .insert(recipientRecords)

    if (recipientsError) {
      console.error('Error inserting campaign recipients:', recipientsError)
      // Rollback campaign
      await supabase
        .from('whatsapp_campaigns')
        .delete()
        .eq('id', campaign.id)
      
      return NextResponse.json(
        { success: false, error: 'Failed to create campaign recipients' },
        { status: 500 }
      )
    }

    // If not scheduled, send immediately
    if (!scheduledAt) {
      // Send messages in background (don't block response)
      sendCampaignMessages(campaign.id, recipients, message, mediaUrl, userInfo.company_id)
        .catch(err => console.error('Error sending campaign messages:', err))
    }

    return NextResponse.json({
      success: true,
      campaign: {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        recipientCount: campaign.recipient_count,
        scheduledAt: campaign.scheduled_at
      }
    })

  } catch (error) {
    console.error(' Error creating campaign:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to create campaign' },
      { status: 500 }
    )
  }
}

// Get campaigns list
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseAdminClient()
    
    // Check authentication
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: 'No token provided' },
        { status: 401 }
      )
    }

    const token = authHeader.split(' ')[1]
    const jwtSecret = getJWTSecret()
    
    let userInfo: any
    try {
      userInfo = jwt.verify(token, jwtSecret) as any
    } catch (error) {
      return NextResponse.json(
        { success: false, error: 'Invalid token' },
        { status: 401 }
      )
    }

    const { data: campaigns, error: campaignsError } = await supabase
      .from('whatsapp_campaigns')
      .select('*')
      .eq('company_id', userInfo.company_id)
      .order('created_at', { ascending: false })

    if (campaignsError) {
      console.error('Error fetching campaigns:', campaignsError)
      return NextResponse.json(
        { success: false, error: 'Failed to fetch campaigns' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      campaigns
    })

  } catch (error) {
    console.error(' Error fetching campaigns:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch campaigns' },
      { status: 500 }
    )
  }
}

// Helper function to send campaign messages
async function sendCampaignMessages(
  campaignId: string,
  recipients: any[],
  message: string,
  mediaUrl: string | undefined,
  companyId: string
) {
  const supabase = getSupabaseAdminClient()
  let sentCount = 0
  let deliveredCount = 0
  let failedCount = 0

  try {
    // Get WhatsApp service and session for this company
    const WhatsAppService = await getWhatsAppService()
    
    // Look up the active session for this company
    const { data: sessionData, error: sessionError } = await supabase
      .from('whatsapp_settings')
      .select('session_id, phone_number, connection_status')
      .eq('company_id', companyId)
      .eq('connection_status', 'ready')
      .single()

    if (sessionError || !sessionData || !sessionData.session_id) {
      console.error(' No active WhatsApp session found for company:', companyId)
      
      // Update campaign as failed
      await supabase
        .from('whatsapp_campaigns')
        .update({
          status: 'failed',
          failed_count: recipients.length,
          completed_at: new Date().toISOString()
        })
        .eq('id', campaignId)
      
      return
    }

    const sessionId = sessionData.session_id
    console.log(` Sending campaign ${campaignId} via session ${sessionId}`)

    for (const recipient of recipients) {
      try {
        // Send message via WhatsApp Service with proper session
        const result = await WhatsAppService.sendMessage(sessionId, recipient.phone, message)
        
        if (result.success) {
          // Update recipient status
          await supabase
            .from('whatsapp_campaign_recipients')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString()
            })
            .eq('campaign_id', campaignId)
            .eq('phone_number', recipient.phone)

          sentCount++
          console.log(` Message sent to ${recipient.phone}`)
        } else {
          throw new Error(result.error || 'Failed to send message')
        }
        
        // Wait a bit to avoid rate limiting (adjust based on WhatsApp API limits)
        await new Promise(resolve => setTimeout(resolve, 1000))
        
      } catch (error: any) {
        console.error(` Failed to send to ${recipient.phone}:`, error)
        
        // Update recipient status with error
        await supabase
          .from('whatsapp_campaign_recipients')
          .update({
            status: 'failed',
            error_message: error.message || 'Unknown error'
          })
          .eq('campaign_id', campaignId)
          .eq('phone_number', recipient.phone)

        failedCount++
      }
    }
  } catch (error: any) {
    console.error(' Campaign sending error:', error)
    failedCount = recipients.length - sentCount
  }

  // Update campaign completion status
  await supabase
    .from('whatsapp_campaigns')
    .update({
      status: failedCount === recipients.length ? 'failed' : 'completed',
      sent_count: sentCount,
      failed_count: failedCount,
      completed_at: new Date().toISOString()
    })
    .eq('id', campaignId)
    
  console.log(` Campaign ${campaignId} completed: ${sentCount} sent, ${failedCount} failed`)
}

