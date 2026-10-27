import { Client, Environment, OrdersController, CheckoutPaymentIntent } from '@paypal/paypal-server-sdk'

const clientId = process.env.PAYPAL_CLIENT_ID || ''
const clientSecret = process.env.PAYPAL_CLIENT_SECRET || ''
const mode = process.env.PAYPAL_MODE || 'sandbox'

let paypalClient: InstanceType<typeof Client> | null = null
let ordersController: InstanceType<typeof OrdersController> | null = null

function getClient() {
  if (!paypalClient) {
    // Fail here, at the point of use, naming the variables that are missing.
    //
    // The client was previously built with empty strings when these were
    // absent, and PayPal answered invalid_client. The SDK turned that into an
    // error whose `message` is an EMPTY STRING, so the route's catch fell
    // through to a generic "Failed to create checkout session" and the real
    // cause was never visible. That is how two missing environment variables
    // went unnoticed for the entire life of the feature.
    if (!clientId || !clientSecret) {
      throw new Error(
        'PayPal is not configured: set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET ' +
          'in the deployed environment. Currently: ' +
          `PAYPAL_CLIENT_ID=${clientId ? 'set' : 'missing'}, ` +
          `PAYPAL_CLIENT_SECRET=${clientSecret ? 'set' : 'missing'}.`
      )
    }

    paypalClient = new Client({
      environment: mode === 'live' ? Environment.Production : Environment.Sandbox,
      clientCredentialsAuthCredentials: {
        oAuthClientId: clientId,
        oAuthClientSecret: clientSecret
      }
    })
  }
  return paypalClient
}

function getOrdersController() {
  if (!ordersController) {
    ordersController = new OrdersController(getClient())
  }
  return ordersController
}

export { getClient as paypalClient, Client, Environment }

// Subscription plans
export const PAYPAL_PLANS = {
  free: { name: 'Free', price: 0, interval: 'MONTH' },
  starter: { name: 'Starter', price: 29, interval: 'MONTH' },
  professional: { name: 'Professional', price: 79, interval: 'MONTH' },
  enterprise: { name: 'Enterprise', price: 199, interval: 'MONTH' },
} as const

export type SubscriptionPlan = keyof typeof PAYPAL_PLANS

// Create a PayPal order
/**
 * PayPal caps custom_id at 127 characters.
 *
 * Shipping an unbounded JSON blob works right up until PayPal rejects the
 * order, and the rejection names a field limit rather than the real problem.
 */
const MAX_CUSTOM_ID = 127

export async function createPayPalOrder(
  planName: string,
  price: number,
  returnUrl: string,
  cancelUrl: string,
  /**
   * The tenant this order belongs to, serialised into custom_id.
   *
   * This is the ONLY way the webhook learns who paid. handlePaymentCompleted
   * reads resource.custom_id, JSON.parses it and destructures companyId,
   * planId and billingCycle. Without it, the webhook hit `if (!customId)
   * return`, answered PayPal with a 200, and the payment was discarded
   * silently: the customer is charged, the account stays on trial, and nothing
   * is logged or retried.
   */
  metadata?: Record<string, unknown>,
  /**
   * A previously-linked PayPal payer id to charge directly.
   *
   * When present, PayPal pre-selects that funding source instead of asking the
   * customer to log in again. This is what makes a saved payment method
   * automatic: without it, every checkout is a fresh approval and the saved
   * method is never actually used.
   *
   * Omitted (or null) when the company has no saved method - PayPal then falls
   * back to its normal account/login prompt, which is also how a first-time
   * customer adds one.
   */
  payerId?: string | null
) {
  const ctrl = getOrdersController()

  const purchaseUnit: Record<string, unknown> = {
    amount: {
      currencyCode: 'USD',
      value: price.toFixed(2),
      breakdown: {
        itemTotal: { currencyCode: 'USD', value: price.toFixed(2) }
      }
    },
    description: `${planName} Subscription`,
    items: [{
      name: planName,
      description: `Monthly ${planName} subscription`,
      unitAmount: { currencyCode: 'USD', value: price.toFixed(2) },
      quantity: '1'
    }]
  }

  if (metadata) {
    // Only the fields the webhook reads. A shorter payload is less likely to
    // breach the 127-character cap, and nothing else should ride along.
    const slim = {
      companyId: metadata.companyId,
      planId: metadata.planId,
      billingCycle: metadata.billingCycle,
    }
    let encoded = JSON.stringify(slim)
    if (encoded.length > MAX_CUSTOM_ID) {
      // Drop the cycle rather than the identifiers - the webhook can default
      // the cycle, but cannot work out which company or plan was paid for.
      encoded = JSON.stringify({ companyId: slim.companyId, planId: slim.planId })
    }
    if (encoded.length > MAX_CUSTOM_ID) {
      // A UUID is 36 chars, so two of them plus JSON is ~90. Reaching here
      // means the values are not identifiers, which must not be shipped.
      throw new Error('checkout metadata is too large for PayPal custom_id')
    }
    /**
     * customId, NOT custom_id.
     *
     * The SDK's PurchaseUnitRequest model maps a `customId` property to
     * `custom_id` on the wire. Passing `custom_id` directly is not rejected -
     * it is silently dropped, because the serializer only walks known
     * properties. The order is created, returns 201, and arrives at PayPal
     * with no custom_id at all.
     *
     * Confirmed by reading PayPal's own record for an order created with the
     * wrong key: custom_id absent, everything else intact.
     */
    purchaseUnit.customId = encoded
  }

  const request: Record<string, unknown> = {
    intent: CheckoutPaymentIntent.Capture,
    purchaseUnits: [purchaseUnit],
    applicationContext: {
      brandName: 'Union',
      landingPage: 'BILLING',
      paymentMethod: {
        payerSelected: 'PAYPAL' as const,
        payeePreferred: 'IMMEDIATE_PAYMENT_REQUIRED' as const
      },
      returnUrl,
      cancelUrl
    }
  }

  /**
   * Pre-select the funding source the customer already linked.
   *
   * `payer.payer_id` is the Orders v2 field the SDK maps onto the wire, and it
   * is what turns a saved payment method into an automatic one: PayPal skips the
   * "log in again" step and charges that account. Omitting it is why every
   * checkout previously demanded a fresh approval even after a method was saved.
   *
   * A payer id that PayPal does not recognise is rejected by the API rather
   * than silently ignored, so a stale saved method surfaces as a real error
   * instead of a mysterious failure at capture time.
   */
  if (payerId) {
    request.payer = { payerId }
  }

  const response = await ctrl.createOrder({ body: request as any })
  return response.result
}

// Capture a PayPal order
export async function capturePayPalOrder(orderId: string) {
  const ctrl = getOrdersController()
  const response = await ctrl.captureOrder({ id: orderId })
  return response.result
}

// Get order details
export async function getPayPalOrder(orderId: string) {
  const ctrl = getOrdersController()
  const response = await ctrl.getOrder({ id: orderId })
  return response.result
}
