/**
 * Integration Data Sync Service
 * Handles data synchronization between external integrations and the CRM
 */

import { getSupabaseAdminClient } from '@/backend/database/supabase-config';

interface SyncResult {
  imported: number;
  updated: number;
  errors: number;
  records?: any[];
  errorDetails?: Array<{ record: any; error: string }>;
}

interface SyncError extends Error {
  code?: string;
  details?: any;
}

export class IntegrationSyncService {
  /**
   * Validate required parameters for sync operations
   */
  private static validateSyncParams(accessToken: string, userId: number, companyId: number): void {
    if (!accessToken) {
      throw new Error('Access token is required');
    }
    if (!userId || userId <= 0) {
      throw new Error('Valid user ID is required');
    }
    if (!companyId || companyId <= 0) {
      throw new Error('Valid company ID is required');
    }
  }

  /**
   * Sync contacts from Salesforce
   */
  static async syncSalesforceContacts(accessToken: string, userId: number, companyId: number): Promise<SyncResult> {
    try {
      this.validateSyncParams(accessToken, userId, companyId);

      const supabase = getSupabaseAdminClient();
      
      // In production, this would call Salesforce API
      // Example: GET https://yourinstance.salesforce.com/services/data/v58.0/query?q=SELECT+Id,Name,Email+FROM+Contact
      
      const mockContacts = [
        { salesforceId: 'SF001', name: 'John Doe', email: 'john@example.com', phone: '555-0101' },
        { salesforceId: 'SF002', name: 'Jane Smith', email: 'jane@example.com', phone: '555-0102' }
      ];

      let imported = 0;
      let updated = 0;
      let errors = 0;
      const errorDetails: Array<{ record: any; error: string }> = [];

      for (const contact of mockContacts) {
        try {
          if (!contact.email) {
            throw new Error('Contact email is required');
          }

          // Check if contact exists in CRM
          const { data: existing, error: queryError } = await supabase
            .from('contacts')
            .select('id')
            .eq('email', contact.email)
            .eq('company_id', companyId)
            .eq("active", true)
            .single();

          if (queryError && queryError.code !== 'PGRST116') {
            // PGRST116 is "no rows returned", which is expected
            throw queryError;
          }

          if (existing) {
            // Update existing contact
            const { error: updateError } = await supabase
              .from('contacts')
              .update({
                name: contact.name,
                phone: contact.phone,
                external_id: contact.salesforceId,
                external_source: 'salesforce'
              })
              .eq('id', existing.id);
            
            if (updateError) throw updateError;
            updated++;
          } else {
            // Create new contact
            const { error: insertError } = await supabase
              .from('contacts')
              .insert({
                company_id: companyId,
                user_id: userId,
                name: contact.name,
                email: contact.email,
                phone: contact.phone,
                external_id: contact.salesforceId,
                external_source: 'salesforce',
                active: 1
              });
            
            if (insertError) throw insertError;
            imported++;
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error('Error syncing contact:', contact, errorMessage);
          errorDetails.push({ record: contact, error: errorMessage });
          errors++;
        }
      }

      return { imported, updated, errors, errorDetails: errorDetails.length > 0 ? errorDetails : undefined };
    } catch (error) {
      const syncError = error as SyncError;
      console.error('Salesforce contacts sync error:', syncError.message || error);
      throw new Error(`Failed to sync Salesforce contacts: ${syncError.message || 'Unknown error'}`);
    }
  }

  /**
   * Sync leads from Salesforce
   */
  static async syncSalesforceLeads(accessToken: string, userId: number, companyId: number): Promise<SyncResult> {
    try {
      this.validateSyncParams(accessToken, userId, companyId);

      const supabase = getSupabaseAdminClient();
      
      const mockLeads = [
        { salesforceId: 'L001', name: 'Acme Corp Lead', email: 'contact@acme.com', status: 'New', source: 'Salesforce' },
        { salesforceId: 'L002', name: 'TechStart Lead', email: 'info@techstart.com', status: 'Qualified', source: 'Salesforce' }
      ];

      let imported = 0;
      let updated = 0;
      let errors = 0;
      const errorDetails: Array<{ record: any; error: string }> = [];

      for (const lead of mockLeads) {
        try {
          if (!lead.email) {
            throw new Error('Lead email is required');
          }

          const { data: existing, error: queryError } = await supabase
            .from('leads')
            .select('id')
            .eq('email', lead.email)
            .eq('company_id', companyId)
            .eq("active", true)
            .single();

          if (queryError && queryError.code !== 'PGRST116') {
            throw queryError;
          }

          if (existing) {
            const { error: updateError } = await supabase
              .from('leads')
              .update({
                name: lead.name,
                status: lead.status,
                source: lead.source,
                external_id: lead.salesforceId,
                external_source: 'salesforce'
              })
              .eq('id', existing.id);
            
            if (updateError) throw updateError;
            updated++;
          } else {
            const { error: insertError } = await supabase
              .from('leads')
              .insert({
                company_id: companyId,
                user_id: userId,
                name: lead.name,
                email: lead.email,
                status: lead.status,
                source: lead.source,
                external_id: lead.salesforceId,
                external_source: 'salesforce',
                active: 1
              });
            
            if (insertError) throw insertError;
            imported++;
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error('Error syncing lead:', lead, errorMessage);
          errorDetails.push({ record: lead, error: errorMessage });
          errors++;
        }
      }

      return { imported, updated, errors, errorDetails: errorDetails.length > 0 ? errorDetails : undefined };
    } catch (error) {
      const syncError = error as SyncError;
      console.error('Salesforce leads sync error:', syncError.message || error);
      throw new Error(`Failed to sync Salesforce leads: ${syncError.message || 'Unknown error'}`);
    }
  }

  /**
   * Sync deals from Salesforce (Opportunities)
   */
  static async syncSalesforceDeals(accessToken: string, userId: number, companyId: number): Promise<SyncResult> {
    try {
      this.validateSyncParams(accessToken, userId, companyId);

      const supabase = getSupabaseAdminClient();
      
      const mockDeals = [
        { salesforceId: 'OPP001', name: 'Big Enterprise Deal', amount: 50000, stage: 'Proposal', probability: 60 },
        { salesforceId: 'OPP002', name: 'Mid-Market Opportunity', amount: 25000, stage: 'Negotiation', probability: 75 }
      ];

      let imported = 0;
      let updated = 0;
      let errors = 0;
      const errorDetails: Array<{ record: any; error: string }> = [];

      for (const deal of mockDeals) {
        try {
          if (!deal.name) {
            throw new Error('Deal name is required');
          }

          const { data: existing, error: queryError } = await supabase
            .from('deals')
            .select('id')
            .eq('external_id', deal.salesforceId)
            .eq('external_source', 'salesforce')
            .eq('company_id', companyId)
            .eq("active", true)
            .single();

          if (queryError && queryError.code !== 'PGRST116') {
            throw queryError;
          }

          if (existing) {
            const { error: updateError } = await supabase
              .from('deals')
              .update({
                name: deal.name,
                value: deal.amount,
                stage: deal.stage
              })
              .eq('id', existing.id);
            
            if (updateError) throw updateError;
            updated++;
          } else {
            const { error: insertError } = await supabase
              .from('deals')
              .insert({
                company_id: companyId,
                user_id: userId,
                name: deal.name,
                value: deal.amount,
                stage: deal.stage,
                external_id: deal.salesforceId,
                external_source: 'salesforce',
                active: 1
              });
            
            if (insertError) throw insertError;
            imported++;
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error('Error syncing deal:', deal, errorMessage);
          errorDetails.push({ record: deal, error: errorMessage });
          errors++;
        }
      }

      return { imported, updated, errors, errorDetails: errorDetails.length > 0 ? errorDetails : undefined };
    } catch (error) {
      const syncError = error as SyncError;
      console.error('Salesforce deals sync error:', syncError.message || error);
      throw new Error(`Failed to sync Salesforce deals: ${syncError.message || 'Unknown error'}`);
    }
  }

  /**
   * Sync contacts from HubSpot
   */
  static async syncHubSpotContacts(accessToken: string, userId: number, companyId: number): Promise<SyncResult> {
    try {
      this.validateSyncParams(accessToken, userId, companyId);

      const supabase = getSupabaseAdminClient();
      
      // In production, call HubSpot API
      // Example: GET https://api.hubapi.com/crm/v3/objects/contacts
      
      const mockContacts = [
        { hubspotId: 'HS001', firstname: 'Alice', lastname: 'Johnson', email: 'alice@example.com' },
        { hubspotId: 'HS002', firstname: 'Bob', lastname: 'Williams', email: 'bob@example.com' }
      ];

      let imported = 0;
      let updated = 0;
      let errors = 0;
      const errorDetails: Array<{ record: any; error: string }> = [];

      for (const contact of mockContacts) {
        try {
          if (!contact.email) {
            throw new Error('Contact email is required');
          }

          const name = `${contact.firstname} ${contact.lastname}`;
          
          const { data: existing, error: queryError } = await supabase
            .from('contacts')
            .select('id')
            .eq('email', contact.email)
            .eq('company_id', companyId)
            .eq("active", true)
            .single();

          if (queryError && queryError.code !== 'PGRST116') {
            throw queryError;
          }

          if (existing) {
            const { error: updateError } = await supabase
              .from('contacts')
              .update({
                name,
                external_id: contact.hubspotId,
                external_source: 'hubspot'
              })
              .eq('id', existing.id);
            
            if (updateError) throw updateError;
            updated++;
          } else {
            const { error: insertError } = await supabase
              .from('contacts')
              .insert({
                company_id: companyId,
                user_id: userId,
                name,
                email: contact.email,
                external_id: contact.hubspotId,
                external_source: 'hubspot',
                active: 1
              });
            
            if (insertError) throw insertError;
            imported++;
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error('Error syncing HubSpot contact:', contact, errorMessage);
          errorDetails.push({ record: contact, error: errorMessage });
          errors++;
        }
      }

      return { imported, updated, errors, errorDetails: errorDetails.length > 0 ? errorDetails : undefined };
    } catch (error) {
      const syncError = error as SyncError;
      console.error('HubSpot contacts sync error:', syncError.message || error);
      throw new Error(`Failed to sync HubSpot contacts: ${syncError.message || 'Unknown error'}`);
    }
  }

  /**
   * Sync Google Calendar events
   */
  static async syncGoogleCalendar(accessToken: string, userId: number, companyId: number): Promise<SyncResult> {
    try {
      // In production, call Google Calendar API
      // Example: GET https://www.googleapis.com/calendar/v3/calendars/primary/events
      
      const mockEvents = [
        { googleId: 'GC001', summary: 'Client Meeting', start: new Date(), end: new Date() },
        { googleId: 'GC002', summary: 'Team Standup', start: new Date(), end: new Date() }
      ];

      let imported = mockEvents.length;
      let updated = 0;

      // In production, save to schedule/tasks table

      return { imported, updated, errors: 0 };
    } catch (error) {
      console.error('Google Calendar sync error:', error);
      throw error;
    }
  }

  /**
   * Full sync for an integration
   */
  static async fullSync(provider: string, accessToken: string, userId: number, companyId: number) {
    const results: Record<string, SyncResult> = {};

    try {
      switch (provider) {
        case 'salesforce':
          results.contacts = await this.syncSalesforceContacts(accessToken, userId, companyId);
          results.leads = await this.syncSalesforceLeads(accessToken, userId, companyId);
          results.deals = await this.syncSalesforceDeals(accessToken, userId, companyId);
          break;

        case 'hubspot':
          results.contacts = await this.syncHubSpotContacts(accessToken, userId, companyId);
          // Add more HubSpot sync methods as needed
          break;

        case 'google':
          results.calendar = await this.syncGoogleCalendar(accessToken, userId, companyId);
          // Add more Google sync methods as needed
          break;

        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }

      return {
        success: true,
        results,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error(`Full sync error for ${provider}:`, error);
      throw error;
    }
  }
}

