"use client"

import { useState, useEffect, useCallback, useRef } from "react"

/**
 * Debounce a value by `delay` ms. Returns the debounced value.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}

/**
 * Debounced callback. Returns a stable function that delays invocation.
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  return useCallback(
    ((...args: any[]) => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => callbackRef.current(...args), delay)
    }) as T,
    [delay]
  )
}

/**
 * Throttle a callback. Returns a stable function that fires at most once per `limit` ms.
 */
export function useThrottledCallback<T extends (...args: any[]) => any>(
  callback: T,
  limit: number
): T {
  const lastCallRef = useRef(0)
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  return useCallback(
    ((...args: any[]) => {
      const now = Date.now()
      if (now - lastCallRef.current >= limit) {
        lastCallRef.current = now
        callbackRef.current(...args)
      }
    }) as T,
    [limit]
  )
}
