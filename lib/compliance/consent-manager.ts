import { getSupabaseAdminClient } from '@/backend/database/supabase-config'

const supabase = getSupabaseAdminClient()

export interface ConsentRecord {
  id: string
  company_id: string
  contact_id: string
  consent_type: string
  status: 'granted' | 'withdrawn' | 'pending'
  purpose: string | null
  source: string | null
  granted_at: string | null
  withdrawn_at: string | null
  expires_at: string | null
  created_at: string
}

export async function getConsentRecords(
  companyId: string,
  filters?: { contact_id?: string; consent_type?: string; status?: string }
): Promise<ConsentRecord[]> {
  let query = supabase
    .from('consent_records')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })

  if (filters?.contact_id) query = query.eq('contact_id', filters.contact_id)
  if (filters?.consent_type) query = query.eq('consent_type', filters.consent_type)
  if (filters?.status) query = query.eq('status', filters.status)

  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function getContactConsentStatus(
  contactId: string,
  companyId: string
): Promise<Record<string, ConsentRecord>> {
  const { data } = await supabase
    .from('consent_records')
    .select('*')
    .eq('contact_id', contactId)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })

  const latestByType: Record<string, ConsentRecord> = {}
  for (const record of data || []) {
    if (!latestByType[record.consent_type]) {
      latestByType[record.consent_type] = record
    }
  }

  return latestByType
}

export async function recordConsent(
  companyId: string,
  contactId: string,
  consentType: string,
  status: 'granted' | 'withdrawn',
  options?: {
    purpose?: string
    source?: string
    ip_address?: string
    user_agent?: string
  }
): Promise<ConsentRecord> {
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('consent_records')
    .insert({
      company_id: companyId,
      contact_id: contactId,
      consent_type: consentType,
      status,
      purpose: options?.purpose || null,
      source: options?.source || 'manual',
      ip_address: options?.ip_address || null,
      user_agent: options?.user_agent || null,
      granted_at: status === 'granted' ? now : null,
      withdrawn_at: status === 'withdrawn' ? now : null
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function hasConsent(
  contactId: string,
  companyId: string,
  consentType: string
): Promise<boolean> {
  const { data } = await supabase
    .from('consent_records')
    .select('status')
    .eq('contact_id', contactId)
    .eq('company_id', companyId)
    .eq('consent_type', consentType)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  return data?.status === 'granted'
}

export async function getConsentStats(companyId: string): Promise<{
  total: number
  granted: number
  withdrawn: number
  pending: number
  byType: Record<string, { granted: number; withdrawn: number }>
}> {
  const { data } = await supabase
    .from('consent_records')
    .select('consent_type, status')
    .eq('company_id', companyId)

  const records = data || []
  const stats = {
    total: records.length,
    granted: records.filter(r => r.status === 'granted').length,
    withdrawn: records.filter(r => r.status === 'withdrawn').length,
    pending: records.filter(r => r.status === 'pending').length,
    byType: {} as Record<string, { granted: number; withdrawn: number }>
  }

  for (const record of records) {
    if (!stats.byType[record.consent_type]) {
      stats.byType[record.consent_type] = { granted: 0, withdrawn: 0 }
    }
    if (record.status === 'granted') stats.byType[record.consent_type].granted++
    if (record.status === 'withdrawn') stats.byType[record.consent_type].withdrawn++
  }

  return stats
}
