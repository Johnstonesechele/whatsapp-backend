/**
 * Country list, with a default currency for each.
 *
 * Kept separate from the currency catalogue because a country is not a
 * currency: several countries share a currency (the euro), and some currencies
 * span countries nobody would think of as a pair. The pairing that matters for
 * this app is "which currency does a business in this country usually invoice
 * in", which is a default, not a rule - a Kenyan company invoicing in USD is
 * ordinary and must remain selectable.
 *
 * The wizard previously carried its own hardcoded 10-country list with Kenya
 * duplicated and Ghana, Uganda, Rwanda and Morocco missing, so those businesses
 * could not set their own currency at all.
 */

import { COUNTRY_CURRENCY } from './currency.ts'

/** Every country, with the currency most businesses there use. */
export const COUNTRIES: string[] = Array.from(
  new Set([...Object.keys(COUNTRY_CURRENCY), 'Other'])
).sort((a, b) => (a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b)))

export function isSupportedCountry(value: unknown): value is string {
  return typeof value === 'string' && COUNTRIES.includes(value)
}
