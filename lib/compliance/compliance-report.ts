import { getSupabaseAdminClient } from '@/backend/database/supabase-config'

const supabase = getSupabaseAdminClient()

export interface ComplianceReport {
  generated_at: string
  company_id: string
  company_name: string
  sections: ComplianceSection[]
  overall_score: number
  recommendations: string[]
}

export interface ComplianceSection {
  name: string
  score: number
  max_score: number
  status: 'pass' | 'warning' | 'fail'
  items: ComplianceItem[]
}

export interface ComplianceItem {
  name: string
  status: 'pass' | 'warning' | 'fail'
  description: string
  detail?: string
}

export async function generateComplianceReport(companyId: string): Promise<ComplianceReport> {
  const { data: company } = await supabase
    .from('companies')
    .select('name')
    .eq('id', companyId)
    .single()

  const sections = await Promise.all([
    checkAccessControls(companyId),
    checkAuditLogging(companyId),
    checkDataProtection(companyId),
    checkMFA(companyId),
    checkSSO(companyId),
    checkDataRetention(companyId)
  ])

  const totalScore = sections.reduce((sum, s) => sum + s.score, 0)
  const maxScore = sections.reduce((sum, s) => sum + s.max_score, 0)
  const overallScore = Math.round((totalScore / maxScore) * 100)

  const recommendations: string[] = []
  for (const section of sections) {
    for (const item of section.items) {
      if (item.status !== 'pass') {
        recommendations.push(`${section.name}: ${item.description}`)
      }
    }
  }

  return {
    generated_at: new Date().toISOString(),
    company_id: companyId,
    company_name: company?.name || 'Unknown',
    sections,
    overall_score: overallScore,
    recommendations
  }
}

async function checkAccessControls(companyId: string): Promise<ComplianceSection> {
  const items: ComplianceItem[] = []

  const { count: totalUsers } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)

  const { count: activeUsers } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('active', true)

  const { count: adminUsers } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .in('role', ['admin', 'system-admin', 'super_admin'])

  items.push({
    name: 'User Account Management',
    status: (activeUsers || 0) <= (totalUsers || 0) ? 'pass' : 'warning',
    description: `${activeUsers} active users out of ${totalUsers} total`,
    detail: `${adminUsers} administrator accounts`
  })

  const { count: recentLogins } = await supabase
    .from('activity_logs')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('action', 'login')
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

  items.push({
    name: 'Login Monitoring',
    status: (recentLogins || 0) > 0 ? 'pass' : 'warning',
    description: `${recentLogins} login events in the last 30 days`
  })

  const score = items.filter(i => i.status === 'pass').length
  return {
    name: 'Access Controls',
    score,
    max_score: items.length,
    status: score === items.length ? 'pass' : score > 0 ? 'warning' : 'fail',
    items
  }
}

async function checkAuditLogging(companyId: string): Promise<ComplianceSection> {
  const items: ComplianceItem[] = []

  const { count: totalLogs } = await supabase
    .from('activity_logs')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)

  items.push({
    name: 'Audit Trail Coverage',
    status: (totalLogs || 0) > 100 ? 'pass' : (totalLogs || 0) > 0 ? 'warning' : 'fail',
    description: `${totalLogs || 0} audit log entries`
  })

  const { count: highRiskLogs } = await supabase
    .from('activity_logs')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .in('risk_level', ['high', 'critical'])

  items.push({
    name: 'High-Risk Action Tracking',
    status: 'pass',
    description: `${highRiskLogs || 0} high-risk actions tracked`
  })

  const { count: hashChainLogs } = await supabase
    .from('activity_logs')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .not('entry_hash', 'is', null)

  items.push({
    name: 'Integrity Verification',
    status: (hashChainLogs || 0) > 0 ? 'pass' : 'warning',
    description: `${hashChainLogs || 0} entries with hash chain integrity`
  })

  const score = items.filter(i => i.status === 'pass').length
  return {
    name: 'Audit Logging',
    score,
    max_score: items.length,
    status: score === items.length ? 'pass' : score > 0 ? 'warning' : 'fail',
    items
  }
}

async function checkDataProtection(companyId: string): Promise<ComplianceSection> {
  const items: ComplianceItem[] = []

  const { count: consentRecords } = await supabase
    .from('consent_records')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)

  items.push({
    name: 'Consent Management',
    status: (consentRecords || 0) > 0 ? 'pass' : 'warning',
    description: `${consentRecords || 0} consent records tracked`
  })

  const { count: retentionPolicies } = await supabase
    .from('data_retention_policies')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)

  items.push({
    name: 'Data Retention Policies',
    status: (retentionPolicies || 0) > 0 ? 'pass' : 'warning',
    description: `${retentionPolicies || 0} retention policies configured`
  })

  const score = items.filter(i => i.status === 'pass').length
  return {
    name: 'Data Protection',
    score,
    max_score: items.length,
    status: score === items.length ? 'pass' : score > 0 ? 'warning' : 'fail',
    items
  }
}

async function checkMFA(companyId: string): Promise<ComplianceSection> {
  const items: ComplianceItem[] = []

  const { count: totalUsers } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('active', true)

  const { count: mfaUsers } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('active', true)
    .eq('mfa_enabled', true)

  const mfaRate = totalUsers ? Math.round(((mfaUsers || 0) / totalUsers) * 100) : 0

  items.push({
    name: 'MFA Adoption',
    status: mfaRate >= 80 ? 'pass' : mfaRate >= 50 ? 'warning' : 'fail',
    description: `${mfaRate}% of users have MFA enabled (${mfaUsers}/${totalUsers})`
  })

  const score = items.filter(i => i.status === 'pass').length
  return {
    name: 'Multi-Factor Authentication',
    score,
    max_score: items.length,
    status: score === items.length ? 'pass' : score > 0 ? 'warning' : 'fail',
    items
  }
}

async function checkSSO(companyId: string): Promise<ComplianceSection> {
  const items: ComplianceItem[] = []

  const { count: ssoConfigs } = await supabase
    .from('sso_configurations')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('is_enabled', true)

  items.push({
    name: 'SSO Configuration',
    status: (ssoConfigs || 0) > 0 ? 'pass' : 'warning',
    description: `${ssoConfigs || 0} active SSO configurations`
  })

  const score = items.filter(i => i.status === 'pass').length
  return {
    name: 'SSO Integration',
    score,
    max_score: items.length,
    status: score === items.length ? 'pass' : score > 0 ? 'warning' : 'fail',
    items
  }
}

async function checkDataRetention(companyId: string): Promise<ComplianceSection> {
  const items: ComplianceItem[] = []

  const { count: retentionPolicies } = await supabase
    .from('data_retention_policies')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)

  items.push({
    name: 'Retention Policy Coverage',
    status: (retentionPolicies || 0) >= 3 ? 'pass' : 'warning',
    description: `${retentionPolicies || 0} retention policies configured`
  })

  const score = items.filter(i => i.status === 'pass').length
  return {
    name: 'Data Retention',
    score,
    max_score: items.length,
    status: score === items.length ? 'pass' : score > 0 ? 'warning' : 'fail',
    items
  }
}
