// Role-Based Access Control (RBAC) Configuration
// Evolution owns the system - System Admins belong to Evolution with unlimited power

export type UserRole = 
  | 'system-admin'    // Evolution's system administrators - unlimited power
  | 'super_admin'     // Alias for system-admin (backwards compatibility)
  | 'admin'           // Company-level administrators  
  | 'company-manager'
  | 'marketing-manager'
  | 'marketing-specialist'
  | 'sales-representative'
  | 'team-member'
  | 'viewer'

// System Ownership and Hierarchy
export const SYSTEM_OWNER_COMPANY = 'Evolution';

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  'system-admin': 100,     // System Admin - Evolution owners, unlimited power
  'super_admin': 100,      // Alias for system-admin
  'admin': 80,             // Company Admin - Company level admin (cannot touch Evolution data)
  'company-manager': 70,   // Company Manager - Company level management
  'marketing-manager': 60, // Marketing Manager - Marketing team lead
  'marketing-specialist': 50, // Marketing Specialist - Marketing operations
  'sales-representative': 40, // Sales Rep - Sales operations
  'team-member': 30,       // Team Member - General team operations
  'viewer': 10             // Viewer - Read-only access
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  'system-admin': 'System Administrator - Full system access and control',
  'super_admin': 'System Administrator - Full system access and control',
  'admin': 'Company Administrator - Company-level management and configuration',
  'company-manager': 'Company Manager - Oversees company operations and teams',
  'marketing-manager': 'Marketing Manager - Manages marketing campaigns and strategies',
  'marketing-specialist': 'Marketing Specialist - Executes marketing campaigns and content',
  'sales-representative': 'Sales Representative - Manages leads and customer relationships',
  'team-member': 'Team Member - General access to company tools and data',
  'viewer': 'Viewer - Read-only access to company information'
};

// System Admin Permissions (Evolution owners)
export const SYSTEM_ADMIN_PERMISSIONS = [
  // Unlimited system control
  'system.manage', 'system.configure', 'system.monitor', 'system.backup', 'system.restore',
  
  // Full company management (all companies including Evolution)
  'companies.view', 'companies.create', 'companies.edit', 'companies.delete', 'companies.manage',
  
  // Full user management across all companies
  'users.view', 'users.create', 'users.edit', 'users.delete', 'users.invite',
  'users.manage_roles', 'users.manage_permissions', 'users.impersonate',
  'users.invite_system_admin', // Only system admins can invite other system admins
  
  // All data operations across all companies
  'contacts.view', 'contacts.create', 'contacts.edit', 'contacts.delete', 'contacts.export', 'contacts.import',
  'leads.view', 'leads.create', 'leads.edit', 'leads.delete', 'leads.assign', 'leads.export', 'leads.import',
  'campaigns.view', 'campaigns.create', 'campaigns.edit', 'campaigns.delete', 'campaigns.execute',
  'analytics.view', 'analytics.export', 'analytics.advanced', 'ai_analytics.view',
  'deals.view', 'deals.create', 'deals.edit', 'deals.delete',
  'automation.view', 'automation.create', 'automation.edit', 'automation.delete', 'automation.execute',
  'surveys.view', 'surveys.create', 'surveys.edit', 'surveys.delete',
  'templates.view', 'templates.create', 'templates.edit', 'templates.delete',
  'settings.view', 'settings.edit', 'security.manage',
  'chat.view', 'chat.participate', 'chat.moderate', 'chat.admin',
  'documents.view', 'documents.upload', 'documents.edit', 'documents.delete',
  'notifications.manage', 'activity.view', 'audit.view',
  
  // Special Evolution-only permissions
  'billing.manage', 'licensing.manage', 'integrations.manage'
];

export const PERMISSIONS_BY_ROLE: Record<UserRole, string[]> = {
  'system-admin': SYSTEM_ADMIN_PERMISSIONS,
  'super_admin': SYSTEM_ADMIN_PERMISSIONS, // Alias for system-admin
  
  'admin': [
    // Company-level admin permissions (restricted to own company only)
    // NOTE: Admins can only manage their own company's data, not Evolution or other companies
    'users.view', 'users.create', 'users.edit', 'users.delete', 'users.invite', // Cannot invite system-admin
    'contacts.view', 'contacts.create', 'contacts.edit', 'contacts.delete', 'contacts.export', 'contacts.import',
    'leads.view', 'leads.create', 'leads.edit', 'leads.delete', 'leads.assign', 'leads.export', 'leads.import',
    'campaigns.view', 'campaigns.create', 'campaigns.edit', 'campaigns.delete', 'campaigns.execute',
    'analytics.view', 'analytics.export', 'analytics.advanced', 'ai_analytics.view',
    'deals.view', 'deals.create', 'deals.edit', 'deals.delete',
    'automation.view', 'automation.create', 'automation.edit', 'automation.delete', 'automation.execute',
    'surveys.view', 'surveys.create', 'surveys.edit', 'surveys.delete',
    'templates.view', 'templates.create', 'templates.edit', 'templates.delete',
    'settings.view', 'settings.edit', 'security.view',
    'chat.view', 'chat.participate', 'chat.moderate',
    'documents.view', 'documents.upload', 'documents.edit', 'documents.delete',
    'notifications.view', 'activity.view'
  ],
  
  'company-manager': [
    // Company management permissions (restricted to own company)
    'users.view', 'users.invite', // Cannot invite system-admin
    'contacts.view', 'contacts.create', 'contacts.edit', 'contacts.delete', 'contacts.export', 'contacts.import',
    'leads.view', 'leads.create', 'leads.edit', 'leads.delete', 'leads.assign', 'leads.export',
    'campaigns.view', 'campaigns.create', 'campaigns.edit', 'campaigns.delete', 'campaigns.execute',
    'analytics.view', 'analytics.export', 'ai_analytics.view',
    'deals.view', 'deals.create', 'deals.edit', 'deals.delete',
    'automation.view', 'automation.create', 'automation.edit', 'automation.execute',
    'surveys.view', 'surveys.create', 'surveys.edit', 'surveys.delete',
    'templates.view', 'templates.create', 'templates.edit',
    'settings.view',
    'chat.view', 'chat.participate',
    'documents.view', 'documents.upload', 'documents.edit',
    'notifications.view', 'activity.view'
  ],
  
  'marketing-manager': [
    // Marketing management permissions
    'users.view', 'users.invite', // Limited to marketing roles, cannot invite system-admin
    'contacts.view', 'contacts.create', 'contacts.edit', 'contacts.export', 'contacts.import',
    'leads.view', 'leads.create', 'leads.edit', 'leads.assign', 'leads.export',
    'campaigns.view', 'campaigns.create', 'campaigns.edit', 'campaigns.delete', 'campaigns.execute',
    'analytics.view', 'analytics.export', 'ai_analytics.view',
    'automation.view', 'automation.create', 'automation.edit', 'automation.execute',
    'surveys.view', 'surveys.create', 'surveys.edit', 'surveys.delete',
    'templates.view', 'templates.create', 'templates.edit',
    'chat.view', 'chat.participate',
    'documents.view', 'documents.upload', 'documents.edit',
    'notifications.view', 'activity.view'
  ],
  
  'marketing-specialist': [
    // Marketing specialist permissions
    'contacts.view', 'contacts.create', 'contacts.edit', 'contacts.export',
    'leads.view', 'leads.create', 'leads.edit', 'leads.export',
    'campaigns.view', 'campaigns.create', 'campaigns.edit', 'campaigns.execute',
    'analytics.view', 'analytics.export', 'ai_analytics.view',
    'automation.view', 'automation.create', 'automation.edit',
    'surveys.view', 'surveys.create', 'surveys.edit',
    'templates.view', 'templates.create', 'templates.edit',
    'chat.view', 'chat.participate',
    'documents.view', 'documents.upload', 'documents.edit',
    'notifications.view', 'activity.view'
  ],
  
  'sales-representative': [
    // Sales representative permissions
    'contacts.view', 'contacts.create', 'contacts.edit', 'contacts.export',
    'leads.view', 'leads.create', 'leads.edit', 'leads.export',
    'campaigns.view', 'campaigns.execute',
    'analytics.view', 'analytics.export', 'ai_analytics.view',
    'deals.view', 'deals.create', 'deals.edit', 'deals.delete',
    'automation.view',
    'surveys.view', 'surveys.create',
    'templates.view',
    'chat.view', 'chat.participate',
    'documents.view', 'documents.upload',
    'notifications.view', 'activity.view'
  ],
  
  'team-member': [
    // Basic team member permissions
    'contacts.view', 'contacts.create', 'contacts.edit',
    'leads.view', 'leads.create', 'leads.edit',
    'campaigns.view',
    'analytics.view', 'ai_analytics.view',
    'deals.view', 'deals.create', 'deals.edit',
    'automation.view',
    'surveys.view',
    'templates.view',
    'chat.view', 'chat.participate',
    'documents.view', 'documents.upload',
    'notifications.view', 'activity.view'
  ],
  
  'viewer': [
    // Read-only permissions
    'contacts.view',
    'leads.view',
    'campaigns.view',
    'analytics.view',
    'deals.view',
    'automation.view',
    'surveys.view',
    'templates.view',
    'chat.view',
    'documents.view',
    'notifications.view', 'activity.view'
  ]
};

// All available permissions in the system
export const ALL_PERMISSIONS = {
  'contacts.view': 'View contacts',
  'contacts.create': 'Create contacts',
  'contacts.edit': 'Edit contacts',
  'contacts.delete': 'Delete contacts',
  'contacts.export': 'Export contacts',
  'contacts.import': 'Import contacts',
  'leads.view': 'View leads',
  'leads.create': 'Create leads',
  'leads.edit': 'Edit leads',
  'leads.delete': 'Delete leads',
  'leads.assign': 'Assign leads',
  'leads.export': 'Export leads',
  'leads.import': 'Import leads',
  'campaigns.view': 'View campaigns',
  'campaigns.create': 'Create campaigns',
  'campaigns.edit': 'Edit campaigns',
  'campaigns.delete': 'Delete campaigns',
  'campaigns.execute': 'Execute campaigns',
  'analytics.view': 'View analytics',
  'analytics.export': 'Export analytics',
  'analytics.advanced': 'Access advanced analytics',
  'ai_analytics.view': 'View AI analytics',
  'deals.view': 'View deals',
  'deals.create': 'Create deals',
  'deals.edit': 'Edit deals',
  'deals.delete': 'Delete deals',
  'automation.view': 'View automation',
  'automation.create': 'Create automation',
  'automation.edit': 'Edit automation',
  'automation.delete': 'Delete automation',
  'automation.execute': 'Execute automation',
  'surveys.view': 'View surveys',
  'surveys.create': 'Create surveys',
  'surveys.edit': 'Edit surveys',
  'surveys.delete': 'Delete surveys',
  'templates.view': 'View templates',
  'templates.create': 'Create templates',
  'templates.edit': 'Edit templates',
  'templates.delete': 'Delete templates',
  'settings.view': 'View settings',
  'settings.edit': 'Edit settings',
  'security.manage': 'Manage security',
  'security.view': 'View security',
  'chat.view': 'View chat',
  'chat.participate': 'Participate in chat',
  'chat.moderate': 'Moderate chat',
  'chat.admin': 'Admin chat',
  'documents.view': 'View documents',
  'documents.upload': 'Upload documents',
  'documents.edit': 'Edit documents',
  'documents.delete': 'Delete documents',
  'notifications.view': 'View notifications',
  'notifications.manage': 'Manage notifications',
  'activity.view': 'View activity',
  'audit.view': 'View audit logs',
  'users.view': 'View users',
  'users.create': 'Create users',
  'users.edit': 'Edit users',
  'users.delete': 'Delete users',
  'users.invite': 'Invite users',
  'users.manage_roles': 'Manage user roles',
  'users.manage_permissions': 'Manage user permissions',
  'users.impersonate': 'Impersonate users',
  'users.invite_system_admin': 'Invite system administrators',
  'companies.view': 'View companies',
  'companies.create': 'Create companies',
  'companies.edit': 'Edit companies',
  'companies.delete': 'Delete companies',
  'companies.manage': 'Manage companies',
  'system.manage': 'Manage system',
  'system.configure': 'Configure system',
  'system.monitor': 'Monitor system',
  'system.backup': 'Backup system',
  'system.restore': 'Restore system',
  'billing.manage': 'Manage billing',
  'licensing.manage': 'Manage licensing',
  'integrations.manage': 'Manage integrations'
} as const;

export type PermissionKey = keyof typeof ALL_PERMISSIONS;

// Action descriptions for UI display
export const ACTION_DESCRIPTIONS: Record<PermissionKey, string> = ALL_PERMISSIONS;

// Utility functions
export function hasPermission(userPermissions: string[], requiredPermission: PermissionKey): boolean {
  // Check if user has wildcard permission (super admin)
  if (userPermissions.includes('*')) {
    return true;
  }
  return userPermissions.includes(requiredPermission);
}

export function hasAnyPermission(userPermissions: string[], requiredPermissions: PermissionKey[]): boolean {
  // Check if user has wildcard permission (super admin)
  if (userPermissions.includes('*')) {
    return true;
  }
  return requiredPermissions.some(permission => userPermissions.includes(permission));
}

export function getPermissionLevel(permission: PermissionKey): number {
  const [, action] = permission.split('.');
  
  switch (action) {
    case 'view': return 1;
    case 'create': return 2;
    case 'edit': return 3;
    case 'delete': return 4;
    case 'manage': return 5;
    default: return 3;
  }
}

export function getRoleLevel(role: UserRole): number {
  return ROLE_HIERARCHY[role] || 0;
}

export function canManageRole(managerRole: UserRole, targetRole: UserRole): boolean {
  return getRoleLevel(managerRole) > getRoleLevel(targetRole);
}

export function getRolePermissions(role: UserRole): string[] {
  return PERMISSIONS_BY_ROLE[role] || [];
}

// Evolution system ownership functions
export function isSystemAdmin(role: UserRole | string): boolean {
  // Handle all role name variations for backwards compatibility
  return role === 'system-admin' || role === 'super_admin' || role === 'system_admin';
}

export function isEvolutionCompany(companyName: string): boolean {
  return companyName === SYSTEM_OWNER_COMPANY;
}

export function canInviteSystemAdmin(userRole: UserRole): boolean {
  return isSystemAdmin(userRole); // Only system admins can invite other system admins
}

export function getInvitableRoles(userRole: UserRole): UserRole[] {
  if (isSystemAdmin(userRole)) {
    // System admins can invite anyone
    return ['system-admin', 'admin', 'company-manager', 'marketing-manager', 'marketing-specialist', 'sales-representative', 'team-member', 'viewer'];
  }
  
  if (userRole === 'admin') {
    // Company admins cannot invite system-admins or other admins
    return ['company-manager', 'marketing-manager', 'marketing-specialist', 'sales-representative', 'team-member', 'viewer'];
  }
  
  if (userRole === 'company-manager') {
    // Company managers can invite lower roles
    return ['marketing-manager', 'marketing-specialist', 'sales-representative', 'team-member', 'viewer'];
  }
  
  if (userRole === 'marketing-manager') {
    // Marketing managers can invite marketing team and lower
    return ['marketing-specialist', 'sales-representative', 'team-member', 'viewer'];
  }
  
  // Other roles cannot invite
  return [];
}
