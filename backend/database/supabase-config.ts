import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Supabase configuration
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 
                        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY || ''
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// Validation
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('  Supabase credentials not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local')
}

function isNetworkError(error: any): boolean {
  return (
    error?.name === 'ConnectTimeoutError' ||
    error?.cause?.name === 'ConnectTimeoutError' ||
    error?.code === 'UND_ERR_CONNECT_TIMEOUT' ||
    error?.message?.includes('fetch failed')
  )
}

function createRetryFetch(requestTimeout = 30000, maxRetries = 3) {
  return async (url: string | URL | Request, options: any = {}) => {
    let lastError: Error | null = null
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fetch(url, {
          ...options,
          signal: AbortSignal.timeout(requestTimeout),
        })
      } catch (error: any) {
        lastError = error
        if (isNetworkError(error) && attempt < maxRetries - 1) {
          const delay = 1000 * Math.pow(2, attempt)
          await new Promise(r => setTimeout(r, delay))
          continue
        }
        throw error
      }
    }
    throw lastError
  }
}

// Client for frontend/public operations (with RLS enforcement)
let supabaseClient: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase credentials not configured')
    }
    supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        fetch: createRetryFetch(30000, 3),
      },
    })
  }
  return supabaseClient
}

// Admin client for backend operations (can bypass RLS when needed)
// WARNING: Use with caution! This bypasses Row Level Security.
// Always validate permissions manually when using this client.
let supabaseAdminClient: SupabaseClient | null = null

export function getSupabaseAdminClient(): SupabaseClient {
  if (!supabaseAdminClient) {
    if (!supabaseUrl) {
      throw new Error('Supabase URL not configured')
    }
    
    // Use service role key if available, otherwise fall back to anon key
    const key = supabaseServiceRoleKey || supabaseAnonKey
    
    if (!key) {
      throw new Error('Neither service role key nor anon key configured')
    }
    
    if (!supabaseServiceRoleKey) {
      console.warn('  Service role key not available. Using anon key (RLS will be enforced)')
    }
    
    supabaseAdminClient = createClient(supabaseUrl, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: {
        fetch: createRetryFetch(30000, 3),
      },
    })
  }
  return supabaseAdminClient
}

// Helper to create an authenticated client for user-context operations
// Use this when you need to perform operations on behalf of a specific user
export async function getAuthenticatedClient(userId: string, accessToken?: string): Promise<SupabaseClient> {
  const client = getSupabaseClient()
  
  if (accessToken) {
    // If we have an access token, use it
    await client.auth.setSession({
      access_token: accessToken,
      refresh_token: '', // Not needed for server operations
    })
  }
  
  return client
}

// Database types (to be generated from Supabase schema)
export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          company_id: string | null
          name: string
          email: string
          password_hash: string
          role: string
          permissions: string
          department: string | null
          position: string | null
          location: string | null
          phone: string | null
          avatar: string | null
          active: boolean
          email_verified: boolean
          invitation_token: string | null
          invitation_expires_at: string | null
          last_login: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['users']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['users']['Insert']>
      }
      // Add more table types as needed
    }
  }
}

export default {
  getSupabaseClient,
  getSupabaseAdminClient,
}
