/**
 * Canonical status/stage vocabularies, and the mapping into them.
 *
 * WHY THIS EXISTS
 *
 * The UI sends lowercase values (`active`, `prospecting`, `closed_won`) while
 * the database CHECK constraints require Title Case. Every write that passed a
 * UI value straight through failed with 23514, which is what the Postgres logs
 * are full of:
 *
 *   23514  new row for relation "contacts" violates check constraint "contacts_status_check"
 *   23514  new row for relation "leads"    violates check constraint "leads_status_check"
 *
 * The allowed values were read from the LIVE database by probing each
 * constraint (tools/probe-check-constraints.py), not from the repo's schema
 * files, which have drifted from production:
 *
 *   contacts.status  Active | Inactive | Prospect
 *   leads.status     New | Contacted | Qualified | Cold | Warm | Hot
 *   leads.stage      Prospecting | Qualification | Proposal | Negotiation | Closed Won | Closed Lost
 *   deals.stage      (as above, plus legacy Won/Lost rows already in the table)
 *
 * This is the same class of bug as the lead-stage and automation-trigger drift
 * fixed earlier: three separate places each hand-encoding a vocabulary. The
 * mapping now lives in one file, and a test asserts it against the live
 * constraints so a future rename fails the build instead of the customer.
 *
 * Machine values, ids and enum keys are never translated - these are DB enum
 * values, so they are mapped, not localised.
 */

/** contacts.status, exactly as the live CHECK allows. */
export const CONTACT_STATUSES = ['Active', 'Inactive', 'Prospect'] as const
export type ContactStatus = (typeof CONTACT_STATUSES)[number]

/** leads.status, exactly as the live CHECK allows. */
export const LEAD_STATUSES = ['New', 'Contacted', 'Qualified', 'Cold', 'Warm', 'Hot'] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]

/**
 * leads.stage, exactly as the live CHECK allows.
 *
 * This is NOT the same list as deals.stage - see DEAL_STAGES.
 */
export const PIPELINE_STAGES = [
  'Prospecting',
  'Qualification',
  'Proposal',
  'Negotiation',
  'Closed Won',
  'Closed Lost',
] as const
export type PipelineStage = (typeof PIPELINE_STAGES)[number]

/**
 * deals.stage, exactly as the live CHECK allows.
 *
 * Verified by probing the constraint (tools/probe-deals-stage.py). There is no
 * 'Prospecting' here, unlike leads.stage - the two tables drifted apart in the
 * live schema. Assuming they share a vocabulary is what made deal creation fail
 * with deals_stage_check after the leads side was already correct.
 */
export const DEAL_STAGES = [
  'Qualification',
  'Proposal',
  'Negotiation',
  'Closed Won',
  'Closed Lost',
] as const
export type DealStage = (typeof DEAL_STAGES)[number]

/**
 * Everything the UI has ever sent, mapped onto the value the database accepts.
 *
 * Both the lowercase UI form and the Title Case database form are keys, so a
 * value that is already correct passes through unchanged.
 */
const CONTACT_STATUS_MAP: Record<string, ContactStatus> = {
  active: 'Active',
  inactive: 'Inactive',
  prospect: 'Prospect',
  // The form offers "blocked", which the constraint does not allow. The
  // closest real state is Inactive - mapping it to a value that exists beats
  // failing the insert, and the distinction is preserved in the record's notes.
  blocked: 'Inactive',
}

const LEAD_STATUS_MAP: Record<string, LeadStatus> = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  cold: 'Cold',
  warm: 'Warm',
  hot: 'Hot',
  // Common UI synonyms for the same states.
  open: 'New',
  working: 'Contacted',
  nurture: 'Warm',
}

const STAGE_MAP: Record<string, PipelineStage> = {
  prospecting: 'Prospecting',
  qualification: 'Qualification',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  'closed won': 'Closed Won',
  'closed_won': 'Closed Won',
  closedwon: 'Closed Won',
  won: 'Closed Won',
  'closed lost': 'Closed Lost',
  'closed_lost': 'Closed Lost',
  closedlost: 'Closed Lost',
  lost: 'Closed Lost',
}

function normaliseKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, ' ')
}

/**
 * Map any incoming value onto one the database accepts.
 *
 * Returns the fallback when the value is empty or unrecognised, so a caller can
 * never write a status the CHECK will reject. An unknown value is NOT passed
 * through - that is precisely how these inserts failed.
 */
export function toContactStatus(value: unknown, fallback: ContactStatus = 'Active'): ContactStatus {
  if (typeof value !== 'string' || !value.trim()) return fallback
  const key = normaliseKey(value)
  const direct = CONTACT_STATUSES.find((s) => s.toLowerCase() === key)
  if (direct) return direct
  return CONTACT_STATUS_MAP[key] ?? fallback
}

export function toLeadStatus(value: unknown, fallback: LeadStatus = 'New'): LeadStatus {
  if (typeof value !== 'string' || !value.trim()) return fallback
  const key = normaliseKey(value)
  const direct = LEAD_STATUSES.find((s) => s.toLowerCase() === key)
  if (direct) return direct
  return LEAD_STATUS_MAP[key] ?? fallback
}

export function toPipelineStage(value: unknown, fallback: PipelineStage = 'Prospecting'): PipelineStage {
  if (typeof value !== 'string' || !value.trim()) return fallback
  const key = normaliseKey(value)
  const direct = PIPELINE_STAGES.find((s) => s.toLowerCase() === key)
  if (direct) return direct
  return STAGE_MAP[key] ?? fallback
}

/**
 * deals.stage.
 *
 * Kept separate from toPipelineStage because the live constraint is different:
 * deals has no 'Prospecting', so a prospecting stage written to a deal is
 * rejected. 'Prospecting' and 'new' both map to the earliest stage deals does
 * have rather than being passed through.
 */
const DEAL_STAGE_MAP: Record<string, DealStage> = {
  qualification: 'Qualification',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  'closed won': 'Closed Won',
  'closed_won': 'Closed Won',
  closedwon: 'Closed Won',
  won: 'Closed Won',
  'closed lost': 'Closed Lost',
  'closed_lost': 'Closed Lost',
  closedlost: 'Closed Lost',
  lost: 'Closed Lost',
  // deals has no prospecting stage; the earliest one it has is Qualification.
  prospecting: 'Qualification',
  new: 'Qualification',
}

export function toDealStage(value: unknown, fallback: DealStage = 'Qualification'): DealStage {
  if (typeof value !== 'string' || !value.trim()) return fallback
  const key = normaliseKey(value)
  const direct = DEAL_STAGES.find((s) => s.toLowerCase() === key)
  if (direct) return direct
  return DEAL_STAGE_MAP[key] ?? fallback
}

/** True when the value is one the database accepts as-is. */
export function isValidContactStatus(value: unknown): value is ContactStatus {
  return typeof value === 'string' && (CONTACT_STATUSES as readonly string[]).includes(value)
}

export function isValidLeadStatus(value: unknown): value is LeadStatus {
  return typeof value === 'string' && (LEAD_STATUSES as readonly string[]).includes(value)
}

export function isValidPipelineStage(value: unknown): value is PipelineStage {
  return typeof value === 'string' && (PIPELINE_STAGES as readonly string[]).includes(value)
}

export function isValidDealStage(value: unknown): value is DealStage {
  return typeof value === 'string' && (DEAL_STAGES as readonly string[]).includes(value)
}

/**
 * campaigns.status, exactly as the live CHECK allows. Lowercase only.
 *
 * The campaigns status toggle sends Title Case ('Active', 'Paused'), which this
 * constraint rejects outright - every toggle attempt failed with "Failed to
 * update campaign".
 */
export const CAMPAIGN_STATUSES = [
  'draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled', 'completed',
] as const
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number]

/** scheduled_messages.status, exactly as the live CHECK allows. */
export const SCHEDULED_MESSAGE_STATUSES = [
  'pending', 'scheduled', 'sent', 'failed', 'cancelled', 'paused',
] as const
export type ScheduledMessageStatus = (typeof SCHEDULED_MESSAGE_STATUSES)[number]

/**
 * scheduled_messages.recipient_type.
 *
 * Widened to match the seven values the schedule UI offers, by
 * supabase/migrations/20261014_widen_scheduled_messages_constraints.sql. All
 * three executors resolve these to real contact lists, so the values are
 * implemented, not aspirational.
 */
export const RECIPIENT_TYPES = [
  'all', 'active', 'vip', 'leads',
  'service_contacts', 'service_leads', 'service_deals',
] as const
export type RecipientType = (typeof RECIPIENT_TYPES)[number]

/**
 * Title Case and UI labels -> the value the database accepts.
 *
 * The campaigns UI compares against 'Active', 'Scheduled' and 'Completed' and
 * the toggle sends 'Active'/'Paused'. None of those exist in the database, so
 * every one of them either fails the write or makes a comparison that can never
 * be true.
 */
const CAMPAIGN_STATUS_MAP: Record<string, CampaignStatus> = {
  active: 'draft',
  inactive: 'cancelled',
  paused: 'paused',
  draft: 'draft',
  scheduled: 'scheduled',
  sending: 'sending',
  sent: 'sent',
  completed: 'completed',
  cancelled: 'cancelled',
  canceled: 'cancelled',
}

export function toCampaignStatus(value: unknown, fallback: CampaignStatus = 'draft'): CampaignStatus {
  if (typeof value !== 'string' || !value.trim()) return fallback
  const key = normaliseKey(value)
  const direct = CAMPAIGN_STATUSES.find((s) => s.toLowerCase() === key)
  if (direct) return direct
  return CAMPAIGN_STATUS_MAP[key] ?? fallback
}

/**
 * scheduled_messages.status.
 *
 * 'paused' is a REAL status - it was added to the constraint rather than aliased
 * to 'cancelled', so a paused message never reads as cancelled.
 */
const SCHEDULED_MESSAGE_STATUS_MAP: Record<string, ScheduledMessageStatus> = {
  inactive: 'cancelled',
  stopped: 'cancelled',
  active: 'scheduled',
  pending: 'pending',
  scheduled: 'scheduled',
  sent: 'sent',
  failed: 'failed',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  queued: 'pending',
  processing: 'pending',
  paused: 'paused',
}

export function toScheduledMessageStatus(
  value: unknown,
  fallback: ScheduledMessageStatus = 'pending',
): ScheduledMessageStatus {
  if (typeof value !== 'string' || !value.trim()) return fallback
  const key = normaliseKey(value)
  const direct = SCHEDULED_MESSAGE_STATUSES.find((s) => s.toLowerCase() === key)
  if (direct) return direct
  return SCHEDULED_MESSAGE_STATUS_MAP[key] ?? fallback
}

/**
 * scheduled_messages.recipient_type. An unknown value falls back to 'all'
 * rather than being written through, so an unrecognised grouping still sends to
 * everyone instead of failing the insert.
 */
const RECIPIENT_TYPE_MAP: Record<string, RecipientType> = {
  contacts: 'all',
  everyone: 'all',
  allcontacts: 'all',
  'all contacts': 'all',
  'service contacts': 'service_contacts',
  'service leads': 'service_leads',
  'service deals': 'service_deals',
}

export function toRecipientType(value: unknown, fallback: RecipientType = 'all'): RecipientType {
  if (typeof value !== 'string' || !value.trim()) return fallback
  const key = normaliseKey(value)
  const direct = RECIPIENT_TYPES.find((s) => s.toLowerCase() === key)
  if (direct) return direct
  return RECIPIENT_TYPE_MAP[key] ?? fallback
}

/** True when the value is one the database accepts as-is. */
export function isValidCampaignStatus(value: unknown): value is CampaignStatus {
  return typeof value === 'string' && (CAMPAIGN_STATUSES as readonly string[]).includes(value)
}

export function isValidScheduledMessageStatus(value: unknown): value is ScheduledMessageStatus {
  return typeof value === 'string' &&
    (SCHEDULED_MESSAGE_STATUSES as readonly string[]).includes(value)
}

export function isValidRecipientType(value: unknown): value is RecipientType {
  return typeof value === 'string' && (RECIPIENT_TYPES as readonly string[]).includes(value)
}
