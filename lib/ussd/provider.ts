/**
 * USSD provider abstraction.
 *
 * A USSD gateway (Africa's Talking, Arkesel, Hubtel, ...) differs only in how
 * it sends an inbound message and how it accepts an outbound reply. The
 * dialogue itself lives in lib/survey-system.ts and is provider-agnostic, so
 * every adapter implements just these three things:
 *
 *   authenticate()  - obtain whatever token/header the gateway expects
 *   sendMessage()   - push one USSD reply back to the handset
 *   parseInbound()  - turn the provider's webhook body into a normal message
 *
 * The inbound webhook is UNSIGNED by the gateway - it is authenticated by
 * network configuration and the provider's IP allowlist - so parseInbound()
 * must not trust any company identifier in the payload. The tenant is resolved
 * from the short code we dialled out on, which we control.
 */

export interface UssdInboundMessage {
  /** The handset's MSISDN, in international format where possible. */
  phoneNumber: string
  /** Raw text the user typed. */
  text: string
  /** The USSD short code the user dialled, e.g. '*123#'. */
  shortCode: string
  /** Provider session id, used to correlate the reply. */
  sessionId?: string
  /** Service code, for gateways that separate it from the short code. */
  serviceCode?: string
}

export interface UssdProvider {
  readonly name: string
  authenticate(): Promise<void>
  sendMessage(phoneNumber: string, text: string, sessionId?: string): Promise<void>
  parseInbound(body: unknown, headers?: Record<string, string | undefined>): UssdInboundMessage
  /** True when this provider matches the webhook payload. */
  canHandle(body: unknown): boolean
}

export class UssdProviderError extends Error {
  // Explicit field, not a parameter property: `node --experimental-strip-types`
  // cannot execute parameter properties.
  readonly cause?: unknown

  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'UssdProviderError'
    this.cause = cause
  }
}

/**
 * Normalise a dialled number to E.164-ish form.
 *
 * Gateways report the MSISDN inconsistently: '254712345678',
 * '+254712345678', '0712345678' or '254 712 345 678'. Session state is keyed
 * by this value, so an unstable normalisation would strand a user mid-survey
 * with a fresh session on their next message.
 */
export function normalizeMsisdn(raw: string | null | undefined, defaultCountryCode = '254'): string {
  if (!raw) return ''
  let digits = String(raw).replace(/\D/g, '')
  if (!digits) return ''

  // International prefix.
  if (digits.startsWith('00')) digits = digits.slice(2)

  const cc = defaultCountryCode
  const nationalLength = 9 // e.g. 712345678

  // Already in international form.
  if (digits.startsWith(cc) && digits.length === cc.length + nationalLength) {
    return digits
  }
  // International with a trunk zero, e.g. 0254712345678 or 0712345678.
  if (digits.startsWith('0' + cc) && digits.length === 1 + cc.length + nationalLength) {
    return cc + digits.slice(1 + cc.length)
  }
  // National trunk form, e.g. 0712345678 -> 254712345678.
  if (digits.length === 1 + nationalLength && digits.startsWith('0')) {
    return cc + digits.slice(1)
  }
  // Bare national form, e.g. 712345678.
  if (digits.length === nationalLength && !digits.startsWith('0')) {
    return cc + digits
  }
  // Unknown shape: return the digits unchanged rather than guessing and
  // corrupting the number.
  return digits
}

/** Strip the dial prefix/suffix so '*123#' and '123' map to the same code. */
export function normalizeShortCode(raw: string | null | undefined): string {
  if (!raw) return ''
  // Remove the dial markers explicitly. A permissive character class would
  // keep '*' and '#' (they are legal in a short code) and the trailing '#'
  // would never be stripped, so '*12345#' and '12345' would not match.
  return String(raw)
    .trim()
    .replace(/^[*#]+/, '')
    .replace(/[*#]+$/, '')
    .trim()
}
