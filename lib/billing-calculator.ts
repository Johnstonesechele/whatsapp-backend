/**
 * Dynamic Billing Calculator
 * Handles the two-tier pricing model:
 * - First payment: Based on purchased seats (from checkout)
 * - Subsequent payments: Based on active users in the system
 */

import { getSupabaseAdminClient } from '@/backend/database/supabase-config'

export interface BillingCalculation {
  currentAmount: number // What they're paying now
  nextAmount: number // What they'll pay next billing cycle
  activeUsers: number
  purchasedSeats: number
  pricePerUser: number
  billingCycle: 'monthly' | 'yearly'
  isFirstBilling: boolean
  savings?: number // If they have unused seats
}

/**
 * Calculate the current billing amount and next billing amount
 * @param companyId - The company ID
 * @returns Billing calculation details
 */
export async function calculateDynamicBilling(companyId: string): Promise<BillingCalculation | null> {
  try {
    const supabase = getSupabaseAdminClient()

    // Get subscription details
    const { data: subscription, error: subError } = await supabase
      .from('company_subscriptions')
      .select(`
        *,
        plan:subscription_plans(*)
      `)
      .eq('company_id', companyId)
      .single()

    if (subError || !subscription) {
      console.error('Error fetching subscription:', subError)
      return null
    }

    const plan = subscription.plan

    // Count active users in the system
    const { count: activeUsers } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('active', true)

    const actualActiveUsers = activeUsers || 1

    console.log(` Billing Calculation for company ${companyId}:`, {
      plan_name: plan.name,
      account_type: plan.account_type,
      billing_cycle: subscription.billing_cycle,
      current_amount: subscription.amount,
      purchased_seats: subscription.purchased_user_seats,
      active_users: actualActiveUsers,
      last_payment_date: subscription.last_payment_date
    })

    // Determine if this is the first billing cycle
    // First billing = no previous payment date OR payment date is within the same period as creation
    const isFirstBilling = !subscription.last_payment_date || 
      (new Date(subscription.last_payment_date).getTime() === new Date(subscription.created_at).getTime())

    console.log(` Is First Billing: ${isFirstBilling}`)

    // Get billing cycle
    const billingCycle: 'monthly' | 'yearly' = subscription.billing_cycle === 'yearly' ? 'yearly' : 'monthly'

    // For solo plans, pricing is fixed
    if (plan.account_type === 'solo') {
      const amount = billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly
      console.log(` Solo Plan: Fixed amount = $${amount}`)
      return {
        currentAmount: amount,
        nextAmount: amount,
        activeUsers: 1,
        purchasedSeats: 1,
        pricePerUser: amount,
        billingCycle,
        isFirstBilling
      }
    }

    // For team plans, calculate based on pricing brackets
    let currentAmount = subscription.amount || 0
    let nextAmount = 0
    let pricePerUser = 0

    // Parse pricing brackets
    let pricingBrackets = plan.team_pricing_brackets
    if (typeof pricingBrackets === 'string') {
      try {
        pricingBrackets = JSON.parse(pricingBrackets)
      } catch (e) {
        console.error('Error parsing pricing brackets:', e)
        pricingBrackets = []
      }
    }

    if (pricingBrackets && Array.isArray(pricingBrackets)) {
      console.log(` Pricing Brackets for company ${companyId}:`, pricingBrackets)
      console.log(` Active users for calculation: ${actualActiveUsers}`)
      
      // Find bracket for actual active users (for next billing)
      const nextBracket = pricingBrackets.find(
        (b: any) => actualActiveUsers >= b.min_users && (b.max_users === -1 || actualActiveUsers <= b.max_users)
      )

      console.log(` Next Bracket Found:`, nextBracket)

      if (nextBracket) {
        pricePerUser = billingCycle === 'yearly' ? nextBracket.price_yearly : nextBracket.price_monthly
        nextAmount = pricePerUser * actualActiveUsers
        console.log(` Next Amount Calculation: ${actualActiveUsers} users × $${pricePerUser} = $${nextAmount}`)
      } else {
        console.warn(` No pricing bracket found for ${actualActiveUsers} users!`)
        // FALLBACK: Use the lowest bracket if no match found (edge case for single user teams)
        if (pricingBrackets.length > 0) {
          const lowestBracket = pricingBrackets[0]
          pricePerUser = billingCycle === 'yearly' ? lowestBracket.price_yearly : lowestBracket.price_monthly
          nextAmount = pricePerUser * actualActiveUsers
          console.warn(` Using fallback bracket: ${actualActiveUsers} users × $${pricePerUser} = $${nextAmount}`)
        }
      }

      // Current amount logic:
      // - If first billing: use purchased seats (what they paid during checkout)
      // - If subsequent billing: use stored amount (last calculated based on active users)
      if (isFirstBilling) {
        // First billing: based on purchased seats
        const firstBracket = pricingBrackets.find(
          (b: any) => subscription.purchased_user_seats >= b.min_users && 
                     (b.max_users === -1 || subscription.purchased_user_seats <= b.max_users)
        )
        if (firstBracket) {
          const firstPricePerUser = billingCycle === 'yearly' ? firstBracket.price_yearly : firstBracket.price_monthly
          currentAmount = firstPricePerUser * subscription.purchased_user_seats
        } else if (pricingBrackets.length > 0) {
          // FALLBACK: Use lowest bracket
          const lowestBracket = pricingBrackets[0]
          const firstPricePerUser = billingCycle === 'yearly' ? lowestBracket.price_yearly : lowestBracket.price_monthly
          currentAmount = firstPricePerUser * subscription.purchased_user_seats
          console.warn(` Using fallback bracket for first billing: ${subscription.purchased_user_seats} seats × $${firstPricePerUser} = $${currentAmount}`)
        }
      } else {
        // Subsequent billing: use stored amount from last billing cycle
        currentAmount = subscription.amount
      }
    } else {
      console.warn(` No pricing brackets array available for company ${companyId}`)
    }

    // Calculate savings if they have unused seats
    const savings = isFirstBilling && actualActiveUsers < subscription.purchased_user_seats
      ? (subscription.purchased_user_seats - actualActiveUsers) * pricePerUser
      : undefined

    const result = {
      currentAmount,
      nextAmount,
      activeUsers: actualActiveUsers,
      purchasedSeats: subscription.purchased_user_seats,
      pricePerUser,
      billingCycle,
      isFirstBilling,
      savings
    }

    console.log(` Billing Calculation Result for company ${companyId}:`, result)

    return result
  } catch (error) {
    console.error('Error calculating dynamic billing:', error)
    return null
  }
}

/**
 * Update subscription amount to next billing amount
 * Call this when processing recurring payments
 */
export async function updateToNextBillingAmount(companyId: string): Promise<boolean> {
  try {
    const supabase = getSupabaseAdminClient()
    const billing = await calculateDynamicBilling(companyId)

    if (!billing) {
      return false
    }

    // Update subscription with next billing amount
    const { error } = await supabase
      .from('company_subscriptions')
      .update({
        amount: billing.nextAmount,
        used_user_seats: billing.activeUsers,
        last_payment_date: new Date().toISOString(),
        last_payment_amount: billing.nextAmount,
        updated_at: new Date().toISOString()
      })
      .eq('company_id', companyId)

    if (error) {
      console.error('Error updating billing amount:', error)
      return false
    }

    console.log(` Updated billing amount for company ${companyId}: $${billing.nextAmount} (${billing.activeUsers} users)`)
    return true
  } catch (error) {
    console.error('Error updating billing amount:', error)
    return false
  }
}

/**
 * Get a formatted billing summary for display
 */
export function formatBillingSummary(billing: BillingCalculation): {
  currentDisplay: string
  nextDisplay: string
  message: string
} {
  const currentDisplay = `$${billing.currentAmount.toFixed(2)}/${billing.billingCycle}`
  const nextDisplay = `$${billing.nextAmount.toFixed(2)}/${billing.billingCycle}`

  let message = ''
  
  if (billing.isFirstBilling) {
    if (billing.savings && billing.savings > 0) {
      message = `You purchased ${billing.purchasedSeats} seats but have ${billing.activeUsers} active users. Next billing will be ${nextDisplay} based on active users.`
    } else if (billing.activeUsers > billing.purchasedSeats) {
      message = `You have ${billing.activeUsers} active users (${billing.activeUsers - billing.purchasedSeats} more than purchased). Next billing will be ${nextDisplay}.`
    } else {
      message = `Next billing will be ${nextDisplay} based on ${billing.activeUsers} active users.`
    }
  } else {
    if (billing.nextAmount !== billing.currentAmount) {
      const diff = billing.nextAmount - billing.currentAmount
      const change = diff > 0 ? 'increase' : 'decrease'
      message = `Your next billing will ${change} to ${nextDisplay} (${billing.activeUsers} active users).`
    } else {
      message = `Your next billing will remain ${nextDisplay} (${billing.activeUsers} active users).`
    }
  }

  return {
    currentDisplay,
    nextDisplay,
    message
  }
}
