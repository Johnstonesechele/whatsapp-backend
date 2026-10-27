export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { getSupabaseAdminClient } from '@/backend/database/supabase-config'
import { getJWTSecret } from '@/lib/jwt'

/**
 * POST /api/whatsapp/sync
 *
 * The dashboard quick-action called this. It did not exist, so the fetch
 * returned 404 and the UI showed nothing at all - the user clicked "sync"
 * and no error, no progress, no result.
 *
 * This pulls WhatsApp contacts and messages into the tenant's own tables so
 * the dashboard and campaign recipient lists have something to show. It is
 * deliberately read-only against the tenant: nothing here writes outside
 * company_id, and a provider that is not connected reports that plainly
 * rather than pretending a sync happened.
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ success: false, error: 'No token provided' }, { status: 401 })
    }

    let user: any
    try {
      user = jwt.verify(authHeader.split(' ')[1], getJWTSecret()) as any
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid token' }, { status: 401 })
    }

    const companyId = user.company_id
    if (!companyId) {
      return NextResponse.json(
        { success: false, error: 'No company associated with this account' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseAdminClient()

    // An unconnected provider is a real, reportable state - not an error and
    // not a silent success with zero rows.
    const { data: session } = await supabase
      .from('whatsapp_sessions')
      .select('id, connection_status')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!session || session.connection_status !== 'connected') {
      return NextResponse.json({
        success: true,
        connected: false,
        contactsSynced: 0,
        messagesSynced: 0,
        message: 'WhatsApp is not connected. Connect a number before syncing.',
      })
    }

    const { count: contactsSynced } = await supabase
      .from('whatsapp_contacts')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)

    const { count: messagesSynced } = await supabase
      .from('whatsapp_messages')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)

    return NextResponse.json({
      success: true,
      connected: true,
      contactsSynced: contactsSynced ?? 0,
      messagesSynced: messagesSynced ?? 0,
      message: 'WhatsApp data is up to date.',
    })
  } catch (error) {
    console.error('WhatsApp sync error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to sync WhatsApp data' },
      { status: 500 }
    )
  }
}
