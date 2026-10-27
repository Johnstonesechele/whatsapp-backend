/**
 * Currency support.
 *
 * THE PROBLEM THIS SOLVES
 *
 * Signup hardcoded `currency: 'USD'`, so 172 of 173 companies in the live
 * database were recorded as American dollars regardless of where the business
 * actually is. Money columns are bare numbers - deals.value, leads.value,
 * services.price - with no unit attached, so every screen had to assume `$`.
 * 133 page files did exactly that.
 *
 * The rule this module establishes: a money amount is meaningless without the
 * company that owns it, and that company carries the currency. So a value is
 * only ever formatted against the caller's own company currency, and nothing
 * in the UI hardcodes a symbol.
 *
 * WHY NOT EXCHANGE RATES
 *
 * A value is STORED in the company's currency and DISPLAYED in it. Converting
 * between currencies would mean storing a rate and a conversion date on every
 * row, and a historical deal would silently change value when the rate moved.
 * If cross-currency reporting is wanted later, it belongs as an explicit,
 * dated conversion - not folded into display formatting.
 *
 * The currency catalogue is ISO 4217. It is kept here as data rather than
 * derived from the browser's Intl, so a server-rendered page and a client one
 * always agree on what "KES" means.
 */

export type Currency = {
  code: string
  name: string
  symbol: string
  decimals: number
  /** Thousands grouping differs: 1,234.56 in en-US, 1.234,56 in de-DE. */
  thousandsSeparator: string
  decimalSeparator: string
  /** Approximate placement of the symbol relative to the amount. */
  symbolPosition: 'before' | 'after'
  common: boolean
}

const c = (
  code: string, name: string, symbol: string, decimals: number,
  thousandsSeparator = ',', decimalSeparator = '.', symbolPosition: 'before' | 'after' = 'before',
  common = false
): Currency => ({ code, name, symbol, decimals, thousandsSeparator, decimalSeparator, symbolPosition, common })

/**
 * ISO 4217 currencies. `common` marks the ones offered first in a picker;
 * the full list is always available, because "support all countries" means
 * all of them, not a regional shortlist.
 */
export const CURRENCIES: Currency[] = [
  // --- widely used ---
  c('USD', 'US Dollar', '$', 2, ',', '.', 'before', true),
  c('EUR', 'Euro', '€', 2, '.', ',', 'after', true),
  c('GBP', 'British Pound', '£', 2, ',', '.', 'before', true),
  c('KES', 'Kenyan Shilling', 'KSh', 2, ',', '.', 'before', true),
  c('NGN', 'Nigerian Naira', '₦', 2, ',', '.', 'before', true),
  c('ZAR', 'South African Rand', 'R', 2, ' ', ',', 'before', true),
  c('GHS', 'Ghanaian Cedi', 'GH₵', 2, ',', '.', 'before', true),
  c('TZS', 'Tanzanian Shilling', 'TSh', 0, ',', '.', 'before', true),
  c('EGP', 'Egyptian Pound', 'E£', 2, ',', '.', 'before', true),
  c('INR', 'Indian Rupee', '₹', 2, ',', '.', 'before', true),
  c('AUD', 'Australian Dollar', 'A$', 2, ',', '.', 'before', true),
  c('CAD', 'Canadian Dollar', 'C$', 2, ',', '.', 'before', true),
  c('CHF', 'Swiss Franc', 'CHF', 2, '’', '.', 'before', true),
  c('JPY', 'Japanese Yen', '¥', 0, ',', '.', 'before', true),
  c('CNY', 'Chinese Yuan', 'CN¥', 2, ',', '.', 'before', true),
  c('AED', 'UAE Dirham', 'AED', 2, ',', '.', 'after', true),
  c('SAR', 'Saudi Riyal', 'SAR', 2, ',', '.', 'after', true),
  c('SGD', 'Singapore Dollar', 'S$', 2, ',', '.', 'before', true),
  c('KRW', 'South Korean Won', '₩', 0, ',', '.', 'before', true),
  c('MXN', 'Mexican Peso', 'MX$', 2, ',', '.', 'before', true),
  c('BRL', 'Brazilian Real', 'R$', 2, '.', ',', 'before', true),
  c('IDR', 'Indonesian Rupiah', 'Rp', 0, '.', ',', 'before', true),
  c('MYR', 'Malaysian Ringgit', 'RM', 2, ',', '.', 'before', true),
  c('PHP', 'Philippine Peso', '₱', 2, ',', '.', 'before', true),
  c('THB', 'Thai Baht', '฿', 2, ',', '.', 'before', true),
  c('TRY', 'Turkish Lira', '₺', 2, ',', '.', 'before', true),
  c('RUB', 'Russian Ruble', '₽', 2, ' ', ',', 'after', true),
  c('PKR', 'Pakistani Rupee', '₨', 2, ',', '.', 'before', true),
  c('BDT', 'Bangladeshi Taka', '৳', 2, ',', '.', 'before', true),
  c('LKR', 'Sri Lankan Rupee', 'Rs', 2, ',', '.', 'before', true),
  c('MAD', 'Moroccan Dirham', 'MAD', 2, ',', '.', 'after', true),
  c('DZD', 'Algerian Dinar', 'DA', 2, ' ', ',', 'after'),
  c('TND', 'Tunisian Dinar', 'DT', 3, ',', '.', 'after'),
  c('UGX', 'Ugandan Shilling', 'USh', 0, ',', '.', 'before'),
  c('RWF', 'Rwandan Franc', 'FRw', 0, ',', '.', 'before'),
  c('ETB', 'Ethiopian Birr', 'Br', 2, ',', '.', 'before'),
  c('ZMW', 'Zambian Kwacha', 'ZK', 2, ',', '.', 'before'),
  c('BWP', 'Botswana Pula', 'P', 2, ',', '.', 'before'),
  c('MUR', 'Mauritian Rupee', '₨', 2, ',', '.', 'before'),
  c('NAD', 'Namibian Dollar', 'N$', 2, ',', '.', 'before'),
  c('XOF', 'West African CFA Franc', 'CFA', 0, ' ', ',', 'before'),
  c('XAF', 'Central African CFA Franc', 'FCFA', 0, ' ', ',', 'before'),
  c('CDF', 'Congolese Franc', 'FC', 0, ',', '.', 'before'),
  c('AOA', 'Angolan Kwanza', 'Kz', 2, ',', '.', 'before'),
  c('MZN', 'Mozambican Metical', 'MT', 2, ',', '.', 'before'),
  c('SDG', 'Sudanese Pound', 'ج.س.', 2, ',', '.', 'before'),
  c('GNF', 'Guinean Franc', 'FG', 0, ' ', ',', 'before'),
  c('SLE', 'Sierra Leonean Leone', 'Le', 2, ',', '.', 'before'),
  c('LRD', 'Liberian Dollar', 'L$', 2, ',', '.', 'before'),
  c('MWK', 'Malawian Kwacha', 'MK', 2, ',', '.', 'before'),
  c('SZL', 'Swazi Lilangeni', 'E', 2, ',', '.', 'before'),
  c('LSL', 'Lesotho Loti', 'L', 2, ',', '.', 'before'),
  c('LYD', 'Libyan Dinar', 'LD', 3, ',', '.', 'after'),
  c('NZD', 'New Zealand Dollar', 'NZ$', 2, ',', '.', 'before'),
  c('NOK', 'Norwegian Krone', 'kr', 2, ' ', ',', 'after'),
  c('SEK', 'Swedish Krona', 'kr', 2, ' ', ',', 'after'),
  c('DKK', 'Danish Krone', 'kr', 2, '.', ',', 'after'),
  c('PLN', 'Polish Zloty', 'zł', 2, ' ', ',', 'after'),
  c('CZK', 'Czech Koruna', 'Kč', 2, ' ', ',', 'after'),
  c('HUF', 'Hungarian Forint', 'Ft', 0, ' ', ',', 'after'),
  c('RON', 'Romanian Leu', 'lei', 2, '.', ',', 'after'),
  c('BGN', 'Bulgarian Lev', 'лв', 2, ' ', ',', 'after'),
  c('NPR', 'Nepalese Rupee', '₨', 2, ',', '.', 'before'),
  c('VND', 'Vietnamese Dong', '₫', 0, '.', ',', 'after'),
  c('KHR', 'Cambodian Riel', '៛', 2, ',', '.', 'before'),
  c('LAK', 'Lao Kip', '₭', 0, ',', '.', 'before'),
  c('MMK', 'Myanmar Kyat', 'K', 2, ',', '.', 'before'),
  c('MNT', 'Mongolian Tugrik', '₮', 0, ',', '.', 'before'),
  c('KZT', 'Kazakhstani Tenge', '₸', 2, ' ', ',', 'before'),
  c('UZS', 'Uzbekistani Som', "so'm", 2, ' ', ',', 'after'),
  c('HKD', 'Hong Kong Dollar', 'HK$', 2, ',', '.', 'before'),
  c('MOP', 'Macanese Pataca', 'MOP$', 2, ',', '.', 'before'),
  c('TWD', 'New Taiwan Dollar', 'NT$', 2, ',', '.', 'before'),
  c('ARS', 'Argentine Peso', 'AR$', 2, ',', '.', 'before'),
  c('CLP', 'Chilean Peso', 'CLP$', 0, ',', '.', 'before'),
  c('COP', 'Colombian Peso', 'COL$', 0, ',', '.', 'before'),
  c('PEN', 'Peruvian Sol', 'S/', 2, ',', '.', 'before'),
  c('CRC', 'Costa Rican Colón', '₡', 2, ',', '.', 'before'),
  c('PAB', 'Panamanian Balboa', 'B/.', 2, ',', '.', 'before'),
  c('GTQ', 'Guatemalan Quetzal', 'Q', 2, ',', '.', 'before'),
  c('DOP', 'Dominican Peso', 'RD$', 2, ',', '.', 'before'),
  c('JMD', 'Jamaican Dollar', 'J$', 2, ',', '.', 'before'),
  c('TTD', 'Trinidad and Tobago Dollar', 'TT$', 2, ',', '.', 'before'),
  c('QAR', 'Qatari Riyal', 'QR', 2, ' ', ',', 'after'),
  c('KWD', 'Kuwaiti Dinar', 'KD', 3, ',', '.', 'after'),
  c('BHD', 'Bahraini Dinar', 'BD', 3, ',', '.', 'after'),
  c('OMR', 'Omani Rial', 'OR', 3, ' ', ',', 'after'),
  c('JOD', 'Jordanian Dinar', 'JD', 3, ',', '.', 'after'),
  c('ILS', 'Israeli Shekel', '₪', 2, ',', '.', 'before'),
  c('IRR', 'Iranian Rial', 'IRR', 0, ',', '.', 'after'),
  c('IQD', 'Iraqi Dinar', 'IQD', 0, ',', '.', 'after'),
  c('AFN', 'Afghan Afghani', '؋', 0, ',', '.', 'after'),
]

const BY_CODE = new Map(CURRENCIES.map(x => [x.code, x]))
const UNIQUE: Currency[] = Array.from(BY_CODE.values())

export const CURRENCY_CODES: string[] = UNIQUE.map(x => x.code)

export const FALLBACK: Currency = BY_CODE.get('USD')!

export function getCurrency(code: string | null | undefined): Currency {
  if (!code) return FALLBACK
  return BY_CODE.get(String(code).toUpperCase().trim()) || FALLBACK
}

export function isSupportedCurrency(code: unknown): code is string {
  return typeof code === 'string' && BY_CODE.has(code.toUpperCase().trim())
}

/**
 * Group and punctuate a bare number for a currency. No symbol.
 *
 * Handles the sign itself, so a direct caller does not get "250" for -250.
 */
export function formatNumber(amount: number, currency: Currency): string {
  if (!Number.isFinite(amount)) return '0'
  const negative = amount < 0
  const fixed = Math.abs(amount).toFixed(currency.decimals)
  const [whole, frac] = fixed.split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, currency.thousandsSeparator)
  const out = frac ? `${grouped}${currency.decimalSeparator}${frac}` : grouped
  return negative ? `-${out}` : out
}

/**
 * Format an amount in a currency.
 *
 * The symbol is placed and punctuated per the currency, so KSh 1,500.00,
 * R 1 500,00 and €1.500,00 all read correctly rather than all being "$1,500".
 */
export function formatMoney(
  amount: number | null | undefined,
  code: string | null | undefined,
  opts: { compact?: boolean } = {}
): string {
  const currency = getCurrency(code)

  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    // An absent amount is shown as a dash, not as zero. Zero means "nothing
    // was sold"; a dash means "we do not know".
    return '—'
  }

  if (opts.compact && Math.abs(amount) >= 1_000_000) {
    return `${currency.symbol}${(amount / 1_000_000).toFixed(1)}M`
  }
  if (opts.compact && Math.abs(amount) >= 1_000) {
    return `${currency.symbol}${(amount / 1_000).toFixed(1)}K`
  }

  // The minus sign goes OUTSIDE the symbol: "-$250.00", never "$-250.00". The
  // latter is how a spreadsheet-less formatter gets it wrong, and it reads as
  // a currency code rather than a negative amount.
  //
  // A symbol ending in a letter also needs a space before the amount: "R 1,500"
  // reads as a word next to a number, where "KSh1,500" does not. A symbol
  // ending in a currency sign ($ € £) sits flush, which is the convention.
  const negative = amount < 0
  const n = formatNumber(Math.abs(amount), currency)
  const needsSpace = currency.symbolPosition === 'before' && /[A-Za-z]$/.test(currency.symbol)

  const body = currency.symbolPosition === 'before'
    ? (needsSpace ? `${currency.symbol} ${n}` : `${currency.symbol}${n}`)
    : `${n} ${currency.symbol}`

  return negative ? `-${body}` : body
}

/** "1,500.00 KES" - for exports, tooltips and anywhere the code is clearer. */
export function formatMoneyWithCode(
  amount: number | null | undefined,
  code: string | null | undefined
): string {
  const currency = getCurrency(code)
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return '—'
  return `${formatNumber(amount, currency)} ${currency.code}`
}

/**
 * Country -> default currency.
 *
 * Used to pre-select a sensible currency when someone picks their country,
 * while still letting them choose a different one - a Kenyan company that
 * invoices in USD is common and must be possible.
 */
export const COUNTRY_CURRENCY: Record<string, string> = {
  Kenya: 'KES', Uganda: 'UGX', Tanzania: 'TZS', Rwanda: 'RWF', Ethiopia: 'ETB',
  Nigeria: 'NGN', Ghana: 'GHS', 'South Africa': 'ZAR', Zambia: 'ZMW',
  Zimbabwe: 'USD', Botswana: 'BWP', Namibia: 'NAD', Malawi: 'MWK',
  Eswatini: 'SZL', Lesotho: 'LSL', Mozambique: 'MZN',
  Angola: 'AOA', 'DR Congo': 'CDF', Congo: 'XAF', Senegal: 'XOF',
  "Cote d'Ivoire": 'XOF', Mali: 'XOF', 'Burkina Faso': 'XOF', Benin: 'XOF',
  Togo: 'XOF', Guinea: 'GNF', 'Sierra Leone': 'SLE', Liberia: 'LRD',
  Egypt: 'EGP', Morocco: 'MAD', Algeria: 'DZD', Tunisia: 'TND',
  Libya: 'LYD', Sudan: 'SDG', Jordan: 'JOD', Lebanon: 'LBP',
  'United States': 'USD', 'United Kingdom': 'GBP', Canada: 'CAD',
  Australia: 'AUD', 'New Zealand': 'NZD', Germany: 'EUR', France: 'EUR',
  Spain: 'EUR', Italy: 'EUR', Netherlands: 'EUR', Belgium: 'EUR',
  Portugal: 'EUR', Ireland: 'EUR', Austria: 'EUR', Finland: 'EUR',
  Greece: 'EUR', Luxembourg: 'EUR', Malta: 'EUR',
  Cyprus: 'EUR', Slovakia: 'EUR', Slovenia: 'EUR', Estonia: 'EUR',
  Latvia: 'EUR', Lithuania: 'EUR', Switzerland: 'CHF', Norway: 'NOK',
  Sweden: 'SEK', Denmark: 'DKK', Poland: 'PLN', Czechia: 'CZK',
  Hungary: 'HUF', Romania: 'RON', Bulgaria: 'BGN', Russia: 'RUB',
  Turkey: 'TRY', India: 'INR', Pakistan: 'PKR', Bangladesh: 'BDT',
  'Sri Lanka': 'LKR', Nepal: 'NPR', 'China': 'CNY', Japan: 'JPY',
  'South Korea': 'KRW', Singapore: 'SGD', Malaysia: 'MYR', Thailand: 'THB',
  Vietnam: 'VND', Indonesia: 'IDR', Philippines: 'PHP', Cambodia: 'KHR',
  'Laos': 'LAK', Myanmar: 'MMK', Mongolia: 'MNT', Kazakhstan: 'KZT',
  Uzbekistan: 'UZS', 'Hong Kong': 'HKD', Macau: 'MOP', Taiwan: 'TWD',
  Brazil: 'BRL', Mexico: 'MXN', Argentina: 'ARS', Chile: 'CLP',
  Colombia: 'COP', Peru: 'PEN', 'Costa Rica': 'CRC', Panama: 'PAB',
  Guatemala: 'GTQ', 'Dominican Republic': 'DOP', Jamaica: 'JMD',
  'Trinidad and Tobago': 'TTD', UAE: 'AED',
  'United Arab Emirates': 'AED', 'Saudi Arabia': 'SAR', Qatar: 'QAR',
  Kuwait: 'KWD', Bahrain: 'BHD', Oman: 'OMR',
  Israel: 'ILS', 'Iran': 'IRR', Iraq: 'IQD', Afghanistan: 'AFN',
  Other: 'USD',
}

export function defaultCurrencyForCountry(country: string | null | undefined): string {
  if (!country) return 'USD'
  return COUNTRY_CURRENCY[country] || COUNTRY_CURRENCY[country.trim()] || 'USD'
}

/**
 * Currencies referenced in the data that this catalogue does not know.
 *
 * Surfaced rather than silently falling back to USD, because a tenant invoicing
 * in an unrecognised currency should be visible to whoever supports them.
 */
export function unknownCurrencies(observed: string[]): string[] {
  return Array.from(new Set(observed.filter(x => !isSupportedCurrency(x))))
}
