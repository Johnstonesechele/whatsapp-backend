import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '@/backend/database/supabase-config'
import jwt from 'jsonwebtoken'
import { getJWTSecret } from '@/lib/jwt'

// GET - List all WhatsApp menus for the company
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    let decoded: any
    try {
      decoded = jwt.verify(token, getJWTSecret())
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const supabase = getSupabaseAdminClient()
    
    // Get user's company
    const { data: user } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', decoded.userId || decoded.id)
      .single()

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Get menus
    const { data: menus, error } = await supabase
      .from('whatsapp_menus')
      .select('*')
      .eq('company_id', user.company_id)
      .order('order_index', { ascending: true })

    if (error) {
      // Table may not exist yet, return empty array
      return NextResponse.json({ success: true, menus: [] })
    }

    return NextResponse.json({ success: true, menus: menus || [] })
  } catch (error) {
    console.error('Error fetching WhatsApp menus:', error)
    return NextResponse.json({ success: true, menus: [] })
  }
}

// POST - Create a new WhatsApp menu
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    let decoded: any
    try {
      decoded = jwt.verify(token, getJWTSecret())
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    const supabase = getSupabaseAdminClient()
    
    // Get user's company
    const { data: user } = await supabase
      .from('users')
      .select('company_id')
      .eq('id', decoded.userId || decoded.id)
      .single()

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const body = await request.json()
    // Accept both spellings: the WhatsAppMenuManager UI sends welcomeMessage
    // (camelCase) while the column is welcome_message (snake_case). Only the
    // snake_case name was read, so the UI's value was dropped and the insert
    // violated welcome_message's NOT NULL constraint — every menu creation
    // returned 500 "Failed to create menu".
    const { name, title, description, options, parent_menu_id } = body
    const welcomeMessage =
      (body as any).welcome_message ?? (body as any).welcomeMessage ?? ''

    if (!name || !title) {
      return NextResponse.json({ error: 'Name and title are required' }, { status: 400 })
    }

    // Create menu
    const { data: menu, error } = await supabase
      .from('whatsapp_menus')
      .insert({
        company_id: user.company_id,
        name,
        title,
        description: description || '',
        welcome_message: welcomeMessage,
        options: options || [],
        parent_menu_id: parent_menu_id || null,
        active: true,
        order_index: 0,
        created_by: decoded.userId || decoded.id
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating WhatsApp menu:', error)
      return NextResponse.json({ success: false, error: 'Failed to create menu' }, { status: 500 })
    }

    return NextResponse.json({ success: true, menu })
  } catch (error) {
    console.error('Error creating WhatsApp menu:', error)
    return NextResponse.json({ success: false, error: 'Failed to create menu' }, { status: 500 })
  }
}
