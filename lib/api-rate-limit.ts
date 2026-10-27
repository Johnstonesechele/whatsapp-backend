/**
 * In-process sliding-window rate limiter for API-key traffic.
 *
 * The api_keys table carries a rate_limit column, but nothing read it - a key
 * could be limited to 1000/day in the UI and then be called as fast as the
 * network allowed.
 *
 * SCOPE, STATED PLAINLY
 *
 * This is per server instance, in memory. On Vercel each instance holds its
 * own counters, so the effective limit is (configured limit x instances).
 * That is a real limitation, not a subtle one: a key with rate_limit 1000 is
 * allowed roughly 1000 requests per instance per window, not 1000 per
 * database.
 *
 * It is still worth having. The failure it prevents is a runaway integration
 * hammering the app - dozens of requests per second from one client - which
 * this stops on every instance independently. For a strict global limit the
 * counter has to live in the database, which is a deliberate later step
 * rather than something to fake here.
 */

type Window = { count: number; resetAt: number }

const WINDOW_MS: Record<string, number> = {
  '1 second': 1_000,
  minute: 60_000,
  '1 minute': 60_000,
  hour: 3_600_000,
  '1 hour': 3_600_000,
  day: 86_400_000,
  '1 day': 86_400_000,
  week: 604_800_000,
  '1 week': 604_800_000,
  month: 2_592_000_000,
  '30 days': 2_592_000_000,
  year: 31_536_000_000,
  '1 year': 31_536_000_000,
}

function windowMs(name: string | null | undefined): number {
  if (!name) return WINDOW_MS['1 minute']
  return WINDOW_MS[name.trim().toLowerCase()] ?? WINDOW_MS['1 minute']
}

// Survive hot reloads without resetting everyone's counters mid-window.
const globalForLimit = globalThis as unknown as {
  __apiRateWindows?: Map<string, Window>
}
const windows: Map<string, Window> =
  globalForLimit.__apiRateWindows ?? (globalForLimit.__apiRateWindows = new Map())

// Keep the map from growing without bound on a long-lived process.
const MAX_TRACKED_KEYS = 10_000

export type RateLimitResult = {
  allowed: boolean
  limit: number | null
  remaining: number | null
  resetAt: number | null
}

/**
 * Count one request against a key.
 *
 * A key with no rate_limit configured is unlimited - the column is nullable
 * and "no limit" is a legitimate setting.
 */
export function checkRateLimit(
  keyId: string,
  limit: number | null | undefined,
  windowName: string | null | undefined
): RateLimitResult {
  if (limit === null || limit === undefined) {
    return { allowed: true, limit: null, remaining: null, resetAt: null }
  }
  if (limit <= 0) {
    return { allowed: false, limit: 0, remaining: 0, resetAt: Date.now() + 60_000 }
  }

  const now = Date.now()
  const span = windowMs(windowName)
  const existing = windows.get(keyId)

  let current: Window
  if (!existing || existing.resetAt <= now) {
    current = { count: 0, resetAt: now + span }
  } else {
    current = existing
  }

  if (current.count >= limit) {
    windows.set(keyId, current)
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetAt: current.resetAt,
    }
  }

  current.count += 1
  windows.set(keyId, current)

  if (windows.size > MAX_TRACKED_KEYS) {
    for (const [id, w] of windows) {
      if (w.resetAt <= now) windows.delete(id)
      if (windows.size <= MAX_TRACKED_KEYS) break
    }
  }

  return {
    allowed: true,
    limit,
    remaining: Math.max(0, limit - current.count),
    resetAt: current.resetAt,
  }
}

/** Rate-limit headers, so a well-behaved client can back off on its own. */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  if (result.limit === null) return {}
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining ?? 0),
  }
  if (result.resetAt) {
    headers['X-RateLimit-Reset'] = String(Math.ceil(result.resetAt / 1000))
  }
  return headers
}

/** Test hook: forget a key's counter. */
export function resetRateLimit(keyId?: string): void {
  if (keyId) windows.delete(keyId)
  else windows.clear()
}
