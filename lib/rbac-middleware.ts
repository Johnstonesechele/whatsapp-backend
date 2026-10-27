// RBAC Middleware - Comprehensive role-based access control
// This middleware ensures company admins have full access to their company data

import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { getSupabaseAdminClient } from '@/backend/database/supabase-config'
import { isSystemAdminRole, isCompanyAdminRole, normalizeRole } from './auth-utils'
import { getJWTSecret } from "@/lib/jwt"

const JWT_SECRET = getJWTSecret()

// Role hierarchy for permission levels (higher number = more permissions)
export const ROLE_LEVELS: Record<string, number> = {
  'system_admin': 100,
  'super_admin': 100,
  'admin': 90,
  'company_admin': 90,
  'company_manager': 80,
  'sales_manager': 70,
  'marketing_manager': 70,
  'sales_representative': 60,
  'sales_rep': 60,
  'marketing_specialist': 60,
  'customer_support': 50,
  'team_member': 40,
  'viewer': 30,
  'guest': 10
}

// Permission matrix - defines what each role can do
export const PERMISSIONS: Record<string, string[]> = {
  'system_admin': ['*'], // All permissions
  'super_admin': ['*'],
  'admin': [
    'user:*', 'role:*', 'company:*', 'settings:*', 
    'team:*', 'analytics:*', 'billing:*', 'subscription:*',
    'leads:*', 'contacts:*', 'deals:*', 'pipeline:*'
  ],
  'company_admin': [
    'user:*', 'role:*', 'settings:*', 'team:*', 
    'analytics:*', 'billing:*', 'subscription:*',
    'leads:*', 'contacts:*', 'deals:*', 'pipeline:*'
  ],
  'company_manager': [
    'user:read', 'user:update', 'role:read', 
    'settings:read', 'settings:update', 'team:read', 'team:update',
    'analytics:read', 'billing:read', 'leads:*', 'contacts:*', 
    'deals:*', 'pipeline:*'
  ],
  'sales_manager': [
    'user:read', 'team:read', 'analytics:read',
    'leads:*', 'contacts:*', 'deals:*', 'pipeline:*'
  ],
  'marketing_manager': [
    'user:read', 'team:read', 'analytics:read',
    'contacts:read', 'contacts:update', 'deals:read'
  ],
  'sales_representative': [
    'leads:read', 'leads:update', 'contacts:read', 'contacts:update',
    'deals:read', 'deals:update', 'pipeline:read'
  ],
  'sales_rep': [
    'leads:read', 'leads:update', 'contacts:read', 'contacts:update',
    'deals:read', 'deals:update', 'pipeline:read'
  ],
  'marketing_specialist': [
    'contacts:read', 'contacts:update', 'deals:read', 'analytics:read'
  ],
  'customer_support': [
    'contacts:read', 'contacts:update', 'deals:read'
  ],
  'team_member': [
    'leads:read', 'contacts:read', 'deals:read'
  ],
  'viewer': [
    'leads:read', 'contacts:read', 'deals:read', 'analytics:read'
  ],
  'guest': ['contacts:read']
}

// Company admin permissions - these are the permissions company admins should have
export const COMPANY_ADMIN_PERMISSIONS = [
  'manage_users', 'manage_roles', 'manage_billing', 'manage_subscriptions',
  'manage_settings', 'manage_team', 'view_analytics', 'manage_leads',
  'manage_contacts', 'manage_deals', 'manage_pipeline', 'view_all_data'
]

/**
 * Check if a user has a specific permission
 */
export function hasPermission(userRole: string, userPermissions: string[], permission: string): boolean {
  const normalizedRole = normalizeRole(userRole)
  
  // System admins have all permissions
  if (isSystemAdminRole(userRole)) {
    return true
  }
  
  // Company admins have all permissions within their company
  if (isCompanyAdminRole(userRole)) {
    return true
  }
  
  // Check if user has wildcard permission
  if (userPermissions.includes('*') || userPermissions.includes('admin.*')) {
    return true
  }
  
  // Check exact permission match
  if (userPermissions.includes(permission)) {
    return true
  }
  
  // Check wildcard permissions (e.g., 'leads:*' matches 'leads:read')
  const permissionParts = permission.split(':')
  for (const userPerm of userPermissions) {
    if (userPerm.includes(':')) {
      const [userResource, userAction] = userPerm.split(':')
      const [resource, action] = permissionParts
      
      if (userAction === '*' && userResource === resource) {
        return true
      }
    }
  }
  
  // Check role-based permissions
  const rolePermissions = PERMISSIONS[normalizedRole] || []
  if (rolePermissions.includes('*') || rolePermissions.includes(permission)) {
    return true
  }
  
  // Check wildcard role permissions
  for (const rolePerm of rolePermissions) {
    if (rolePerm.includes(':')) {
      const [roleResource, roleAction] = rolePerm.split(':')
      const [resource, action] = permissionParts
      
      if (roleAction === '*' && roleResource === resource) {
        return true
      }
    }
  }
  
  return false
}

/**
 * Check if user can access a specific company's data
 */
export async function canAccessCompany(userId: string, companyId: string): Promise<boolean> {
  const supabase = getSupabaseAdminClient()
  
  const { data: user } = await supabase
    .from('users')
    .select('role, company_id')
    .eq('id', userId)
    .single()
  
  if (!user) return false
  
  // System admins can access any company
  if (isSystemAdminRole(user.role)) {
    return true
  }
  
  // Users can access their own company
  if (user.company_id === companyId) {
    return true
  }
  
  return false
}

/**
 * Check if user is a company admin for a specific company
 */
export async function isCompanyAdminForCompany(userId: string, companyId: string): Promise<boolean> {
  const supabase = getSupabaseAdminClient()
  
  const { data: user } = await supabase
    .from('users')
    .select('role, company_id')
    .eq('id', userId)
    .single()
  
  if (!user) return false
  
  // System admins are considered company admins for all companies
  if (isSystemAdminRole(user.role)) {
    return true
  }
  
  // Check if user is company admin and belongs to the specified company
  if (isCompanyAdminRole(user.role) && user.company_id === companyId) {
    return true
  }
  
  return false
}

/**
 * Middleware to enforce RBAC on API routes
 */
export async function rbacMiddleware(
  request: NextRequest,
  requiredPermission?: string,
  companyIdParam?: string
): Promise<{ userId: string; companyId: string; hasAccess: boolean; error?: string }> {
  try {
    const authHeader = request.headers.get('authorization')
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { 
        userId: '', 
        companyId: '', 
        hasAccess: false, 
        error: 'No token provided' 
      }
    }
    
    const token = authHeader.substring(7)
    const decoded = jwt.verify(token, JWT_SECRET) as any
    const userId = decoded.userId
    
    if (!userId) {
      return { 
        userId: '', 
        companyId: '', 
        hasAccess: false, 
        error: 'Invalid token' 
      }
    }
    
    const supabase = getSupabaseAdminClient()
    const { data: user } = await supabase
      .from('users')
      .select('role, company_id, permissions')
      .eq('id', userId)
      .single()
    
    if (!user) {
      return { 
        userId, 
        companyId: '', 
        hasAccess: false, 
        error: 'User not found' 
      }
    }
    
    // System admins have full access
    if (isSystemAdminRole(user.role)) {
      return { 
        userId, 
        companyId: user.company_id || '', 
        hasAccess: true 
      }
    }
    
    // Check company access if companyId is specified
    if (companyIdParam && user.company_id !== companyIdParam) {
      // Company admins can only access their own company
      if (isCompanyAdminRole(user.role)) {
        return { 
          userId, 
          companyId: user.company_id || '', 
          hasAccess: false, 
          error: 'Access denied: Company admin can only access their own company data' 
        }
      }
      
      return { 
        userId, 
        companyId: user.company_id || '', 
        hasAccess: false, 
        error: 'Access denied: User does not belong to the specified company' 
      }
    }
    
    // Check required permission
    if (requiredPermission) {
      const userPermissions = user.permissions || []
      const hasPerm = hasPermission(user.role, userPermissions, requiredPermission)
      
      if (!hasPerm) {
        return { 
          userId, 
          companyId: user.company_id || '', 
          hasAccess: false, 
          error: `Permission denied: ${requiredPermission} required` 
        }
      }
    }
    
    return { 
      userId, 
      companyId: user.company_id || '', 
      hasAccess: true 
    }
    
  } catch (error) {
    console.error('RBAC middleware error:', error)
    return { 
      userId: '', 
      companyId: '', 
      hasAccess: false, 
      error: 'Authentication failed' 
    }
  }
}

/**
 * Create RBAC-protected API handler
 */
export function createProtectedHandler(
  handler: (request: NextRequest, userId: string, companyId: string) => Promise<NextResponse>,
  requiredPermission?: string
) {
  return async (request: NextRequest) => {
    const rbacResult = await rbacMiddleware(request, requiredPermission)
    
    if (!rbacResult.hasAccess) {
      return NextResponse.json(
        { error: rbacResult.error || 'Access denied' },
        { status: 403 }
      )
    }
    
    return handler(request, rbacResult.userId, rbacResult.companyId)
  }
}

/**
 * Utility to get company admin status with caching
 */
const companyAdminCache = new Map<string, boolean>()

export async function checkCompanyAdminStatus(userId: string, companyId?: string): Promise<boolean> {
  // Check cache first
  const cacheKey = companyId ? `${userId}:${companyId}` : userId
  if (companyAdminCache.has(cacheKey)) {
    return companyAdminCache.get(cacheKey)!
  }
  
  const supabase = getSupabaseAdminClient()
  
  const { data: user } = await supabase
    .from('users')
    .select('role, company_id')
    .eq('id', userId)
    .single()
  
  if (!user) {
    companyAdminCache.set(cacheKey, false)
    return false
  }
  
  // System admins are always company admins
  if (isSystemAdminRole(user.role)) {
    companyAdminCache.set(cacheKey, true)
    return true
  }
  
  // Check if user is company admin
  const isCompanyAdmin = isCompanyAdminRole(user.role)
  
  // If specific company is required, check company match
  if (companyId && user.company_id !== companyId) {
    companyAdminCache.set(cacheKey, false)
    return false
  }
  
  companyAdminCache.set(cacheKey, isCompanyAdmin)
  return isCompanyAdmin
}

// Clear cache (useful for testing or when roles change)
export function clearCompanyAdminCache(): void {
  companyAdminCache.clear()
}

export {
  isSystemAdminRole,
  isCompanyAdminRole,
  normalizeRole
} from './auth-utils'