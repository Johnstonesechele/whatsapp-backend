/**
 * WhatsApp backend base URL.
 *
 * The WhatsApp backend (whatsapp-web.js) runs on Render because it needs
 * long-lived processes + a persistent disk for sessions. The frontend on Vercel
 * calls it through this base URL. In local dev the var is empty and we fall
 * back to same-origin so nothing changes.
 */
export const WA_BASE = (process.env.NEXT_PUBLIC_WHATSAPP_API_URL || '').replace(/\/$/, '')

export function waUrl(path: string): string {
  const p = path.startsWith('/') ? path : '/' + path
  return WA_BASE ? `${WA_BASE}${p}` : p
}
