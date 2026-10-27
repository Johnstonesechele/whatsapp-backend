export const dynamic = 'force-dynamic'
import { NextRequest, NextResponse } from 'next/server'
import { DatabaseUtils } from '@/backend/database/db-api'
import jwt from 'jsonwebtoken'
import { getJWTSecret } from "@/lib/jwt"


export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, message: 'No token provided' },
        { status: 401 }
      )
    }

    const token = authHeader.split(' ')[1]
    try {
      jwt.verify(token, getJWTSecret())
    } catch (error) {
      return NextResponse.json(
        { success: false, message: 'Invalid token' },
        { status: 401 }
      )
    }

    const menus = await DatabaseUtils.getWhatsAppMenus()
    
    return NextResponse.json({
      success: true,
      menus: menus.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    })

  } catch (error) {
    console.error('Get WhatsApp menus error:', error)
    return NextResponse.json(
      { success: false, message: 'Failed to fetch WhatsApp menus' },
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
        { success: false, message: 'No token provided' },
        { status: 401 }
      )
    }

    const token = authHeader.split(' ')[1]
    try {
      jwt.verify(token, getJWTSecret())
    } catch (error) {
      return NextResponse.json(
        { success: false, message: 'Invalid token' },
        { status: 401 }
      )
    }

    const menuData = await request.json()

    // Validate required fields
    if (!menuData.title || !menuData.options || !Array.isArray(menuData.options)) {
      return NextResponse.json(
        { success: false, message: 'Menu title and options array are required' },
        { status: 400 }
      )
    }

    // Validate menu options
    for (const option of menuData.options) {
      if (!option.number || !option.title || !option.response) {
        return NextResponse.json(
          { success: false, message: 'Each menu option must have number, title, and response' },
          { status: 400 }
        )
      }
    }

    const newMenu = await DatabaseUtils.createWhatsAppMenu(menuData)

    return NextResponse.json({
      success: true,
      menu: newMenu
    })

  } catch (error) {
    console.error('Create WhatsApp menu error:', error)
    return NextResponse.json(
      { success: false, message: 'Failed to create WhatsApp menu' },
      { status: 500 }
    )
  }
}
