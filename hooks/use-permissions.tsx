"use client"

import { useAuth } from '@/hooks/use-auth'
import { hasPermission, hasAnyPermission, ACTION_DESCRIPTIONS, type PermissionKey } from '@/lib/role-config'
import { toast } from '@/components/ui/use-toast'
import { usePermissionPopup } from '@/components/permission-denied-popup'

export interface PermissionCheckOptions {
  showToast?: boolean
  showPopup?: boolean
  toastTitle?: string
  toastDescription?: string
  customMessage?: string
}

export function usePermissions() {
  const { user } = useAuth()
  const { showPermissionDenied, hidePermissionDenied, isOpen, popupProps } = usePermissionPopup()

  const normalizedRole = user?.role?.replace(/-/g, '_')
  const isCompanyAdminRole = normalizedRole === 'admin' || normalizedRole === 'company_admin'
  const systemOnlyPermissions = new Set([
    'system.manage',
    'system.configure',
    'system.monitor',
    'system.backup',
    'system.restore',
    'companies.create',
    'companies.delete',
    'companies.manage',
    'users.impersonate'
  ])

  const checkPermission = (
    requiredPermission: string,
    options: PermissionCheckOptions = {}
  ): boolean => {
    if (!user || !user.permissions) {
      if (options.showToast) {
        toast({
          title: options.toastTitle || "Permission Denied",
          description: options.toastDescription || "You need to be logged in to perform this action.",
          variant: "destructive"
        })
      }
      return false
    }

    if (isCompanyAdminRole && !systemOnlyPermissions.has(requiredPermission)) {
      return true
    }

    const hasAccess = hasPermission(user.permissions, requiredPermission as PermissionKey)
    
    if (!hasAccess) {
      if (options.showPopup) {
        showPermissionDenied({
          requiredPermission: requiredPermission as PermissionKey,
          customMessage: options.customMessage
        })
      }
      
      if (options.showToast) {
        const actionDescription = (ACTION_DESCRIPTIONS as Record<string, string>)[requiredPermission] || requiredPermission
        toast({
          title: options.toastTitle || "Insufficient Permissions",
          description: options.toastDescription || 
            `You don't have permission to ${actionDescription}. Contact your administrator for access.`,
          variant: "destructive"
        })
      }
    }

    return hasAccess
  }

  const checkAnyPermission = (
    requiredPermissions: string[],
    options: PermissionCheckOptions = {}
  ): boolean => {
    if (!user || !user.permissions) {
      if (options.showToast) {
        toast({
          title: options.toastTitle || "Permission Denied",
          description: options.toastDescription || "You need to be logged in to perform this action.",
          variant: "destructive"
        })
      }
      return false
    }

    if (isCompanyAdminRole && requiredPermissions.some(permission => !systemOnlyPermissions.has(permission))) {
      return true
    }

    const hasAccess = hasAnyPermission(user.permissions, requiredPermissions as PermissionKey[])
    
    if (!hasAccess) {
      if (options.showPopup) {
        showPermissionDenied({
          requiredPermissions: requiredPermissions as PermissionKey[],
          customMessage: options.customMessage
        })
      }
      
      if (options.showToast) {
        const actionDescriptions = requiredPermissions.map(p => 
          (ACTION_DESCRIPTIONS as Record<string, string>)[p] || p
        ).join(' or ')
        
        toast({
          title: options.toastTitle || "Insufficient Permissions",
          description: options.toastDescription || 
            `You don't have permission to ${actionDescriptions}. Contact your administrator for access.`,
          variant: "destructive"
        })
      }
    }

    return hasAccess
  }

  const canView = (section: string) => checkPermission(`${section}.view`)
  const canCreate = (section: string) => checkPermission(`${section}.create`)
  const canEdit = (section: string) => checkPermission(`${section}.edit`)
  const canDelete = (section: string) => checkPermission(`${section}.delete`)
  const canExport = (section: string) => checkPermission(`${section}.export`)

  const withPermissionCheck = (
    requiredPermission: string,
    action: () => void,
    options: PermissionCheckOptions = { showToast: true }
  ) => {
    return () => {
      if (checkPermission(requiredPermission, options)) {
        action()
      }
    }
  }

  const withAnyPermissionCheck = (
    requiredPermissions: string[],
    action: () => void,
    options: PermissionCheckOptions = { showToast: true }
  ) => {
    return () => {
      if (checkAnyPermission(requiredPermissions, options)) {
        action()
      }
    }
  }

  return {
    user,
    checkPermission,
    checkAnyPermission,
    canView,
    canCreate,
    canEdit,
    canDelete,
    canExport,
    withPermissionCheck,
    withAnyPermissionCheck,
    
    // Common permission groups for convenience
    canManageUsers: () => checkAnyPermission(['users.create', 'users.edit', 'users.delete']),
    canManageContacts: () => checkAnyPermission(['contacts.create', 'contacts.edit', 'contacts.delete']),
    canManageLeads: () => checkAnyPermission(['leads.create', 'leads.edit', 'leads.delete']),
    canManageCampaigns: () => checkAnyPermission(['campaigns.create', 'campaigns.edit', 'campaigns.delete']),
    canViewAnalytics: () => checkPermission('analytics.view'),
    canExportData: () => checkAnyPermission(['contacts.export', 'leads.export', 'analytics.export']),
    isSystemAdmin: () => checkPermission('system.manage'),
    isCompanyAdmin: () => isCompanyAdminRole || checkAnyPermission(['users.manage_roles', 'security.manage']),
    
    // Role-based checks
    isViewer: () => user?.role === 'viewer',
    isTeamMember: () => user?.role === 'team-member',
    isSalesRep: () => user?.role === 'sales-representative',
    isMarketingSpecialist: () => user?.role === 'marketing-specialist',
    isMarketingManager: () => user?.role === 'marketing-manager',
    isCompanyManager: () => user?.role === 'company-manager',
    isAdmin: () => user?.role === 'admin',
    isSystemAdminRole: () => user?.role === 'system-admin',
    
    // Permission popup functionality
    permissionPopup: {
      isOpen,
      popupProps,
      showPermissionDenied,
      hidePermissionDenied
    }
  }
}
