/**
 * Server-Side Team Size Update Utility
 * For use in API routes to automatically update subscription pricing when team members are added/removed
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

export async function updateTeamSizeForCompany(companyId: string): Promise<{
  success: boolean
  error?: string
  teamSize?: number
  newPrice?: number
}> {
  try {
    console.log(' [Team Size Update] Starting for company:', companyId)

    const { data: subscription, error: subError } = await supabaseAdmin
      .from('company_subscriptions')
      .select(`
        *,
        subscription_plans(*)
      `)
      .eq('company_id', companyId)
      .eq('status', 'active')
      .single()

    if (subError || !subscription) {
      console.log(' [Team Size Update] No active subscription found')
      return { success: true, error: 'No active subscription' }
    }

    const plan = subscription.subscription_plans
    if (!plan || plan.account_type !== 'team') {
      console.log('ℹ [Team Size Update] Not a team plan, skipping')
      return { success: true, error: 'Not a team plan' }
    }

    // Get current team size (count active users)
    const { data: teamMembers } = await supabaseAdmin
      .from("users")
      .select("id")
      .eq("company_id", companyId)
      .eq("active", true)

    const newTeamSize = Math.max(teamMembers?.length || 2, 2)

    console.log(' [Team Size Update]:', {
      companyId,
      planName: plan.display_name,
      oldTeamSize: subscription.team_size,
      newTeamSize
    })

    if (subscription.team_size === newTeamSize) {
      console.log('ℹ [Team Size Update] Team size unchanged')
      return { success: true, teamSize: newTeamSize }
    }

    // Parse pricing brackets
    let pricingBrackets = plan.team_pricing_brackets
    if (typeof pricingBrackets === 'string') {
      pricingBrackets = JSON.parse(pricingBrackets)
    }

    const bracket = pricingBrackets?.find(
      (b: any) => newTeamSize >= b.min_users && (b.max_users === -1 || newTeamSize <= b.max_users)
    )

    if (!bracket) {
      console.error(' [Team Size Update] No pricing bracket found for team size:', newTeamSize)
      return { success: false, error: `No pricing bracket found for team size ${newTeamSize}` }
    }

    const billingCycle = subscription.billing_cycle || 'monthly'
    const pricePerUser = billingCycle === 'yearly' ? bracket.price_yearly : bracket.price_monthly
    const newPrice = pricePerUser * newTeamSize

    console.log(' [New Pricing]:', { billingCycle, pricePerUser, newTeamSize, newPrice })

    // Update database record
    await supabaseAdmin
      .from('company_subscriptions')
      .update({
        team_size: newTeamSize,
        amount: newPrice,
        updated_at: new Date().toISOString()
      })
      .eq('id', subscription.id)

    console.log(' [Database] Subscription record updated')

    return { success: true, teamSize: newTeamSize, newPrice }

  } catch (error: any) {
    console.error(' [Team Size Update] Error:', error)
    return { success: false, error: error.message || 'Failed to update team size' }
  }
}
