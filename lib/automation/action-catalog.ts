/**
 * Canonical automation action catalog.
 *
 * The executor (lib/automation-executor.ts) can already perform ~20 action
 * types, but the UI offered none of them and the API had no way to run or
 * inspect an automation. Each entry below is a capability the executor
 * genuinely implements, so the builder can only offer steps that will
 * actually run.
 *
 * `aliases` are the names older automations may already have stored in
 * `actions[].type`; they are shown in the UI so an existing automation still
 * reads correctly and is migrated on the next save.
 */

export type ActionCategory = 'communication' | 'crm' | 'data' | 'flow'

export interface ActionField {
  name: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'select' | 'entity' | 'boolean'
  required?: boolean
  placeholder?: string
  help?: string
  /** Populated by the UI from a live endpoint when type === 'entity'. */
  optionsFrom?: string
  options?: Array<{ value: string; label: string }>
}

export interface ActionDefinition {
  type: string
  label: string
  description: string
  category: ActionCategory
  icon: string
  fields: ActionField[]
  aliases?: string[]
}

/**
 * IMPORTANT: this list must contain ONLY types the executor can actually run.
 * tests/automation-catalog.test.ts asserts the catalog against
 * lib/automation-executor.ts in both directions, so adding a step here
 * without implementing it fails the suite. Tag / list / condition / webhook
 * steps are intentionally absent because no executor implementation exists;
 * implement them in the executor first, then add them here.
 */
export const AUTOMATION_ACTIONS: ActionDefinition[] = [
  {
    type: 'send_email',
    label: 'Send email',
    description: 'Send an email template to the contact.',
    category: 'communication',
    icon: 'Mail',
    aliases: ['email'],
    fields: [
      { name: 'template_id', label: 'Email template', type: 'entity', required: true, optionsFrom: '/api/email-templates' },
      { name: 'delay_minutes', label: 'Wait before sending (minutes)', type: 'number', placeholder: '0', help: 'Leave 0 to send immediately. 1440 = 1 day.' },
    ],
  },
  {
    type: 'send_sms',
    label: 'Send SMS',
    description: 'Send a text message to the contact phone number.',
    category: 'communication',
    icon: 'MessageSquare',
    aliases: ['sms'],
    fields: [
      { name: 'message', label: 'Message', type: 'textarea', required: true, placeholder: 'Hi {{first_name}}, ...' },
      { name: 'delay_minutes', label: 'Wait before sending (minutes)', type: 'number', placeholder: '0' },
    ],
  },
  {
    type: 'send_whatsapp',
    label: 'Send WhatsApp message',
    description: 'Send a WhatsApp message to the contact number.',
    category: 'communication',
    icon: 'MessageCircle',
    aliases: ['whatsapp'],
    fields: [
      { name: 'message', label: 'Message', type: 'textarea', required: true },
      { name: 'delay_minutes', label: 'Wait before sending (minutes)', type: 'number', placeholder: '0' },
    ],
  },
  {
    type: 'send_notification',
    label: 'Notify team',
    description: 'Send an internal notification to your team.',
    category: 'communication',
    icon: 'Bell',
    aliases: ['notify'],
    fields: [
      { name: 'message', label: 'Message', type: 'textarea', required: true },
      { name: 'title', label: 'Title', type: 'text' },
    ],
  },
  {
    type: 'create_task',
    label: 'Create task',
    description: 'Create a follow-up task assigned to a user.',
    category: 'crm',
    icon: 'CheckSquare',
    aliases: ['task'],
    fields: [
      { name: 'title', label: 'Task title', type: 'text', required: true },
      { name: 'description', label: 'Description', type: 'textarea' },
      { name: 'due_in_days', label: 'Due in (days)', type: 'number', placeholder: '1' },
      { name: 'assignee_id', label: 'Assign to', type: 'entity', optionsFrom: '/api/users' },
    ],
  },
  {
    type: 'update_field',
    label: 'Update record field',
    description: "Set a field on the contact, lead, or deal that triggered the automation.",
    category: 'crm',
    icon: 'Pencil',
    aliases: ['update'],
    fields: [
      {
        name: 'entity', label: 'Record type', type: 'select', required: true,
        options: [
          { value: 'contact', label: 'Contact' },
          { value: 'lead', label: 'Lead' },
          { value: 'deal', label: 'Deal' },
        ],
      },
      { name: 'field', label: 'Field name', type: 'text', required: true, placeholder: 'status' },
      { name: 'value', label: 'New value', type: 'text', required: true },
    ],
  },
  {
    type: 'add_tag',
    label: 'Add tag',
    description: 'Add a tag to the contact, lead or deal.',
    category: 'data',
    icon: 'Tag',
    fields: [{ name: 'tag', label: 'Tag', type: 'text', required: true }],
  },
  {
    type: 'remove_tag',
    label: 'Remove tag',
    description: 'Remove a tag from the contact, lead or deal.',
    category: 'data',
    icon: 'Tag',
    fields: [{ name: 'tag', label: 'Tag', type: 'text', required: true }],
  },
  {
    type: 'move_stage',
    label: 'Move to stage',
    description: 'Move a lead or deal into a pipeline stage.',
    category: 'crm',
    icon: 'GitBranch',
    fields: [{ name: 'stage', label: 'Stage', type: 'text', required: true, placeholder: 'Qualified' }],
  },
  {
    type: 'assign_to',
    label: 'Assign to user',
    description: 'Assign the record to a member of your company.',
    category: 'crm',
    icon: 'UserPlus',
    fields: [{ name: 'assigned_to', label: 'Assign to', type: 'entity', required: true, optionsFrom: '/api/users' }],
  },
  {
    type: 'condition',
    label: 'Condition (if/then)',
    description: 'Only run the steps after this one when the rule matches.',
    category: 'flow',
    icon: 'GitBranch',
    fields: [
      {
        name: 'condition_type', label: 'Condition', type: 'select', required: true,
        options: [
          { value: 'field_equals', label: 'Field equals a value' },
          { value: 'field_contains', label: 'Field contains text' },
          { value: 'field_not_empty', label: 'Field is not empty' },
          { value: 'tag_added', label: 'Has a specific tag' },
          { value: 'email_opened', label: 'Opened the email' },
          { value: 'email_clicked', label: 'Clicked a link' },
          { value: 'deal_value_greater', label: 'Deal value is greater than' },
        ],
      },
      { name: 'field', label: 'Field name', type: 'text', placeholder: 'status' },
      { name: 'value', label: 'Value', type: 'text' },
      { name: 'tag', label: 'Tag (for "has a tag")', type: 'text' },
    ],
  },
  {
    type: 'webhook',
    label: 'Call webhook',
    description: 'Send the record data to an external HTTPS URL.',
    category: 'flow',
    icon: 'Webhook',
    fields: [
      { name: 'url', label: 'Webhook URL', type: 'text', required: true, placeholder: 'https://example.com/hook', help: 'Must be HTTPS. The request times out after 10 seconds.' },
    ],
  },
  {
    type: 'wait',
    label: 'Wait',
    description: 'Pause before the next step. Useful for drip sequences.',
    category: 'flow',
    icon: 'Clock',
    aliases: ['delay'],
    fields: [
      { name: 'delay_minutes', label: 'Wait (minutes)', type: 'number', required: true, placeholder: '1440', help: '1440 = 1 day, 10080 = 1 week.' },
    ],
  },
]

/** Every accepted type, including legacy aliases. */
export const KNOWN_ACTION_TYPES = new Set<string>(
  AUTOMATION_ACTIONS.flatMap(a => [a.type, ...(a.aliases || [])])
)

/**
 * Resolve any stored alias to the canonical type, or null when the action
 * type is not something this build can perform. Used to validate on save so
 * an automation can never be persisted with a step the executor will ignore.
 */
export function canonicalActionType(type: string | null | undefined): string | null {
  const raw = (type || '').trim()
  if (!raw) return null
  const direct = AUTOMATION_ACTIONS.find(a => a.type === raw)
  if (direct) return direct.type
  const aliased = AUTOMATION_ACTIONS.find(a => (a.aliases || []).includes(raw))
  return aliased ? aliased.type : null
}

/** Human label for a stored type, including legacy aliases. */
export function actionLabel(type: string | null | undefined): string {
  const canonical = canonicalActionType(type)
  const found = AUTOMATION_ACTIONS.find(a => a.type === canonical)
  return found?.label || String(type || 'Unknown action')
}

export interface TriggerDefinition {
  type: string
  label: string
  description: string
  entity?: 'contact' | 'lead' | 'deal'
}

export const AUTOMATION_TRIGGERS: TriggerDefinition[] = [
  { type: 'lead_created', label: 'New lead created', description: 'Runs when a lead is added.', entity: 'lead' },
  { type: 'contact_created', label: 'New contact created', description: 'Runs when a contact is added.', entity: 'contact' },
  { type: 'deal_stage_changed', label: 'Deal stage changed', description: 'Runs when a deal moves to a new stage.', entity: 'deal' },
  { type: 'tag_added', label: 'Tag added to contact', description: 'Runs when a tag is applied to a contact.', entity: 'contact' },
  { type: 'email_opened', label: 'Email opened', description: 'Runs when a contact opens an email.', entity: 'contact' },
  { type: 'email_clicked', label: 'Link clicked', description: 'Runs when a contact clicks a link.', entity: 'contact' },
  { type: 'scheduled', label: 'Scheduled (recurring)', description: 'Runs on a schedule you define.' },
  { type: 'manual', label: 'Manual / API only', description: 'Only runs when triggered directly.' },
]
