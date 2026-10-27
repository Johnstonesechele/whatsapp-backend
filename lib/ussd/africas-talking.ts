// The explicit .ts extension is required by `node --experimental-strip-types`
// (used by the tests) and is resolved identically by Next. Type-only imports
// use `import type` because strip-only mode erases them at runtime.
import type { UssdProvider, UssdInboundMessage } from './provider'
import { UssdProviderError, normalizeMsisdn, normalizeShortCode } from './provider'

/**
 * Africa's Talking USSD adapter.
 *
 * Inbound: AT POSTs form-encoded fields (isActive, sessionId, phoneNumber,
 * serviceCode, text) to the callback URL. `isActive` is 'true' while the
 * session is open and 'false' when the user times out.
 *
 * Outbound: to advance the dialogue you must call the USSD send endpoint with
 * the SAME sessionId, not reply over SMS. Getting this wrong is the classic
 * reason a USSD integration 'works' on paper and drops every response.
 *
 * API docs: https://developers.africastalking.com/docs/ussd/overview
 */

export interface AfricasTalkingConfig {
  username: string
  apiKey: string
  /** Sandbox uses a different host; default to production. */
  environment?: 'sandbox' | 'production'
  /** Default country code for MSISDN normalisation. */
  defaultCountryCode?: string
}

export class AfricasTalkingUssdProvider implements UssdProvider {
  readonly name = 'AfricasTalking'
  private token: string | null = null
  private tokenExpiry = 0
  private readonly config: AfricasTalkingConfig

  // Written as an explicit field rather than a TypeScript parameter property
  // so the file can be executed directly by `node --experimental-strip-types`
  // in tests, which does not support parameter properties.
  constructor(config: AfricasTalkingConfig) {
    this.config = config
  }

  private get baseUrl(): string {
    return this.config.environment === 'sandbox'
      ? 'https://sandbox.africastalking.com'
      : 'https://api.africastalking.com'
  }

  /**
   * Africa's Talking issues a short-lived bearer token. Cache it with a
   * safety margin so a token cannot expire mid-dialogue.
   */
  async authenticate(): Promise<void> {
    if (this.token && Date.now() < this.tokenExpiry - 60_000) return

    const res = await fetch(`${this.baseUrl}/oauth/v1/token?grant_type=client_credentials`, {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${this.config.username}:${this.config.apiKey}`).toString('base64')}` },
    })
    if (!res.ok) {
      throw new UssdProviderError(`AfricasTalking auth failed: ${res.status}`, await res.text())
    }
    const data = await res.json() as { access_token?: string; expires_in?: number }
    if (!data.access_token) throw new UssdProviderError('AfricasTalking returned no access token')
    this.token = data.access_token
    this.tokenExpiry = Date.now() + (data.expires_in ?? 3600) * 1000
  }

  canHandle(body: unknown): boolean {
    if (!body || typeof body !== 'object') return false
    const b = body as Record<string, unknown>
    // AT always sends isActive + serviceCode together.
    return 'isActive' in b && ('serviceCode' in b || 'phoneNumber' in b)
  }

  parseInbound(body: unknown, _headers?: Record<string, string | undefined>): UssdInboundMessage {
    const b = (body || {}) as Record<string, unknown>
    const cc = this.config.defaultCountryCode || '254'
    // AT reports the MSISDN as '2547XXXXXXXX' with no '+'.
    const phoneNumber = normalizeMsisdn(
      (b.phoneNumber as string) || (b.phone_number as string) || (b.msisdn as string),
      cc
    )
    // serviceCode is the code WITHOUT the leading * and trailing #, e.g. '12345'.
    const shortCode = normalizeShortCode(
      (b.shortCode as string) || `*${b.serviceCode ?? ''}#`
    )
    const text = String(b.text ?? b.response ?? '').trim()

    if (!phoneNumber) throw new UssdProviderError('Inbound USSD message has no phone number')
    if (!text) throw new UssdProviderError('Inbound USSD message has no text')

    return {
      phoneNumber,
      text,
      shortCode,
      sessionId: (b.sessionId as string) || undefined,
      serviceCode: (b.serviceCode as string) || undefined,
    }
  }

  async sendMessage(phoneNumber: string, text: string, sessionId?: string): Promise<void> {
    if (!sessionId) {
      throw new UssdProviderError(
        'AfricasTalking requires the original sessionId to continue a USSD dialogue'
      )
    }
    await this.authenticate()

    const form = new URLSearchParams({
      username: this.config.username,
      phoneNumber,
      sessionId,
      // AT rejects replies longer than 1820 characters; long survey prompts
      // must be chunked or the gateway silently truncates them.
      response: text.slice(0, 1820),
    })

    const res = await fetch(`${this.baseUrl}/ussd/ussd`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: form.toString(),
    })
    if (!res.ok) {
      throw new UssdProviderError(`AfricasTalking send failed: ${res.status}`, await res.text())
    }
  }
}
