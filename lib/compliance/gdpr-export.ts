import { getSupabaseAdminClient } from '@/backend/database/supabase-config'

const supabase = getSupabaseAdminClient()

export interface GDPRExportData {
  contact: any
  leads: any[]
  deals: any[]
  communications: any[]
  activities: any[]
  consents: any[]
  survey_responses: any[]
  feedback: any[]
  exported_at: string
}

export async function exportContactData(
  contactId: string,
  companyId: string
): Promise<GDPRExportData> {
  const { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', contactId)
    .eq('company_id', companyId)
    .single()

  if (!contact) throw new Error('Contact not found')

  const [leads, deals, activities, consents, surveyResponses, feedback] = await Promise.all([
    supabase.from('leads').select('*').eq('contact_id', contactId).eq('company_id', companyId),
    supabase.from('deals').select('*').eq('contact_id', contactId).eq('company_id', companyId),
    supabase.from('activity_logs').select('*').eq('entity_id', contactId).eq('company_id', companyId),
    supabase.from('consent_records').select('*').eq('contact_id', contactId).eq('company_id', companyId),
    supabase.from('survey_responses').select('*').eq('contact_id', contactId),
    supabase.from('feedback').select('*').eq('contact_id', contactId).eq('company_id', companyId)
  ])

  return {
    contact,
    leads: leads.data || [],
    deals: deals.data || [],
    communications: activities.data || [],
    activities: activities.data || [],
    consents: consents.data || [],
    survey_responses: surveyResponses.data || [],
    feedback: feedback?.data || [],
    exported_at: new Date().toISOString()
  }
}

export async function anonymizeContactData(
  contactId: string,
  companyId: string
): Promise<boolean> {
  const anonymized = {
    name: 'REDACTED',
    email: `redacted_${Date.now()}@redacted.invalid`,
    phone: null,
    address: null,
    notes: null,
    tags: [],
    metadata: { anonymized: true, anonymized_at: new Date().toISOString() }
  }

  const { error } = await supabase
    .from('contacts')
    .update(anonymized)
    .eq('id', contactId)
    .eq('company_id', companyId)

  return !error
}

export async function deleteContactData(
  contactId: string,
  companyId: string
): Promise<{ deleted: string[]; errors: string[] }> {
  const deleted: string[] = []
  const errors: string[] = []

  const tables = ['leads', 'deals', 'campaign_recipients', 'consent_records', 'feedback']

  for (const table of tables) {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('contact_id', contactId)
      .eq('company_id', companyId)

    if (error) errors.push(`${table}: ${error.message}`)
    else deleted.push(table)
  }

  const { error: contactError } = await supabase
    .from('contacts')
    .delete()
    .eq('id', contactId)
    .eq('company_id', companyId)

  if (contactError) errors.push(`contacts: ${contactError.message}`)
  else deleted.push('contacts')

  return { deleted, errors }
}
