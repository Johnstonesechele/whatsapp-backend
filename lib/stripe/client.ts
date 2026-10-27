/**
 * Payment Client-Side Configuration
 * Now uses PayPal instead of Stripe.
 */

/**
 * Format amount to display currency
 */
export function formatAmount(amountInCents: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amountInCents / 100)
}

/**
 * Convert dollars to cents
 */
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100)
}

/**
 * Convert cents to dollars
 */
export function centsToDollars(cents: number): number {
  return cents / 100
}

/**
 * Get payment method type display name
 */
export function getPaymentMethodTypeName(type: string): string {
  const types: Record<string, string> = {
    paypal: 'PayPal',
    card: 'Credit/Debit Card',
  }
  return types[type] || type
}

// Re-export for backward compatibility
export const getStripe = () => null
export const getCardBrandName = (brand?: string) => brand || 'PayPal'
export const getCardBrandIcon = () => ''
export const formatCardNumber = (n: string) => n
export const maskCardNumber = () => '•••• PayPal'
export const isValidCardNumber = () => true

export default getStripe
