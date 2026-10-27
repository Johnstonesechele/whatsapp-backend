/**
 * Subscription Pricing Utilities
 * Handles dynamic price calculation based on active team members
 */

interface PricingBracket {
  min_users: number
  max_users: number
  price_monthly: number
  price_yearly: number
}

interface Plan {
  id: string
  name: string
  account_type: string
  price_monthly: number
  price_yearly: number
  team_pricing_brackets?: PricingBracket[]
  max_users: number
}

/**
 * Calculate current subscription price based on active team members
 * This is the dynamic calculation that reflects actual team size, not purchased seats
 */
export function calculateCurrentPrice(
  plan: Plan,
  activeTeamMembers: number,
  billingCycle: 'monthly' | 'yearly'
): number {
  // Solo plans: fixed price regardless of team size
  if (plan.account_type === 'solo') {
    return billingCycle === 'monthly' ? plan.price_monthly : plan.price_yearly
  }

  // Enterprise plans: custom pricing (return 0, should contact sales)
  if (plan.account_type === 'enterprise') {
    return 0
  }

  // Team plans: bracket-based pricing
  if (plan.account_type === 'team' && plan.team_pricing_brackets) {
    let bracket = plan.team_pricing_brackets.find(
      b => activeTeamMembers >= b.min_users && 
           (b.max_users === -1 || activeTeamMembers <= b.max_users)
    )
    
    // Fallback: If no bracket found (e.g., 1 user on team plan), use the first bracket
    if (!bracket && plan.team_pricing_brackets.length > 0) {
      console.warn(` [Price Calculator] No bracket found for ${activeTeamMembers} users, using first bracket as fallback`)
      bracket = plan.team_pricing_brackets[0]
    }
    
    if (bracket) {
      const pricePerUser = billingCycle === 'monthly'
        ? bracket.price_monthly
        : bracket.price_yearly
      
      const totalPrice = pricePerUser * activeTeamMembers
      
      console.log(' [Price Calculator] Team pricing:', {
        activeMembers: activeTeamMembers,
        bracket: `${bracket.min_users}-${bracket.max_users === -1 ? '∞' : bracket.max_users}`,
        pricePerUser,
        totalPrice,
        billingCycle
      })
      
      return totalPrice
    }
  }

  // Fallback to base price (should rarely happen)
  console.warn(' [Price Calculator] No bracket found, using base price')
  const fallbackPrice = billingCycle === 'monthly' ? plan.price_monthly : plan.price_yearly
  
  // If base price is also 0, return a minimum price to avoid showing $0
  if (fallbackPrice === 0 && plan.account_type === 'team') {
    console.error(' [Price Calculator] Base price is 0 for team plan! Please check pricing brackets.')
  }
  
  return fallbackPrice
}

/**
 * Format price for display
 */
export function formatPrice(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount)
}

/**
 * Calculate price difference between two plans/team sizes
 */
export function calculatePriceDifference(
  currentPlan: Plan,
  currentTeamSize: number,
  newPlan: Plan,
  newTeamSize: number,
  billingCycle: 'monthly' | 'yearly'
): {
  currentPrice: number
  newPrice: number
  difference: number
  percentageChange: number
  isIncrease: boolean
} {
  const currentPrice = calculateCurrentPrice(currentPlan, currentTeamSize, billingCycle)
  const newPrice = calculateCurrentPrice(newPlan, newTeamSize, billingCycle)
  const difference = newPrice - currentPrice
  const percentageChange = currentPrice > 0 ? (difference / currentPrice) * 100 : 0
  
  return {
    currentPrice,
    newPrice,
    difference,
    percentageChange,
    isIncrease: difference > 0
  }
}

/**
 * Get the pricing bracket for a given team size
 */
export function getPricingBracket(
  plan: Plan,
  teamSize: number
): PricingBracket | null {
  if (plan.account_type !== 'team' || !plan.team_pricing_brackets) {
    return null
  }

  return plan.team_pricing_brackets.find(
    b => teamSize >= b.min_users && (b.max_users === -1 || teamSize <= b.max_users)
  ) || null
}

/**
 * Calculate prorated amount when changing team size mid-period
 */
export function calculateProratedAmount(
  oldPrice: number,
  newPrice: number,
  daysRemainingInPeriod: number,
  totalDaysInPeriod: number
): {
  credit: number
  newCharge: number
  proratedAmount: number
} {
  // Calculate daily rates
  const oldDailyRate = oldPrice / totalDaysInPeriod
  const newDailyRate = newPrice / totalDaysInPeriod
  
  // Calculate credit for unused portion of old price
  const credit = oldDailyRate * daysRemainingInPeriod
  
  // Calculate charge for new price for remaining period
  const newCharge = newDailyRate * daysRemainingInPeriod
  
  // Net prorated amount (what customer pays now)
  const proratedAmount = newCharge - credit
  
  return {
    credit,
    newCharge,
    proratedAmount
  }
}

/**
 * Get suggested team size based on actual users
 * Ensures team size doesn't exceed purchased seats
 */
export function getSuggestedTeamSize(
  activeUsers: number,
  purchasedSeats: number,
  planMaxUsers: number
): {
  suggested: number
  needsUpgrade: boolean
  availableSeats: number
} {
  // Can't exceed plan maximum
  const maxAllowed = planMaxUsers === -1 ? purchasedSeats : Math.min(planMaxUsers, purchasedSeats)
  
  // Need more seats if active users exceed purchased
  const needsUpgrade = activeUsers > purchasedSeats
  
  // Suggested size is current active users, but not exceeding max
  const suggested = Math.min(activeUsers, maxAllowed)
  
  // Available seats = purchased - active (can't be negative)
  const availableSeats = Math.max(0, purchasedSeats - activeUsers)
  
  return {
    suggested,
    needsUpgrade,
    availableSeats
  }
}

/**
 * Validate if a team size change is allowed
 */
export function validateTeamSizeChange(
  currentSize: number,
  newSize: number,
  planMaxUsers: number,
  activeUsers: number
): {
  valid: boolean
  error?: string
  warning?: string
} {
  // Can't reduce below active users
  if (newSize < activeUsers) {
    return {
      valid: false,
      error: `Cannot reduce team size below ${activeUsers} active users. Remove users first.`
    }
  }

  // Can't exceed plan maximum
  if (planMaxUsers !== -1 && newSize > planMaxUsers) {
    return {
      valid: false,
      error: `Team size cannot exceed ${planMaxUsers} for this plan. Upgrade to a higher tier.`
    }
  }

  // Warn if purchasing many unused seats
  const unusedSeats = newSize - activeUsers
  if (unusedSeats > 5) {
    return {
      valid: true,
      warning: `You're purchasing ${unusedSeats} unused seats. Consider adjusting to ${activeUsers} to save costs.`
    }
  }

  return { valid: true }
}

/**
 * Calculate annual savings compared to monthly
 */
export function calculateAnnualSavings(
  plan: Plan,
  teamSize: number
): {
  monthlyTotal: number
  yearlyTotal: number
  savings: number
  savingsPercentage: number
} {
  const monthlyPrice = calculateCurrentPrice(plan, teamSize, 'monthly')
  const yearlyPrice = calculateCurrentPrice(plan, teamSize, 'yearly')
  
  const monthlyTotal = monthlyPrice * 12
  const yearlyTotal = yearlyPrice
  const savings = monthlyTotal - yearlyTotal
  const savingsPercentage = monthlyTotal > 0 ? (savings / monthlyTotal) * 100 : 0
  
  return {
    monthlyTotal,
    yearlyTotal,
    savings,
    savingsPercentage
  }
}

/**
 * Check if downgrade from team to solo is possible
 */
export function canDowngradeToSolo(
  currentTeamSize: number,
  isCompanyAdmin: boolean
): {
  canDowngrade: boolean
  reason?: string
  warning?: string
  membersToRemove: number
} {
  if (!isCompanyAdmin) {
    return {
      canDowngrade: false,
      reason: 'Only company administrators can downgrade to solo plan',
      membersToRemove: 0
    }
  }

  const membersToRemove = currentTeamSize - 1 // All except admin

  return {
    canDowngrade: true,
    warning: membersToRemove > 0 
      ? `${membersToRemove} team member${membersToRemove > 1 ? 's' : ''} will be removed and lose access`
      : undefined,
    membersToRemove
  }
}
