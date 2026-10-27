import { NextRequest, NextResponse } from 'next/server'
import { getLogs } from '@/lib/log-buffer'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const fs = require('fs')
  const candidates = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/chromium-shell']
  const browsers: Record<string, boolean> = {}
  for (const c of candidates) {
    try { browsers[c] = fs.existsSync(c) } catch { browsers[c] = false }
  }
  let puppeteerPath: string | null = null
  try {
    const puppeteer = require('puppeteer')
    puppeteerPath = puppeteer.executablePath()
    browsers[puppeteerPath] = fs.existsSync(puppeteerPath)
  } catch (e: any) {
    puppeteerPath = 'error: ' + (e && e.message ? e.message : e)
  }
  return NextResponse.json({
    ok: true,
    node: process.version,
    env: {
      NODE_ENV: process.env.NODE_ENV,
      ENABLE_WHATSAPP: process.env.ENABLE_WHATSAPP,
      WHATSAPP_SESSION_PATH: process.env.WHATSAPP_SESSION_PATH,
      JWT_SECRET_SET: !!process.env.JWT_SECRET,
      SUPABASE_URL_SET: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_KEY_SET: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
    browsers,
    puppeteerPath,
    logs: getLogs(),
  })
}
