import { getSupabaseAdminClient } from '@/backend/database/supabase-config'

/**
 * Check if a company's subscription is active and has access to requested features
 */
export async function checkSubscriptionAccess(
  companyId: string,
  requiredFeature?: string
): Promise<{
  hasAccess: boolean
  subscription: any
  plan: any
  reason?: string
}> {
  try {
    const supabase = getSupabaseAdminClient()

    // Get company subscription
    const { data: subscription, error: subError } = await supabase
      .from('company_subscriptions')
      .select('*, subscription_plans(*)')
      .eq('company_id', companyId)
      .single()

    if (subError || !subscription) {
      return {
        hasAccess: false,
        subscription: null,
        plan: null,
        reason: 'No active subscription found'
      }
    }

    // Check if subscription is active or in trial
    if (subscription.status !== 'active' && subscription.status !== 'trial') {
      return {
        hasAccess: false,
        subscription,
        plan: subscription.subscription_plans,
        reason: `Subscription status is ${subscription.status}`
      }
    }

    // Check if trial has expired
    if (subscription.is_trial && subscription.trial_end_date) {
      const trialEndDate = new Date(subscription.trial_end_date)
      const now = new Date()
      
      if (now > trialEndDate) {
        return {
          hasAccess: false,
          subscription,
          plan: subscription.subscription_plans,
          reason: 'Trial has expired. Please add payment method to continue.'
        }
      }
    }

    const plan = subscription.subscription_plans

    // Check specific feature access if required
    if (requiredFeature) {
      const featureMap: { [key: string]: keyof typeof plan } = {
        'whatsapp': 'has_whatsapp_integration',
        'email': 'has_email_integration',
        'analytics': 'has_advanced_analytics',
        'automation': 'has_automation',
        'ai': 'has_ai_features',
        'team': 'has_team_collaboration',
        'roles': 'has_role_management',
        'api': 'has_api_access',
        'integrations': 'has_custom_integrations',
        'white_label': 'has_white_label',
        'priority_support': 'has_priority_support'
      }

      const featureKey = featureMap[requiredFeature.toLowerCase()]
      
      if (featureKey && !plan[featureKey]) {
        return {
          hasAccess: false,
          subscription,
          plan,
          reason: `Your plan does not include ${requiredFeature}. Please upgrade.`
        }
      }
    }

    return {
      hasAccess: true,
      subscription,
      plan
    }
  } catch (error) {
    console.error('Error checking subscription access:', error)
    return {
      hasAccess: false,
      subscription: null,
      plan: null,
      reason: 'Error checking subscription status'
    }
  }
}

/**
 * Check if a company has reached usage limits
 */
export async function checkUsageLimits(
  companyId: string,
  resourceType: 'contacts' | 'users' | 'leads' | 'deals' | 'whatsapp_messages' | 'email_campaigns' | 'surveys' | 'storage' | 'api_calls'
): Promise<{
  isWithinLimit: boolean
  current: number
  limit: number
  percentage: number
}> {
  try {
    const supabase = getSupabaseAdminClient()

    // Get subscription and plan
    const { data: subscription } = await supabase
      .from('company_subscriptions')
      .select('*, subscription_plans(*)')
      .eq('company_id', companyId)
      .single()

    if (!subscription) {
      return { isWithinLimit: false, current: 0, limit: 0, percentage: 100 }
    }

    const plan = subscription.subscription_plans

    // Get current usage
    const { data: usage } = await supabase
      .from('subscription_usage')
      .select('*')
      .eq('company_id', companyId)
      .order('period_start', { ascending: false })
      .limit(1)
      .single()

    // Map resource types to plan limits and usage fields
    const limitMap: { [key: string]: { limit: number, current: number } } = {
      'contacts': { 
        limit: plan.max_contacts, 
        current: usage?.contacts_count || 0 
      },
      'users': { 
        limit: subscription.purchased_user_seats, 
        current: usage?.users_count || 0 
      },
      'leads': { 
        limit: plan.max_leads, 
        current: usage?.leads_count || 0 
      },
      'deals': { 
        limit: plan.max_deals, 
        current: usage?.deals_count || 0 
      },
      'whatsapp_messages': { 
        limit: plan.max_whatsapp_messages, 
        current: usage?.whatsapp_messages_sent || 0 
      },
      'email_campaigns': { 
        limit: plan.max_email_campaigns, 
        current: usage?.email_campaigns_sent || 0 
      },
      'surveys': { 
        limit: plan.max_surveys, 
        current: usage?.surveys_created || 0 
      },
      'storage': { 
        limit: plan.storage_gb, 
        current: usage?.storage_used_gb || 0 
      },
      'api_calls': { 
        limit: plan.max_api_calls, 
        current: usage?.api_calls_made || 0 
      }
    }

    const { limit, current } = limitMap[resourceType] || { limit: 0, current: 0 }

    // -1 means unlimited
    if (limit === -1) {
      return { isWithinLimit: true, current, limit: -1, percentage: 0 }
    }

    const percentage = limit > 0 ? (current / limit) * 100 : 0
    const isWithinLimit = current < limit

    return { isWithinLimit, current, limit, percentage }
  } catch (error) {
    console.error('Error checking usage limits:', error)
    return { isWithinLimit: false, current: 0, limit: 0, percentage: 100 }
  }
}

/**
 * Check if a solo user is trying to access team features
 */
export async function checkTeamFeatureAccess(companyId: string): Promise<{
  isTeamAccount: boolean
  canAccessTeamFeatures: boolean
  accountType: string
}> {
  try {
    const supabase = getSupabaseAdminClient()

    const { data: subscription } = await supabase
      .from('company_subscriptions')
      .select('account_type, subscription_plans(has_team_collaboration)')
      .eq('company_id', companyId)
      .single()

    if (!subscription) {
      return {
        isTeamAccount: false,
        canAccessTeamFeatures: false,
        accountType: 'unknown'
      }
    }

    const isTeamAccount = subscription.account_type === 'team'
    const plan = Array.isArray(subscription.subscription_plans) 
      ? subscription.subscription_plans[0] 
      : subscription.subscription_plans
    const hasTeamCollaboration = plan?.has_team_collaboration || false

    return {
      isTeamAccount,
      canAccessTeamFeatures: isTeamAccount && hasTeamCollaboration,
      accountType: subscription.account_type
    }
  } catch (error) {
    console.error('Error checking team feature access:', error)
    return {
      isTeamAccount: false,
      canAccessTeamFeatures: false,
      accountType: 'unknown'
    }
  }
}

/**
 * Update usage tracking for a resource
 */
export async function updateUsageTracking(
  companyId: string,
  resourceType: 'contacts' | 'users' | 'leads' | 'deals' | 'whatsapp_messages' | 'email_campaigns' | 'surveys' | 'storage' | 'api_calls',
  increment: number = 1
): Promise<boolean> {
  try {
    const supabase = getSupabaseAdminClient()

    // Get current period usage entry
    const now = new Date()
    const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

    const { data: usage } = await supabase
      .from('subscription_usage')
      .select('*')
      .eq('company_id', companyId)
      .eq('period_start', periodStart.toISOString())
      .single()

    const fieldMap: { [key: string]: string } = {
      'contacts': 'contacts_count',
      'users': 'users_count',
      'leads': 'leads_count',
      'deals': 'deals_count',
      'whatsapp_messages': 'whatsapp_messages_sent',
      'email_campaigns': 'email_campaigns_sent',
      'surveys': 'surveys_created',
      'storage': 'storage_used_gb',
      'api_calls': 'api_calls_made'
    }

    const field = fieldMap[resourceType]

    if (usage) {
      // Update existing usage
      const { error } = await supabase
        .from('subscription_usage')
        .update({
          [field]: (usage[field] || 0) + increment,
          last_calculated_at: now.toISOString(),
          updated_at: now.toISOString()
        })
        .eq('id', usage.id)

      return !error
    } else {
      // Create new usage entry
      const { data: subscription } = await supabase
        .from('company_subscriptions')
        .select('id')
        .eq('company_id', companyId)
        .single()

      if (!subscription) return false

      const { error } = await supabase
        .from('subscription_usage')
        .insert({
          company_id: companyId,
          subscription_id: subscription.id,
          period_start: periodStart.toISOString(),
          period_end: periodEnd.toISOString(),
          [field]: increment,
          last_calculated_at: now.toISOString(),
          created_at: now.toISOString(),
          updated_at: now.toISOString()
        })

      return !error
    }
  } catch (error) {
    console.error('Error updating usage tracking:', error)
    return false
  }
}

/**
 * Get subscription status for display
 */
export function getSubscriptionStatusInfo(subscription: any): {
  status: string
  message: string
  color: string
  action?: string
} {
  if (!subscription) {
    return {
      status: 'no_subscription',
      message: 'No active subscription',
      color: 'red',
      action: 'Subscribe Now'
    }
  }

  if (subscription.status === 'trial') {
    const daysRemaining = Math.ceil(
      (new Date(subscription.trial_end_date).getTime() - new Date().getTime()) / 
      (1000 * 60 * 60 * 24)
    )

    if (daysRemaining <= 0) {
      return {
        status: 'trial_expired',
        message: 'Trial expired',
        color: 'red',
        action: 'Activate Subscription'
      }
    } else if (daysRemaining <= 7) {
      return {
        status: 'trial_ending',
        message: `Trial ends in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}`,
        color: 'yellow',
        action: 'Add Payment Method'
      }
    } else {
      return {
        status: 'trial',
        message: `${daysRemaining} days remaining in trial`,
        color: 'blue'
      }
    }
  }

  if (subscription.status === 'active') {
    return {
      status: 'active',
      message: 'Active subscription',
      color: 'green'
    }
  }

  if (subscription.status === 'past_due') {
    return {
      status: 'past_due',
      message: 'Payment failed - please update payment method',
      color: 'red',
      action: 'Update Payment Method'
    }
  }

  if (subscription.status === 'cancelled') {
    return {
      status: 'cancelled',
      message: 'Subscription cancelled',
      color: 'gray',
      action: 'Reactivate'
    }
  }

  if (subscription.status === 'suspended') {
    return {
      status: 'suspended',
      message: 'Subscription suspended',
      color: 'red',
      action: 'Contact Support'
    }
  }

  return {
    status: 'unknown',
    message: 'Unknown status',
    color: 'gray'
  }
}
