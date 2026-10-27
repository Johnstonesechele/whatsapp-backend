/**
 * System Admin Role Utilities
 * Centralized helper functions for checking system admin roles
 * Handles all role name variations: system-admin, super_admin, system_admin
 */

export type SystemAdminRole = 'system-admin' | 'super_admin' | 'system_admin';

/**
 * Check if a role is a system administrator role
 * Handles all variations: system-admin, super_admin, system_admin
 */
export function isSystemAdminRole(role: string | undefined | null): boolean {
  if (!role) return false;
  
  const systemAdminRoles: SystemAdminRole[] = ['system-admin', 'super_admin', 'system_admin'];
  return systemAdminRoles.includes(role as SystemAdminRole);
}

/**
 * Check if a user object has system admin role
 */
export function isSystemAdmin(user: { role?: string | null } | null | undefined): boolean {
  if (!user || !user.role) return false;
  return isSystemAdminRole(user.role);
}

/**
 * Check if a user can invite system administrators
 * Only system admins can invite other system admins
 */
export function canInviteSystemAdmin(userRole: string | undefined | null): boolean {
  return isSystemAdminRole(userRole);
}

/**
 * Get the normalized system admin role name
 * Returns 'super_admin' as the canonical form
 */
export function normalizeSystemAdminRole(role: string): string {
  if (isSystemAdminRole(role)) {
    return 'super_admin';
  }
  return role;
}

/**
 * Check if user has wildcard permissions
 */
export function hasWildcardPermissions(permissions: string[] | string | undefined | null): boolean {
  if (!permissions) return false;
  
  if (Array.isArray(permissions)) {
    return permissions.includes('*') || permissions.includes('all');
  }
  
  if (typeof permissions === 'string') {
    return permissions === '*' || permissions === 'all';
  }
  
  return false;
}

/**
 * Check if user has unrestricted access (system admin or wildcard permissions)
 */
export function hasUnrestrictedAccess(user: {
  role?: string | null;
  permissions?: string[] | string | null;
} | null | undefined): boolean {
  if (!user) return false;
  
  return isSystemAdmin(user) || hasWildcardPermissions(user.permissions);
}
