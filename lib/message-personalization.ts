/**
 * Personalisation for messages sent to one person.
 *
 * WHY THIS EXISTS
 *
 * The app could send a campaign to a segment, schedule a message, and send a
 * WhatsApp message. None of those substituted anything: a template containing
 * {{name}} went out with the braces visible, which is how a personalisation
 * feature that does not personalise looks from the recipient's side.
 *
 * THE RULE THAT MATTERS MOST
 *
 * An unknown token is an ERROR, not a blank. Consider:
 *
 *     Dear , we would like to offer you 20% off.
 *
 * That is a message the sender cannot tell went out. It is worse than a
 * refusal, because a refusal is visible before anything is sent and this is
 * only visible afterwards, to a customer. So tryPersonalize() reports which
 * tokens it could not fill, and the send route refuses before calling the
 * provider.
 *
 * THE OTHER TWO RULES
 *
 * An empty value falls back to a stated default, so one template works for a
 * contact with no city and another with one. Without a default it is an error,
 * because that is the same problem as an unknown token wearing a different hat.
 *
 * A substituted value is never rescanned. A contact whose notes contain
 * "{{discount}}" cannot inject a token into the message that mentions them.
 *
 * SMS LENGTH
 *
 * 160 characters for GSM-7, 153 for a concatenated UCS-2 message. Over that
 * Twilio splits the text into several billed segments, and the recipient gets
 * a message chopped mid-sentence. It is refused here rather than sent and
 * discovered later on an invoice.
 */

/** The tokens a template may use. Each maps to a column contacts actually has. */
export const CONTACT_TOKENS = [
  'name',
  'email',
  'phone',
  'company',
  'address',
  'city',
  'state',
  'country',
  'notes',
] as const

export type ContactToken = (typeof CONTACT_TOKENS)[number]

/** A contact as far as personalisation is concerned. Extra keys are ignored. */
export type Personalisable = Partial<Record<string, unknown>>

export type PersonaliseFailure = {
  ok: false
  /** Tokens the template used that the contact cannot supply. */
  unknown: string[]
  /** Human-readable reason, for the UI. */
  error: string
  message: null
}

export type PersonaliseSuccess = {
  ok: true
  unknown: []
  error: null
  message: string
}

export type PersonaliseResult = PersonaliseSuccess | PersonaliseFailure

/** Twilio's GSM-7 single-segment limit. */
export const SMS_MAX_LENGTH = 160
/** The concatenated UCS-2 limit, which is lower because of the headers. */
export const SMS_MAX_LENGTH_UNICODE = 153

/**
 * Characters outside GSM-7 force the lower limit.
 *
 * GSM-7 is not just ASCII. Its basic table is 0x00-0x7F, but there is an
 * EXTENSION table for Latin-1 letters - à â ä å æ ç é è ê ë ï î ï ñ ô ö ò
 * ø ù û ü ÿ and the uppercase forms - which cost the same one byte as ASCII.
 * So "café" is a single-segment 160-character SMS, and treating it as
 * non-ASCII would refuse a message that sends fine for less than the price of
 * a Unicode one.
 *
 * Everything outside that - Arabic, Hindi, Chinese, Japanese, emoji, and the
 * punctuation a paste from a word processor brings along (en dash, curly
 * quotes) - is what switches the encoding to UCS-2, where a character costs two
 * bytes and the per-segment budget drops to 153.
 *
 * DEFINED BY CODE POINT, NOT BY LITERAL CHARACTERS
 *
 * A run of accented Latin-1 letters in the source is indistinguishable from a
 * double-encoded UTF-8 block, and the repository's own encoding test flags it
 * as mojibake. It was flagged here for exactly that reason. Stating the ranges
 * as numbers is also what the GSM-7 spec actually specifies, so it cannot drift
 * from a table copied off a web page.
 */
const GSM7_EXTENSION_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x00c0, 0x00ff], // Latin-1 supplement letters, upper then lower
  [0x2018, 0x201a], // left/right single quotation marks - in the GSM-7 table
  [0x203c, 0x203c], // double exclamation
  [0x20ac, 0x20ac], // euro
]

function isGsm7Extension(code: number): boolean {
  for (const [lo, hi] of GSM7_EXTENSION_RANGES) {
    if (code >= lo && code <= hi) return true
  }
  // The remaining documented extension characters are ASCII punctuation that is
  // already inside 0x00-0x7F, so they need no special case here.
  return false
}

function needsUnicode(s: string): boolean {
  for (const ch of s) {
    const code = ch.codePointAt(0)!
    if (code < 0x80) continue
    if (isGsm7Extension(code)) continue
    return true
  }
  return false
}

export function smsLimitFor(body: string): number {
  return needsUnicode(body) ? SMS_MAX_LENGTH_UNICODE : SMS_MAX_LENGTH
}

/**
 * Every token in a template, in first-appearance order, de-duplicated.
 *
 * Exported so a UI can offer an insert control and, more usefully, so a
 * template can be checked without a contact attached to it.
 */
export function tokensIn(template: string): string[] {
  const found: string[] = []
  const re = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(template)) !== null) {
    const name = m[1]
    if (!found.includes(name)) found.push(name)
  }
  return found
}

/**
 * Substitute contact values into a template.
 *
 * Throws nothing: use tryPersonalize() when you need to know why it failed,
 * which is the case for anything that is about to be sent.
 */
export function personalize(
  template: string,
  contact: Personalisable,
  defaults: Record<string, string> = {},
): string {
  const result = tryPersonalize(template, contact, defaults)
  if (!result.ok) {
    throw new Error(result.error)
  }
  return result.message
}

/**
 * Substitute, and report instead of throwing.
 *
 * The three failure modes are deliberately distinct, because they need
 * different messages to the user:
 *
 *   unknown tokens   - the template is wrong, or names a field that was removed
 *   missing values   - the template is fine, this contact has nothing for it
 *   too long for SMS - the channel is wrong for this body
 */
export function tryPersonalize(
  template: string,
  contact: Personalisable,
  defaults: Record<string, string> = {},
): PersonaliseResult {
  const tokens = tokensIn(template)

  // An empty or whitespace-only body is not a message. Refusing it here beats
  // asking a provider to send nothing.
  if (!template || !template.trim()) {
    return {
      ok: false,
      unknown: [],
      error: 'The message is empty.',
      message: null,
    }
  }

  const unknown: string[] = []
  const missing: string[] = []

  // Built by walking the template once and consuming tokens as they appear,
  // rather than by repeatedly replacing each token name: a value containing
  // "{{name}}" must survive untouched, and a second pass would rewrite it.
  let out = ''
  let cursor = 0
  const re = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(template)) !== null) {
    out += template.slice(cursor, m.index)
    cursor = m.index + m[0].length

    const name = m[1]
    const raw = contact[name]
    // `null`, `undefined` and '' all mean "this contact has no value here".
    // 0 and false are real values and must survive, so they are not folded in.
    const hasValue = raw !== undefined && raw !== null && String(raw).trim() !== ''

    if (hasValue) {
      out += String(raw)
      continue
    }
    if (Object.prototype.hasOwnProperty.call(defaults, name) && defaults[name]) {
      out += defaults[name]
      continue
    }
    if (!unknown.includes(name) && !(name in contact)) unknown.push(name)
    if (!missing.includes(name) && name in contact) missing.push(name)
    // Left as-is in `out` so the preview can show where it went wrong; the
    // result is a failure either way.
    out += m[0]
  }
  out += template.slice(cursor)

  if (unknown.length > 0) {
    return {
      ok: false,
      unknown,
      error:
        `This message uses ${unknown.map((u) => `"${u}"`).join(', ')}, which ${unknown.length === 1 ? 'is not a contact field' : 'are not contact fields'}. ` +
        `Available: ${CONTACT_TOKENS.join(', ')}.`,
      message: null,
    }
  }

  if (missing.length > 0) {
    return {
      ok: false,
      unknown: [],
      error:
        `${contact.name ? String(contact.name) : 'This contact'} has no ` +
        `${missing.map((u) => `"${u}"`).join(', ')}. Give ${missing.length === 1 ? 'it a default' : 'them defaults'} in the template, or remove ${missing.length === 1 ? 'it' : 'them'}.`,
      message: null,
    }
  }

  return { ok: true, unknown: [], error: null, message: out }
}

/**
 * Substitute, then check the result fits the channel.
 *
 * Split out because the SMS limit only applies to SMS: an email subject line
 * and body have no such limit, and applying 160 characters to an email would
 * refuse messages that are perfectly fine.
 */
export function tryPersonalizeForChannel(
  template: string,
  contact: Personalisable,
  channel: 'email' | 'sms',
  defaults: Record<string, string> = {},
): PersonaliseResult {
  const result = tryPersonalize(template, contact, defaults)
  if (!result.ok) return result

  if (channel === 'sms') {
    const limit = smsLimitFor(result.message)
    if (result.message.length > limit) {
      return {
        ok: false,
        unknown: [],
        error:
          `This message is ${result.message.length} characters. An SMS must be ${limit} or fewer, ` +
          `because anything longer is split into several billed segments and arrives chopped.`,
        message: null,
      }
    }
  }

  return result
}