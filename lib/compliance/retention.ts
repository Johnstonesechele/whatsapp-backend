import { getSupabaseAdminClient } from '@/backend/database/supabase-config'

const supabase = getSupabaseAdminClient()

export interface RetentionPolicy {
  id: string
  company_id: string
  entity_type: string
  retention_days: number
  auto_delete: boolean
  archive_before_delete: boolean
  last_cleanup_at: string | null
}

export async function getRetentionPolicies(companyId: string): Promise<RetentionPolicy[]> {
  const { data, error } = await supabase
    .from('data_retention_policies')
    .select('*')
    .eq('company_id', companyId)
    .order('entity_type')

  if (error) throw error
  return data || []
}

export async function upsertRetentionPolicy(
  companyId: string,
  entityType: string,
  input: Partial<Pick<RetentionPolicy, 'retention_days' | 'auto_delete' | 'archive_before_delete'>>
): Promise<RetentionPolicy> {
  const { data, error } = await supabase
    .from('data_retention_policies')
    .upsert({
      company_id: companyId,
      entity_type: entityType,
      retention_days: input.retention_days || 365,
      auto_delete: input.auto_delete || false,
      archive_before_delete: input.archive_before_delete !== false
    }, { onConflict: 'company_id,entity_type' })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function executeRetentionCleanup(
  companyId: string,
  entityType?: string
): Promise<{ cleaned: number; errors: string[] }> {
  const policies = entityType
    ? (await getRetentionPolicies(companyId)).filter(p => p.entity_type === entityType)
    : await getRetentionPolicies(companyId)

  let totalCleaned = 0
  const errors: string[] = []

  for (const policy of policies) {
    try {
      const cutoffDate = new Date(Date.now() - policy.retention_days * 24 * 60 * 60 * 1000).toISOString()

      const tableMap: Record<string, string> = {
        contacts: 'contacts',
        leads: 'leads',
        deals: 'deals',
        campaigns: 'campaigns',
        activities: 'activity_logs',
        feedback: 'feedback',
        chat_messages: 'chat_messages'
      }

      const table = tableMap[policy.entity_type]
      if (!table) {
        errors.push(`Unknown entity type: ${policy.entity_type}`)
        continue
      }

      const { count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .lt('created_at', cutoffDate)

      if (policy.auto_delete && count && count > 0) {
        const { error } = await supabase
          .from(table)
          .delete()
          .eq('company_id', companyId)
          .lt('created_at', cutoffDate)

        if (error) {
          errors.push(`${policy.entity_type}: ${error.message}`)
        } else {
          totalCleaned += count
          await supabase
            .from('data_retention_policies')
            .update({
              last_cleanup_at: new Date().toISOString(),
              cleanup_log: [...((policy as any).cleanup_log || []), {
                date: new Date().toISOString(),
                count,
                action: 'deleted'
              }]
            })
            .eq('id', policy.id)
        }
      }
    } catch (err: any) {
      errors.push(`${policy.entity_type}: ${err.message}`)
    }
  }

  return { cleaned: totalCleaned, errors }
}
