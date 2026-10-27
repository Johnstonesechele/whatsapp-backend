import crypto from 'crypto'
import { getSupabaseAdminClient } from '@/backend/database/supabase-config'

const supabase = getSupabaseAdminClient()

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'
export type ComplianceCategory = 'access_control' | 'data_protection' | 'change_management' | 'audit' | 'system' | 'none'

export interface AuditLogEntry {
  id?: string
  company_id: string
  user_id: string
  action: string
  entity_type: string
  entity_id?: string
  details?: string
  old_values?: Record<string, any>
  new_values?: Record<string, any>
  ip_address?: string
  user_agent?: string
  session_id?: string
  risk_level?: RiskLevel
  compliance_category?: ComplianceCategory
}

const HIGH_RISK_ACTIONS = [
  'delete', 'role_change', 'permission_change', 'password_reset',
  'account_disable', 'export', 'sso_login', 'impersonate',
  'system_config_change', 'billing_change'
]

const CRITICAL_ACTIONS = [
  'data_breach', 'admin_elevation', 'system_delete', 'backup_delete',
  'compliance_violation', 'external_sharing'
]

const COMPLIANCE_MAP: Record<string, ComplianceCategory> = {
  login: 'access_control', logout: 'access_control',
  sso_login: 'access_control', mfa_verify: 'access_control',
  password_change: 'access_control', password_reset: 'access_control',
  account_create: 'access_control', account_disable: 'access_control',
  user_invite: 'access_control', role_change: 'access_control',
  permission_change: 'access_control', impersonate: 'access_control',
  create: 'change_management', update: 'change_management',
  delete: 'change_management', import: 'change_management',
  export: 'data_protection', consent_change: 'data_protection',
  data_access: 'data_protection', data_download: 'data_protection',
  settings_change: 'system', config_change: 'system',
  system_config_change: 'system', backup: 'system',
  audit_view: 'audit', audit_export: 'audit'
}

function classifyRiskLevel(action: string, entityType?: string): RiskLevel {
  const actionLower = action.toLowerCase()
  if (CRITICAL_ACTIONS.some(a => actionLower.includes(a))) return 'critical'
  if (HIGH_RISK_ACTIONS.some(a => actionLower.includes(a))) return 'high'
  if (['update', 'edit', 'change'].some(a => actionLower.includes(a))) return 'medium'
  return 'low'
}

function classifyCompliance(action: string): ComplianceCategory {
  return COMPLIANCE_MAP[action] || 'none'
}

async function getLatestHash(companyId: string): Promise<string | null> {
  const { data } = await supabase
    .from('activity_logs')
    .select('entry_hash')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()
  return data?.entry_hash || null
}

function generateEntryHash(
  companyId: string,
  userId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  previousHash: string | null,
  timestamp: string
): string {
  const data = `${companyId}:${userId}:${action}:${entityType}:${entityId || ''}:${previousHash || ''}:${timestamp}`
  return crypto.createHash('sha256').update(data).digest('hex')
}

export async function logAction(entry: AuditLogEntry): Promise<void> {
  try {
    const now = new Date().toISOString()
    const riskLevel = entry.risk_level || classifyRiskLevel(entry.action, entry.entity_type)
    const complianceCategory = entry.compliance_category || classifyCompliance(entry.action)

    const previousHash = await getLatestHash(entry.company_id)
    const entryHash = generateEntryHash(
      entry.company_id,
      entry.user_id,
      entry.action,
      entry.entity_type,
      entry.entity_id || null,
      previousHash,
      now
    )

    await supabase.from('activity_logs').insert({
      company_id: entry.company_id,
      user_id: entry.user_id,
      action: entry.action,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id || null,
      details: entry.details || null,
      old_values: entry.old_values || null,
      new_values: entry.new_values || null,
      ip_address: entry.ip_address || null,
      user_agent: entry.user_agent || null,
      session_id: entry.session_id || null,
      risk_level: riskLevel,
      compliance_category: complianceCategory,
      previous_hash: previousHash,
      entry_hash: entryHash
    })
  } catch (error) {
    console.error('Audit log error:', error)
  }
}

export async function logCRUD(
  companyId: string,
  userId: string,
  action: 'create' | 'update' | 'delete',
  entityType: string,
  entityId: string,
  oldValues?: Record<string, any>,
  newValues?: Record<string, any>,
  request?: { ip?: string; userAgent?: string; sessionId?: string }
): Promise<void> {
  const details = action === 'delete'
    ? `Deleted ${entityType} ${entityId}`
    : action === 'create'
    ? `Created new ${entityType}`
    : `Updated ${entityType} ${entityId}`

  await logAction({
    company_id: companyId,
    user_id: userId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    details,
    old_values: oldValues,
    new_values: newValues,
    ip_address: request?.ip,
    user_agent: request?.userAgent,
    session_id: request?.sessionId
  })
}

export async function logAuth(
  companyId: string,
  userId: string,
  action: string,
  details: string,
  request?: { ip?: string; userAgent?: string }
): Promise<void> {
  await logAction({
    company_id: companyId,
    user_id: userId,
    action,
    entity_type: 'auth',
    details,
    ip_address: request?.ip,
    user_agent: request?.userAgent
  })
}

export { classifyRiskLevel, classifyCompliance }
