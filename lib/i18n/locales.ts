/**
 * Locales: the languages the interface can be shown in.
 *
 * WHY THIS IS A CATALOGUE AND NOT A LIBRARY
 *
 * There is no i18n dependency in this project, and adding a framework would be
 * the wrong first step. The app has roughly 1850 hardcoded English strings
 * across 199 dashboard files; a translation library cannot help until strings
 * are extracted and a catalogue exists to extract them into. Building the
 * vocabulary first means the extraction that follows is mechanical rather than
 * a rewrite.
 *
 * The database already anticipated this: user_preferences.language,
 * user_preferences.timezone, company_settings.default_language and
 * company_settings.timezone all exist, and nothing reads any of them. This
 * module is what those columns will be read through.
 *
 * WHAT THIS DOES NOT DO
 *
 * It does not translate. It defines the languages, their locale tags, their
 * writing direction, their number/date/currency formatting, and the fallback
 * chain. A missing translation falls back to English - visibly and
 * countably, so an untranslated string is a known gap rather than a blank.
 */

export type Locale = {
  code: string
  /** BCP 47 tag, used for Intl and Accept-Language. */
  tag: string
  englishName: string
  /** Name in the language itself, for a language picker. */
  nativeName: string
  dir: 'ltr' | 'rtl'
  /** Space between number and currency, in case one is needed. */
  common: boolean
}

const l = (
  code: string, tag: string, englishName: string, nativeName: string,
  dir: 'ltr' | 'rtl' = 'ltr', common = false
): Locale => ({ code, tag, englishName, nativeName, dir, common })

export const LOCALES: Locale[] = [
  l('en', 'en-GB', 'English', 'English', 'ltr', true),
  l('sw', 'sw-KE', 'Swahili', 'Kiswahili', 'ltr', true),
  l('fr', 'fr-FR', 'French', 'Français', 'ltr', true),
  l('es', 'es-ES', 'Spanish', 'Español', 'ltr', true),
  l('pt', 'pt-PT', 'Portuguese', 'Português', 'ltr', true),
  l('ar', 'ar-EG', 'Arabic', 'العربية', 'rtl', true),
  l('de', 'de-DE', 'German', 'Deutsch', 'ltr'),
  l('it', 'it-IT', 'Italian', 'Italiano', 'ltr'),
  l('nl', 'nl-NL', 'Dutch', 'Nederlands', 'ltr'),
  l('zh', 'zh-CN', 'Chinese (Simplified)', '简体中文', 'ltr', true),
  l('hi', 'hi-IN', 'Hindi', 'हिन्दी', 'ltr', true),
  l('ja', 'ja-JP', 'Japanese', '日本語', 'ltr'),
  l('ko', 'ko-KR', 'Korean', '한국어', 'ltr'),
  // East African currencies are the ones most likely to be needed next.
  l('rw', 'rw-RW', 'Kinyarwanda', 'Ikinyarwanda', 'ltr'),
  l('ug', 'ug-UG', 'Swahili (Uganda)', 'Luganda', 'ltr'),
]

const BY_CODE = new Map(LOCALES.map(x => [x.code, x]))
const BY_TAG = new Map(LOCALES.map(x => [x.tag.toLowerCase(), x]))

/** The language everything falls back to. */
export const DEFAULT_LOCALE = 'en'

export function getLocale(code: string | null | undefined): Locale {
  if (!code) return BY_CODE.get(DEFAULT_LOCALE)!
  return BY_CODE.get(String(code).toLowerCase().trim()) || BY_CODE.get(DEFAULT_LOCALE)!
}

export function isSupportedLocale(code: unknown): code is string {
  return typeof code === 'string' && BY_CODE.has(code.toLowerCase().trim())
}

/**
 * Pick the best supported locale for an Accept-Language header.
 *
 * `en-GB,en;q=0.9,fr;q=0.8` should yield 'fr', not 'en' - the first supported
 * language in the user's own order of preference. A region-only match is
 * accepted, so `fr-CA` resolves to 'fr' rather than falling all the way back.
 */
function rankAcceptLanguage(acceptLanguage: string | null | undefined) {
  if (!acceptLanguage) return []
  return acceptLanguage
    .split(',')
    .map(part => {
      const [tag, ...params] = part.trim().split(';')
      const q = params.find(p => p.trim().startsWith('q='))
      const quality = q ? parseFloat(q.split('=')[1]) : 1
      return { tag: tag.trim().toLowerCase(), quality: Number.isFinite(quality) ? quality : 0 }
    })
    .filter(x => x.tag)
    .sort((a, b) => b.quality - a.quality)
}

/**
 * The locale an Accept-Language header asks for, or null when it asks for
 * nothing this build carries.
 *
 * The null is the point. This function used to return DEFAULT_LOCALE for BOTH
 * "the browser wants English" and "the browser wants a language we do not
 * have", which are opposite facts. A geo-aware caller cannot tell them apart,
 * so it either overrode English browsers - handing Swahili to somebody whose
 * laptop is set to en-US - or ignored geography altogether.
 *
 * negotiateLocale() below is the same walk wrapped back into a total function,
 * for the callers that only want an answer and not the reason.
 */
export function matchAcceptLanguage(acceptLanguage: string | null | undefined): string | null {
  for (const { tag } of rankAcceptLanguage(acceptLanguage)) {
    const exact = BY_TAG.get(tag)
    if (exact) return exact.code
    const base = tag.split('-')[0]
    const partial = BY_CODE.get(base)
    if (partial) return partial.code
  }
  return null
}

export function negotiateLocale(acceptLanguage: string | null | undefined): string {
  return matchAcceptLanguage(acceptLanguage) ?? DEFAULT_LOCALE
}

/*
 * WHERE THE VISITOR IS, AND WHAT LANGUAGE THEY SPEAK
 * ===================================================
 *
 * A visitor in Kampala whose laptop is set to en-US is an English speaker by
 * browser and a Swahili or Kinyarwanda speaker by where they are. Asking only
 * the browser gets that person English.
 *
 * THE ORDER, AND WHY THE BROWSER STILL WINS A TIE
 *
 *   1. the person's own choice      user_preferences.language
 *   2. a choice they already made    the union_locale cookie
 *   3. the tenant default            company_settings.default_language
 *   4. the country they are in      the platform's edge header
 *   5. the browser's preference      Accept-Language
 *   6. English
 *
 * Steps 4 and 5 are read together, and the rule is: a language the visitor's
 * own browser asked for outranks where they happen to be standing. Country is
 * only consulted when the browser asked for nothing this build carries.
 *
 * That is what stops geo-detection becoming an override. A French laptop in
 * Nairobi reads French, and a company account set to French reads French in
 * Dar es Salaam. What country DOES decide is the visitor whose browser is set
 * to a language the catalogue has no entry for - and the most common real
 * instance of that is no Accept-Language header at all, which some clients
 * send. Those people are served in the language of the country they are in.
 *
 * It also means an en-US browser in Cairo stays English, because 'en' IS a
 * supported locale and the browser branch claims it. That is deliberate:
 * guessing wrong about somebody's language is worse than not guessing, and a
 * Kenyan on an English laptop is far more likely to want English than
 * Swahili.
 *
 * WHY NOT AN IP GEOLOCATION API
 *
 * lib/geo/location-detector.ts already exists and calls ipapi.co, then
 * ipgeolocation.io, then ip-api.com, then Cloudflare's trace endpoint. It is
 * kept, and it is the right tool for CURRENCY, which genuinely needs a city
 * and a currency code. For a language it is the wrong tool:
 *
 *   - The hosting platform already attaches the visitor's country to every
 *     request. Asking somebody else costs a round trip, on the critical path
 *     to first paint, for a value the request already carries.
 *   - Those APIs are free at 1,000 requests a day. Every one of them is
 *     already spent or nearly so.
 *   - Sending a visitor's IP to three companies to decide which of them
 *     answers first is a privacy cost that buys nothing here.
 *
 * Cloudflare's trace endpoint defaults to 'US' when it cannot see the visitor.
 * That is worse than no answer at all: it would confidently hand a Kenyan
 * visitor to an English page and report a country nobody was ever in. This
 * module treats an unrecognised or absent value as silence.
 */

/**
 * The official or dominant language of a country, as a supported locale code.
 *
 * Returns null - never DEFAULT_LOCALE - when there is nothing to say. The
 * distinction is load-bearing: returning 'en' would claim English was chosen
 * and stop the caller's remaining fallbacks from being tried, so a browser
 * that asks for French would silently lose to a country that says nothing.
 */
const COUNTRY_LOCALE: Readonly<Record<string, string>> = Object.freeze({
  // ---- East Africa: the product's home markets -----------------------
  KE: 'sw',  // Kenya: Swahili and English are both official. Swahili is the
             // language people actually conduct business in.
  TZ: 'sw',
  UG: 'sw',
  RW: 'rw',  // Rwanda: officially bilingual French/Kinyarwanda. Kinyarwanda
             // is what a local staff member reads, and it is supported.
  BI: 'rw',  // Burundi: Kirundi/French; Kinyarwanda is close and supported.

  // ---- Arabic-speaking ------------------------------------------------
  EG: 'ar', SA: 'ar', AE: 'ar', KW: 'ar', QA: 'ar', BH: 'ar', OM: 'ar',
  JO: 'ar', LB: 'ar', IQ: 'ar', SY: 'ar', YE: 'ar', PS: 'ar', LY: 'ar',
  SD: 'ar', DZ: 'ar', MA: 'fr',  // Morocco is francophone in practice
  TN: 'fr',                      // Tunisia likewise

  // ---- Western Europe -------------------------------------------------
  FR: 'fr', BE: 'fr',            // a French speaker in Brussels
  ES: 'es', MX: 'es', AR: 'es', CL: 'es', CO: 'es', PE: 'es', VE: 'es',
  PT: 'pt', BR: 'pt',            // Brazil's business language in practice
  DE: 'de', AT: 'it',            // Austria: German is spoken nationwide,
                                  // but the interface's supported set covers
                                  // German and not Bavarian.
  IT: 'it',
  NL: 'nl', LU: 'fr',            // Luxembourg is trilingual; French leads
                                  // in business.
  CM: 'fr',                      // Cameroon: French is the majority
                                  // language.
  CH: 'de',                      // Switzerland: German is the largest.

  // ---- Asia -----------------------------------------------------------
  CN: 'zh', TW: 'zh', HK: 'zh',
  IN: 'hi',                      // Hindi is the most widely spoken; the
                                  // catalogue also carries English, which an
                                  // English-speaking Indian chooses.
  JP: 'ja', KR: 'ko',

  // ---- Anglophone: deliberately ABSENT --------------------------------
  // US, GB, IE, AU, NZ, ZA have no entry. Their language is English, which
  // is already the final fallback, so an entry would claim a decision was
  // made when nothing was. The absence is the correct answer: it lets the
  // chain fall through to 'default' honestly.
  CA: 'fr',                       // Canada: French is the minority language
                                  // but the one a francophone Canadian wants.
  NG: 'en', GH: 'en',
})

export function localeForCountry(country: unknown): string | null {
  if (typeof country !== 'string') return null
  const code = country.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) return null
  const hit = COUNTRY_LOCALE[code]
  return isSupportedLocale(hit) ? (hit as string) : null
}

/**
 * The visitor's country, as the platform already knows it.
 *
 * Reads the edge header the CDN sets. Two names are checked because the app
 * has been deployed on both: x-vercel-ip-country (Vercel) and cf-ipcountry
 * (Cloudflare). Neither is more authoritative, so a fixed order is used and
 * the first non-empty one wins.
 *
 * 'XX' is what the edge sends when it cannot place the visitor - a VPN, a
 * Tor exit, an unallocated block. It is passed through rather than swallowed
 * so the caller can see that the lookup happened and found nothing, and
 * localeForCountry() maps it to null anyway.
 */
export function countryFromHeaders(
  headers: { get(name: string): string | null } | Record<string, string> | null | undefined
): string | null {
  if (!headers) return null
  const read = (name: string): string | null => {
    const v =
      typeof (headers as { get?: unknown }).get === 'function'
        ? (headers as { get(n: string): string | null }).get(name)
        : (headers as Record<string, string>)[name]
    if (typeof v !== 'string') return null
    const trimmed = v.trim()
    return trimmed.length ? trimmed : null
  }
  return read('x-vercel-ip-country') ?? read('cf-ipcountry') ?? read('x-country-code')
}

export type LocaleSource = 'user' | 'cookie' | 'company' | 'country' | 'browser' | 'default'

export type LocaleResolution = { locale: string; source: LocaleSource }

/**
 * The whole precedence chain, in one place, so the API route and the provider
 * cannot disagree about it.
 *
 * Note what is NOT here: no call to a geolocation service, and no write to
 * storage. Resolving a locale must never have a side effect - a signed-out
 * visitor is not a user, and persisting a guess for someone who has not
 * chosen anything would make the guess permanent after the first page view.
 */
export function resolveLocale(input: {
  user?: unknown
  cookie?: unknown
  company?: unknown
  country?: unknown
  acceptLanguage?: string | null
}): LocaleResolution {
  if (isSupportedLocale(input.user)) {
    return { locale: String(input.user).toLowerCase().trim(), source: 'user' }
  }
  if (isSupportedLocale(input.cookie)) {
    return { locale: String(input.cookie).toLowerCase().trim(), source: 'cookie' }
  }
  if (isSupportedLocale(input.company)) {
    return { locale: String(input.company).toLowerCase().trim(), source: 'company' }
  }

  // The country is consulted BEFORE the browser, but only ever as a tie-breaker
  // between people who have expressed no preference. matchAcceptLanguage is
  // used rather than negotiateLocale because it can report "the browser asked
  // for nothing we carry" - the one case where the country is allowed to
  // speak. negotiateLocale answers 'en' for both, which is exactly the
  // ambiguity this branch exists to avoid.
  const fromCountry = localeForCountry(input.country)
  const fromBrowser = matchAcceptLanguage(input.acceptLanguage)
  if (fromCountry && fromBrowser) {
    // Both have an opinion. A language the visitor's own browser asked for
    // outranks where they happen to be standing.
    return { locale: fromBrowser, source: 'browser' }
  }
  if (fromBrowser) {
    return { locale: fromBrowser, source: 'browser' }
  }
  if (fromCountry) {
    return { locale: fromCountry, source: 'country' }
  }

  return { locale: DEFAULT_LOCALE, source: 'default' }
}


// ------------------------------------------------------------ formatting

/**
 * Format a number for a locale.
 *
 * Uses Intl rather than a hand-rolled separator table, because Intl knows the
 * things that are easy to get wrong: Indian digit grouping (1,23,456 not
 * 123,456), and locales that use a non-breaking space as the group separator.
 */
export function formatNumberFor(
  value: number,
  locale: string,
  opts: Intl.NumberFormatOptions = {}
): string {
  if (!Number.isFinite(value)) return '—'
  return new Intl.NumberFormat(getLocale(locale).tag, opts).format(value)
}

/** A percentage, formatted for the locale. */
export function formatPercentFor(
  value: number,
  locale: string,
  fractionDigits = 0
): string {
  if (!Number.isFinite(value)) return '—'
  return new Intl.NumberFormat(getLocale(locale).tag, {
    style: 'percent',
    maximumFractionDigits: fractionDigits,
  }).format(value / 100)
}

/**
 * A date, formatted for the locale.
 *
 * Deliberately not time-zone aware here. The tenant's zone comes from
 * company_settings.timezone, and a date that shifts by a day because the
 * server is in UTC is a bug, not a formatting preference - so the zone is the
 * caller's decision, not this function's default.
 */
export function formatDateFor(
  value: string | number | Date | null | undefined,
  locale: string,
  opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }
): string {
  if (value === null || value === undefined || value === '') return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(getLocale(locale).tag, opts).format(date)
}

/**
 * A date in the tenant's own time zone.
 *
 * A deal closed at 23:30 in Nairobi belongs to the 23:30 of that day. Formatting
 * such a timestamp in UTC shows the next day, which is how a monthly revenue
 * total ends up in the wrong month.
 */
export function formatDateInTimezone(
  value: string | number | Date | null | undefined,
  locale: string,
  timezone: string,
  opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }
): string {
  if (value === null || value === undefined || value === '') return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  // An invalid zone must not throw; fall back to the locale default.
  try {
    return new Intl.DateTimeFormat(getLocale(locale).tag, { ...opts, timeZone: timezone }).format(date)
  } catch {
    return new Intl.DateTimeFormat(getLocale(locale).tag, opts).format(date)
  }
}

/** Is this time zone one the runtime recognises? */
export function isValidTimezone(tz: string | null | undefined): boolean {
  if (!tz) return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

/** Reading direction, for setting `dir` on a layout. */
export function directionFor(locale: string): 'ltr' | 'rtl' {
  return getLocale(locale).dir
}

/** Locales offered first in a picker. */
export function commonLocales(): Locale[] {
  return LOCALES.filter(x => x.common)
}

export function otherLocales(): Locale[] {
  return LOCALES.filter(x => !x.common)
}


/**
 * The locale this device chose, if any.
 *
 * Stored locally because a signed-out visitor has no server-side record - and
 * the landing page is the one page they can reach, so waiting on a 401 round
 * trip before showing their language is a visible flash of the wrong one.
 *
 * Deliberately in the lib rather than beside the switcher component: the
 * provider needs it, and a provider importing a component that imports the
 * provider is a cycle.
 */
export const LOCALE_STORAGE_KEY = 'union_locale'

export function readStoredLocale(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const v = window.localStorage.getItem(LOCALE_STORAGE_KEY)
    return v && BY_CODE.has(v) ? v : null
  } catch {
    // Private browsing can refuse storage. Falling back to negotiation is
    // better than throwing during render.
    return null
  }
}

export function storeLocale(code: string): void {
  if (typeof window === 'undefined' || !BY_CODE.has(code)) return
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, code)
  } catch {
    // A refused write is not a failure of the choice; it still applies to this
    // page view.
  }
}
