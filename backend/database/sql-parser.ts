/**
 * Advanced SQL Parser for Supabase Migration
 * Converts SQL queries to Supabase query builder calls
 */

import type { SupabaseClient } from '@supabase/supabase-js'

interface ParsedSQL {
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE'
  tableName: string
  columns?: string[]
  where?: WhereClause[]
  orderBy?: { column: string; direction: 'asc' | 'desc' }[]
  limit?: number
  offset?: number
  joins?: JoinClause[]
  insertData?: Record<string, any>
  updateData?: Record<string, any>
}

interface WhereClause {
  column: string
  operator: string
  value: any
  connector?: 'AND' | 'OR'
}

interface JoinClause {
  type: 'INNER' | 'LEFT' | 'RIGHT'
  table: string
  on: { left: string; right: string }
}

/**
 * Parse SQL query string into structured format
 */
export function parseSQL(sql: string, params?: any[]): ParsedSQL {
  const trimmed = sql.trim()
  const upper = trimmed.toUpperCase()
  
  // Determine operation
  let operation: ParsedSQL['operation'] = 'SELECT'
  if (upper.startsWith('INSERT')) operation = 'INSERT'
  else if (upper.startsWith('UPDATE')) operation = 'UPDATE'
  else if (upper.startsWith('DELETE')) operation = 'DELETE'
  
  const result: ParsedSQL = {
    operation,
    tableName: '',
  }
  
  // Parse based on operation
  switch (operation) {
    case 'SELECT':
      return parseSELECT(sql, params)
    case 'INSERT':
      return parseINSERT(sql, params)
    case 'UPDATE':
      return parseUPDATE(sql, params)
    case 'DELETE':
      return parseDELETE(sql, params)
  }
  
  return result
}

/**
 * Parse SELECT query
 */
function parseSELECT(sql: string, params?: any[]): ParsedSQL {
  const result: ParsedSQL = {
    operation: 'SELECT',
    tableName: '',
    columns: [],
    where: [],
    orderBy: [],
  }
  
  // Extract columns (SELECT ... FROM)
  const selectMatch = sql.match(/SELECT\s+(.*?)\s+FROM/i)
  if (selectMatch) {
    const columnsStr = selectMatch[1].trim()
    if (columnsStr === '*') {
      result.columns = ['*']
    } else {
      result.columns = columnsStr.split(',').map(c => c.trim())
    }
  }
  
  // Extract table name
  const fromMatch = sql.match(/FROM\s+(\w+)/i)
  if (fromMatch) {
    result.tableName = fromMatch[1]
  }
  
  // Extract WHERE clauses
  result.where = parseWHERE(sql, params)
  
  // Extract ORDER BY
  const orderMatch = sql.match(/ORDER\s+BY\s+(.*?)(?:\s+LIMIT|\s+OFFSET|$)/i)
  if (orderMatch) {
    const orderStr = orderMatch[1].trim()
    result.orderBy = orderStr.split(',').map(part => {
      const [column, direction] = part.trim().split(/\s+/)
      return {
        column,
        direction: (direction?.toUpperCase() === 'DESC' ? 'desc' : 'asc') as 'asc' | 'desc'
      }
    })
  }
  
  // Extract LIMIT
  const limitMatch = sql.match(/LIMIT\s+(\d+)/i)
  if (limitMatch) {
    result.limit = parseInt(limitMatch[1])
  }
  
  // Extract OFFSET
  const offsetMatch = sql.match(/OFFSET\s+(\d+)/i)
  if (offsetMatch) {
    result.offset = parseInt(offsetMatch[1])
  }
  
  // Extract JOINs (simplified)
  const joinMatches = sql.matchAll(/(LEFT|RIGHT|INNER)?\s*JOIN\s+(\w+)\s+(?:AS\s+)?(\w+)?\s+ON\s+(\w+\.\w+)\s*=\s*(\w+\.\w+)/gi)
  result.joins = []
  for (const match of joinMatches) {
    result.joins.push({
      type: (match[1]?.toUpperCase() as any) || 'INNER',
      table: match[2],
      on: {
        left: match[4],
        right: match[5]
      }
    })
  }
  
  return result
}

/**
 * Parse WHERE clauses
 */
function parseWHERE(sql: string, params?: any[]): WhereClause[] {
  const where: WhereClause[] = []
  
  // Extract WHERE clause
  const whereMatch = sql.match(/WHERE\s+(.*?)(?:\s+ORDER|\s+GROUP|\s+LIMIT|\s+OFFSET|$)/i)
  if (!whereMatch) return where
  
  const whereStr = whereMatch[1].trim()
  
  // Split by AND/OR (simple split, doesn't handle complex parentheses)
  const parts = whereStr.split(/\s+(AND|OR)\s+/i)
  
  let paramIndex = 0
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].toUpperCase() === 'AND' || parts[i].toUpperCase() === 'OR') {
      continue
    }
    
    const part = parts[i].trim()
    
    // Parse condition (column operator value)
    // Support: =, !=, <, >, <=, >=, LIKE, IN, IS NULL
    let match = part.match(/(\w+(?:\.\w+)?)\s*(=|!=|<>|<|>|<=|>=|LIKE|IN|IS\s+NULL|IS\s+NOT\s+NULL)\s*(.*)/)
    
    if (match) {
      const column = match[1].replace(/^\w+\./, '') // Remove table prefix
      const operator = match[2].toUpperCase()
      let value: any
      
      if (operator === 'IS NULL' || operator === 'IS NOT NULL') {
        value = null
      } else if (match[3] === '?') {
        value = params?.[paramIndex++]
      } else {
        value = match[3].replace(/['"]/g, '') // Remove quotes
      }
      
      where.push({
        column,
        operator,
        value,
        connector: i > 0 && parts[i - 1] ? (parts[i - 1].toUpperCase() as 'AND' | 'OR') : 'AND'
      })
    }
  }
  
  return where
}

/**
 * Parse INSERT query
 */
function parseINSERT(sql: string, params?: any[]): ParsedSQL {
  const result: ParsedSQL = {
    operation: 'INSERT',
    tableName: '',
    insertData: {}
  }
  
  // Extract table name
  const tableMatch = sql.match(/INSERT\s+INTO\s+(\w+)/i)
  if (tableMatch) {
    result.tableName = tableMatch[1]
  }
  
  // Extract columns
  const columnsMatch = sql.match(/\(([^)]+)\)\s*VALUES/i)
  if (columnsMatch && params) {
    const columns = columnsMatch[1].split(',').map(c => c.trim())
    result.insertData = {}
    columns.forEach((col, idx) => {
      if (params[idx] !== undefined) {
        result.insertData![col] = params[idx]
      }
    })
  }
  
  return result
}

/**
 * Parse UPDATE query
 */
function parseUPDATE(sql: string, params?: any[]): ParsedSQL {
  const result: ParsedSQL = {
    operation: 'UPDATE',
    tableName: '',
    updateData: {},
    where: []
  }
  
  // Extract table name
  const tableMatch = sql.match(/UPDATE\s+(\w+)/i)
  if (tableMatch) {
    result.tableName = tableMatch[1]
  }
  
  // Extract SET clause
  const setMatch = sql.match(/SET\s+(.*?)\s+WHERE/i)
  if (setMatch && params) {
    const setParts = setMatch[1].split(',')
    let paramIndex = 0
    
    setParts.forEach(part => {
      const [column] = part.trim().split('=')
      if (column && params[paramIndex] !== undefined) {
        result.updateData![column.trim()] = params[paramIndex++]
      }
    })
    
    // Parse WHERE with remaining params
    result.where = parseWHERE(sql, params.slice(paramIndex))
  }
  
  return result
}

/**
 * Parse DELETE query
 */
function parseDELETE(sql: string, params?: any[]): ParsedSQL {
  const result: ParsedSQL = {
    operation: 'DELETE',
    tableName: '',
    where: []
  }
  
  // Extract table name
  const tableMatch = sql.match(/DELETE\s+FROM\s+(\w+)/i)
  if (tableMatch) {
    result.tableName = tableMatch[1]
  }
  
  // Extract WHERE
  result.where = parseWHERE(sql, params)
  
  return result
}

/**
 * Execute parsed SQL on Supabase
 */
export async function executeSupabaseQuery<T = any>(
  supabase: SupabaseClient,
  parsed: ParsedSQL
): Promise<T[]> {
  let query: any
  
  switch (parsed.operation) {
    case 'SELECT':
      query = supabase.from(parsed.tableName).select(parsed.columns?.join(',') || '*')
      
      // Apply WHERE clauses
      if (parsed.where) {
        for (const where of parsed.where) {
          switch (where.operator) {
            case '=':
              query = query.eq(where.column, where.value)
              break
            case '!=':
            case '<>':
              query = query.neq(where.column, where.value)
              break
            case '>':
              query = query.gt(where.column, where.value)
              break
            case '<':
              query = query.lt(where.column, where.value)
              break
            case '>=':
              query = query.gte(where.column, where.value)
              break
            case '<=':
              query = query.lte(where.column, where.value)
              break
            case 'LIKE':
              query = query.like(where.column, where.value)
              break
            case 'IN':
              query = query.in(where.column, where.value)
              break
            case 'IS NULL':
              query = query.is(where.column, null)
              break
            case 'IS NOT NULL':
              query = query.not(where.column, null)
              break
          }
        }
      }
      
      // Apply ORDER BY
      if (parsed.orderBy && parsed.orderBy.length > 0) {
        parsed.orderBy.forEach(order => {
          query = query.order(order.column, { ascending: order.direction === 'asc' })
        })
      }
      
      // Apply LIMIT
      if (parsed.limit) {
        query = query.limit(parsed.limit)
      }
      
      // Apply OFFSET
      if (parsed.offset) {
        query = query.range(parsed.offset, parsed.offset + (parsed.limit || 1000) - 1)
      }
      
      break
      
    case 'INSERT':
      query = supabase.from(parsed.tableName).insert(parsed.insertData).select()
      break
      
    case 'UPDATE':
      query = supabase.from(parsed.tableName).update(parsed.updateData!)
      
      // Apply WHERE clauses
      if (parsed.where) {
        for (const where of parsed.where) {
          if (where.operator === '=') {
            query = query.eq(where.column, where.value)
          }
        }
      }
      
      query = query.select()
      break
      
    case 'DELETE':
      query = supabase.from(parsed.tableName).delete()
      
      // Apply WHERE clauses
      if (parsed.where) {
        for (const where of parsed.where) {
          if (where.operator === '=') {
            query = query.eq(where.column, where.value)
          }
        }
      }
      break
  }
  
  const { data, error } = await query
  
  if (error) {
    console.error('Supabase query error:', error)
    console.error('Original SQL:', parsed)
    throw new Error(`Supabase ${parsed.operation} failed: ${error.message}`)
  }
  
  return (data || []) as T[]
}
