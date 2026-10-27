/**
 * One personalised message to one lead or deal.
 *
 * WHY THIS IS A SHARED MODULE AND NOT TWO COPIES
 *
 * A lead and a deal are both "a row with a person on it, addressed by that
 * person's email or phone", and the rules that make a send safe are identical
 * for both: read the record inside the caller's own tenant, refuse a token that
 * cannot be filled, refuse an SMS over the length limit, resolve the subject
 * with the same rules as the body, and record what happened afterwards. Written
 * twice, those rules would drift within a month, and the drift would be the
 * kind nobody notices - one copy refuses an over-long SMS and the other sends
 * it chopped mid-sentence.
 *
 * WHY NOT JUST REUSE THE CONTACT ROUTE
 *
 * Because most leads have no contact at all. POST /api/leads inserts name,
 * email and phone and never writes contact_id, so a manually created lead is
 * exactly the case that needs messaging and is unreachable through
 * /api/contacts/[id]/message. A dead control on the majority of rows is worse
 * than one more route, so leads and deals get their own endpoints and this
 * module is the single implementation behind both.
 *
 * THE TENANT IS NEVER FROM THE REQUEST
 *
 * company_id comes from the caller's own users row, and the record read is
 * filtered by it. A lead id from another tenant is therefore a 404 and not a
 * message sent to somebody else's customer. 404 rather than 403 on purpose: a
 * record belonging to another tenant has to be indistinguishable from one that
 * does not exist, or this endpoint becomes a way to confirm that a given id
 * exists somewhere.
 *
 * A DEAL WITH NO ADDRESS OF ITS OWN
 *
 * deals carries email/phone columns, but a deal created from a lead often has
 * them empty while contact_id points at the person. In that case the contact is
 * read - also scoped to the same company - and its address is used. Same
 * person, one message; refusing it would mean the user has to find the contact
 * record first for no reason.
 */

import { getSupabaseAdminClient } from '@/backend/database/supabase-config'
import { logActivity } from '@/backend/database/db-api'
import { tryPersonalizeForChannel, tokensIn, CONTACT_TOKENS } from '@/lib/message-personalization'
import { EmailService } from '@/backend/services/email-service'
import { SMSService } from '@/backend/services/sms-service'

export type MessageChannel = 'email' | 'sms'

/** Which table a record lives in. Only these two are accepted. */
export type RecordKind = 'leads' | 'deals'

/**
 * The personalisable projection. Deliberately narrow: five fields, all of them
 * columns leads and deals actually have, and all of them named in
 * CONTACT_TOKENS. Adding a field the engine does not declare would produce a
 * token that works in the editor and is refused by the next reader of the
 * engine's list.
 */
export type MessagePerson = {
  name: string
  email: string
  phone: string
  company: string
  notes: string
}

/** The result a route turns into JSON. */
export type RecordMessageOutcome =
  | { status: number; body: Record<string, unknown> }

type SendArgs = {
  kind: RecordKind
  recordId: string
  companyId: string
  userId: string
  channel: MessageChannel
  template: string
  subject: string
  html: boolean
  defaults: Record<string, string>
  dryRun: boolean
}

/**
 * Build the route's reply. The name is deliberately neutral: a 200 is as much
 * a "refusal-shaped" value as a 422, and naming every one of them FAIL made the
 * success paths read as failures.
 */
const reply = (status: number, body: Record<string, unknown>): RecordMessageOutcome => ({
  status,
  body,
})

/** Trimmed string, or ''. `null`, undefined and '   ' all mean "not set". */
function text(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

/**
 * Only string defaults, and only for tokens the engine declares. A default
 * arriving for an unknown token would hide the very mistake the personaliser
 * exists to surface.
 */
export function collectDefaults(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === 'string' && (CONTACT_TOKENS as readonly string[]).includes(k)) out[k] = v
    }
  }
  return out
}

/** The parts of a send request that do not come from the URL or the session. */
export type SendRequest = Pick<SendArgs, 'channel' | 'template' | 'subject' | 'html' | 'defaults' | 'dryRun'>

/** Validate the channel, the body and the defaults. Runs before any database read. */
export function parseSendRequest(
  body: Record<string, unknown> | null,
): { ok: true; value: SendRequest } | { ok: false; outcome: RecordMessageOutcome } {
  const channel = body?.channel === 'email' || body?.channel === 'sms' ? (body.channel as MessageChannel) : null
  if (!channel) return { ok: false, outcome: reply(400, { error: 'Choose a channel: email or sms.' }) }

  const template = typeof body?.message === 'string' ? body.message : ''
  if (!template.trim()) return { ok: false, outcome: reply(400, { error: 'The message is empty.' }) }

  return {
    ok: true,
    value: {
      channel,
      template,
      subject: typeof body?.subject === 'string' ? body.subject : '',
      html: body?.html === true,
      defaults: collectDefaults(body?.defaults),
      dryRun: body?.dryRun === true,
    },
  }
}

/**
 * Send, or preview with dryRun, one personalised message to one lead or deal.
 *
 * Every refusal happens BEFORE the provider is called. A message that went out
 * with "Dear , we would like to offer you" is worse than a refusal, because the
 * sender cannot tell it went out and the customer can.
 */
export async function sendToRecord(args: SendArgs): Promise<RecordMessageOutcome> {
  const { kind, recordId, companyId, userId, channel, template, defaults, dryRun } = args
  let subject = args.subject
  const supabase = getSupabaseAdminClient()

  // ---- the record, inside this tenant only ------------------------------
  const { data: record, error: recordError } = await supabase
    .from(kind)
    .select('id, contact_id, name, email, phone, company, notes')
    .eq('id', recordId)
    .eq('company_id', companyId)
    .maybeSingle()

  if (recordError) {
    return reply(500, { error: `Could not read the ${kind.slice(0, -1)}: ${recordError.message}` })
  }
  // 404 rather than 403: see the note at the top of this file.
  if (!record) return reply(404, { error: kind === 'leads' ? 'Lead not found' : 'Deal not found' })

  // ---- fall back to the linked contact, same tenant --------------------
  // A deal built from a lead routinely has empty email/phone while
  // contact_id names the person. Same person, so same message.
  let contact: { id: string; name?: string; email?: string; phone?: string; company?: string; notes?: string } | null = null
  if (record.contact_id) {
    const { data } = await supabase
      .from('contacts')
      .select('id, name, email, phone, company, notes')
      .eq('id', record.contact_id)
      .eq('company_id', companyId)
      .maybeSingle()
    contact = data ?? null
  }

  const person: MessagePerson = {
    name: text(record.name) || text(contact?.name),
    email: text(record.email) || text(contact?.email),
    phone: text(record.phone) || text(contact?.phone),
    company: text(record.company) || text(contact?.company),
    notes: text(record.notes) || text(contact?.notes),
  }
  const label = person.name || (kind === 'leads' ? 'This lead' : 'This deal')

  // ---- can this channel even reach them? -------------------------------
  // Checked before personalisation, so the user is told the real problem
  // first: a missing phone number is not fixable by editing the message.
  const destination = channel === 'email' ? person.email : person.phone
  if (!destination) {
    return reply(422, {
      error:
        channel === 'email'
          ? `${label} has no email address. Add one to their record first.`
          : `${label} has no phone number. Add one to their record first.`,
      field: channel,
      recordId,
      sent: false,
    })
  }

  // ---- personalise ------------------------------------------------------
  const result = tryPersonalizeForChannel(template, person, channel, defaults)
  if (!result.ok) {
    // 422, not 400: the request was well formed and understood, the content
    // just cannot be sent. Nothing was sent.
    return reply(422, {
      error: result.error,
      unknownTokens: result.unknown,
      tokens: tokensIn(template),
      availableTokens: CONTACT_TOKENS,
      recordId,
      sent: false,
    })
  }

  // The subject is personalised too. A subject that failed while the body
  // succeeded would put "{{company}}" in a mailbox subject line.
  if (subject.trim()) {
    const subjectResult = tryPersonalizeForChannel(subject, person, 'email', defaults)
    if (!subjectResult.ok) {
      return reply(422, {
        error: `Subject: ${subjectResult.error}`,
        unknownTokens: subjectResult.unknown,
        sent: false,
      })
    }
    subject = subjectResult.message
  }

  if (dryRun) {
    return reply(200, {
      ok: true,
      dryRun: true,
      sent: false,
      channel,
      destination,
      preview: result.message,
      previewSubject: subject || null,
      characters: result.message.length,
      limit: channel === 'sms' ? 160 : null,
      recordId,
    })
  }

  // ---- actually send ---------------------------------------------------
  let providerId: string | null = null

  if (channel === 'email') {
    if (!subject.trim()) {
      return reply(422, { error: 'An email needs a subject line.', sent: false })
    }
    await EmailService.sendEmail(
      companyId,
      destination,
      subject,
      result.message,
      undefined,
      undefined,
      args.html
    )
    // The SMTP service does not surface a provider id for a single send, so
    // none is recorded. A fabricated one would be worse than none.
  } else {
    const results = await SMSService.sendSMS(companyId, destination, result.message)
    const first = Array.isArray(results) ? results[0] : undefined
    if (!first || first.status !== 'sent') {
      const detail = first && 'error' in first ? String(first.error) : 'no response'
      return reply(502, { error: `The SMS provider did not accept the message: ${detail}`, sent: false })
    }
    providerId = first.messageId ?? null
  }

  // ---- record what happened ---------------------------------------------
  // Best effort by design. The message HAS gone out at this point, so a failed
  // log must not turn a successful send into a 500 and leave the user
  // believing it did not.
  try {
    await logActivity({
      action: channel === 'email' ? 'contact_email_sent' : 'contact_sms_sent',
      user_id: userId,
      company_id: companyId,
      resource: kind,
      resource_id: recordId,
      details: {
        channel,
        to: destination,
        subject: channel === 'email' ? subject : null,
        characters: result.message.length,
        providerId,
      },
    })
  } catch (logError) {
    console.error('Message sent but the activity log failed:', logError)
  }

  // The contact's own record carries when they were last reached, which the
  // "no contact in N days" filters read. The column is TEXT in the schema, so
  // a full ISO instant would not match what the other writers put there.
  const contactId = text(record.contact_id) || (contact ? contact.id : '')
  if (contactId) {
    try {
      await supabase
        .from('contacts')
        .update({ last_contact_date: new Date().toISOString().slice(0, 10) })
        .eq('id', contactId)
        .eq('company_id', companyId)
    } catch (updateError) {
      console.error('Message sent but last_contact_date did not update:', updateError)
    }
  }

  return reply(200, {
    ok: true,
    sent: true,
    channel,
    destination,
    providerId,
    characters: result.message.length,
    contactId: contactId || null,
    recordId,
  })
}
