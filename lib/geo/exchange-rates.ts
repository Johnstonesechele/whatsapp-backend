/**
 * Currency Exchange Rate Service
 * Fetches and caches real-time exchange rates
 */

interface ExchangeRates {
  base: string
  rates: Record<string, number>
  timestamp: number
}

const CACHE_KEY = 'exchange_rates'
const CACHE_DURATION = 60 * 60 * 1000 // 1 hour

/**
 * Fetch exchange rates with multiple fallback APIs
 */
export async function fetchExchangeRates(baseCurrency: string = 'USD'): Promise<ExchangeRates | null> {
  // Try to get from cache first
  const cached = getCachedRates(baseCurrency)
  if (cached) {
    console.log(' Using cached exchange rates')
    return cached
  }

  const apis = [
    // Primary: exchangerate-api.com (free, 1500 requests/month)
    async () => {
      const response = await fetch(`https://api.exchangerate-api.com/v4/latest/${baseCurrency}`, {
        signal: AbortSignal.timeout(5000)
      })
      if (!response.ok) throw new Error('exchangerate-api.com failed')
      const data = await response.json()
      return {
        base: data.base,
        rates: data.rates,
        timestamp: Date.now()
      }
    },

    // Fallback 1: api.exchangerate.host (free, unlimited)
    async () => {
      const response = await fetch(`https://api.exchangerate.host/latest?base=${baseCurrency}`, {
        signal: AbortSignal.timeout(5000)
      })
      if (!response.ok) throw new Error('exchangerate.host failed')
      const data = await response.json()
      return {
        base: data.base,
        rates: data.rates,
        timestamp: Date.now()
      }
    },

    // Fallback 2: frankfurter.app (free, unlimited, no API key)
    async () => {
      const response = await fetch(`https://api.frankfurter.app/latest?from=${baseCurrency}`, {
        signal: AbortSignal.timeout(5000)
      })
      if (!response.ok) throw new Error('frankfurter.app failed')
      const data = await response.json()
      return {
        base: data.base,
        rates: { ...data.rates, [data.base]: 1 }, // Add base currency
        timestamp: Date.now()
      }
    }
  ]

  // Try each API
  for (const api of apis) {
    try {
      console.log(' Fetching exchange rates...')
      const rates = await api()
      console.log(' Exchange rates fetched:', rates.base)
      
      // Cache the result
      if (typeof window !== 'undefined') {
        localStorage.setItem(`${CACHE_KEY}_${baseCurrency}`, JSON.stringify(rates))
      }
      
      return rates
    } catch (error) {
      console.warn('Exchange rate API failed, trying next...', error)
      continue
    }
  }

  console.error(' All exchange rate APIs failed')
  return null
}

/**
 * Get cached exchange rates
 */
function getCachedRates(baseCurrency: string): ExchangeRates | null {
  if (typeof window === 'undefined') return null
  
  const cached = localStorage.getItem(`${CACHE_KEY}_${baseCurrency}`)
  if (!cached) return null
  
  try {
    const rates: ExchangeRates = JSON.parse(cached)
    // Return cache if less than 1 hour old
    if (Date.now() - rates.timestamp < CACHE_DURATION) {
      return rates
    }
  } catch (e) {
    return null
  }
  
  return null
}

/**
 * Convert amount from one currency to another
 */
export async function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string
): Promise<number | null> {
  if (fromCurrency === toCurrency) return amount
  
  const rates = await fetchExchangeRates(fromCurrency)
  if (!rates || !rates.rates[toCurrency]) return null
  
  return amount * rates.rates[toCurrency]
}

/**
 * Get exchange rate between two currencies
 */
export async function getExchangeRate(
  fromCurrency: string,
  toCurrency: string
): Promise<number | null> {
  if (fromCurrency === toCurrency) return 1
  
  const rates = await fetchExchangeRates(fromCurrency)
  if (!rates || !rates.rates[toCurrency]) return null
  
  return rates.rates[toCurrency]
}

/**
 * Static fallback rates (used when APIs fail)
 * Updated periodically - Last update: 2024
 */
export const fallbackRates: Record<string, number> = {
  USD: 1.00,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 149.50,
  CNY: 7.24,
  INR: 83.12,
  CAD: 1.35,
  AUD: 1.52,
  CHF: 0.88,
  MXN: 17.08,
  BRL: 4.97,
  KRW: 1320.50,
  SGD: 1.34,
  HKD: 7.82,
  NOK: 10.62,
  SEK: 10.35,
  DKK: 6.87,
  PLN: 3.97,
  THB: 35.45,
  IDR: 15625.00,
  MYR: 4.68,
  PHP: 56.25,
  ZAR: 18.75,
  AED: 3.67,
  SAR: 3.75,
  NGN: 1250.00,
  KES: 145.00
}

/**
 * Convert using fallback rates
 */
export function convertCurrencyFallback(
  amount: number,
  fromCurrency: string,
  toCurrency: string
): number {
  if (fromCurrency === toCurrency) return amount
  
  const fromRate = fallbackRates[fromCurrency] || 1
  const toRate = fallbackRates[toCurrency] || 1
  
  // Convert to USD first, then to target currency
  const usdAmount = amount / fromRate
  return usdAmount * toRate
}
