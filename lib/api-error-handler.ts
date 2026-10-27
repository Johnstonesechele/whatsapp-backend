/**
 * Global API Error Handler
 * 
 * Provides centralized error handling for all API responses,
 * with special handling for 403 permission errors.
 */

import { toast } from "@/components/ui/use-toast"

interface ErrorHandlerOptions {
  showPermissionError?: (error: any, context: any) => void
  action?: string
  resource?: string
  requiredPermission?: string
  onSuccess?: (data?: any) => void
  onError?: (error: any) => void
  successMessage?: string
  errorMessage?: string
}

/**
 * Handle API response with automatic error handling
 * 
 * @param response - Fetch API response
 * @param options - Error handling options
 */
export async function handleApiResponse(
  response: Response,
  options: ErrorHandlerOptions = {}
): Promise<any> {
  const {
    showPermissionError,
    action,
    resource,
    requiredPermission,
    onSuccess,
    onError,
    successMessage,
    errorMessage
  } = options

  if (response.ok) {
    const data = await response.json().catch(() => ({}))
    
    if (successMessage) {
      toast({
        title: "Success",
        description: successMessage,
      })
    }
    
    onSuccess?.(data)
    return data
  }

  // Handle 403 Permission Errors
  if (response.status === 403) {
    try {
      const errorData = await response.json()
      
      if (showPermissionError) {
        showPermissionError(errorData, {
          action,
          title: `Permission Denied${resource ? `: ${resource}` : ''}`,
          message: errorData.message || errorData.error
        })
      } else {
        // Fallback if permission dialog not available
        toast({
          title: "Permission Denied",
          description: errorData.message || "You don't have permission to perform this action",
          variant: "destructive"
        })
      }
      
      onError?.(errorData)
      throw new Error(errorData.message || 'Permission denied')
    } catch (e) {
      if (e instanceof Error && e.message !== 'Permission denied') {
        throw e
      }
      throw new Error('Permission denied')
    }
  }

  // Handle other errors
  try {
    const errorData = await response.json()
    const message = errorData.message || errorData.error || errorMessage || 'An error occurred'
    
    toast({
      title: "Error",
      description: message,
      variant: "destructive"
    })
    
    onError?.(errorData)
    throw new Error(message)
  } catch (e) {
    if (e instanceof Error) {
      throw e
    }
    const message = errorMessage || 'An error occurred'
    toast({
      title: "Error",
      description: message,
      variant: "destructive"
    })
    throw new Error(message)
  }
}

/**
 * Simplified API call wrapper with automatic error handling
 * 
 * @example
 * ```tsx
 * const { showPermissionError } = usePermissionError()
 * 
 * await apiCall(
 *   () => fetch('/api/leads/123/convert', { method: 'POST' }),
 *   {
 *     showPermissionError,
 *     action: 'convert lead to deal',
 *     requiredPermission: 'deals:write',
 *     successMessage: 'Lead converted successfully',
 *     onSuccess: () => router.push('/deals')
 *   }
 * )
 * ```
 */
export async function apiCall<T = any>(
  fetchFn: () => Promise<Response>,
  options: ErrorHandlerOptions = {}
): Promise<T> {
  try {
    const response = await fetchFn()
    return await handleApiResponse(response, options)
  } catch (error) {
    // Error already handled by handleApiResponse
    throw error
  }
}

/**
 * Check if error is a permission error
 */
export function isPermissionError(error: any): boolean {
  return (
    error?.status === 403 ||
    error?.statusCode === 403 ||
    error?.code === 'PERMISSION_DENIED' ||
    error?.message?.toLowerCase().includes('permission')
  )
}

/**
 * Extract permission details from error
 */
export function extractPermissionDetails(error: any): {
  requiredPermission?: string
  userRole?: string
  message?: string
} {
  return {
    requiredPermission: error?.requiredPermission || error?.required_permission,
    userRole: error?.userRole || error?.user_role,
    message: error?.message || error?.error
  }
}

/**
 * Format error message for display
 */
export function formatErrorMessage(error: any): string {
  if (typeof error === 'string') return error
  
  return (
    error?.message ||
    error?.error ||
    error?.statusText ||
    'An unexpected error occurred'
  )
}
