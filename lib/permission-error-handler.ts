/**
 * Permission Error Handler Utility
 * 
 * This module provides utilities for handling permission-related errors
 * and displaying user-friendly notifications.
 */

export interface PermissionError {
  error: string
  details?: {
    required?: string
    userRole?: string
    userPermissions?: string[]
  }
  code?: string
}

export interface PermissionErrorConfig {
  title?: string
  message?: string
  action?: string
  severity?: 'error' | 'warning' | 'info'
}

/**
 * Check if an error response is a permission error (403)
 */
export function isPermissionError(error: any): boolean {
  return (
    error?.status === 403 ||
    error?.response?.status === 403 ||
    error?.code === 'PERMISSION_DENIED' ||
    (typeof error?.error === 'string' && error.error.toLowerCase().includes('permission'))
  )
}

/**
 * Extract permission error details from an API error response
 */
export function extractPermissionError(error: any): PermissionError | null {
  if (!isPermissionError(error)) {
    return null
  }

  // If error is already in the right format
  if (error.error && typeof error.error === 'string') {
    return {
      error: error.error,
      details: error.details,
      code: error.code || 'PERMISSION_DENIED'
    }
  }

  // If error is from fetch response
  if (error.response?.data) {
    return {
      error: error.response.data.error || 'Permission denied',
      details: error.response.data.details,
      code: error.response.data.code || 'PERMISSION_DENIED'
    }
  }

  // Generic permission error
  return {
    error: 'You do not have permission to perform this action',
    code: 'PERMISSION_DENIED'
  }
}

/**
 * Get user-friendly message for permission error
 */
export function getPermissionErrorMessage(error: PermissionError, config?: PermissionErrorConfig): string {
  const action = config?.action || 'perform this action'
  const defaultMessage = `You don't have permission to ${action}.`

  if (config?.message) {
    return config.message
  }

  if (error.details?.required) {
    return `${defaultMessage}\n\nRequired: ${error.details.required}`
  }

  return defaultMessage
}

/**
 * Get title for permission error notification
 */
export function getPermissionErrorTitle(config?: PermissionErrorConfig): string {
  return config?.title || 'Permission Denied'
}

/**
 * Format permission error for display
 */
export function formatPermissionError(error: any, config?: PermissionErrorConfig) {
  const permError = extractPermissionError(error)
  
  if (!permError) {
    return null
  }

  return {
    title: getPermissionErrorTitle(config),
    message: getPermissionErrorMessage(permError, config),
    severity: config?.severity || 'error',
    details: permError.details,
    code: permError.code
  }
}

/**
 * Common action descriptions for permission errors
 */
export const PERMISSION_ACTIONS = {
  CREATE_LEAD: 'create leads',
  EDIT_LEAD: 'edit this lead',
  DELETE_LEAD: 'delete leads',
  CONVERT_TO_DEAL: 'convert to deal',
  ASSIGN_LEAD: 'assign leads',
  VIEW_REPORTS: 'view reports',
  MANAGE_USERS: 'manage users',
  MANAGE_SETTINGS: 'manage settings',
  EXPORT_DATA: 'export data',
  DELETE_RECORDS: 'delete records',
  MANAGE_CAMPAIGNS: 'manage campaigns',
  ACCESS_ANALYTICS: 'access analytics'
} as const

/**
 * Role-based recommendations
 */
export function getPermissionRecommendation(userRole?: string): string {
  if (!userRole) {
    return 'Contact your administrator for access.'
  }

  const recommendations: Record<string, string> = {
    viewer: 'Your role only allows viewing. Contact your administrator to request edit permissions.',
    user: 'This action requires elevated permissions. Contact your team lead or administrator.',
    sales: 'This action requires manager or admin permissions. Contact your sales manager.',
    manager: 'This action requires admin permissions. Contact your system administrator.',
    admin: 'This action requires owner or super admin permissions.',
    default: 'Contact your administrator for the required permissions.'
  }

  return recommendations[userRole.toLowerCase()] || recommendations.default
}
