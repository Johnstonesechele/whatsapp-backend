/**
 * Database Adapter Layer
 * Unified interface for SQLite, Supabase (via pg), and Supabase (via RPC).
 *
 * Resolution order when DATABASE_MODE=supabase:
 *   1. Direct PostgreSQL via `pg` pool (needs DATABASE_URL)
 *   2. Supabase RPC fallback (needs SUPABASE_SERVICE_ROLE_KEY)
 *
 * When DATABASE_MODE=sqlite:
 *   Legacy better-sqlite3 path (kept for root-level migration scripts only).
 */

import { getSupabaseAdminClient } from './supabase-config'

const DB_MODE = (process.env.DATABASE_MODE || 'sqlite') as 'sqlite' | 'supabase'

// ============= PG POOL (preferred for supabase mode) =============

let _pgPool: any = null

async function getPgPool(): Promise<any> {
  if (_pgPool) return _pgPool

  const url = process.env.DATABASE_URL
  if (!url) return null

  // Dynamic import so the app still starts when pg is unused
  const { Pool } = await import('pg')
  _pgPool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  })
  return _pgPool
}

// ============= PLACEHOLDER → $N CONVERSION =============

function convertPlaceholders(sql: string, params: any[]): { text: string; values: any[] } {
  let idx = 0
  const text = sql.replace(/\?/g, () => `$${++idx}`)
  return { text, values: params }
}

// ============= PUBLIC QUERY INTERFACE =============

/**
 * Execute a SELECT query and return all matching rows.
 */
export async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  if (DB_MODE === 'supabase') {
    return pgQuery<T>(sql, params)
  }
  return sqliteQuery<T>(sql, params)
}

/**
 * Execute a SELECT query and return the first row or null.
 */
export async function queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows.length > 0 ? rows[0] : null
}

/**
 * Execute an INSERT, UPDATE, or DELETE statement.
 * Returns an object compatible with better-sqlite3's RunResult.
 */
export async function execute(
  sql: string,
  params?: any[]
): Promise<{ changes: number; lastInsertRowid?: any }> {
  if (DB_MODE === 'supabase') {
    return pgExecute(sql, params)
  }
  return sqliteExecute(sql, params)
}

/**
 * Execute multiple statements in a transaction.
 * With pg this wraps in BEGIN/COMMIT/ROLLBACK.
 */
export async function transaction(callback: () => void | Promise<void>): Promise<void> {
  if (DB_MODE === 'supabase') {
    const pool = await getPgPool()
    if (!pool) {
      // No direct connection — fall back to sequential execution
      await callback()
      return
    }
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await callback()
      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } else {
    // SQLite — synchronous transaction
    // Dynamically import to avoid pulling in better-sqlite3 at bundle time
    const { getDatabase } = await import('./connection')
    const db = getDatabase()
    const txn = db.transaction(callback as any)
    txn()
  }
}

// ============= PG IMPLEMENTATION =============

async function pgQuery<T>(sql: string, params?: any[]): Promise<T[]> {
  const pool = await getPgPool()
  if (!pool) return rpcQuery<T>(sql, params)

  try {
    const { text, values } = convertPlaceholders(sql, params || [])
    const result = await pool.query(text, values)
    return result.rows as T[]
  } catch (err: any) {
    console.error('PG query error:', err.message)
    // Fall back to RPC if direct connection fails
    return rpcQuery<T>(sql, params)
  }
}

async function pgExecute(
  sql: string,
  params?: any[]
): Promise<{ changes: number; lastInsertRowid?: any }> {
  const pool = await getPgPool()
  if (!pool) return rpcExecute(sql, params)

  try {
    const { text, values } = convertPlaceholders(sql, params || [])
    const result = await pool.query(text, values)
    return {
      changes: result.rowCount ?? 0,
      lastInsertRowid: result.rows?.[0]?.id ?? null,
    }
  } catch (err: any) {
    console.error('PG execute error:', err.message)
    return rpcExecute(sql, params)
  }
}

// ============= SUPABASE RPC FALLBACK =============

async function rpcQuery<T>(sql: string, params?: any[]): Promise<T[]> {
  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase.rpc('execute_query', {
    sql_query: sql,
    params: params || [],
  })
  if (error) {
    console.error('RPC query error:', error.message)
    throw new Error(`RPC query failed: ${error.message}`)
  }
  return (data || []) as T[]
}

async function rpcExecute(
  sql: string,
  params?: any[]
): Promise<{ changes: number; lastInsertRowid?: any }> {
  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase.rpc('execute_sql', {
    sql_query: sql,
    params: params || [],
  })
  if (error) {
    console.error('RPC execute error:', error.message)
    throw new Error(`RPC execute failed: ${error.message}`)
  }
  return {
    changes: data?.changes ?? data?. rowCount ?? 1,
    lastInsertRowid: data?.id ?? data?.lastInsertRowid ?? null,
  }
}

// ============= SQLITE LEGACY (sync, for root scripts only) =============

function sqliteQuery<T>(sql: string, params?: any[]): T[] {
  // Dynamic import so better-sqlite3 isn't required at bundle time
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Database = require('better-sqlite3')
  const path = require('path')
  const dbPath = process.env.DB_PATH || path.resolve(process.cwd(), 'app/database/crm.db')
  const db = new Database(dbPath, { readonly: true })
  try {
    const stmt = db.prepare(sql)
    return (params ? stmt.all(...params) : stmt.all()) as T[]
  } finally {
    db.close()
  }
}

function sqliteExecute(
  sql: string,
  params?: any[]
): { changes: number; lastInsertRowid?: any } {
  const Database = require('better-sqlite3')
  const path = require('path')
  const dbPath = process.env.DB_PATH || path.resolve(process.cwd(), 'app/database/crm.db')
  const db = new Database(dbPath)
  try {
    const stmt = db.prepare(sql)
    const result = params ? stmt.run(...params) : stmt.run()
    return { changes: result.changes, lastInsertRowid: result.lastInsertRowid }
  } finally {
    db.close()
  }
}

// ============= NATIVE SUPABASE HELPERS =============

/**
 * Get Supabase table query builder (for new code using native Supabase queries).
 */
export function table(tableName: string) {
  if (DB_MODE === 'supabase') {
    return getSupabaseAdminClient().from(tableName)
  }
  throw new Error('Supabase table queries only available in supabase mode')
}

/**
 * Get the raw database client.
 * In supabase mode returns the Supabase admin client.
 * In sqlite mode returns the better-sqlite3 Database instance.
 */
export function getDatabase() {
  if (DB_MODE === 'supabase') {
    return getSupabaseAdminClient()
  }
  // Lazy import for sqlite mode
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Database = require('better-sqlite3')
  const path = require('path')
  const dbPath = process.env.DB_PATH || path.resolve(process.cwd(), 'app/database/crm.db')
  return new Database(dbPath)
}

export function isSupabaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

export function getDatabaseMode(): 'sqlite' | 'supabase' {
  return DB_MODE
}

console.log(`  Database adapter: mode=${DB_MODE}, pg=${!!process.env.DATABASE_URL ? 'direct' : 'rpc-fallback'}`)

export default {
  query,
  queryOne,
  execute,
  transaction,
  table,
  getDatabase,
  isSupabaseConfigured,
  getDatabaseMode,
}
