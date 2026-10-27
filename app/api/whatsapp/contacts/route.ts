export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { getSupabaseAdminClient } from '@/backend/database/supabase-config'
import crypto from 'crypto'

import { logActivity } from '@/backend/database/db-api'
export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: 'No token provided' },
        { status: 401 }
      )
    }

    const token = authHeader.split(' ')[1]
    const jwtSecret = process.env.JWT_SECRET
    if (!jwtSecret) {
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
        { status: 500 }
      )
    }
    
    let userInfo: any
    try {
      userInfo = jwt.verify(token, jwtSecret) as any
    } catch (error) {
      return NextResponse.json(
        { success: false, error: 'Invalid token' },
        { status: 401 }
      )
    }

    const companyId = userInfo.company_id || userInfo.companyId
    if (!companyId) {
      return NextResponse.json(
        { success: false, error: 'Missing company context' },
        { status: 401 }
      )
    }

    console.log(' Fetching WhatsApp contacts and leads for company:', companyId)

    const supabase = getSupabaseAdminClient()

    // Get contacts and leads filtered by company from Supabase
    const { data: contacts } = await supabase
      .from('contacts')
      .select('*')
      .eq('company_id', companyId)

    const { data: leads } = await supabase
      .from('leads')
      .select('*')
      .eq('company_id', companyId)

    // Format for WhatsApp campaigns - include phone numbers and names
    const whatsappContacts = [
      ...(contacts || []).map(contact => ({
        id: contact.id,
        name: contact.name,
        phone: contact.phone,
        email: contact.email,
        type: 'contact',
        status: contact.status || 'active',
        tags: contact.tags || [],
        lastContactDate: contact.last_contact,
        notes: contact.notes
      })).filter(contact => contact.phone),

      ...(leads || []).map(lead => ({
        id: lead.id,
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        type: 'lead',
        status: lead.status,
        source: lead.source,
        score: lead.score || 0,
        assignedTo: lead.assigned_to,
        tags: [],
        notes: lead.notes,
        createdAt: lead.created_at
      })).filter(lead => lead.phone)
    ]

    console.log(` Found ${whatsappContacts.length} WhatsApp-enabled contacts/leads`)

    return NextResponse.json({
      success: true,
      contacts: whatsappContacts,
      stats: {
        totalContacts: (contacts || []).filter(c => c.phone).length,
        totalLeads: (leads || []).filter(l => l.phone).length,
        totalWhatsAppEnabled: whatsappContacts.length
      }
    })

  } catch (error) {
    console.error(' Error fetching WhatsApp contacts:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch contacts' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: 'No token provided' },
        { status: 401 }
      )
    }

    const token = authHeader.split(' ')[1]
    const jwtSecret = process.env.JWT_SECRET
    if (!jwtSecret) {
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
        { status: 500 }
      )
    }
    
    let userInfo: any
    try {
      userInfo = jwt.verify(token, jwtSecret) as any
    } catch (error) {
      return NextResponse.json(
        { success: false, error: 'Invalid token' },
        { status: 401 }
      )
    }

    const companyId = userInfo.company_id || userInfo.companyId

    const body = await request.json()
    const { action, contactIds, leadIds } = body

    console.log(` WhatsApp contacts action: ${action}`)

    if (action === 'sync') {
      // Sync WhatsApp activity with contacts and leads
      try {
        // Log general activity for the sync operation
        const supabase = getSupabaseAdminClient()
        logActivity({
      user_id: userInfo.userId,
      action: 'whatsapp_sync',
      entity_type: 'whatsapp',
      company_id: companyId,
      details: ((d) => (d && typeof d === 'object' && !Array.isArray(d) ? { ...d, ...{ "created_at": new Date().toISOString() } } : { message: d, ...{ "created_at": new Date().toISOString() } }))(`Synchronized WhatsApp activity for ${(contactIds?.length || 0) + (leadIds?.length || 0)} contacts/leads`)
    })

        return NextResponse.json({
          success: true,
          message: 'WhatsApp activity synchronized',
          synced: {
            contacts: contactIds?.length || 0,
            leads: leadIds?.length || 0
          }
        })

      } catch (error) {
        console.error('Error syncing WhatsApp activity:', error)
        return NextResponse.json(
          { success: false, error: 'Failed to sync activity' },
          { status: 500 }
        )
      }
    }

    return NextResponse.json(
      { success: false, error: 'Invalid action' },
      { status: 400 }
    )

  } catch (error) {
    console.error(' Error in WhatsApp contacts POST:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
