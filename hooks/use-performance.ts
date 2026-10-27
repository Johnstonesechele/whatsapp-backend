"use client"

import { useCallback, useRef } from "react"

/**
 * Measure execution time of async operations.
 * Returns the result and logs timing in development.
 *
 * @example
 * const measure = usePerformanceMeasure()
 * const data = await measure("fetchContacts", () => fetchContacts())
 */
export function usePerformanceMeasure() {
  const measurementsRef = useRef<Map<string, number[]>>(new Map())

  return useCallback(
    async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
      const start = performance.now()
      try {
        const result = await fn()
        const duration = performance.now() - start

        // Track measurements
        const existing = measurementsRef.current.get(label) || []
        existing.push(duration)
        measurementsRef.current.set(label, existing.slice(-20)) // Keep last 20

        if (process.env.NODE_ENV === "development") {
          const avg =
            existing.reduce((a, b) => a + b, 0) / existing.length
        }

        // Warn on slow operations
        if (duration > 1000) {
          console.warn(`[Perf] Slow operation: ${label} took ${duration.toFixed(0)}ms`)
        }

        return result
      } catch (error) {
        const duration = performance.now() - start
        console.error(`[Perf] ${label} failed after ${duration.toFixed(1)}ms:`, error)
        throw error
      }
    },
    []
  )
}

/**
 * Get performance statistics for a measured label.
 */
export function getPerformanceStats(
  measurementsRef: Map<string, number[]>,
  label: string
) {
  const measurements = measurementsRef.get(label) || []
  if (measurements.length === 0) return null

  const sorted = [...measurements].sort((a, b) => a - b)
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: sorted.reduce((a, b) => a + b, 0) / sorted.length,
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)],
  }
}
