import { getSupabaseAdminClient } from '@/backend/database/supabase-config'
import { EmailService } from '@/backend/services/email-service'
import { SMSService } from '@/backend/services/sms-service'
import { tryPersonalizeForChannel } from '@/lib/message-personalization'

/**
 * Shared campaign delivery.
 *
 * Used by both POST /api/campaigns/[id]/send (send now) and
 * POST /api/cron/execute-scheduled-campaigns (send when due), so the two
 * paths can never drift in what they actually transmit.
 *
 * The original send route marked every recipient 'sent' and wrote a log row
 * without transmitting anything. Delivery is now real and per-recipient, and a
 * partial failure is reported as such instead of a blanket success.
 */

export interface DeliveryResult {
  recipientId: string
  contactId: string
  to: string | null
  status: 'delivered' | 'failed' | 'skipped'
  error?: string
}

export interface DeliverySummary {
  attempted: number
  delivered: number
  failed: number
  skipped: number
  status: 'sent' | 'partial' | 'failed'
  results: DeliveryResult[]
}

export async function deliverCampaign(
  supabase: any,
  campaignId: string,
  companyId: string,
  userId: string
): Promise<DeliverySummary> {
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .eq('company_id', companyId)
    .maybeSingle()

  if (campaignError || !campaign) {
    return { attempted: 0, delivered: 0, failed: 0, skipped: 0, status: 'failed', results: [] }
  }

  // Pending recipients with their contact. company_id on the join is
  // re-checked below so a recipient row cannot point at another tenant.
  // 'failed' is retryable, not terminal.
  //
  // Selecting pending rows only meant that once every recipient had failed -
  // a gateway outage, a bad address, a temporarily unconfigured mailbox - the
  // campaign could never be sent again. It sat in 'sending' forever and the
  // next Send reported "No recipients added to campaign", which reads as though
  // the user had forgotten to add anyone.
  //
  // The schema already allows 'failed' as a recipient state, and it is the
  // honest one to keep: the attempt happened, it did not succeed, and it is
  // still owed a send. delivered/read/clicked are excluded - those already
  // went out and re-sending would duplicate them.
  const { data: recipients, error: recipientsError } = await supabase
    .from('campaign_recipients')
    .select('id, contact_id, contact:contacts!inner(id, name, email, phone, company_id)')
    .eq('campaign_id', campaignId)
    .in('status', ['pending', 'failed'])

  if (recipientsError) {
    console.error('Error fetching recipients:', recipientsError)
    return { attempted: 0, delivered: 0, failed: 0, skipped: 0, status: 'failed', results: [] }
  }
  if (!recipients || recipients.length === 0) {
    return { attempted: 0, delivered: 0, failed: 0, skipped: 0, status: 'failed', results: [] }
  }

  const now = new Date().toISOString()
  const channel = String(campaign.type || campaign.channel || 'email').toLowerCase()
  const subject = campaign.subject || campaign.name || 'Campaign'
  const content = campaign.message || campaign.content || ''

  const results: DeliveryResult[] = []

  for (const recipient of recipients) {
    const contact: any = Array.isArray(recipient.contact) ? recipient.contact[0] : recipient.contact

    if (!contact || contact.company_id !== companyId) {
      await markRecipient(supabase, recipient.id, 'failed', 'Recipient contact not found in this company')
      results.push({ recipientId: recipient.id, contactId: recipient.contact_id, to: null, status: 'skipped' })
      continue
    }

    const to = channel === 'email' ? contact.email : contact.phone
    if (!to) {
      await markRecipient(supabase, recipient.id, 'failed', `No ${channel} address on contact`)
      results.push({
        recipientId: recipient.id, contactId: recipient.contact_id, to: null,
        status: 'failed', error: `No ${channel} address`,
      })
      continue
    }

    try {
      if (channel === 'email') {
        await EmailService.sendEmail(
          companyId, to, subject, content, undefined, campaign.template_id || undefined, true
        )
      } else if (channel === 'sms') {
        // SMS really does transmit. This branch used to report "not configured
        // on this deployment", which was untrue: twilio is a dependency and
        // SMSService.sendSMS is already the path the contact-message route, the
        // automation engine and the settings test all use. A campaign was the
        // only SMS send that never sent.
        //
        // Personalised like the contact-message route, then length-checked.
        // A campaign body is written for email and is routinely over 160
        // characters; sending it anyway makes Twilio split it into several
        // billed segments and the recipient gets the message chopped mid
        // sentence. That looks exactly like a gateway fault, so it is refused
        // on the recipient with the reason, instead.
        //
        // The subject is NOT prepended. It is often most of the 160 budget,
        // and the campaign name is already in the communication log.
        const personalised = tryPersonalizeForChannel(
          content,
          { name: contact.name, email: contact.email, phone: contact.phone, company: contact.company },
          'sms',
        )
        if (!personalised.ok) {
          await markRecipient(supabase, recipient.id, 'failed', personalised.error || 'Message cannot be personalised or is too long for SMS')
          results.push({
            recipientId: recipient.id, contactId: recipient.contact_id, to,
            status: 'failed', error: personalised.error || 'Not deliverable over SMS',
          })
          continue
        }
        const smsResults = await SMSService.sendSMS(companyId, String(to), personalised.message)
        const sent = Array.isArray(smsResults)
          ? smsResults.filter((r: any) => r.status === 'sent')
          : []
        if (sent.length === 0) {
          const why = Array.isArray(smsResults) && smsResults[0]?.error
            ? String(smsResults[0].error)
            : 'SMS gateway returned no successful send'
          await markRecipient(supabase, recipient.id, 'failed', why)
          results.push({ recipientId: recipient.id, contactId: recipient.contact_id, to, status: 'failed', error: why })
          continue
        }
      } else {
        // WhatsApp genuinely is not wired up: it needs a held session, which
        // cannot survive a serverless invocation. Saying so on the recipient is
        // the honest outcome, and it is the same limitation the QR page states.
        await markRecipient(supabase, recipient.id, 'failed', `WhatsApp delivery requires a connected session, which is not available in this deployment`)
        results.push({
          recipientId: recipient.id, contactId: recipient.contact_id, to,
          status: 'failed', error: `${channel} needs a connected WhatsApp session`,
        })
        continue
      }

      // The schema's funnel is pending -> delivered -> read -> clicked.
      // Writing 'sent' here left the row stuck one step behind, so the
      // performance route counted delivered=0 and reported a 0% delivery rate
      // for every campaign. 'sent_at' already records when it was sent.
      await markRecipient(supabase, recipient.id, 'delivered')
      results.push({ recipientId: recipient.id, contactId: recipient.contact_id, to, status: 'delivered' })
    } catch (err: any) {
      const message = err?.message || 'Send failed'
      await markRecipient(supabase, recipient.id, 'failed', message)
      results.push({
        recipientId: recipient.id, contactId: recipient.contact_id, to,
        status: 'failed', error: message,
      })
    }
  }

  const delivered = results.filter(r => r.status === 'delivered').length
  const failed = results.filter(r => r.status === 'failed').length
  const skipped = results.filter(r => r.status === 'skipped').length
  // Delivery outcome, independent of the stored campaign status.
  const status: DeliverySummary['status'] =
    delivered > 0 ? (delivered < results.length ? 'partial' : 'sent') : 'failed'

  // The campaigns.status CHECK constraint allows only
  // draft|scheduled|sending|sent|paused|cancelled|completed. Map the
  // delivery outcome onto it: anything not fully delivered is 'sending' so a
  // retry can pick the remaining pending recipients up, and the 'failed'
  // count still records what happened.
  const campaignStatus = status === 'sent' ? 'sent' : 'sending'

  // Communication log reflects what actually happened.
  const logs = results.map(r => ({
    id: crypto.randomUUID(),
    company_id: companyId,
    contact_id: r.contactId,
    campaign_id: campaignId,
    template_id: campaign.template_id,
    user_id: userId,
    channel,
    // The live constraint is communication_log_type_check, and I probed it
    // directly against the database rather than trusting a schema file:
    //
    //   ALLOWED: outbound | inbound | automated | scheduled
    //   REJECTED: campaign, manual, transactional, notification, survey, ...
    //
    // 'campaign' is what this used to write, so EVERY send failed its log
    // insert with 23514 and the communication history was silently empty. The
    // send itself still succeeded - the log write is the part that failed -
    // which is why delivery looked perfect and the history showed nothing.
    //
    // A campaign IS an outbound message, so 'outbound' is both accepted and
    // accurate. The campaign_id column on the same row carries the provenance,
    // so nothing is lost by not encoding it in `type`.
    type: 'outbound',
    subject,
    message: content,
    status: r.status === 'delivered' ? 'sent' : 'failed',
    sent_at: r.status === 'delivered' ? now : null,
    created_at: now,
  }))
  if (logs.length) {
    const { error: logError } = await supabase.from('communication_log').insert(logs)
    if (logError) console.error('Error creating communication logs:', logError)
  }

  await supabase
    .from('campaigns')
    .update({
      status: campaignStatus,
      sent_at: now,
      sent: delivered,
      // The column is `failed`, and the campaign status CHECK constraint only
      // allows draft|scheduled|sending|sent|paused|cancelled|completed - there
      // is no 'partial' or 'failed' status, so a row that used one would be
      // rejected outright and the counts would never land.
      failed,
      updated_at: now,
    })
    .eq('id', campaignId)
    .eq('company_id', companyId)

  return { attempted: results.length, delivered, failed, skipped, status, results }
}

async function markRecipient(
  supabase: any,
  recipientId: string,
  status: 'delivered' | 'failed',
  error?: string
) {
  const now = new Date().toISOString()
  const patch: any = {
    status,
    error_message: error || null,
    updated_at: now,
  }
  // Populate the matching funnel timestamp. The schema has sent_at,
  // delivered_at and failed_at, and analytics reads them.
  if (status === 'delivered') {
    patch.sent_at = now
    patch.delivered_at = now
  } else {
    patch.failed_at = now
  }
  await supabase
    .from('campaign_recipients')
    .update(patch)
    .eq('id', recipientId)
}
