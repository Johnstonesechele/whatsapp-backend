/**
 * Automation Integration Module
 * Connects automation triggers to system events across all CRM modules
 * Ensures all actions and triggers are synchronized with the system
 */

import { AutomationExecutor } from './automation-executor'

/**
 * Lead Event Triggers
 */
export class LeadAutomation {
  /**
   * Trigger automation when a new lead is created
   */
  static async onLeadCreated(leadData: any) {
    try {
      console.log(' Triggering lead_created automation for lead:', leadData.id)
      
      // Get company_id from the lead data or fetch it
      const companyId = leadData.company_id || leadData.companyId
      
      if (!companyId) {
        console.warn('  No company_id found for lead, skipping automation')
        return
      }
      
      await AutomationExecutor.executeTrigger({
        eventType: 'lead_created',
        companyId: companyId,
        entityId: leadData.id,
        entityType: 'lead',
        data: {
          id: leadData.id,
          name: leadData.name,
          email: leadData.email,
          phone: leadData.phone,
          company: leadData.company,
          status: leadData.status,
          stage: leadData.stage,
          value: leadData.value,
          source: leadData.source
        }
      })
    } catch (error) {
      console.error(' Failed to trigger lead_created automation:', error)
    }
  }

  /**
   * Trigger automation when a lead is updated
   */
  static async onLeadUpdated(leadData: any, changes: any) {
    try {
      console.log(' Triggering lead_updated automation for lead:', leadData.id)
      
      const companyId = leadData.company_id || leadData.companyId
      
      if (!companyId) {
        console.warn('  No company_id found for lead, skipping automation')
        return
      }
      
      await AutomationExecutor.executeTrigger({
        eventType: 'lead_updated',
        companyId: companyId,
        entityId: leadData.id,
        entityType: 'lead',
        data: {
          id: leadData.id,
          name: leadData.name,
          email: leadData.email,
          phone: leadData.phone,
          company: leadData.company,
          status: leadData.status,
          stage: leadData.stage,
          value: leadData.value,
          source: leadData.source,
          changes
        }
      })
      
      // Trigger stage-specific automations
      if (changes.stage) {
        await AutomationExecutor.executeTrigger({
          eventType: 'deal_stage_changed',
          companyId: companyId,
          entityId: leadData.id,
          entityType: 'lead',
          data: {
            ...leadData,
            oldStage: changes.stage.old,
            newStage: changes.stage.new
          }
        })
      }
    } catch (error) {
      console.error(' Failed to trigger lead_updated automation:', error)
    }
  }

  /**
   * Trigger automation when a lead is converted
   */
  static async onLeadConverted(leadData: any, dealData: any) {
    try {
      console.log(' Triggering lead_converted automation for lead:', leadData.id)
      // Note: lead_converted not implemented in executor yet
      console.warn('  lead_converted automation not yet implemented')
    } catch (error) {
      console.error(' Failed to trigger lead_converted automation:', error)
    }
  }
}

/**
 * Contact Event Triggers
 */
export class ContactAutomation {
  /**
   * Trigger automation when a new contact is added
   */
  static async onContactAdded(contactData: any) {
    try {
      console.log(' Triggering contact_added automation for contact:', contactData.id)
      
      const companyId = contactData.company_id || contactData.companyId
      
      if (!companyId) {
        console.warn('  No company_id found for contact, skipping automation')
        return
      }
      
      await AutomationExecutor.executeTrigger({
        eventType: 'contact_created',
        companyId: companyId,
        entityId: contactData.id,
        entityType: 'contact',
        data: {
          id: contactData.id,
          name: contactData.name,
          email: contactData.email,
          phone: contactData.phone,
          company: contactData.company,
          position: contactData.position,
          status: contactData.status
        }
      })
    } catch (error) {
      console.error(' Failed to trigger contact_added automation:', error)
    }
  }

  /**
   * Trigger automation when a contact is updated
   */
  static async onContactUpdated(contactData: any, changes: any) {
    try {
      console.log(' Triggering contact_updated automation for contact:', contactData.id)
      
      const companyId = contactData.company_id || contactData.companyId
      
      if (!companyId) {
        console.warn('  No company_id found for contact, skipping automation')
        return
      }
      
      await AutomationExecutor.executeTrigger({
        eventType: 'contact_updated',
        companyId: companyId,
        entityId: contactData.id,
        entityType: 'contact',
        data: {
          id: contactData.id,
          name: contactData.name,
          email: contactData.email,
          phone: contactData.phone,
          company: contactData.company,
          position: contactData.position,
          status: contactData.status,
          changes
        }
      })
    } catch (error) {
      console.error(' Failed to trigger contact_updated automation:', error)
    }
  }
}

/**
 * Campaign Event Triggers
 */
export class CampaignAutomation {
  /**
   * Trigger automation when a campaign is created
   */
  static async onCampaignCreated(campaignData: any) {
    try {
      console.log(' Triggering campaign_created automation for campaign:', campaignData.id)
      // Note: campaign events not implemented in executor yet
      console.warn('  campaign_created automation not yet implemented')
    } catch (error) {
      console.error(' Failed to trigger campaign_created automation:', error)
    }
  }

  /**
   * Trigger automation when a campaign is sent
   */
  static async onCampaignSent(campaignData: any) {
    try {
      console.log(' Triggering campaign_sent automation for campaign:', campaignData.id)
      // Note: campaign events not implemented in executor yet
      console.warn('  campaign_sent automation not yet implemented')
    } catch (error) {
      console.error(' Failed to trigger campaign_sent automation:', error)
    }
  }
}

/**
 * Email Event Triggers
 */
export class EmailAutomation {
  /**
   * Trigger automation when an email is opened
   */
  static async onEmailOpened(emailData: any) {
    try {
      console.log(' Triggering email_opened automation for email:', emailData.id)
      // Note: email events not implemented in executor yet
      console.warn('  email_opened automation not yet implemented')
    } catch (error) {
      console.error(' Failed to trigger email_opened automation:', error)
    }
  }

  /**
   * Trigger automation when a link in an email is clicked
   */
  static async onLinkClicked(emailData: any, linkData: any) {
    try {
      console.log(' Triggering link_clicked automation for email:', emailData.id)
      // Note: email events not implemented in executor yet
      console.warn('  link_clicked automation not yet implemented')
    } catch (error) {
      console.error(' Failed to trigger link_clicked automation:', error)
    }
  }
}

/**
 * WhatsApp Event Triggers
 */
export class WhatsAppAutomation {
  /**
   * Trigger automation when a WhatsApp message is received
   */
  static async onMessageReceived(messageData: any) {
    try {
      console.log(' Triggering whatsapp_received automation for message:', messageData.id)
      // Note: WhatsApp events not implemented in executor yet
      console.warn('  whatsapp_received automation not yet implemented')
    } catch (error) {
      console.error(' Failed to trigger whatsapp_received automation:', error)
    }
  }

  /**
   * Trigger automation when a WhatsApp message is sent
   */
  static async onMessageSent(messageData: any) {
    try {
      console.log(' Triggering whatsapp_sent automation for message:', messageData.id)
      // Note: WhatsApp events not implemented in executor yet
      console.warn('  whatsapp_sent automation not yet implemented')
    } catch (error) {
      console.error(' Failed to trigger whatsapp_sent automation:', error)
    }
  }
}

/**
 * Form Event Triggers
 */
export class FormAutomation {
  /**
   * Trigger automation when a form is submitted
   */
  static async onFormSubmitted(formData: any) {
    try {
      console.log(' Triggering form_submitted automation for form:', formData.formId)
      // Note: Form events not implemented in executor yet
      console.warn('  form_submitted automation not yet implemented')
    } catch (error) {
      console.error(' Failed to trigger form_submitted automation:', error)
    }
  }
}

/**
 * Deal Event Triggers
 */
export class DealAutomation {
  /**
   * Trigger automation when a deal is created
   */
  static async onDealCreated(dealData: any) {
    try {
      console.log(' Triggering deal_created automation for deal:', dealData.id)
      
      const companyId = dealData.company_id || dealData.companyId
      
      if (!companyId) {
        console.warn('  No company_id found for deal, skipping automation')
        return
      }
      
      await AutomationExecutor.executeTrigger({
        eventType: 'deal_created',
        companyId: companyId,
        entityId: dealData.id,
        entityType: 'deal',
        data: {
          id: dealData.id,
          name: dealData.name,
          value: dealData.value,
          stage: dealData.stage,
          probability: dealData.probability
        }
      })
    } catch (error) {
      console.error(' Failed to trigger deal_created automation:', error)
    }
  }

  /**
   * Trigger automation when a deal stage changes
   */
  static async onDealStageChanged(dealData: any, oldStage: string, newStage: string) {
    try {
      console.log(' Triggering deal_stage_changed automation for deal:', dealData.id)
      
      const companyId = dealData.company_id || dealData.companyId
      
      if (!companyId) {
        console.warn('  No company_id found for deal, skipping automation')
        return
      }
      
      await AutomationExecutor.executeTrigger({
        eventType: 'deal_stage_changed',
        companyId: companyId,
        entityId: dealData.id,
        entityType: 'deal',
        data: {
          id: dealData.id,
          name: dealData.name,
          value: dealData.value,
          oldStage,
          newStage
        }
      })
    } catch (error) {
      console.error(' Failed to trigger deal_stage_changed automation:', error)
    }
  }

  /**
   * Trigger automation when a deal is won
   */
  static async onDealWon(dealData: any) {
    try {
      console.log(' Triggering deal_won automation for deal:', dealData.id)
      
      const companyId = dealData.company_id || dealData.companyId
      
      if (!companyId) {
        console.warn('  No company_id found for deal, skipping automation')
        return
      }
      
      await AutomationExecutor.executeTrigger({
        eventType: 'deal_won',
        companyId: companyId,
        entityId: dealData.id,
        entityType: 'deal',
        data: {
          id: dealData.id,
          name: dealData.name,
          value: dealData.value,
          wonAt: new Date().toISOString()
        }
      })
    } catch (error) {
      console.error(' Failed to trigger deal_won automation:', error)
    }
  }

  /**
   * Trigger automation when a deal is lost
   */
  static async onDealLost(dealData: any, reason?: string) {
    try {
      console.log(' Triggering deal_lost automation for deal:', dealData.id)
      
      const companyId = dealData.company_id || dealData.companyId
      
      if (!companyId) {
        console.warn('  No company_id found for deal, skipping automation')
        return
      }
      
      await AutomationExecutor.executeTrigger({
        eventType: 'deal_lost',
        companyId: companyId,
        entityId: dealData.id,
        entityType: 'deal',
        data: {
          id: dealData.id,
          name: dealData.name,
          value: dealData.value,
          reason,
          lostAt: new Date().toISOString()
        }
      })
    } catch (error) {
      console.error(' Failed to trigger deal_lost automation:', error)
    }
  }
}

/**
 * Centralized Automation Trigger Manager
 * Provides a single entry point for triggering automations from any module
 */
export class AutomationTriggerManager {
  static Lead = LeadAutomation
  static Contact = ContactAutomation
  static Campaign = CampaignAutomation
  static Email = EmailAutomation
  static WhatsApp = WhatsAppAutomation
  static Form = FormAutomation
  static Deal = DealAutomation

  /**
   * Initialize the automation system
   */
  static async initialize() {
    try {
      console.log(' Automation system initialized successfully')
    } catch (error) {
      console.error(' Failed to initialize automation system:', error)
    }
  }

  /**
   * Get automation statistics
   */
  static getStats() {
    // Return empty stats for now
    return {
      totalAutomations: 0,
      activeAutomations: 0,
      totalExecutions: 0
    }
  }
}

export default AutomationTriggerManager
