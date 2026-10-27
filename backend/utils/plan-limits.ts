import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSupabaseAdminClient } from '@/backend/database/supabase-config'
import jwt from 'jsonwebtoken'
import { getJWTSecret } from "@/lib/jwt"

const JWT_SECRET = getJWTSecret()

/**
 * Check if company has reached their plan limits
 */
export async function checkPlanLimits(
  companyId: string,
  resourceType: 'contacts' | 'leads' | 'deals' | 'whatsapp_messages' | 'email_campaigns' | 'surveys' | 'users' | 'storage' | 'api_calls',
  incrementBy: number = 1
): Promise<{ allowed: boolean; limit: number; current: number; message?: string }> {
  try {
    const supabase = getSupabaseAdminClient()

    // Get company subscription and plan
    const { data: subscription, error: subError } = await supabase
      .from('company_subscriptions')
      .select(`
        *,
        subscription_plans!inner(
          max_contacts,
          max_users,
          max_leads,
          max_deals,
          max_whatsapp_messages,
          max_email_campaigns,
          max_surveys,
          storage_gb,
          max_api_calls
        )
      `)
      .eq('company_id', companyId)
      .single()

    if (subError || !subscription) {
      console.error(' [Limits] No subscription found:', subError)
      return { allowed: false, limit: 0, current: 0, message: 'No active subscription' }
    }

    const plan = subscription.subscription_plans
    const limitField = `max_${resourceType}`
    const limit = plan[limitField] || 0

    // -1 means unlimited
    if (limit === -1) {
      return { allowed: true, limit: -1, current: 0 }
    }

    // Get current period start/end
    const periodStart = subscription.current_period_start || new Date().toISOString()
    const periodEnd = subscription.current_period_end || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

    // Check current usage for this billing period
    let currentUsage = 0

    switch (resourceType) {
      case 'contacts':
        const { count: contactCount } = await supabase
          .from('contacts')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId).eq('active', true)
        currentUsage = contactCount || 0
        break

      case 'leads':
        const { count: leadCount } = await supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId).eq('active', true)
        currentUsage = leadCount || 0
        break

      case 'deals':
        const { count: dealCount } = await supabase
          .from('deals')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId).eq('active', true)
        currentUsage = dealCount || 0
        break

      case 'whatsapp_messages':
        const { count: whatsappCount } = await supabase
          .from('whatsapp_messages')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .gte('sent_at', periodStart)
          .lte('sent_at', periodEnd)
        currentUsage = whatsappCount || 0
        break

      case 'email_campaigns':
        const { count: campaignCount } = await supabase
          .from('email_campaigns')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .gte('created_at', periodStart)
          .lte('created_at', periodEnd)
        currentUsage = campaignCount || 0
        break

      case 'surveys':
        const { count: surveyCount } = await supabase
          .from('surveys')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
        currentUsage = surveyCount || 0
        break

      case 'users':
        const { count: userCount } = await supabase
          .from('user_profiles')
          .select('user_id', { count: 'exact', head: true })
          .eq('company_id', companyId)
        currentUsage = userCount || 0
        break

      case 'api_calls':
        // Get API calls for current period from usage tracking
        const { count: apiCount } = await supabase
          .from('api_usage_logs')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .gte('created_at', periodStart)
          .lte('created_at', periodEnd)
        currentUsage = apiCount || 0
        break

      case 'storage':
        // Get total storage usage (in GB)
        const { data: storageData } = await supabase
          .from('file_storage')
          .select('file_size')
          .eq('company_id', companyId)
        
        const totalBytes = storageData?.reduce((sum, file) => sum + (file.file_size || 0), 0) || 0
        currentUsage = Math.ceil(totalBytes / (1024 * 1024 * 1024)) // Convert to GB
        break
    }

    const newUsage = currentUsage + incrementBy
    const allowed = newUsage <= limit

    if (!allowed) {
      return {
        allowed: false,
        limit,
        current: currentUsage,
        message: `Plan limit reached: ${currentUsage}/${limit} ${resourceType}. Upgrade your plan or wait until next billing cycle.`
      }
    }

    return { allowed: true, limit, current: currentUsage }

  } catch (error) {
    console.error(' [Limits] Error checking limits:', error)
    return { allowed: false, limit: 0, current: 0, message: 'Error checking limits' }
  }
}

/**
 * Middleware to enforce plan limits on API routes
 */
export async function enforcePlanLimits(
  request: NextRequest,
  resourceType: 'contacts' | 'leads' | 'deals' | 'whatsapp_messages' | 'email_campaigns' | 'surveys' | 'users' | 'storage' | 'api_calls',
  incrementBy: number = 1
): Promise<{ allowed: boolean; response?: NextResponse }> {
  try {
    // Extract company_id from JWT token
    const authHeader = request.headers.get("Authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return {
        allowed: false,
        response: NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      }
    }

    const token = authHeader.substring(7)
    let decoded: any

    try {
      decoded = jwt.verify(token, JWT_SECRET)
    } catch (jwtError) {
      return {
        allowed: false,
        response: NextResponse.json({ error: "Invalid token" }, { status: 401 })
      }
    }

    const companyId = decoded.company_id
    if (!companyId) {
      return {
        allowed: false,
        response: NextResponse.json({ error: "Missing company_id" }, { status: 401 })
      }
    }

    // Check limits
    const limitCheck = await checkPlanLimits(companyId, resourceType, incrementBy)

    if (!limitCheck.allowed) {
      console.warn(` [Limits] Plan limit reached for company ${companyId}:`, limitCheck.message)
      return {
        allowed: false,
        response: NextResponse.json({
          error: limitCheck.message,
          limitReached: true,
          limit: limitCheck.limit,
          current: limitCheck.current,
          resourceType
        }, { status: 403 })
      }
    }

    return { allowed: true }

  } catch (error) {
    console.error(' [Limits] Error in enforcePlanLimits:', error)
    return {
      allowed: false,
      response: NextResponse.json({ error: "Error checking plan limits" }, { status: 500 })
    }
  }
}

/**
 * Get usage statistics for a company
 */
export async function getUsageStats(companyId: string) {
  const supabase = getSupabaseAdminClient()

  const { data: subscription, error: subError } = await supabase
    .from('company_subscriptions')
    .select(`
      *,
      subscription_plans!inner(
        max_contacts,
        max_users,
        max_leads,
        max_deals,
        max_whatsapp_messages,
        max_email_campaigns,
        max_surveys,
        storage_gb,
        max_api_calls
      )
    `)
    .eq('company_id', companyId)
    .single()

  if (subError || !subscription) {
    return null
  }

  const plan = subscription.subscription_plans
  const periodStart = subscription.current_period_start || new Date().toISOString()
  const periodEnd = subscription.current_period_end || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  // Get all usage counts.
  // Contacts/leads/deals are filtered to active rows, matching what the list
  // endpoints show (each applies .eq('active', true)). Counting inactive rows
  // here charged a company for records it had deactivated: the contacts list
  // showed 114 while usage reported 115, and the extra one was a deactivated
  // contact still counting against the paid limit.
  const [contacts, leads, deals, whatsapp, campaigns, surveys, users] = await Promise.all([
    supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('active', true),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('active', true),
    supabase.from('deals').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('active', true),
    supabase.from('whatsapp_messages').select('id', { count: 'exact', head: true }).eq('company_id', companyId).gte('sent_at', periodStart).lte('sent_at', periodEnd),
    supabase.from('email_campaigns').select('id', { count: 'exact', head: true }).eq('company_id', companyId).gte('created_at', periodStart).lte('created_at', periodEnd),
    supabase.from('surveys').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
    supabase.from('user_profiles').select('user_id', { count: 'exact', head: true }).eq('company_id', companyId)
  ])

  return {
    contacts: { current: contacts.count || 0, limit: plan.max_contacts, unlimited: plan.max_contacts === -1 },
    leads: { current: leads.count || 0, limit: plan.max_leads, unlimited: plan.max_leads === -1 },
    deals: { current: deals.count || 0, limit: plan.max_deals, unlimited: plan.max_deals === -1 },
    whatsapp_messages: { current: whatsapp.count || 0, limit: plan.max_whatsapp_messages, unlimited: plan.max_whatsapp_messages === -1 },
    email_campaigns: { current: campaigns.count || 0, limit: plan.max_email_campaigns, unlimited: plan.max_email_campaigns === -1 },
    surveys: { current: surveys.count || 0, limit: plan.max_surveys, unlimited: plan.max_surveys === -1 },
    users: { current: users.count || 0, limit: plan.max_users, unlimited: plan.max_users === -1 },
    periodStart,
    periodEnd
  }
}
