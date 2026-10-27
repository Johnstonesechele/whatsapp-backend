import { AuditLogResult } from './audit-query'

export function exportToCSV(logs: AuditLogResult[]): string {
  const headers = [
    'Timestamp', 'User', 'Email', 'Action', 'Entity Type', 'Entity ID',
    'Details', 'Risk Level', 'Compliance Category', 'IP Address',
    'User Agent', 'Entry Hash'
  ]

  const rows = logs.map(log => [
    log.created_at,
    log.user_name || '',
    log.user_email || '',
    log.action,
    log.entity_type,
    log.entity_id || '',
    (log.details || '').replace(/"/g, '""'),
    log.risk_level,
    log.compliance_category,
    log.ip_address || '',
    (log.user_agent || '').replace(/"/g, '""'),
    log.entry_hash || ''
  ])

  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n')

  return csvContent
}

export function exportToJSON(logs: AuditLogResult[]): string {
  return JSON.stringify(logs.map(log => ({
    timestamp: log.created_at,
    user: { id: log.user_id, name: log.user_name, email: log.user_email },
    action: log.action,
    entity: { type: log.entity_type, id: log.entity_id },
    details: log.details,
    old_values: log.old_values,
    new_values: log.new_values,
    risk_level: log.risk_level,
    compliance_category: log.compliance_category,
    ip_address: log.ip_address,
    user_agent: log.user_agent,
    entry_hash: log.entry_hash
  })), null, 2)
}

export function formatForCEF(logs: AuditLogResult[]): string {
  return logs.map(log => {
    const timestamp = new Date(log.created_at).getTime()
    const severity = mapRiskToSeverity(log.risk_level)

    return `CEF:0|EvolutionCRM|CRM|1.0|${log.action}|${log.details || log.action}|${severity}|`
      + `src=${log.ip_address || 'unknown'} `
      + `suser=${log.user_email} `
      + `suid=${log.user_id} `
      + `cs1=${log.entity_type} cs1=Entity Type `
      + `cs2=${log.entity_id || 'N/A'} cs2=Entity ID `
      + `cs3=${log.risk_level} cs3=Risk Level `
      + `cs4=${log.compliance_category} cs4=Compliance `
      + `request=${log.user_agent || 'unknown'}`
  }).join('\n')
}

function mapRiskToSeverity(riskLevel: string): number {
  switch (riskLevel) {
    case 'critical': return 10
    case 'high': return 7
    case 'medium': return 4
    case 'low': return 1
    default: return 1
  }
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function downloadCSV(logs: AuditLogResult[], filename?: string): void {
  const csv = exportToCSV(logs)
  downloadFile(csv, filename || `audit-logs-${new Date().toISOString().split('T')[0]}.csv`, 'text/csv')
}

export function downloadJSON(logs: AuditLogResult[], filename?: string): void {
  const json = exportToJSON(logs)
  downloadFile(json, filename || `audit-logs-${new Date().toISOString().split('T')[0]}.json`, 'application/json')
}

export function downloadSIEM(logs: AuditLogResult[], filename?: string): void {
  const cef = formatForCEF(logs)
  downloadFile(cef, filename || `audit-logs-siem-${new Date().toISOString().split('T')[0]}.log`, 'text/plain')
}
