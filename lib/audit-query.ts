import { getSupabaseAdminClient } from '@/backend/database/supabase-config'
import { RiskLevel, ComplianceCategory } from './audit-logger'

const supabase = getSupabaseAdminClient()

export interface AuditQueryFilters {
  company_id: string
  user_id?: string
  action?: string
  entity_type?: string
  risk_level?: RiskLevel
  compliance_category?: ComplianceCategory
  date_from?: string
  date_to?: string
  search?: string
  page?: number
  limit?: number
}

export interface AuditLogResult {
  id: string
  user_id: string
  action: string
  entity_type: string
  entity_id: string | null
  details: string | null
  old_values: Record<string, any> | null
  new_values: Record<string, any> | null
  ip_address: string | null
  user_agent: string | null
  session_id: string | null
  risk_level: RiskLevel
  compliance_category: ComplianceCategory
  entry_hash: string | null
  created_at: string
  user_name?: string
  user_email?: string
}

export interface AuditQueryResponse {
  logs: AuditLogResult[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export async function queryLogs(filters: AuditQueryFilters): Promise<AuditQueryResponse> {
  const page = filters.page || 1
  const limit = Math.min(filters.limit || 50, 100)
  const offset = (page - 1) * limit

  let query = supabase
    .from('activity_logs')
    .select('*, users:user_id(name, email)', { count: 'exact' })
    .eq('company_id', filters.company_id)
    .order('created_at', { ascending: false })

  if (filters.user_id) query = query.eq('user_id', filters.user_id)
  if (filters.action) query = query.eq('action', filters.action)
  if (filters.entity_type) query = query.eq('entity_type', filters.entity_type)
  if (filters.risk_level) query = query.eq('risk_level', filters.risk_level)
  if (filters.compliance_category) query = query.eq('compliance_category', filters.compliance_category)
  if (filters.date_from) query = query.gte('created_at', filters.date_from)
  if (filters.date_to) query = query.lte('created_at', filters.date_to)
  if (filters.search) {
    query = query.or(`details.ilike.%${filters.search}%,action.ilike.%${filters.search}%,entity_type.ilike.%${filters.search}%`)
  }

  const { data, count, error } = await query.range(offset, offset + limit - 1)

  if (error) throw error

  const logs = (data || []).map(log => ({
    ...log,
    old_values: typeof log.old_values === 'string' ? JSON.parse(log.old_values) : log.old_values,
    new_values: typeof log.new_values === 'string' ? JSON.parse(log.new_values) : log.new_values,
    user_name: log.users?.name || 'Unknown',
    user_email: log.users?.email || 'Unknown'
  }))

  return {
    logs,
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit)
  }
}

export async function getLogById(logId: string, companyId: string): Promise<AuditLogResult | null> {
  const { data, error } = await supabase
    .from('activity_logs')
    .select('*, users:user_id(name, email)')
    .eq('id', logId)
    .eq('company_id', companyId)
    .single()

  if (error || !data) return null

  return {
    ...data,
    old_values: typeof data.old_values === 'string' ? JSON.parse(data.old_values) : data.old_values,
    new_values: typeof data.new_values === 'string' ? JSON.parse(data.new_values) : data.new_values,
    user_name: data.users?.name || 'Unknown',
    user_email: data.users?.email || 'Unknown'
  }
}

export async function getAuditStats(companyId: string): Promise<{
  totalLogs: number
  highRiskCount: number
  criticalRiskCount: number
  uniqueUsers: number
  actionsByType: Record<string, number>
  riskDistribution: Record<RiskLevel, number>
  complianceByCategory: Record<string, number>
  recentActivity: Array<{ date: string; count: number }>
}> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data: logs } = await supabase
    .from('activity_logs')
    .select('action, risk_level, compliance_category, user_id, created_at')
    .eq('company_id', companyId)
    .gte('created_at', thirtyDaysAgo)

  const allLogs = logs || []

  const actionsByType: Record<string, number> = {}
  const riskDistribution: Record<RiskLevel, number> = { low: 0, medium: 0, high: 0, critical: 0 }
  const complianceByCategory: Record<string, number> = {}
  const uniqueUsers = new Set<string>()
  const dailyCounts: Record<string, number> = {}

  for (const log of allLogs) {
    actionsByType[log.action] = (actionsByType[log.action] || 0) + 1
    if (log.risk_level) riskDistribution[log.risk_level as RiskLevel]++
    if (log.compliance_category && log.compliance_category !== 'none') {
      complianceByCategory[log.compliance_category] = (complianceByCategory[log.compliance_category] || 0) + 1
    }
    uniqueUsers.add(log.user_id)
    const date = log.created_at.split('T')[0]
    dailyCounts[date] = (dailyCounts[date] || 0) + 1
  }

  const recentActivity = Object.entries(dailyCounts)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const { count: totalCount } = await supabase
    .from('activity_logs')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)

  const { count: highRiskCount } = await supabase
    .from('activity_logs')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .in('risk_level', ['high', 'critical'])
    .gte('created_at', thirtyDaysAgo)

  return {
    totalLogs: totalCount || 0,
    highRiskCount: highRiskCount || 0,
    criticalRiskCount: riskDistribution.critical,
    uniqueUsers: uniqueUsers.size,
    actionsByType,
    riskDistribution,
    complianceByCategory,
    recentActivity
  }
}

export async function verifyIntegrity(companyId: string, limit: number = 100): Promise<{
  valid: boolean
  totalChecked: number
  brokenAt: string | null
  message: string
}> {
  const { data: logs } = await supabase
    .from('activity_logs')
    .select('id, entry_hash, previous_hash, user_id, action, entity_type, entity_id, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!logs || logs.length === 0) {
    return { valid: true, totalChecked: 0, brokenAt: null, message: 'No logs to verify' }
  }

  const sorted = [...logs].reverse()

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]
    const expectedPrevious = sorted[i - 1].entry_hash

    if (current.previous_hash !== expectedPrevious) {
      return {
        valid: false,
        totalChecked: sorted.length,
        brokenAt: current.id,
        message: `Hash chain broken at entry ${current.id} (${current.created_at})`
      }
    }
  }

  return {
    valid: true,
    totalChecked: sorted.length,
    brokenAt: null,
    message: `All ${sorted.length} entries verified - hash chain is intact`
  }
}
