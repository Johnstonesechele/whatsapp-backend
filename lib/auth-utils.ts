// Auth types and utility functions - no React

export interface User {
  id: string
  name: string
  email: string
  role: string
  permissions: string[]
  department?: string
  position?: string
  location?: string
  company_id: string
  company?: {
    id: string
    name: string
    subscription_plan: string
    subscription_status: string
  }
  avatar?: string
  email_verified: boolean
}

export interface AuthContextType {
  user: User | null
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  isLoading: boolean
  hasPermission: (permission: string) => boolean
  canAssignLeads: () => boolean
  canInviteUsers: () => boolean
  isCompanyManager: () => boolean
  isSystemAdmin: () => boolean
}

export const normalizeRole = (role?: string | null): string => {
  return String(role || '').trim().replace(/-/g, '_').toLowerCase()
}

export const parsePermissions = (value: unknown): string[] => {
  if (!value) return []

  if (Array.isArray(value)) {
    return value.map(permission => String(permission)).filter(Boolean)
  }

  if (typeof value !== 'string') {
    return []
  }

  const trimmed = value.trim()
  if (!trimmed) return []

  if (trimmed === '*' || trimmed === 'all') {
    return ['*']
  }

  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed)) {
      return parsed.map(permission => String(permission)).filter(Boolean)
    }
    if (typeof parsed === 'string' && parsed.trim()) {
      return [parsed.trim()]
    }
  } catch {
    // Fall through to legacy string handling below.
  }

  if (trimmed.includes(',')) {
    return trimmed.split(',').map(permission => permission.trim()).filter(Boolean)
  }

  return [trimmed]
}

export const isSystemAdminRole = (role?: string | null): boolean => {
  const normalizedRole = normalizeRole(role)
  return normalizedRole === 'system_admin' || normalizedRole === 'super_admin'
}

export const isCompanyAdminRole = (role?: string | null): boolean => {
  const normalizedRole = normalizeRole(role)
  return normalizedRole === 'admin' || normalizedRole === 'company_admin' || normalizedRole === 'company_manager'
}

export const checkPermission = (userPermissions: string[], permission: string): boolean => {
  if (!userPermissions || !Array.isArray(userPermissions)) {
    return false
  }
  
  return userPermissions.includes(permission) || userPermissions.includes('admin.*')
}

export const checkRole = (user: User | null, requiredRole: string): boolean => {
  if (!user) return false
  const normalizedRole = user.role?.replace(/-/g, '_')
  const normalizedRequiredRole = requiredRole.replace(/-/g, '_')
  return normalizedRole === normalizedRequiredRole
}

export const isSystemAdmin = (user: User | null): boolean => {
  return checkRole(user, 'system_admin')
}

export const isCompanyManager = (user: User | null): boolean => {
  if (!user) return false
  const normalizedRole = user.role?.replace(/-/g, '_')
  return ['company_manager', 'company_admin', 'admin', 'system_admin'].includes(normalizedRole)
}

export const canAssignLeads = (user: User | null): boolean => {
  if (!user) return false
  return checkPermission(user.permissions, 'leads.assign') || isCompanyManager(user)
}

export const canInviteUsers = (user: User | null): boolean => {
  if (!user) return false
  return checkPermission(user.permissions, 'users.invite') || isCompanyManager(user)
}
