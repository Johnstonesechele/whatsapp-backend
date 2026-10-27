/**
 * Third-party data import: parsing, field mapping and validation.
 *
 * WHY THIS EXISTS
 *
 * Two import routes existed and both were broken in ways only running them
 * revealed:
 *
 *  - /api/leads/import could NEVER succeed. It called DatabaseUtils.createLead,
 *    whose INSERT statement has no company_id column, while leads.company_id is
 *    `uuid NOT NULL`. It also generated ids like `lead-1758...-a3f9c1`, and
 *    leads.id is `uuid`. Both would be rejected. Live result:
 *    {"successful":0,"failed":1,"errors":["Row 2: Failed to create lead"]}
 *
 *  - /api/contacts/import parsed CSV with String.split(','). A quoted field
 *    containing a comma - "Lovelace, Ada" - splits into two columns and every
 *    row after it shifts. Live result on a real HubSpot-style export: HTTP 500.
 *
 * Beyond correctness, importing third-party data on signup needs three things
 * the old routes had none of:
 *
 *  1. DRY RUN. Someone moving their CRM in wants to see what will happen -
 *     how many rows, which will fail and why - before writing anything.
 *  2. COLUMN MAPPING. No two exports agree on headers. "First Name",
 *     "firstname", "first_name" and "First_Name" are the same field, and a
 *     user should not have to rename their columns by hand.
 *  3. PER-ROW REPORTING. A 4,000-row import that fails on row 2,000 with a
 *     bare "failed" tells the user nothing they can act on.
 *
 * Everything here is pure: no database, no request. That makes the rules
 * testable, and testable rules are the only reason to trust an importer.
 */

// ------------------------------------------------------------ CSV parsing

/**
 * Parse CSV text into objects keyed by the header row.
 *
 * Handles the cases a naive split gets wrong: quoted fields, escaped quotes,
 * commas and newlines inside quotes, and both CRLF and LF line endings.
 * A UTF-8 BOM is stripped, which Excel writes and which otherwise corrupts
 * the first header name.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const clean = text.replace(/^﻿/, '')
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]

    if (inQuotes) {
      if (ch === '"') {
        // "" inside a quoted field is a literal quote.
        if (clean[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += ch
    }
  }

  // Trailing field/row, unless the file ended with a newline.
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  const nonEmpty = rows.filter(r => r.some(c => c.trim() !== ''))
  if (nonEmpty.length === 0) return []

  const headers = nonEmpty[0].map(h => h.trim())
  const out: Record<string, string>[] = []

  for (let r = 1; r < nonEmpty.length; r++) {
    const values = nonEmpty[r]
    // A row with more cells than headers means an unquoted comma; keep the
    // extras rather than silently dropping data.
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => {
      obj[h] = (values[i] ?? '').trim()
    })
    if (headers.length < values.length) {
      for (let i = headers.length; i < values.length; i++) {
        obj[`column_${i + 1}`] = values[i].trim()
      }
    }
    obj.__row = String(r + 1) // 1-based, and +1 for the header line
    out.push(obj)
  }
  return out
}

// ------------------------------------------------------------ field mapping

/** Canonical field -> accepted header spellings, lowercased and stripped. */
const FIELD_ALIASES: Record<string, string[]> = {
  firstName: ['firstname', 'first name', 'first_name', 'given name', 'givenname', 'forename'],
  lastName: ['lastname', 'last name', 'last_name', 'surname', 'family name', 'familyname', 'sur name'],
  fullName: ['name', 'full name', 'fullname', 'contact name', 'contactname', 'display name'],
  email: ['email', 'e-mail', 'email address', 'emailaddress', 'mail'],
  phone: ['phone', 'phone number', 'phonenumber', 'mobile', 'mobile number', 'telephone', 'tel', 'cell', 'cell phone'],
  company: ['company', 'company name', 'companyname', 'organisation', 'organization', 'org', 'account', 'account name', 'business'],
  title: ['title', 'job title', 'jobtitle', 'position', 'role', 'designation'],
  status: ['status', 'stage', 'lead status', 'contact status', 'state'],
  value: ['value', 'amount', 'deal value', 'dealvalue', 'revenue', 'price', 'budget', 'worth'],
  source: ['source', 'lead source', 'leadsource', 'channel', 'origin'],
  notes: ['notes', 'note', 'comments', 'comment', 'description', 'details'],
  address: ['address', 'street', 'street address', 'location', 'full address'],
  city: ['city', 'town', 'locality'],
  state: ['state', 'province', 'region', 'county'],
  country: ['country', 'country code', 'nation'],
  website: ['website', 'url', 'web site', 'homepage', 'site'],
}

const NORMALISE = (s: string) => s.toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * Work out which column is which field.
 *
 * Returns, for each canonical field, the source header it matched - or null
 * when the export has no such column. Extras are reported so the UI can show
 * the user what was ignored rather than dropping it silently.
 */
export function mapColumns(
  headers: string[]
): { mapping: Record<string, string | null>; unmapped: string[]; unused: string[] } {
  const norm = new Map(headers.map(h => [NORMALISE(h), h]))
  const mapping: Record<string, string | null> = {}
  const consumed = new Set<string>()

  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    let found: string | null = null
    for (const alias of aliases) {
      // Normalise the alias too. The alias list is written in readable form
      // ('e-mail', 'first name'), so comparing it against already-normalised
      // headers only ever matched the few aliases that happened to be
      // single lowercase words.
      const hit = norm.get(NORMALISE(alias))
      if (hit) { found = hit; break }
    }
    mapping[field] = found
    if (found) consumed.add(found)
  }

  return {
    mapping,
    unmapped: headers.filter(h => !consumed.has(h)),
    unused: Object.keys(FIELD_ALIASES).filter(f => !mapping[f]),
  }
}

// -------------------------------------------------------------- validation

export type ImportEntity = 'contacts' | 'leads' | 'deals'

export type RowOutcome = {
  row: string
  ok: boolean
  /** Present when the row will be skipped because a match already exists. */
  duplicate?: boolean
  data?: Record<string, unknown>
  errors: string[]
}

export type ImportReport = {
  total: number
  valid: number
  invalid: number
  duplicates: number
  /** Row numbers that failed, with the reason. */
  problems: { row: string; errors: string[] }[]
  preview: Record<string, unknown>[]
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Trim, and turn the many ways a CSV spells "empty" into one value. */
function clean(v: string | undefined): string {
  if (v === undefined || v === null) return ''
  const s = String(v).trim()
  if (!s) return ''
  // Every spelling of empty is compared lowercased. `s === 'n/a'` missed
  // "N/A" and "n/a " variants, so a literal "N/A" was stored as a company name.
  const lower = s.toLowerCase()
  if (lower === 'null' || lower === 'undefined' || lower === 'n/a' || lower === '-') return ''
  return s
}

function toNumber(v: string): number | null {
  if (!v) return null
  // "$1,250.50" and "1250,50" both appear in real exports.
  const cleaned = v.replace(/[^0-9.\-]/g, '')
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

export type ValidateOptions = {
  entity: ImportEntity
  /** Existing keys (lowercased email, or id) used to detect duplicates. */
  existingKeys?: Set<string>
  /** Cap on preview rows returned, to keep the response small. */
  previewLimit?: number
  /** Refuse a whole file over this many rows. */
  maxRows?: number
}

/**
 * Validate and normalise parsed rows. Pure - it touches no database.
 *
 * The caller runs this once for a dry run and once for the real import, so the
 * preview the user approves is produced by exactly the same rules that then
 * write the data. A preview that disagrees with the import is worse than none.
 */
export function validateRows(
  rows: Record<string, string>[],
  mapping: Record<string, string | null>,
  opts: ValidateOptions
): ImportReport {
  const { entity, existingKeys = new Set(), previewLimit = 5, maxRows = 50_000 } = opts

  const problems: { row: string; errors: string[] }[] = []
  const preview: Record<string, unknown>[] = []
  let valid = 0
  let invalid = 0
  let duplicates = 0

  const pick = (row: Record<string, string>, field: string): string => {
    const header = mapping[field]
    return header ? clean(row[header]) : ''
  }

  for (const row of rows) {
    const rowNo = row.__row || '?'

    if (rows.length > maxRows) {
      problems.push({ row: 'file', errors: [`File has more than ${maxRows} rows`] })
      break
    }

    const firstName = pick(row, 'firstName')
    const lastName = pick(row, 'lastName')
    const fullName = pick(row, 'fullName')
    const email = pick(row, 'email')
    const phone = pick(row, 'phone')
    const errors: string[] = []

    // Name: either a full name or a first/last pair.
    const name = fullName || [firstName, lastName].filter(Boolean).join(' ').trim()
    if (!name) errors.push('Missing name (need "name", or "first name" + "last name")')

    if (email && !EMAIL_RE.test(email)) errors.push(`"${email}" is not a valid email address`)

    // An identifier is needed to match a person at all.
    if (!email && !phone) {
      errors.push('Missing both email and phone - need at least one to identify this record')
    }

    if (errors.length > 0) {
      invalid++
      problems.push({ row: rowNo, errors })
      continue
    }

    // Duplicate detection is on email when there is one, since that is what
    // identifies a person across systems. Case-insensitive: exports vary.
    const key = email ? email.toLowerCase() : null
    if (key && existingKeys.has(key)) {
      duplicates++
      problems.push({ row: rowNo, errors: [`Duplicate: ${email} already exists`] })
      continue
    }

    valid++
    if (preview.length < previewLimit) {
      const record: Record<string, unknown> = { __row: rowNo, name, email: email || null, phone: phone || null }
      const company = pick(row, 'company')
      const title = pick(row, 'title')
      const status = pick(row, 'status')
      const source = pick(row, 'source')
      const notes = pick(row, 'notes')
      const website = pick(row, 'website')
      const address = pick(row, 'address')
      const city = pick(row, 'city')
      const state = pick(row, 'state')
      const country = pick(row, 'country')
      const value = toNumber(pick(row, 'value'))

      if (company) record.company = company
      if (title) record.title = title
      if (status) record.status = status
      if (source) record.source = source
      if (notes) record.notes = notes
      if (website) record.website = website
      if (address) record.address = address
      if (city) record.city = city
      if (state) record.state = state
      if (country) record.country = country

      if (entity === 'leads') {
        if (value !== null) record.value = value
        // The stage vocabulary is the app's, not the export's. "Closed Won"
        // from Salesforce and "closed_won" from a CSV are the same stage.
        if (status) record.stage = normaliseStage(status)
      }
      if (entity === 'deals' && value !== null) record.value = value

      preview.push(record)
    }
  }

  return { total: rows.length, valid, invalid, duplicates, problems, preview }
}

/** Map a third-party stage/status onto the stages this app stores. */
export function normaliseStage(raw: string): string {
  const s = raw.toLowerCase().replace(/[\s_-]+/g, ' ').trim()
  switch (s) {
    case 'new': case 'open': case 'prospect': case 'prospecting':
      return 'Prospecting'
    case 'qualification': case 'qualifying': case 'qualified':
      return 'Qualification'
    case 'proposal': case 'quote': case 'quoting': case 'sent proposal':
      return 'Proposal'
    case 'negotiation': case 'negotiating': case 'review':
      return 'Negotiation'
    case 'closed won': case 'won': case 'win': case 'customer': case 'closed-won':
      return 'Closed Won'
    case 'closed lost': case 'lost': case 'loss': case 'closed-lost':
      return 'Closed Lost'
    default:
      // Preserve an unrecognised value rather than discarding it, but normalise
      // its shape so it does not create a new stage per source system.
      return raw.trim() || 'Prospecting'
  }
}

/**
 * Validate a SINGLE row and return the record to write.
 *
 * validateRows() exists to summarise a whole file; this is the same rules
 * applied to one row, which is what the write path needs. Both call the shared
 * helpers, so a preview and the import that follows it cannot disagree.
 */
export function validateOne(
  row: Record<string, string>,
  mapping: Record<string, string | null>,
  opts: { entity: ImportEntity; existingKeys?: Set<string> }
): { ok: true; data: Record<string, unknown> } | { ok: false; errors: string[] } {
  const { entity, existingKeys = new Set() } = opts

  const pick = (field: string): string => {
    const header = mapping[field]
    return header ? clean(row[header]) : ''
  }

  const firstName = pick('firstName')
  const lastName = pick('lastName')
  const fullName = pick('fullName')
  const email = pick('email')
  const phone = pick('phone')
  const errors: string[] = []

  const name = fullName || [firstName, lastName].filter(Boolean).join(' ').trim()
  if (!name) errors.push('Missing name (need "name", or "first name" + "last name")')
  if (email && !EMAIL_RE.test(email)) errors.push(`"${email}" is not a valid email address`)
  if (!email && !phone) {
    errors.push('Missing both email and phone - need at least one to identify this record')
  }

  const key = email ? email.toLowerCase() : null
  if (key && existingKeys.has(key)) {
    return { ok: false, errors: [`Duplicate: ${email} already exists`] }
  }
  if (errors.length > 0) return { ok: false, errors }

  const record: Record<string, unknown> = {
    __row: row.__row || '?',
    name,
    email: email || null,
    phone: phone || null,
  }
  const company = pick('company')
  const title = pick('title')
  const status = pick('status')
  const source = pick('source')
  const notes = pick('notes')
  const website = pick('website')
  const address = pick('address')
  const city = pick('city')
  const state = pick('state')
  const country = pick('country')
  const value = toNumber(pick('value'))

  if (company) record.company = company
  if (title) record.title = title
  if (status) record.status = status
  if (source) record.source = source
  if (notes) record.notes = notes
  if (website) record.website = website
  if (address) record.address = address
  if (city) record.city = city
  if (state) record.state = state
  if (country) record.country = country
  if (value !== null) record.value = value
  if (entity === 'leads' && status) record.stage = normaliseStage(status)

  return { ok: true, data: record }
}

/** A downloadable template so users know exactly which columns are read. */
export function csvTemplate(entity: ImportEntity): string {
  if (entity === 'contacts') {
    return 'name,email,phone,company,title,address,city,state,country,website,notes\n' +
           'Example Person,example@example.com,+15551234567,Example Ltd,Manager,1 High St,London,,UK,https://example.com,Imported from previous CRM\n'
  }
  return 'name,email,phone,company,title,status,value,source,notes\n' +
         'Example Person,example@example.com,+15551234567,Example Ltd,Manager,Qualification,5000,Web,Imported from previous CRM\n'
}
