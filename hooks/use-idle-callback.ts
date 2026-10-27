"use client"

import { useEffect, useRef } from "react"

/**
 * Runs a callback during browser idle time.
 * Falls back to setTimeout(cb, 0) if requestIdleCallback is not supported.
 */
export function useIdleCallback(
  callback: () => void,
  deps: React.DependencyList = []
) {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    const run = () => callbackRef.current()

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      const id = (window as any).requestIdleCallback(run, { timeout: 2000 })
      return () => (window as any).cancelIdleCallback(id)
    } else {
      const id = setTimeout(run, 0)
      return () => clearTimeout(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

/**
 * Schedule non-critical work during idle time.
 */
export function scheduleIdleWork(fn: () => void) {
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    (window as any).requestIdleCallback(fn, { timeout: 3000 })
  } else {
    setTimeout(fn, 0)
  }
}
