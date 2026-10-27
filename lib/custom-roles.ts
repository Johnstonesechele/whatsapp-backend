import { getSupabaseAdminClient } from '@/backend/database/supabase-config'
import { ALL_PERMISSIONS, PermissionKey } from './role-config'

export interface CustomRole {
  id: string
  company_id: string
  name: string
  description: string | null
  permissions: string[]
  is_system: boolean
  color: string | null
  user_count: number
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface CreateCustomRoleInput {
  name: string
  description?: string
  permissions: string[]
  color?: string
}

export interface UpdateCustomRoleInput {
  name?: string
  description?: string
  permissions?: string[]
  color?: string
}

const supabase = getSupabaseAdminClient()

export async function getCustomRoles(companyId: string): Promise<CustomRole[]> {
  const { data, error } = await supabase
    .from('custom_roles')
    .select('*')
    .eq('company_id', companyId)
    .order('name')

  if (error) throw error
  return (data || []).map(role => ({
    ...role,
    permissions: Array.isArray(role.permissions) ? role.permissions : JSON.parse(role.permissions || '[]')
  }))
}

export async function getCustomRoleById(roleId: string, companyId: string): Promise<CustomRole | null> {
  const { data, error } = await supabase
    .from('custom_roles')
    .select('*')
    .eq('id', roleId)
    .eq('company_id', companyId)
    .single()

  if (error) return null
  return {
    ...data,
    permissions: Array.isArray(data.permissions) ? data.permissions : JSON.parse(data.permissions || '[]')
  }
}

export async function createCustomRole(
  companyId: string,
  input: CreateCustomRoleInput,
  createdBy: string
): Promise<CustomRole> {
  const validPermissions = validatePermissions(input.permissions)

  const { data, error } = await supabase
    .from('custom_roles')
    .insert({
      company_id: companyId,
      name: input.name,
      description: input.description || null,
      permissions: validPermissions,
      color: input.color || null,
      created_by: createdBy,
      user_count: 0
    })
    .select()
    .single()

  if (error) throw error
  return {
    ...data,
    permissions: Array.isArray(data.permissions) ? data.permissions : JSON.parse(data.permissions || '[]')
  }
}

export async function updateCustomRole(
  roleId: string,
  companyId: string,
  input: UpdateCustomRoleInput
): Promise<CustomRole> {
  const updateData: Record<string, any> = { updated_at: new Date().toISOString() }

  if (input.name !== undefined) updateData.name = input.name
  if (input.description !== undefined) updateData.description = input.description
  if (input.color !== undefined) updateData.color = input.color
  if (input.permissions !== undefined) {
    updateData.permissions = validatePermissions(input.permissions)
  }

  const { data, error } = await supabase
    .from('custom_roles')
    .update(updateData)
    .eq('id', roleId)
    .eq('company_id', companyId)
    .select()
    .single()

  if (error) throw error
  return {
    ...data,
    permissions: Array.isArray(data.permissions) ? data.permissions : JSON.parse(data.permissions || '[]')
  }
}

export async function deleteCustomRole(roleId: string, companyId: string): Promise<void> {
  const { error } = await supabase
    .from('custom_roles')
    .delete()
    .eq('id', roleId)
    .eq('company_id', companyId)
    .eq('is_system', false)

  if (error) throw error
}

export async function cloneCustomRole(
  roleId: string,
  companyId: string,
  newName: string,
  createdBy: string
): Promise<CustomRole> {
  const source = await getCustomRoleById(roleId, companyId)
  if (!source) throw new Error('Source role not found')

  return createCustomRole(
    companyId,
    {
      name: newName,
      description: source.description || undefined,
      permissions: [...source.permissions],
      color: source.color || undefined
    },
    createdBy
  )
}

export async function getUserCountForRole(companyId: string, roleId: string): Promise<number> {
  const { count, error } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('custom_role_id', roleId)

  if (error) return 0
  return count || 0
}

export function validatePermissions(permissions: string[]): string[] {
  const validKeys = new Set(Object.keys(ALL_PERMISSIONS))
  return permissions.filter(p => {
    if (p === '*') return true
    if (!validKeys.has(p)) return false
    return true
  })
}

export function getEffectivePermissions(
  builtInRolePermissions: string[],
  customRolePermissions: string[]
): string[] {
  const combined = new Set([...builtInRolePermissions])
  for (const perm of customRolePermissions) {
    combined.add(perm)
  }
  return Array.from(combined)
}

export const ENTERPRISE_PERMISSION_GROUPS: Record<string, string[]> = {
  'Contacts': [
    'contacts.view', 'contacts.create', 'contacts.edit', 'contacts.delete',
    'contacts.export', 'contacts.import'
  ],
  'Leads': [
    'leads.view', 'leads.create', 'leads.edit', 'leads.delete',
    'leads.assign', 'leads.export', 'leads.import'
  ],
  'Deals': [
    'deals.view', 'deals.create', 'deals.edit', 'deals.delete'
  ],
  'Campaigns': [
    'campaigns.view', 'campaigns.create', 'campaigns.edit',
    'campaigns.delete', 'campaigns.execute'
  ],
  'Analytics': [
    'analytics.view', 'analytics.export', 'analytics.advanced', 'ai_analytics.view'
  ],
  'Automation': [
    'automation.view', 'automation.create', 'automation.edit',
    'automation.delete', 'automation.execute'
  ],
  'Surveys': [
    'surveys.view', 'surveys.create', 'surveys.edit', 'surveys.delete'
  ],
  'Templates': [
    'templates.view', 'templates.create', 'templates.edit', 'templates.delete'
  ],
  'Chat': [
    'chat.view', 'chat.participate', 'chat.moderate', 'chat.admin'
  ],
  'Documents': [
    'documents.view', 'documents.upload', 'documents.edit', 'documents.delete'
  ],
  'Users': [
    'users.view', 'users.create', 'users.edit', 'users.delete',
    'users.invite', 'users.manage_roles', 'users.manage_permissions', 'users.impersonate'
  ],
  'Settings': [
    'settings.view', 'settings.edit', 'security.manage', 'security.view'
  ],
  'Notifications': [
    'notifications.view', 'notifications.manage'
  ],
  'Activity': [
    'activity.view', 'audit.view'
  ],
  'Companies': [
    'companies.view', 'companies.create', 'companies.edit',
    'companies.delete', 'companies.manage'
  ],
  'System': [
    'system.manage', 'system.configure', 'system.monitor',
    'system.backup', 'system.restore'
  ],
  'Billing': [
    'billing.manage', 'licensing.manage', 'integrations.manage'
  ]
}
