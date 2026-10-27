// Permission Checking Middleware and Components
import { NextRequest, NextResponse } from 'next/server'
import { hasPermission, hasAnyPermission, type PermissionKey } from '@/lib/role-config'

export interface PermissionCheckResult {
  hasPermission: boolean
  message?: string
  requiredPermissions?: PermissionKey[]
}

// Server-side permission checking middleware
export function checkPermission(userPermissions: string[], requiredPermission: PermissionKey): PermissionCheckResult {
  const hasAccess = hasPermission(userPermissions, requiredPermission)
  
  return {
    hasPermission: hasAccess,
    message: hasAccess ? undefined : `Insufficient permissions. Required: ${requiredPermission}`,
    requiredPermissions: [requiredPermission]
  }
}

export function checkAnyPermission(userPermissions: string[], requiredPermissions: PermissionKey[]): PermissionCheckResult {
  const hasAccess = hasAnyPermission(userPermissions, requiredPermissions)
  
  return {
    hasPermission: hasAccess,
    message: hasAccess ? undefined : `Insufficient permissions. Required one of: ${requiredPermissions.join(', ')}`,
    requiredPermissions
  }
}

// Permission middleware for API routes
export function requirePermission(requiredPermission: PermissionKey) {
  return function(handler: Function) {
    return async function(request: NextRequest, context?: any) {
      // Get user from the request (this would be set by auth middleware)
      const user = (request as any).user
      
      if (!user) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        )
      }
      
      const permissionCheck = checkPermission(user.permissions, requiredPermission)
      
      if (!permissionCheck.hasPermission) {
        return NextResponse.json(
          { 
            error: 'Insufficient permissions',
            message: permissionCheck.message,
            requiredPermission
          },
          { status: 403 }
        )
      }
      
      return handler(request, context)
    }
  }
}

// Permission middleware for multiple permissions (any of them)
export function requireAnyPermission(requiredPermissions: PermissionKey[]) {
  return function(handler: Function) {
    return async function(request: NextRequest, context?: any) {
      const user = (request as any).user
      
      if (!user) {
        return NextResponse.json(
          { error: 'Authentication required' },
          { status: 401 }
        )
      }
      
      const permissionCheck = checkAnyPermission(user.permissions, requiredPermissions)
      
      if (!permissionCheck.hasPermission) {
        return NextResponse.json(
          { 
            error: 'Insufficient permissions',
            message: permissionCheck.message,
            requiredPermissions
          },
          { status: 403 }
        )
      }
      
      return handler(request, context)
    }
  }
}

// Helper to create permission-aware API responses
export function createPermissionResponse(success: boolean, data?: any, permissionError?: string) {
  if (!success && permissionError) {
    return NextResponse.json(
      { 
        error: 'Permission denied',
        message: permissionError,
        action: 'contact_administrator'
      },
      { status: 403 }
    )
  }
  
  return NextResponse.json(data || { success: true })
}
