/**
 * PayPal Connect ("Log in with PayPal") -> payer identity.
 *
 * Why this file exists
 *
 * Linking a PayPal account to a company is a two-step handshake, and the app
 * had only the first step implemented:
 *
 *   1. The customer is sent to PayPal's connect flow and approves the scopes.
 *   2. PayPal redirects back with a single-use `code` in the query string.
 *
 * Step 2 was never handled. The Add Payment Method modal redirected the browser
 * straight to PayPal and then did nothing with the return: there was no handler
 * for ?payment=success, so the authorisation code was discarded and no payment
 * method was ever written. The list stayed empty no matter how many times a
 * customer connected.
 *
 * A `code` is not a payment method on its own. It must be exchanged for an
 * access token, and the token then calls the Identity API, which returns the
 * `payer_id` that can actually be charged later. That is what this module does.
 *
 * Scopes must include the payer id, or userinfo comes back without it and the
 * customer's PayPal account cannot be charged at all - the connect succeeds,
 * the account is saved, and every later payment fails.
 */

const clientId = process.env.PAYPAL_CLIENT_ID || ''
const clientSecret = process.env.PAYPAL_CLIENT_SECRET || ''
const mode = process.env.PAYPAL_MODE || 'sandbox'

/**
 * PayPal's API host. Sandbox and live are separate hosts, and pointing the
 * wrong one at a live credential produces an auth failure that reads like a
 * wrong secret.
 */
export function getPayPalApiBase(): string {
  return mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'
}

export function isPayPalConfigured(): boolean {
  return Boolean(clientId && clientSecret)
}

export interface PayPalIdentity {
  /** The payer id used to charge this account later. */
  payerId: string
  /** PayPal-verified email, if the email scope was granted. */
  email?: string
  /** Given name, when available. Used only for display. */
  givenName?: string
  surname?: string
}

function basicAuth(): string {
  return Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
}

/**
 * Exchange the authorisation code PayPal put on the return URL for an access
 * token.
 *
 * The code is single-use and short-lived: replaying it fails, and a stale one
 * fails too. Both surface here as a rejected promise so the caller can tell the
 * customer to try connecting again rather than saving a dead method.
 */
async function exchangeCodeForToken(code: string): Promise<{ accessToken: string; refreshToken?: string }> {
  if (!isPayPalConfigured()) {
    throw new Error('PayPal is not configured: set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET')
  }

  const res = await fetch(`${getPayPalApiBase()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
    }).toString(),
    // No cache: a token response must never be served from one.
    cache: 'no-store',
  })

  const text = await res.text()
  let body: any
  try {
    body = JSON.parse(text)
  } catch {
    body = {}
  }

  if (!res.ok || !body.access_token) {
    const reason = body.error_description || body.error || `token exchange failed with ${res.status}`
    throw new Error(`PayPal authorisation failed: ${reason}`)
  }

  return { accessToken: body.access_token, refreshToken: body.refresh_token }
}

/**
 * Read the payer identity behind an access token.
 *
 * `payer_id` only comes back when the account granted the payer-id scope, so a
 * missing one is a scope problem rather than a transient error - the caller
 * should not retry it, it needs the connect flow run again with the right scope.
 */
async function fetchIdentity(accessToken: string): Promise<PayPalIdentity> {
  const res = await fetch(`${getPayPalApiBase()}/v1/identity/openidconnect/userinfo/?schema=openid`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })

  const text = await res.text()
  let body: any
  try {
    body = JSON.parse(text)
  } catch {
    body = {}
  }

  if (!res.ok) {
    const reason = body.error_description || body.error || `identity lookup failed with ${res.status}`
    throw new Error(`PayPal identity lookup failed: ${reason}`)
  }

  const payerId = body.payer_id || body.user_id
  if (!payerId) {
    // Deliberately explicit: saving a method with no payer id produces a row
    // that looks valid and can never be charged.
    throw new Error(
      'PayPal did not return a payer_id. The account must grant the payer-id ' +
        'scope for it to be usable as a payment method.',
    )
  }

  return {
    payerId,
    email: body.email,
    givenName: body.given_name,
    surname: body.family_name,
  }
}

/**
 * Full handshake: authorisation code in, chargeable payer identity out.
 */
export async function exchangeCodeForIdentity(code: string): Promise<PayPalIdentity> {
  const { accessToken } = await exchangeCodeForToken(code)
  return fetchIdentity(accessToken)
}

/**
 * The scopes the connect flow must request.
 *
 * `openid email` identifies the account; the payer-id scope is what makes it
 * payable. Without it userinfo omits payer_id and the saved method is inert.
 */
export const PAYPAL_CONNECT_SCOPES = 'openid email https://uri.paypal.com/services/paypalattributes'
