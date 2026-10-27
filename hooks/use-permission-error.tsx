"use client"

import { useState, useCallback, useEffect, createContext, useContext, type ReactNode } from 'react'
import { isPermissionError, formatPermissionError, PERMISSION_ACTIONS } from '@/lib/permission-error-handler'

interface PermissionErrorState {
  isOpen: boolean
  title: string
  message: string
  details?: {
    required?: string
    userRole?: string
    userPermissions?: string[]
  }
  action?: string
}

/**
 * Hook for handling permission errors with dialog/toast notifications
 * 
 * @example
 * ```tsx
 * const { showPermissionError, PermissionDialog } = usePermissionError()
 * 
 * const handleAction = async () => {
 *   try {
 *     await someApiCall()
 *   } catch (error) {
 *     showPermissionError(error, { action: 'create leads' })
 *   }
 * }
 * 
 * return (
 *   <div>
 *     <button onClick={handleAction}>Create Lead</button>
 *     <PermissionDialog />
 *   </div>
 * )
 * ```
 */
export function usePermissionError() {
  const [errorState, setErrorState] = useState<PermissionErrorState>({
    isOpen: false,
    title: 'Permission Denied',
    message: '',
    action: undefined,
    details: undefined
  })

  /**
   * Show permission error dialog
   */
  const showPermissionError = useCallback((
    error: any,
    options?: {
      action?: string
      title?: string
      message?: string
    }
  ) => {
    if (!isPermissionError(error)) {
      // Not a permission error, don't show dialog
      return false
    }

    const formatted = formatPermissionError(error, {
      title: options?.title,
      message: options?.message,
      action: options?.action
    })

    if (!formatted) {
      return false
    }

    setErrorState({
      isOpen: true,
      title: formatted.title,
      message: formatted.message,
      details: formatted.details,
      action: options?.action
    })

    return true
  }, [])

  /**
   * Close the permission error dialog
   */
  const closeDialog = useCallback(() => {
    setErrorState(prev => ({ ...prev, isOpen: false }))
  }, [])

  /**
   * Check if error is a permission error and show dialog if it is
   * Returns true if it was a permission error, false otherwise
   */
  const handleError = useCallback((
    error: any,
    options?: {
      action?: string
      title?: string
      message?: string
      fallback?: (error: any) => void
    }
  ) => {
    const wasPermissionError = showPermissionError(error, options)
    
    if (!wasPermissionError && options?.fallback) {
      options.fallback(error)
    }

    return wasPermissionError
  }, [showPermissionError])

  return {
    showPermissionError,
    closeDialog,
    handleError,
    errorState,
    isOpen: errorState.isOpen,
    // Pre-configured action types
    ACTIONS: PERMISSION_ACTIONS
  }
}

/**
 * Context provider for global permission error handling
 */
interface PermissionErrorContextValue {
  showPermissionError: (error: any, options?: { action?: string; title?: string; message?: string }) => boolean
  handleError: (error: any, options?: any) => boolean
}

const PermissionErrorContext = createContext<PermissionErrorContextValue | null>(null)

export function PermissionErrorProvider({ children }: { children: ReactNode }) {
  const { showPermissionError, handleError, errorState, closeDialog } = usePermissionError()
  
  // Lazy load the dialog component
  const [PermissionErrorDialog, setPermissionErrorDialog] = useState<any>(null)
  
  useEffect(() => {
    import('@/components/ui/permission-error-dialog').then(module => {
      setPermissionErrorDialog(() => module.PermissionErrorDialog)
    })
  }, [])

  return (
    <PermissionErrorContext.Provider value={{ showPermissionError, handleError }}>
      {children}
      {PermissionErrorDialog && (
        <PermissionErrorDialog
          isOpen={errorState.isOpen}
          onClose={closeDialog}
          title={errorState.title}
          message={errorState.message}
          details={errorState.details}
          action={errorState.action}
        />
      )}
    </PermissionErrorContext.Provider>
  )
}

/**
 * Use the global permission error handler
 */
export function useGlobalPermissionError() {
  const context = useContext(PermissionErrorContext)
  
  if (!context) {
    throw new Error('useGlobalPermissionError must be used within PermissionErrorProvider')
  }
  
  return context
}
