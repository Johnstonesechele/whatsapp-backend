/**
 * Multi-Currency and Payment Methods Configuration
 * Supports top 20 countries with localized payment options
 */

export interface Currency {
  code: string
  symbol: string
  name: string
  decimals: number
}

export interface PaymentMethod {
  id: string
  name: string
  type: 'card' | 'bank_transfer' | 'wallet' | 'cash' | 'crypto' | 'other'
  icon: string
  description: string
  processingTime: string
  fees?: string
  requiresVerification?: boolean
  stripeSupported?: boolean
  paypalSupported?: boolean
}

/**
 * Currency configurations for major countries
 */
export const currencies: Record<string, Currency> = {
  // Americas
  US: { code: 'USD', symbol: '$', name: 'US Dollar', decimals: 2 },
  CA: { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', decimals: 2 },
  MX: { code: 'MXN', symbol: 'MX$', name: 'Mexican Peso', decimals: 2 },
  BR: { code: 'BRL', symbol: 'R$', name: 'Brazilian Real', decimals: 2 },
  
  // Europe
  GB: { code: 'GBP', symbol: '£', name: 'British Pound', decimals: 2 },
  EU: { code: 'EUR', symbol: '€', name: 'Euro', decimals: 2 },
  DE: { code: 'EUR', symbol: '€', name: 'Euro', decimals: 2 },
  FR: { code: 'EUR', symbol: '€', name: 'Euro', decimals: 2 },
  IT: { code: 'EUR', symbol: '€', name: 'Euro', decimals: 2 },
  ES: { code: 'EUR', symbol: '€', name: 'Euro', decimals: 2 },
  NL: { code: 'EUR', symbol: '€', name: 'Euro', decimals: 2 },
  CH: { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc', decimals: 2 },
  
  // Asia-Pacific
  CN: { code: 'CNY', symbol: '¥', name: 'Chinese Yuan', decimals: 2 },
  JP: { code: 'JPY', symbol: '¥', name: 'Japanese Yen', decimals: 0 },
  IN: { code: 'INR', symbol: '₹', name: 'Indian Rupee', decimals: 2 },
  ID: { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah', decimals: 0 },
  AU: { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', decimals: 2 },
  SG: { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', decimals: 2 },
  MY: { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit', decimals: 2 },
  TH: { code: 'THB', symbol: '฿', name: 'Thai Baht', decimals: 2 },
  PH: { code: 'PHP', symbol: '₱', name: 'Philippine Peso', decimals: 2 },
  KR: { code: 'KRW', symbol: '₩', name: 'South Korean Won', decimals: 0 },
  
  // Middle East & Africa
  AE: { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham', decimals: 2 },
  SA: { code: 'SAR', symbol: 'SR', name: 'Saudi Riyal', decimals: 2 },
  ZA: { code: 'ZAR', symbol: 'R', name: 'South African Rand', decimals: 2 },
  NG: { code: 'NGN', symbol: '₦', name: 'Nigerian Naira', decimals: 2 },
  KE: { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling', decimals: 2 },
}

/**
 * Payment methods by country/region
 */
export const paymentMethodsByCountry: Record<string, PaymentMethod[]> = {
  // United States
  US: [
    {
      id: 'card',
      name: 'Credit/Debit Card',
      type: 'card',
      icon: '',
      description: 'Visa, Mastercard, American Express',
      processingTime: 'Instant',
      stripeSupported: true
    },
    {
      id: 'ach',
      name: 'ACH Bank Transfer',
      type: 'bank_transfer',
      icon: '',
      description: 'Direct bank account transfer',
      processingTime: '3-5 business days',
      fees: 'Lower fees',
      stripeSupported: true
    },
    {
      id: 'apple_pay',
      name: 'Apple Pay',
      type: 'wallet',
      icon: '',
      description: 'Fast and secure',
      processingTime: 'Instant',
      stripeSupported: true
    },
    {
      id: 'google_pay',
      name: 'Google Pay',
      type: 'wallet',
      icon: '',
      description: 'Fast and secure',
      processingTime: 'Instant',
      stripeSupported: true
    }
  ],

  // United Kingdom
  GB: [
    {
      id: 'card',
      name: 'Credit/Debit Card',
      type: 'card',
      icon: '',
      description: 'Visa, Mastercard',
      processingTime: 'Instant',
      stripeSupported: true
    },
    {
      id: 'bacs',
      name: 'BACS Direct Debit',
      type: 'bank_transfer',
      icon: '',
      description: 'UK bank account',
      processingTime: '3 business days',
      stripeSupported: true
    },
    {
      id: 'apple_pay',
      name: 'Apple Pay',
      type: 'wallet',
      icon: '',
      description: 'Fast and secure',
      processingTime: 'Instant',
      stripeSupported: true
    }
  ],

  // India
  IN: [
    {
      id: 'card',
      name: 'Credit/Debit Card',
      type: 'card',
      icon: '',
      description: 'Visa, Mastercard, RuPay',
      processingTime: 'Instant',
      stripeSupported: true
    },
    {
      id: 'upi',
      name: 'UPI',
      type: 'wallet',
      icon: '',
      description: 'PhonePe, GPay, Paytm',
      processingTime: 'Instant',
      fees: 'No fees',
      stripeSupported: true
    },
    {
      id: 'netbanking',
      name: 'Net Banking',
      type: 'bank_transfer',
      icon: '',
      description: 'All major banks',
      processingTime: 'Instant',
      stripeSupported: true
    },
    {
      id: 'paytm',
      name: 'Paytm Wallet',
      type: 'wallet',
      icon: '',
      description: 'Paytm digital wallet',
      processingTime: 'Instant'
    }
  ],

  // China
  CN: [
    {
      id: 'card',
      name: 'Credit/Debit Card',
      type: 'card',
      icon: '',
      description: 'UnionPay, Visa, Mastercard',
      processingTime: 'Instant',
      stripeSupported: true
    },
    {
      id: 'alipay',
      name: 'Alipay',
      type: 'wallet',
      icon: '',
      description: 'Most popular in China',
      processingTime: 'Instant',
      stripeSupported: true
    },
    {
      id: 'wechat_pay',
      name: 'WeChat Pay',
      type: 'wallet',
      icon: '',
      description: 'WeChat integrated payment',
      processingTime: 'Instant',
      stripeSupported: true
    }
  ],

  // Brazil
  BR: [
    {
      id: 'card',
      name: 'Credit/Debit Card',
      type: 'card',
      icon: '',
      description: 'Visa, Mastercard, Elo',
      processingTime: 'Instant',
      stripeSupported: true
    },
    {
      id: 'boleto',
      name: 'Boleto',
      type: 'cash',
      icon: '',
      description: 'Cash voucher payment',
      processingTime: '1-3 business days',
      stripeSupported: true
    },
    {
      id: 'pix',
      name: 'PIX',
      type: 'bank_transfer',
      icon: '',
      description: 'Instant bank transfer',
      processingTime: 'Instant',
      fees: 'No fees'
    }
  ],

  // Indonesia
  ID: [
    {
      id: 'card',
      name: 'Credit/Debit Card',
      type: 'card',
      icon: '',
      description: 'Visa, Mastercard',
      processingTime: 'Instant',
      stripeSupported: true
    },
    {
      id: 'gopay',
      name: 'GoPay',
      type: 'wallet',
      icon: '',
      description: 'Gojek wallet',
      processingTime: 'Instant'
    },
    {
      id: 'ovo',
      name: 'OVO',
      type: 'wallet',
      icon: '',
      description: 'OVO digital wallet',
      processingTime: 'Instant'
    },
    {
      id: 'dana',
      name: 'DANA',
      type: 'wallet',
      icon: '',
      description: 'DANA wallet',
      processingTime: 'Instant'
    }
  ],

  // Mexico
  MX: [
    {
      id: 'card',
      name: 'Credit/Debit Card',
      type: 'card',
      icon: '',
      description: 'Visa, Mastercard',
      processingTime: 'Instant',
      stripeSupported: true
    },
    {
      id: 'oxxo',
      name: 'OXXO',
      type: 'cash',
      icon: '',
      description: 'Pay at OXXO stores',
      processingTime: '1-3 business days',
      stripeSupported: true
    },
    {
      id: 'spei',
      name: 'SPEI',
      type: 'bank_transfer',
      icon: '',
      description: 'Mexican bank transfer',
      processingTime: 'Same day'
    }
  ],

  // Nigeria
  NG: [
    {
      id: 'card',
      name: 'Credit/Debit Card',
      type: 'card',
      icon: '',
      description: 'Visa, Mastercard, Verve',
      processingTime: 'Instant',
      stripeSupported: true
    },
    {
      id: 'bank_transfer',
      name: 'Bank Transfer',
      type: 'bank_transfer',
      icon: '',
      description: 'Nigerian bank accounts',
      processingTime: 'Instant'
    },
    {
      id: 'ussd',
      name: 'USSD',
      type: 'other',
      icon: '',
      description: 'Dial to pay',
      processingTime: 'Instant'
    }
  ],

  // Kenya
  KE: [
    {
      id: 'card',
      name: 'Credit/Debit Card',
      type: 'card',
      icon: '',
      description: 'Visa, Mastercard',
      processingTime: 'Instant',
      stripeSupported: true
    },
    {
      id: 'mpesa',
      name: 'M-Pesa',
      type: 'wallet',
      icon: '',
      description: 'Most popular in Kenya',
      processingTime: 'Instant',
      fees: 'Low fees'
    }
  ],

  // Default for other countries
  default: [
    {
      id: 'paypal',
      name: 'PayPal',
      type: 'wallet',
      icon: '',
      description: 'Pay with your PayPal balance or a linked account',
      processingTime: 'Instant',
      /**
       * The ONLY processor this product is wired for. Checkout creates a PayPal
       * order (app/api/checkout/session/route.ts -> lib/paypal/server.ts) and
       * the PayPal webhook is what activates a subscription. Nothing else is
       * implemented.
       *
       * It is listed for EVERY country on purpose. A customer who is told
       * "SEPA and iDEAL only" and then reaches a PayPal checkout page has been
       * told something untrue, and the region is known well after the decision
       * to buy.
       */
      paypalSupported: true
    },
    {
      id: 'card',
      name: 'Credit/Debit Card',
      type: 'card',
      icon: '',
      description: 'Visa, Mastercard, American Express',
      processingTime: 'Instant'
    }
  ]
}

// Map European countries to use same payment methods
const europeanCountries = ['DE', 'FR', 'IT', 'ES', 'NL', 'AT', 'BE', 'PT', 'IE', 'FI', 'DK', 'SE', 'NO']
const europeanPaymentMethods: PaymentMethod[] = [
  {
    id: 'card',
    name: 'Credit/Debit Card',
    type: 'card',
    icon: '',
    description: 'Visa, Mastercard',
    processingTime: 'Instant',
    stripeSupported: true
  },
  {
    id: 'sepa',
    name: 'SEPA Direct Debit',
    type: 'bank_transfer',
    icon: '',
    description: 'EU bank account',
    processingTime: '3-5 business days',
    fees: 'Lower fees',
    stripeSupported: true
  },
  {
    id: 'ideal',
    name: 'iDEAL',
    type: 'bank_transfer',
    icon: '',
    description: 'Popular in Netherlands',
    processingTime: 'Instant',
    stripeSupported: true
  },
  {
    id: 'giropay',
    name: 'Giropay',
    type: 'bank_transfer',
    icon: '',
    description: 'Popular in Germany',
    processingTime: 'Instant',
    stripeSupported: true
  }
]

europeanCountries.forEach(country => {
  paymentMethodsByCountry[country] = europeanPaymentMethods
})

/**
 * Get currency for a country
 */
export function getCurrencyForCountry(countryCode: string): Currency {
  return currencies[countryCode] || currencies.US
}

/**
 * Get payment methods for a country
 */
export function getPaymentMethodsForCountry(countryCode: string): PaymentMethod[] {
  const methods = paymentMethodsByCountry[countryCode] || paymentMethodsByCountry.default

  /**
   * PayPal is available everywhere, not per-region.
   *
   * Every country's list above overrode the default, so adding PayPal to the
   * default alone changed nothing for most of the world - a customer in Kenya
   * was still told "Card and M-Pesa only" and then met a PayPal checkout.
   *
   * Conversely, SEPA, iDEAL, giropay, M-Pesa and USSD are advertised in those
   * lists and implemented NOWHERE. Nothing in this product can charge those
   * rails; checkout creates a PayPal order and the PayPal webhook activates the
   * subscription. Advertising them is a promise the product cannot keep, so
   * only what can actually be charged is shown.
   */
  const alreadyThere = methods.some((m) => m.paypalSupported)
  return alreadyThere ? methods : [PAYPAL_METHOD, ...methods]
}

/**
 * The single payment method this product can actually process.
 *
 * Kept as a frozen constant so the catalogue and this list cannot drift apart.
 */
export const PAYPAL_METHOD: PaymentMethod = Object.freeze({
  id: 'paypal',
  name: 'PayPal',
  type: 'wallet',
  icon: '',
  description: 'Pay with your PayPal balance or a linked account',
  processingTime: 'Instant',
  paypalSupported: true
})

/**
 * Format price with currency
 */
export function formatPrice(amount: number, currency: Currency): string {
  const formatted = amount.toFixed(currency.decimals)
  return `${currency.symbol}${formatted}`
}

/**
 * List of all supported currencies
 */
export const allCurrencies = Object.values(currencies).filter((currency, index, self) => 
  index === self.findIndex(c => c.code === currency.code)
).sort((a, b) => a.code.localeCompare(b.code))
