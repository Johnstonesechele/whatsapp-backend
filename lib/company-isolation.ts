/**
 * Company Isolation Middleware
 * Ensures users can only access data within their own company.
 * System admins can access all companies.
 */

import { getSupabaseAdminClient } from "@/backend/database/supabase-config"
import { isSystemAdminRole } from "@/lib/auth-utils"

export interface CompanyUser {
  id: string
  company_id: string
  role: string
  active: boolean
}

/**
 * Get the current user with company information from the JWT token.
 * Returns null if user not found or inactive.
 */
export async function getCurrentUser(userId: string): Promise<CompanyUser | null> {
  const supabase = getSupabaseAdminClient()
  
  const { data: user, error } = await supabase
    .from('users')
    .select('id, company_id, role, active')
    .eq('id', userId)
    .eq('active', true)
    .single()

  if (error || !user) return null
  
  return {
    id: user.id,
    company_id: user.company_id,
    role: user.role,
    active: user.active
  }
}

/**
 * Check if the current user can access data from the specified company.
 * System admins can access any company. Regular users can only access their own.
 */
export function canAccessCompany(currentUser: CompanyUser, targetCompanyId: string): boolean {
  if (isSystemAdminRole(currentUser.role)) return true
  return currentUser.company_id === targetCompanyId
}

/**
 * Add company_id filter to a Supabase query for non-system-admin users.
 * This ensures users can only see data from their own company.
 * 
 * @example
 * const query = supabase.from('contacts').select('*')
 * const filteredQuery = filterByCompany(query, currentUser)
 */
export function filterByCompany<T extends { eq: (col: string, val: any) => any }>(
  query: T,
  currentUser: CompanyUser,
  column: string = 'company_id'
): T {
  if (!isSystemAdminRole(currentUser.role)) {
    return query.eq(column, currentUser.company_id)
  }
  return query
}

/**
 * Verify that a resource belongs to the user's company.
 * Returns true if access is allowed, false otherwise.
 */
export async function verifyResourceOwnership(
  userId: string,
  resourceId: string,
  tableName: string,
  idColumn: string = 'id'
): Promise<{ allowed: boolean; resource?: any }> {
  const supabase = getSupabaseAdminClient()
  
  // Get current user
  const { data: user } = await supabase
    .from('users')
    .select('id, company_id, role')
    .eq('id', userId)
    .eq('active', true)
    .single()

  if (!user) return { allowed: false }

  // System admins can access anything
  if (isSystemAdminRole(user.role)) {
    const { data: resource } = await supabase
      .from(tableName)
      .select('*')
      .eq(idColumn, resourceId)
      .single()
    return { allowed: true, resource }
  }

  // Regular users must own the resource
  const { data: resource, error } = await supabase
    .from(tableName)
    .select('*')
    .eq(idColumn, resourceId)
    .eq('company_id', user.company_id)
    .single()

  if (error || !resource) return { allowed: false }
  return { allowed: true, resource }
}

/**
 * Get the user's company_id from the JWT token.
 * Returns null if the token is invalid or user has no company.
 */
export function getCompanyIdFromToken(decoded: any): string | null {
  return decoded.company_id || decoded.companyId || null
}
