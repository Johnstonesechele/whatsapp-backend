/**
 * Payment Server-Side Configuration
 * Now uses PayPal instead of Stripe.
 * This file re-exports PayPal utilities for backward compatibility.
 */

export { paypalClient as stripe } from '@/lib/paypal/server'
export { createPayPalOrder as createSubscription } from '@/lib/paypal/server'
export { capturePayPalOrder as capturePayment } from '@/lib/paypal/server'
export { getPayPalOrder as getPayment } from '@/lib/paypal/server'

/**
 * Check if PayPal is properly configured
 */
export function isStripeConfigured(): boolean {
  return !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET)
}

/**
 * Throw error if PayPal is not configured
 */
export function requireStripeConfig() {
  if (!isStripeConfigured()) {
    throw new Error('PayPal is not configured. Please set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in your environment variables.')
  }
}
