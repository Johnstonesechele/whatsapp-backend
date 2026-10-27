/**
 * Enhanced Automation Service
 * Handles various types of automated workflows including:
 * - Lead follow-up sequences
 * - Email drip campaigns  
 * - Lead scoring automation
 * - Event-triggered actions
 * - Automated reporting
 */

import { DatabaseUtils } from '@/backend/database/db-api'

// Dynamic imports to avoid client-side issues
let EmailService: any = null
let SMSService: any = null

// Only import services on server-side
if (typeof window === 'undefined') {
  try {
    EmailService = require('@/backend/services/email-service').EmailService
  } catch (e) {
    console.warn('Email service not available:', e)
  }
  
  try {
    SMSService = require('@/backend/services/sms-service').SMSService
  } catch (e) {
    console.warn('SMS service not available:', e)
  }
}

export interface AutomationRule {
  id: string
  name: string
  type: 'lead_followup' | 'drip_campaign' | 'scoring' | 'report' | 'event_trigger'
  status: 'active' | 'paused' | 'draft'
  trigger: AutomationTrigger
  actions: AutomationAction[]
  conditions?: AutomationCondition[]
  created_at: string
  updated_at: string
  executions: number
  success_rate: number
}

export interface AutomationTrigger {
  type: 'time' | 'event' | 'condition'
  event?: 'lead_created' | 'lead_updated' | 'contact_added' | 'contact_updated' | 
          'email_opened' | 'link_clicked' | 'form_submitted' | 'stage_changed' |
          'campaign_created' | 'campaign_sent' | 'deal_created' | 'deal_stage_changed' |
          'deal_won' | 'deal_lost' | 'whatsapp_received' | 'whatsapp_sent'
  schedule?: string // Cron expression for time-based triggers
  conditions?: Record<string, any>
}

export interface AutomationAction {
  type: 'email' | 'sms' | 'whatsapp' | 'update_field' | 'create_task' | 'notify_team' | 'wait'
  config: Record<string, any>
  delay?: number // Delay in minutes before executing
}

export interface AutomationCondition {
  field: string
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than'
  value: any
}

export class AutomationEngine {
  private static automations: AutomationRule[] = []
  private static isRunning = false

  /**
   * Initialize the automation engine
   */
  static async initialize() {
    if (this.isRunning) return
    
    this.isRunning = true
    console.log('Automation engine initialized')
    
    // Load automations from database
    await this.loadAutomations()
    
    // Start periodic execution
    setInterval(() => {
      this.processTimeBasedAutomations()
    }, 60000) // Check every minute
  }

  /**
   * Load automation rules from database
   */
  private static async loadAutomations() {
    try {
      // In a real implementation, load from database
      // this.automations = await DatabaseUtils.getAutomations()
      
      // Mock data for now
      this.automations = [
        {
          id: 'auto-lead-followup-1',
          name: 'New Lead Welcome Sequence',
          type: 'lead_followup',
          status: 'active',
          trigger: {
            type: 'event',
            event: 'lead_created'
          },
          actions: [
            {
              type: 'email',
              config: {
                templateId: 'email-tpl-1758783119800-s2svysiea',
                subject: 'Welcome! Let\'s get started',
                delay: 0
              }
            },
            {
              type: 'email',
              config: {
                templateId: 'email-tpl-1758782448876-9kfx0qxy9',
                subject: 'Follow-up: Next Steps',
                delay: 1440 // 24 hours
              }
            }
          ],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          executions: 0,
          success_rate: 100
        }
      ]
    } catch (error) {
      console.error('Failed to load automations:', error)
    }
  }

  /**
   * Trigger event-based automations
   */
  static async triggerEvent(eventType: string, data: any) {
    const relevantAutomations = this.automations.filter(auto => 
      auto.status === 'active' && 
      auto.trigger.type === 'event' && 
      auto.trigger.event === eventType
    )

    for (const automation of relevantAutomations) {
      try {
        await this.executeAutomation(automation, data)
      } catch (error) {
        console.error(`Failed to execute automation ${automation.id}:`, error)
      }
    }
  }

  /**
   * Process time-based automations
   */
  private static async processTimeBasedAutomations() {
    const timeBasedAutomations = this.automations.filter(auto =>
      auto.status === 'active' && auto.trigger.type === 'time'
    )

    for (const automation of timeBasedAutomations) {
      try {
        // Check if it's time to run based on schedule
        if (this.shouldRunNow(automation.trigger.schedule)) {
          await this.executeAutomation(automation, {})
        }
      } catch (error) {
        console.error(`Failed to execute scheduled automation ${automation.id}:`, error)
      }
    }
  }

  /**
   * Execute an automation rule
   */
  private static async executeAutomation(automation: AutomationRule, triggerData: any) {
    console.log(`Executing automation: ${automation.name}`)

    // Check conditions if any
    if (automation.conditions && !this.evaluateConditions(automation.conditions, triggerData)) {
      console.log(`Conditions not met for automation: ${automation.name}`)
      return
    }

    // Execute actions in sequence
    for (const action of automation.actions) {
      try {
        if (action.delay && action.delay > 0) {
          // Schedule delayed action
          setTimeout(() => {
            this.executeAction(action, triggerData)
          }, action.delay * 60 * 1000) // Convert minutes to milliseconds
        } else {
          await this.executeAction(action, triggerData)
        }
      } catch (error) {
        console.error(`Failed to execute action in automation ${automation.id}:`, error)
      }
    }

    // Update execution count
    automation.executions++
  }

  /**
   * Execute a single action
   */
  private static async executeAction(action: AutomationAction, data: any) {
    switch (action.type) {
      case 'email':
        await this.executeEmailAction(action, data)
        break
      case 'sms':
        await this.executeSMSAction(action, data)
        break
      case 'whatsapp':
        await this.executeWhatsAppAction(action, data)
        break
      case 'update_field':
        await this.executeUpdateFieldAction(action, data)
        break
      case 'create_task':
        await this.executeCreateTaskAction(action, data)
        break
      case 'notify_team':
        await this.executeNotifyTeamAction(action, data)
        break
      default:
        console.warn(`Unknown action type: ${action.type}`)
    }
  }

  /**
   * Execute email action
   */
  private static async executeEmailAction(action: AutomationAction, data: any) {
    if (!data.email) {
      console.warn('No email address available for email action')
      return
    }

    if (!EmailService) {
      console.warn('Email service not available')
      return
    }

    const { templateId, subject, content } = action.config

    // Settings are per-company. Without this the lookup is unscoped, which
    // returns whichever company's mailbox the database answers with - or, once
    // there is more than one tenant, no settings at all and a hard failure.
    const companyId = data.company_id || data.companyId
    if (!companyId) {
      console.warn('Automation email action has no company in context; not sending')
      return
    }

    await EmailService.sendEmail(
      companyId,
      data.email,
      subject || 'Automated Email',
      content || 'This is an automated email from your CRM system.',
      undefined,
      templateId
    )
  }

  /**
   * Execute SMS action
   */
  private static async executeSMSAction(action: AutomationAction, data: any) {
    if (!data.phone) {
      console.warn('No phone number available for SMS action')
      return
    }

    if (!SMSService) {
      console.warn('SMS service not available')
      return
    }

    const { message } = action.config

    const companyId = data.company_id || data.companyId
    if (!companyId) {
      console.warn('Automation SMS action has no company in context; not sending')
      return
    }

    await SMSService.sendSMS(
      companyId,
      data.phone,
      message || 'This is an automated message from your CRM system.'
    )
  }

  /**
   * Execute WhatsApp action
   */
  private static async executeWhatsAppAction(action: AutomationAction, data: any) {
    if (!data.phone) {
      console.warn('No phone number available for WhatsApp action')
      return
    }

    // Dynamically import WhatsApp service
    let WhatsAppService: any = null
    try {
      WhatsAppService = require('@/backend/services/whatsapp-service').WhatsAppService
    } catch (e) {
      console.warn('WhatsApp service not available:', e)
      return
    }

    const { message } = action.config

    try {
      await WhatsAppService.sendMessage(
        data.phone,
        message || 'This is an automated message from your CRM system.'
      )
    } catch (error) {
      console.error('Failed to send WhatsApp message:', error)
    }
  }

  /**
   * Execute update field action
   */
  private static async executeUpdateFieldAction(action: AutomationAction, data: any) {
    const { recordType, recordId, field, value } = action.config

    if (recordType === 'lead' && recordId) {
      await DatabaseUtils.updateLead(recordId, { [field]: value })
    } else if (recordType === 'contact' && recordId) {
      await DatabaseUtils.updateContact(recordId, { [field]: value })
    }
  }

  /**
   * Execute create task action
   */
  private static async executeCreateTaskAction(action: AutomationAction, data: any) {
    const { title, description, assignedTo, dueDate } = action.config

    // In a real implementation, create task in task management system
    console.log(`Creating task: ${title}`)
  }

  /**
   * Execute notify team action
   */
  private static async executeNotifyTeamAction(action: AutomationAction, data: any) {
    const { message, channels } = action.config

    // In a real implementation, send notifications via configured channels
    console.log(`Team notification: ${message}`)
  }

  /**
   * Check if automation should run now based on schedule
   */
  private static shouldRunNow(schedule?: string): boolean {
    if (!schedule) return false
    
    // Simple implementation - in real system, use cron parser
    // For now, just return false to avoid unintended executions
    return false
  }

  /**
   * Evaluate automation conditions
   */
  private static evaluateConditions(conditions: AutomationCondition[], data: any): boolean {
    return conditions.every(condition => {
      const fieldValue = data[condition.field]
      
      switch (condition.operator) {
        case 'equals':
          return fieldValue === condition.value
        case 'not_equals':
          return fieldValue !== condition.value
        case 'contains':
          return String(fieldValue).includes(condition.value)
        case 'greater_than':
          return Number(fieldValue) > Number(condition.value)
        case 'less_than':
          return Number(fieldValue) < Number(condition.value)
        default:
          return false
      }
    })
  }

  /**
   * Get automation statistics
   */
  static getStats() {
    return {
      total: this.automations.length,
      active: this.automations.filter(a => a.status === 'active').length,
      paused: this.automations.filter(a => a.status === 'paused').length,
      totalExecutions: this.automations.reduce((sum, a) => sum + a.executions, 0),
      averageSuccessRate: this.automations.length > 0 
        ? this.automations.reduce((sum, a) => sum + a.success_rate, 0) / this.automations.length 
        : 0
    }
  }
}

export default AutomationEngine
