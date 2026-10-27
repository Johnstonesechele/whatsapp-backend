"use client"

import { useState, useCallback, useRef } from "react"

interface UseOptimisticUpdateOptions<T> {
  onSuccess?: (result: T) => void
  onError?: (error: Error, rolledBack: T[]) => void
}

/**
 * Optimistic UI update hook.
 * Updates local state immediately, then syncs with the server.
 * Rolls back on failure.
 *
 * @example
 * const { optimistic, execute } = useOptimisticUpdate(items, setItems)
 * await execute(
 *   () => addItems API call,
 *   (newItem) => [...prev, newItem],
 *   (prev, item) => prev.filter(i => i.id !== item.id) // rollback
 * )
 */
export function useOptimisticUpdate<T, Args extends any[]>(
  current: T,
  setCurrent: React.Dispatch<React.SetStateAction<T>>,
  options?: UseOptimisticUpdateOptions<any>
) {
  const previousRef = useRef<T>(current)
  const [isPending, setIsPending] = useState(false)

  const execute = useCallback(
    async <R>(
      serverCall: () => Promise<R>,
      optimisticUpdate: (current: T, result: R) => T,
      rollback?: (current: T, result: R) => T
    ): Promise<R | null> => {
      previousRef.current = current
      setIsPending(true)

      try {
        // Apply optimistic update immediately
        const result = await serverCall()
        setCurrent((prev) => optimisticUpdate(prev, result))
        options?.onSuccess?.(result)
        setIsPending(false)
        return result
      } catch (error) {
        // Rollback to previous state
        const err = error instanceof Error ? error : new Error(String(error))
        if (rollback) {
          setCurrent((prev) => rollback(prev, previousRef.current as any))
        } else {
          setCurrent(previousRef.current)
        }
        options?.onError?.(err, [previousRef.current] as any)
        setIsPending(false)
        return null
      }
    },
    [current, setCurrent, options]
  )

  return { execute, isPending }
}
