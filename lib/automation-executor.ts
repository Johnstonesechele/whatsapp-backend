/**
 * Automation Executor
 * Executes automations when triggers fire
 */

import { getSupabaseAdminClient } from '@/backend/database/supabase-config'
import { EmailServiceSupabase } from '@/backend/services/email-service-supabase'
import { SMSService } from '@/backend/services/sms-service'
import { UnifiedWhatsAppService } from '@/backend/services/unified-whatsapp-service'

export interface AutomationTriggerData {
  eventType: 'lead_created' | 'lead_updated' | 'contact_created' | 'contact_updated' | 
             'deal_created' | 'deal_updated' | 'deal_stage_changed' | 'deal_won' | 'deal_lost'
  companyId: string
  entityId: string
  entityType: 'lead' | 'contact' | 'deal'
  data: any
}

/**
 * A UUID column rejects anything that is not a UUID, and automation config is
 * written by hand in the builder UI - which is where 'system', 'sales_rep' and
 * 'company_manager' come from. Those are ROLE slugs and a sentinel, not user
 * ids, and each one produced:
 *
 *   22P02 invalid input syntax for type uuid: "sales_rep"
 *
 * ...which aborted the whole INSERT, so the task or notification was never
 * created and the automation appeared to have run.
 *
 * Returns null for anything that is not a UUID, which the columns accept. A
 * role name is not a person: dropping the assignee is correct, silently writing
 * one is not.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function asUserId(value: unknown): string | null {
  const s = typeof value === 'string' ? value.trim() : ''
  return UUID_RE.test(s) ? s : null
}

export class AutomationExecutor {
  /**
   * Check and execute automations for a trigger event
   */
  static async executeTrigger(triggerData: AutomationTriggerData): Promise<any[]> {
    try {
      const supabase = getSupabaseAdminClient()

      // Find active automations that match this trigger
      const { data: automations, error } = await supabase
        .from('automations')
        .select('*')
        .eq('company_id', triggerData.companyId)
        .eq('is_active', true)

      if (error) {
        console.error('Error fetching automations:', error)
        return []
      }

      if (!automations || automations.length === 0) {
        return []
      }

      // Log each automation's trigger config
      automations.forEach((auto, i) => {
        console.log(`   Auto ${i + 1}: ${auto.name} - trigger_config:`, JSON.stringify(auto.trigger_config))
      })

      // Filter automations that match this trigger event
      const matchingAutomations = automations.filter(auto => {
        const trigger = auto.trigger_config || {}
        
        // Check if trigger event matches directly
        if (trigger.event === triggerData.eventType) {
          console.log(`    ${auto.name} matches (direct event match)`)
          return true
        }
        
        // Check if trigger type is 'event' and event matches
        if (trigger.type === 'event' && trigger.event === triggerData.eventType) {
          console.log(`    ${auto.name} matches (type=event + event match)`)
          return true
        }
        
        // Map workflow builder triggers to system events
        const triggerMapping: Record<string, string[]> = {
          'lead_created': ['lead_created'],
          'contact_added': ['contact_created'],  // contact_added → contact_created
          'contact_created': ['contact_created'],
          'email_opened': ['email_opened'],
          'form_submitted': ['form_submitted'],
          'stage_changed': ['lead_stage_changed', 'deal_stage_changed'],
          'lead_stage_changed': ['lead_stage_changed'],
          'deal_stage_changed': ['deal_stage_changed'],
          'lead_updated': ['lead_updated'],
          'contact_updated': ['contact_updated'],
          'deal_created': ['deal_created'],
          'deal_updated': ['deal_updated'],
          'deal_won': ['deal_won'],
          'deal_lost': ['deal_lost']
        }
        
        // Check trigger.when field (legacy support)
        if (trigger.when) {
          const matchedEvents = triggerMapping[trigger.when] || []
          if (matchedEvents.includes(triggerData.eventType)) {
            console.log(`    ${auto.name} matches (trigger.when="${trigger.when}" maps to "${triggerData.eventType}")`)
            return true
          }
        }
        
        // Check trigger.event field with mapping
        if (trigger.event) {
          const matchedEvents = triggerMapping[trigger.event] || []
          if (matchedEvents.includes(triggerData.eventType)) {
            console.log(`    ${auto.name} matches (trigger.event="${trigger.event}" maps to "${triggerData.eventType}")`)
            return true
          }
        }
        
        console.log(`    ${auto.name} does not match`)
        return false
      })

      console.log(`Found ${matchingAutomations.length} matching automation(s)`)

      // Execute each matching automation and report what ran, so the caller
      // can tell the customer whether anything happened instead of assuming.
      const runs: any[] = []
      for (const automation of matchingAutomations) {
        try {
          await this.executeAutomation(automation, triggerData)
          runs.push({ automationId: automation.id, name: automation.name, ok: true })
        } catch (error: any) {
          console.error(`Error executing automation ${automation.id}:`, error)
          runs.push({
            automationId: automation.id,
            name: automation.name,
            ok: false,
            error: error?.message || String(error),
          })
        }
      }
      return runs

    } catch (error) {
      console.error('Error in automation executor:', error)
      return []
    }
  }

  /**
   * Write one execution-log row per run.
   *
   * This replaces four per-action inserts that could never succeed. Verified
   * against the LIVE database, not the repo's three conflicting schema files:
   *
   *   - status CHECK allows ('success','failure','partial','skipped') and
   *     REJECTS 'failed' with 23514. The old code wrote 'failed' every time.
   *   - there is no `action_type` column at all, so those inserts 400'd.
   *   - `automation_id` was never set, and the logs route filters on it, so
   *     even a row that landed was invisible.
   *   - `trigger_type` is NOT NULL and was never supplied.
   *
   * Net effect: nothing was ever logged, successful or failed, and the log
   * drawer had no data for reasons unrelated to the route.
   *
   * Failures inside action handlers now bubble to this summary row, which
   * carries the automation id and a status the constraint accepts.
   */
  private static async logRun(
    supabase: any,
    args: {
      automation: any
      companyId: string
      triggerData: AutomationTriggerData
      status: 'success' | 'failure' | 'partial' | 'skipped'
      errorMessage?: string
      actionsExecuted: unknown[]
      durationMs: number
    },
  ): Promise<void> {
    const { automation, companyId, triggerData, status, errorMessage, actionsExecuted, durationMs } = args
    try {
      await supabase.from('automation_logs').insert({
        automation_id: automation?.id ?? null,
        company_id: companyId,
        entity_type: triggerData.entityType,
        entity_id: triggerData.entityId,
        // NOT NULL. The event that started the run is the honest value.
        trigger_type: triggerData.eventType,
        trigger_data: triggerData.data || {},
        actions_executed: actionsExecuted,
        status,
        error_message: errorMessage ?? null,
        duration_ms: durationMs,
        executed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      })
    } catch (logError: any) {
      // A logging failure must never fail the run itself - the customer's
      // automation already did its work.
      console.error('   could not write automation_logs row:', logError?.message || logError)
    }
  }

  /**
   * Execute a single automation
   */
  private static async executeAutomation(automation: any, triggerData: AutomationTriggerData) {
    console.log(`▶  Executing automation: ${automation.name}`)
    
    const supabase = getSupabaseAdminClient()
    const actions = automation.actions || []
    const companyId = triggerData.companyId
    const startedAt = Date.now()

    // Check if conditions are met
    const trigger = automation.trigger_config || {}
    if (trigger.conditions) {
      const conditionsMet = await this.evaluateConditions(
        trigger.conditions, 
        triggerData.data
      )
      
      if (!conditionsMet) {
        console.log(`⏭  Conditions not met for automation: ${automation.name}`)
        await this.logRun(supabase, {
          automation,
          companyId,
          triggerData,
          status: 'skipped',
          errorMessage: 'Conditions not met',
          actionsExecuted: [],
          durationMs: Date.now() - startedAt,
        })
        return
      }
    }

    // Execute each action.
    //
    // A `condition` step gates everything after it: if the test fails, the
    // remaining steps are skipped. This is how the builder expresses
    // "if/then" without a branch graph - steps before the condition always
    // run, steps after it run only when it passes.
    const actionsExecuted: Array<{ type: string; ok: boolean; error?: string }> = []

    let conditionFailed = false
    for (const action of actions) {
      try {
        const actionType = action?.type

        // A failed condition gates everything after it.
        if (conditionFailed) {
          console.log(`   Skipping "${actionType}" because a previous condition failed`)
          actionsExecuted.push({ type: String(actionType), ok: false, error: 'skipped: condition not met' })
          continue
        }

        // A condition step gates everything after it. Steps before it always
        // run; steps after it run only when the test passes.
        if (actionType === 'condition') {
          const passed = await this.evaluateStepCondition(action.config || {}, triggerData)
          if (!passed) {
            conditionFailed = true
            console.log('   Condition not met; remaining steps will be skipped')
            actionsExecuted.push({ type: 'condition', ok: false, error: 'condition not met' })
          } else {
            actionsExecuted.push({ type: 'condition', ok: true })
          }
          continue
        }

        await this.executeAction(action, triggerData, automation.company_id)
        actionsExecuted.push({ type: String(actionType), ok: true })
      } catch (error: any) {
        // The per-action insert that used to live here could never succeed:
        // it wrote status 'failed', which the live CHECK rejects, and a column
        // (action_type) that does not exist. Record it here instead and let
        // logRun write one correct row for the whole run.
        console.error(`Error executing action:`, error)
        actionsExecuted.push({
          type: String(action?.type),
          ok: false,
          error: error?.message || String(error),
        })
      }
    }

    const failed = actionsExecuted.filter((a) => !a.ok)
    const ran = actionsExecuted.filter((a) => a.type !== 'condition')
    const runStatus = conditionFailed && ran.length === 0
      ? 'skipped'
      : failed.length > 0 && failed.length === ran.length
        ? 'failure'
        : failed.length > 0
          ? 'partial'
          : 'success'

    // Update execution count
    await supabase
      .from('automations')
      .update({ 
        execution_count: (automation.execution_count || 0) + 1,
        last_executed_at: new Date().toISOString()
      })
      .eq('id', automation.id)

    await this.logRun(supabase, {
      automation,
      companyId,
      triggerData,
      status: runStatus,
      errorMessage: failed.length ? failed.map((f) => `${f.type}: ${f.error}`).join('; ') : undefined,
      actionsExecuted,
      durationMs: Date.now() - startedAt,
    })

    console.log(` Automation executed: ${automation.name} (${runStatus})`)
  }

  /**
   * Execute a single action
   */
  private static async executeAction(action: any, triggerData: AutomationTriggerData, companyId: string) {
    const actionType = action.type
    const config = action.config || {}

    console.log(`   Executing action: ${actionType}`)

    switch (actionType) {
      case 'send_email':
      case 'email':
        await this.executeEmailAction(config, triggerData, companyId)
        break
        
      case 'send_sms':
      case 'sms':
        await this.executeSMSAction(config, triggerData, companyId)
        break
        
      case 'send_whatsapp':
      case 'whatsapp':
        await this.executeWhatsAppAction(config, triggerData, companyId)
        break
        
      case 'update_field':
      case 'update':
        await this.executeUpdateFieldAction(config, triggerData, companyId)
        break
        
      case 'create_task':
      case 'task':
        await this.executeCreateTaskAction(config, triggerData, companyId)
        break
        
      case 'send_notification':
      case 'notify':
        await this.executeNotificationAction(config, triggerData, companyId)
        break
        
      case 'wait':
      case 'delay':
        await this.executeWaitAction(config, triggerData)
        break

      case 'add_tag':
      case 'remove_tag':
        await this.executeTagAction(actionType, config, triggerData, companyId)
        break

      case 'move_stage':
        await this.executeMoveStageAction(config, triggerData, companyId)
        break

      case 'assign_to':
        await this.executeAssignToAction(config, triggerData, companyId)
        break

      case 'webhook':
        await this.executeWebhookAction(config, triggerData)
        break

      case 'condition':
        // Handled by the caller (executeActions checks it before running the
        // remaining steps), but kept here so the type is not reported as
        // unknown if it ever reaches the switch directly.
        break

      default:
        console.log(`    Unknown action type: ${actionType}`)
    }
  }

  /**
   * Evaluate a `condition` step against the triggering record.
   *
   * Returns true when the following steps should run. An unrecognised or
   * incomplete condition fails closed (returns false) rather than silently
   * letting every step through - a broken condition must not fire actions the
   * user gated behind it.
   */
  private static async evaluateStepCondition(
    config: any,
    triggerData: AutomationTriggerData
  ): Promise<boolean> {
    const data = triggerData.data || {}

    switch (config.condition_type) {
      case 'field_equals': {
        if (!config.field) return false
        return String(data[config.field] ?? '') === String(config.value ?? '')
      }
      case 'field_contains': {
        if (!config.field) return false
        return String(data[config.field] ?? '').toLowerCase()
          .includes(String(config.value ?? '').toLowerCase())
      }
      case 'field_not_empty': {
        if (!config.field) return false
        const v = data[config.field]
        return v !== null && v !== undefined && String(v).trim() !== ''
      }
      case 'tag_added': {
        const tag = String(config.tag || '').trim()
        if (!tag) return false
        const tags = (data.tags || triggerData.data?.tags || []) as string[]
        return Array.isArray(tags) && tags.includes(tag)
      }
      case 'email_opened':
      case 'email_clicked': {
        const wanted = config.condition_type === 'email_opened' ? 'opened' : 'clicked'
        // Accept either a boolean flag or an events list on the payload.
        const flag = data[`email_${wanted}`]
        if (typeof flag === 'boolean') return flag
        const events = (data.events || data.email_events || []) as string[]
        return Array.isArray(events) && events.includes(wanted)
      }
      case 'deal_value_greater': {
        const amount = Number(data.value ?? data.amount)
        const threshold = Number(config.value)
        if (Number.isNaN(amount) || Number.isNaN(threshold)) return false
        return amount > threshold
      }
      default:
        console.log(`   Unknown condition type: ${config.condition_type}; treating as not met`)
        return false
    }
  }

  /**
   * Execute add_tag / remove_tag
   *
   * Tags live as a text array on the record itself (contacts.tags), not in a
   * join table, so this read-modify-writes the array. Scoped to company_id on
   * both the read and the write.
   */
  private static async executeTagAction(
    actionType: string,
    config: any,
    triggerData: AutomationTriggerData,
    companyId: string
  ) {
    try {
      const tag = String(config.tag || '').trim()
      if (!tag) {
        console.log('   No tag configured; skipping')
        return
      }
      const tableName = this.tableFor(triggerData.entityType)
      if (!tableName) return

      const supabase = getSupabaseAdminClient()
      const { data: record, error: readErr } = await supabase
        .from(tableName)
        .select('id, tags')
        .eq('id', triggerData.entityId)
        .eq('company_id', companyId)
        .maybeSingle()

      if (readErr || !record) {
        console.log(`   No ${tableName} ${triggerData.entityId} in this company; tag not changed`)
        return
      }

      const current: string[] = Array.isArray(record.tags) ? record.tags : []
      const next = actionType === 'add_tag'
        ? (current.includes(tag) ? current : [...current, tag])
        : current.filter(t => t !== tag)

      if (next.length === current.length && actionType === 'add_tag') {
        console.log(`   Tag "${tag}" already present`)
        return
      }

      const { error: writeErr } = await supabase
        .from(tableName)
        .update({ tags: next, updated_at: new Date().toISOString() })
        .eq('id', triggerData.entityId)
        .eq('company_id', companyId)

      if (writeErr) {
        console.error('   Error writing tag:', writeErr)
        return
      }
      console.log(`   ${actionType === 'add_tag' ? 'Added' : 'Removed'} tag "${tag}" on ${tableName}`)
    } catch (error) {
      console.error(`   Error executing ${actionType} action:`, error)
    }
  }

  /** Map an entity type to its table, or null when unsupported. */
  private static tableFor(entityType: string): string | null {
    switch (entityType) {
      case 'lead': return 'leads'
      case 'contact': return 'contacts'
      case 'deal': return 'deals'
      default: return null
    }
  }

  /**
   * Move a lead or deal into a pipeline stage.
   *
   * Leads use `stage`, deals use `stage`/`pipeline_stage` depending on the
   * deployment, so set whichever column the record actually has.
   */
  private static async executeMoveStageAction(
    config: any,
    triggerData: AutomationTriggerData,
    companyId: string
  ) {
    try {
      const stage = String(config.stage || config.value || '').trim()
      if (!stage) {
        console.log('   No stage configured; skipping')
        return
      }
      const tableName = this.tableFor(triggerData.entityType)
      if (!tableName) return

      const supabase = getSupabaseAdminClient()
      const { data: record, error: readErr } = await supabase
        .from(tableName)
        .select('*')
        .eq('id', triggerData.entityId)
        .eq('company_id', companyId)
        .maybeSingle()
      if (readErr || !record) {
        console.log(`   No ${tableName} ${triggerData.entityId} in this company; stage not changed`)
        return
      }

      const column = 'stage' in record ? 'stage'
        : 'pipeline_stage' in record ? 'pipeline_stage'
        : 'status' in record ? 'status'
        : null
      if (!column) {
        console.log(`   ${tableName} has no stage/status column; skipping`)
        return
      }

      const { error } = await supabase
        .from(tableName)
        .update({ [column]: stage, updated_at: new Date().toISOString() })
        .eq('id', triggerData.entityId)
        .eq('company_id', companyId)
      if (error) {
        console.error('   Error moving stage:', error)
        return
      }
      console.log(`   Moved ${tableName} to ${column}="${stage}"`)
    } catch (error) {
      console.error('   Error executing move stage action:', error)
    }
  }

  /**
   * Assign a record to a user. Leads/deals use `assigned_to`; tasks use
   * `assigned_to` as well, so the column name is shared.
   */
  private static async executeAssignToAction(
    config: any,
    triggerData: AutomationTriggerData,
    companyId: string
  ) {
    try {
      const assignee = String(config.assigned_to || config.user_id || config.assignee_id || '').trim()
      if (!assignee) {
        console.log('   No assignee configured; skipping')
        return
      }
      const tableName = this.tableFor(triggerData.entityType)
      if (!tableName) return

      const supabase = getSupabaseAdminClient()

      // Confirm the assignee is a member of THIS company. Without this a
      // tenant could assign work to a user in another company.
      const { data: member } = await supabase
        .from('users')
        .select('id')
        .eq('id', assignee)
        .eq('company_id', companyId)
        .maybeSingle()
      if (!member) {
        console.log(`   Assignee ${assignee} is not a member of this company; skipping`)
        return
      }

      const { error } = await supabase
        .from(tableName)
        .update({ assigned_to: assignee, updated_at: new Date().toISOString() })
        .eq('id', triggerData.entityId)
        .eq('company_id', companyId)
      if (error) {
        console.error('   Error assigning:', error)
        return
      }
      console.log(`   Assigned ${tableName} to ${assignee}`)
    } catch (error) {
      console.error('   Error executing assign to action:', error)
    }
  }

  /**
   * Call an external webhook with the record's data.
   *
   * Restricted to https and a bounded timeout so a user-supplied URL cannot
   * stall the automation runner or reach an internal address.
   */
  private static async executeWebhookAction(
    config: any,
    triggerData: AutomationTriggerData
  ) {
    try {
      const url = String(config.url || '').trim()
      if (!url) {
        console.log('   No webhook URL configured; skipping')
        return
      }
      let parsed: URL
      try {
        parsed = new URL(url)
      } catch {
        console.log('   Webhook URL is not a valid URL; skipping')
        return
      }
      if (parsed.protocol !== 'https:') {
        console.log('   Webhook URL must use https; skipping')
        return
      }

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 10_000)
      try {
        const res = await fetch(parsed.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: triggerData.eventType,
            companyId: triggerData.companyId,
            entityType: triggerData.entityType,
            entityId: triggerData.entityId,
            data: triggerData.data,
          }),
          signal: controller.signal,
        })
        console.log(`   Webhook responded ${res.status}`)

        /**
         * A non-2xx response is a failed step, not a successful one.
         *
         * This used to only console.log the status and return, so a webhook
         * answering 500 - or an unreachable host - was recorded as a successful
         * run. The customer had no way to learn their integration was broken.
         *
         * Throwing lets the caller record it in actions_executed and set the
         * run status to failure/partial.
         */
        if (!res.ok) {
          throw new Error(`webhook responded ${res.status} ${res.statusText}`.trim())
        }
      } finally {
        clearTimeout(timer)
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        // A timeout is a failure too, and must surface as one.
        throw new Error('webhook timed out after 10s')
      }
      throw error
    }
  }

  /**
   * Execute email action
   */
  private static async executeEmailAction(config: any, triggerData: AutomationTriggerData, companyId: string) {
    try {
      const supabase = getSupabaseAdminClient()
      
      // Get email settings
      const { data: emailSettings } = await supabase
        .from('email_settings')
        .select('*')
        .eq('company_id', companyId)
        .single()

      if (!emailSettings || !(emailSettings.enabled || emailSettings.enable_email)) {
        console.log('    Email not configured or not enabled')
        return
      }

      // Get recipient email
      let recipientEmail = config.to || triggerData.data.email
      
      if (!recipientEmail) {
        console.log('    No recipient email available')
        return
      }

      // Get template if specified
      let subject = config.subject || 'Automated Email'
      let body = config.body || config.message || ''
      
      if (config.template_id || config.templateId) {
        const { data: template } = await supabase
          .from('email_templates')
          .select('*')
          .eq('id', config.template_id || config.templateId)
          .single()
          
        if (template) {
          subject = template.subject
          body = template.body
        }
      }

      // Replace variables in subject and body
      subject = this.replaceVariables(subject, triggerData.data)
      body = this.replaceVariables(body, triggerData.data)
      recipientEmail = this.replaceVariables(recipientEmail, triggerData.data)

      console.log(`   Sending email to: ${recipientEmail}`)
      console.log(`     Subject: ${subject}`)

      // Actually send the email using EmailServiceSupabase
      try {
        await EmailServiceSupabase.sendEmail(
          recipientEmail,
          subject,
          body,
          [], // attachments
          config.template_id || config.templateId,
          true, // isHtml
          companyId // Pass company_id
        )
        console.log('   Email sent successfully')
      } catch (emailError: any) {
        console.error('   Failed to send email:', emailError.message)
      }
      
    } catch (error) {
      console.error('   Error executing email action:', error)
    }
  }

  /**
   * Execute SMS action
   */
  private static async executeSMSAction(config: any, triggerData: AutomationTriggerData, companyId: string) {
    try {
      const supabase = getSupabaseAdminClient()
      
      // Get phone number from config or trigger data
      let phone = config.to || config.phone || triggerData.data.phone
      
      if (!phone) {
        console.log('    No phone number available')
        return
      }

      let message = config.message || config.body || ''
      message = this.replaceVariables(message, triggerData.data)
      phone = this.replaceVariables(phone, triggerData.data)

      console.log(`   Sending SMS to: ${phone}`)
      console.log(`     Message: ${message}`)
      
      try {
        await SMSService.sendSMS(companyId, phone, message)
        console.log('   SMS sent successfully')
      } catch (smsError: any) {
        console.error('   Failed to send SMS:', smsError.message)
      }
      
    } catch (error) {
      console.error('   Error executing SMS action:', error)
    }
  }

  /**
   * Execute WhatsApp action
   */
  private static async executeWhatsAppAction(config: any, triggerData: AutomationTriggerData, companyId: string) {
    try {
      const supabase = getSupabaseAdminClient()
      
      // Get phone number from config or trigger data
      let phone = config.to || config.phone || triggerData.data.phone
      
      if (!phone) {
        console.log('    No phone number available')
        return
      }

      let message = config.message || config.body || config.content || ''
      message = this.replaceVariables(message, triggerData.data)
      phone = this.replaceVariables(phone, triggerData.data)

      console.log(`   Sending WhatsApp to: ${phone}`)
      console.log(`     Message: ${message}`)
      
      try {
        // Get user's WhatsApp session for the company
        const { data: users } = await supabase
          .from('users')
          .select('id')
          .eq('company_id', companyId)
          .limit(1)
        
        if (!users || users.length === 0) {
          throw new Error('No user found for company')
        }
        
        const userId = users[0].id
        
        // Check if user has active WhatsApp session
        const sessionStatus = await UnifiedWhatsAppService.getUserSessionStatus(userId)
        
        if (!sessionStatus.connected || !sessionStatus.sessionId) {
          console.log('    WhatsApp not connected for this company')
          console.log('   User needs to scan QR code in WhatsApp settings first')
          
          return
        }
        
        // Send message using whatsapp service
        const whatsappService = require('@/backend/services/whatsapp-service').whatsappWebService
        await whatsappService.sendMessage(sessionStatus.sessionId, phone, message)
        
        console.log('   WhatsApp message sent successfully')
      } catch (whatsappError: any) {
        console.error('   Failed to send WhatsApp:', whatsappError.message)
      }
      
    } catch (error) {
      console.error('   Error executing WhatsApp action:', error)
    }
  }

  /**
   * Execute Wait/Delay action
   */
  private static async executeWaitAction(config: any, triggerData: AutomationTriggerData) {
    try {
      const delay = config.delay || config.duration || 0
      
      if (delay > 0) {
        console.log(`  ⏱  Waiting ${delay} minutes...`)
        // In a production system, you would schedule the next action
        // For now, we'll just log it
        console.log('  ℹ  Note: Delays are logged but not executed in real-time')
        console.log('   For production, implement scheduling system')
      } else {
        console.log('    No delay specified, skipping wait')
      }
      
    } catch (error) {
      console.error('   Error executing wait action:', error)
    }
  }

  /**
   * Execute update field action
   */
  private static async executeUpdateFieldAction(config: any, triggerData: AutomationTriggerData, companyId: string) {
    try {
      const supabase = getSupabaseAdminClient()
      const { field, value } = config
      
      if (!field) {
        console.log('    No field specified for update')
        return
      }

      let tableName = ''
      switch (triggerData.entityType) {
        case 'lead':
          tableName = 'leads'
          break
        case 'contact':
          tableName = 'contacts'
          break
        case 'deal':
          tableName = 'deals'
          break
        default:
          console.log('    Unknown entity type')
          return
      }

      const updateData: any = {}
      updateData[field] = value
      updateData.updated_at = new Date().toISOString()

      // Scope the write to the caller's company. Without this the update
      // matched on id alone, so a crafted entityId could modify a record
      // belonging to another tenant.
      const { data: updated, error: updateErr } = await supabase
        .from(tableName)
        .update(updateData)
        .eq('id', triggerData.entityId)
        .eq('company_id', companyId)
        .select('id')
        .maybeSingle()

      if (updateErr) {
        console.error('   Error updating field:', updateErr)
        return
      }
      if (!updated) {
        console.log(`   No ${tableName} ${triggerData.entityId} in this company; nothing updated`)
        return
      }

      console.log(`   Updated ${field} to ${value} for ${tableName} ${triggerData.entityId}`)

    } catch (error) {
      console.error('   Error executing update field action:', error)
    }
  }

  /**
   * Execute create task action
   */
  private static async executeCreateTaskAction(config: any, triggerData: AutomationTriggerData, companyId: string) {
    try {
      const supabase = getSupabaseAdminClient()
      
      const task = {
        company_id: companyId,
        title: this.replaceVariables(config.title || 'Automated Task', triggerData.data),
        description: this.replaceVariables(config.description || '', triggerData.data),
        due_date: config.due_date || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        status: 'pending',
        priority: config.priority || 'medium',
        // A role slug is not a user id. See asUserId.
        assigned_to: asUserId(config.assigned_to),
        related_to_type: triggerData.entityType,
        related_to_id: triggerData.entityId,
        created_at: new Date().toISOString()
      }

      await supabase
        .from('tasks')
        .insert([task])

      console.log(`   Created task: ${task.title}`)
      
    } catch (error) {
      console.error('   Error executing create task action:', error)
    }
  }

  /**
   * Execute notification action
   */
  private static async executeNotificationAction(config: any, triggerData: AutomationTriggerData, companyId: string) {
    try {
      const supabase = getSupabaseAdminClient()
      
      const notification = {
        company_id: companyId,
        // A role slug is not a user id. See asUserId.
        user_id: asUserId(config.user_id),
        title: this.replaceVariables(config.title || 'Automation Notification', triggerData.data),
        message: this.replaceVariables(config.message || '', triggerData.data),
        type: 'automation',
        read: false,
        created_at: new Date().toISOString()
      }

      await supabase
        .from('notifications')
        .insert([notification])

      console.log(`   Created notification: ${notification.title}`)
      
    } catch (error) {
      console.error('   Error executing notification action:', error)
    }
  }

  /**
   * Evaluate conditions
   */
  private static async evaluateConditions(conditions: any, data: any): Promise<boolean> {
    if (!conditions) return true

    // Simple field comparison for now
    for (const [field, expectedValue] of Object.entries(conditions)) {
      if (data[field] !== expectedValue) {
        return false
      }
    }

    return true
  }

  /**
   * Replace variables in text
   */
  private static replaceVariables(text: string, data: any): string {
    if (!text) return ''
    
    let result = text
    
    // Replace {{variable}} with actual values
    const variableRegex = /\{\{(\w+)\}\}/g
    result = result.replace(variableRegex, (match, varName) => {
      return data[varName] !== undefined ? String(data[varName]) : match
    })
    
    return result
  }
}