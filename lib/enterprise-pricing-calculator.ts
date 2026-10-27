/**
 * Enterprise & Custom Pricing Calculator
 * Calculates custom pricing based on service requirements beyond standard plans
 * Supports volume-based pricing, add-ons, and promotional discounts
 */

import { getSupabaseAdminClient } from '@/backend/database/supabase-config'

// Base pricing for enterprise add-ons (per unit/month)
export const ENTERPRISE_ADDON_PRICING = {
  // User seats (beyond standard limits)
  additional_users: {
    base_price: 15, // $15 per user for 1-50 additional users
    tiers: [
      { min: 1, max: 50, price: 15 },
      { min: 51, max: 100, price: 12 },
      { min: 101, max: 500, price: 10 },
      { min: 501, max: -1, price: 8 } // 501+ users
    ]
  },
  
  // Contacts storage
  additional_contacts: {
    base_price: 0.05, // $0.05 per contact
    tiers: [
      { min: 1, max: 10000, price: 0.05 },
      { min: 10001, max: 50000, price: 0.04 },
      { min: 50001, max: 100000, price: 0.03 },
      { min: 100001, max: -1, price: 0.02 }
    ]
  },
  
  // Leads management
  additional_leads: {
    base_price: 0.10, // $0.10 per lead
    tiers: [
      { min: 1, max: 5000, price: 0.10 },
      { min: 5001, max: 20000, price: 0.08 },
      { min: 20001, max: 50000, price: 0.06 },
      { min: 50001, max: -1, price: 0.05 }
    ]
  },
  
  // Deals pipeline
  additional_deals: {
    base_price: 0.50, // $0.50 per deal
    tiers: [
      { min: 1, max: 1000, price: 0.50 },
      { min: 1001, max: 5000, price: 0.40 },
      { min: 5001, max: 10000, price: 0.30 },
      { min: 10001, max: -1, price: 0.25 }
    ]
  },
  
  // WhatsApp messaging
  additional_whatsapp_messages: {
    base_price: 0.02, // $0.02 per message
    tiers: [
      { min: 1, max: 10000, price: 0.02 },
      { min: 10001, max: 50000, price: 0.015 },
      { min: 50001, max: 100000, price: 0.012 },
      { min: 100001, max: -1, price: 0.01 }
    ]
  },
  
  // Email campaigns
  additional_email_campaigns: {
    base_price: 5, // $5 per campaign
    tiers: [
      { min: 1, max: 50, price: 5 },
      { min: 51, max: 200, price: 4 },
      { min: 201, max: 500, price: 3 },
      { min: 501, max: -1, price: 2 }
    ]
  },
  
  // Surveys
  additional_surveys: {
    base_price: 3, // $3 per survey
    tiers: [
      { min: 1, max: 50, price: 3 },
      { min: 51, max: 200, price: 2.5 },
      { min: 201, max: 500, price: 2 },
      { min: 501, max: -1, price: 1.5 }
    ]
  },
  
  // Storage (per GB)
  additional_storage_gb: {
    base_price: 2, // $2 per GB
    tiers: [
      { min: 1, max: 100, price: 2 },
      { min: 101, max: 500, price: 1.5 },
      { min: 501, max: 1000, price: 1.2 },
      { min: 1001, max: -1, price: 1 }
    ]
  },
  
  // API calls (per 1000 calls)
  additional_api_calls: {
    base_price: 0.10, // $0.10 per 1000 calls
    tiers: [
      { min: 1, max: 100000, price: 0.10 },
      { min: 100001, max: 500000, price: 0.08 },
      { min: 500001, max: 1000000, price: 0.06 },
      { min: 1000001, max: -1, price: 0.05 }
    ]
  }
}

// Premium feature add-ons (flat monthly fee)
export const PREMIUM_FEATURES: Record<string, { price: number; name: string; oneTime?: boolean }> = {
  dedicated_account_manager: { price: 500, name: 'Dedicated Account Manager' },
  priority_support: { price: 200, name: '24/7 Priority Support' },
  custom_integrations: { price: 300, name: 'Custom Integration Development' },
  advanced_analytics: { price: 150, name: 'Advanced Analytics & Reporting' },
  white_label: { price: 400, name: 'White Label Branding' },
  sla_guarantee: { price: 250, name: 'SLA Guarantee (99.9% uptime)' },
  data_migration: { price: 1000, name: 'One-time Data Migration Service', oneTime: true },
  custom_training: { price: 800, name: 'Custom Team Training Program', oneTime: true },
  audit_logs: { price: 100, name: 'Advanced Audit Logs & Compliance' },
  sso_integration: { price: 300, name: 'SSO Integration (SAML/OAuth)' }
}

// Discount tiers based on contract length
export const CONTRACT_DISCOUNTS = {
  monthly: { discount: 0, label: 'Monthly (No discount)' },
  quarterly: { discount: 0.05, label: 'Quarterly (5% off)' },
  semi_annual: { discount: 0.10, label: 'Semi-Annual (10% off)' },
  annual: { discount: 0.15, label: 'Annual (15% off)' },
  biennial: { discount: 0.20, label: '2-Year (20% off)' },
  triennial: { discount: 0.25, label: '3-Year (25% off)' }
}

// Seasonal/promotional discounts
export const PROMOTIONAL_DISCOUNTS = {
  new_customer: { discount: 0.20, label: 'New Customer (20% off first 3 months)', duration_months: 3 },
  referral: { discount: 0.15, label: 'Referral Discount (15% off)', duration_months: 6 },
  black_friday: { discount: 0.30, label: 'Black Friday Special (30% off)', duration_months: 1 },
  end_of_year: { discount: 0.25, label: 'End of Year Sale (25% off)', duration_months: 1 }
}

export interface EnterpriseRequirements {
  // Resource requirements (beyond base plan limits)
  additional_users?: number
  additional_contacts?: number
  additional_leads?: number
  additional_deals?: number
  additional_whatsapp_messages?: number
  additional_email_campaigns?: number
  additional_surveys?: number
  additional_storage_gb?: number
  additional_api_calls?: number // per 1000
  
  // Premium features
  premium_features?: string[] // Keys from PREMIUM_FEATURES
  
  // Discounts
  contract_period?: keyof typeof CONTRACT_DISCOUNTS
  promotional_code?: keyof typeof PROMOTIONAL_DISCOUNTS
  
  // Base plan (starting point)
  base_plan_price?: number // Usually Team Professional price
}

export interface EnterprisePricingBreakdown {
  base_plan_price: number
  add_ons: {
    name: string
    quantity: number
    unit_price: number
    total: number
  }[]
  premium_features: {
    name: string
    price: number
    is_one_time: boolean
  }[]
  subtotal: number
  contract_discount: {
    type: string
    percentage: number
    amount: number
  } | null
  promotional_discount: {
    type: string
    percentage: number
    amount: number
    duration_months: number
  } | null
  total_monthly: number
  total_first_month: number // Including one-time fees
  estimated_annual: number
  savings_vs_monthly: number
}

/**
 * Calculate tiered pricing for a resource
 */
function calculateTieredPrice(quantity: number, tiers: any[]): { unit_price: number, total: number } {
  if (quantity <= 0) return { unit_price: 0, total: 0 }
  
  // Find matching tier
  const tier = tiers.find(t => quantity >= t.min && (t.max === -1 || quantity <= t.max))
  const unit_price = tier ? tier.price : tiers[0].price
  
  return {
    unit_price,
    total: quantity * unit_price
  }
}

/**
 * Calculate enterprise/custom pricing based on requirements
 */
export function calculateEnterprisePricing(requirements: EnterpriseRequirements): EnterprisePricingBreakdown {
  const base_plan_price = requirements.base_plan_price || 45 // Default to Team Professional base
  
  // Calculate add-ons
  const add_ons: any[] = []
  
  if (requirements.additional_users && requirements.additional_users > 0) {
    const pricing = calculateTieredPrice(
      requirements.additional_users,
      ENTERPRISE_ADDON_PRICING.additional_users.tiers
    )
    add_ons.push({
      name: 'Additional User Seats',
      quantity: requirements.additional_users,
      unit_price: pricing.unit_price,
      total: pricing.total
    })
  }
  
  if (requirements.additional_contacts && requirements.additional_contacts > 0) {
    const pricing = calculateTieredPrice(
      requirements.additional_contacts,
      ENTERPRISE_ADDON_PRICING.additional_contacts.tiers
    )
    add_ons.push({
      name: 'Additional Contacts',
      quantity: requirements.additional_contacts,
      unit_price: pricing.unit_price,
      total: pricing.total
    })
  }
  
  if (requirements.additional_leads && requirements.additional_leads > 0) {
    const pricing = calculateTieredPrice(
      requirements.additional_leads,
      ENTERPRISE_ADDON_PRICING.additional_leads.tiers
    )
    add_ons.push({
      name: 'Additional Leads',
      quantity: requirements.additional_leads,
      unit_price: pricing.unit_price,
      total: pricing.total
    })
  }
  
  if (requirements.additional_deals && requirements.additional_deals > 0) {
    const pricing = calculateTieredPrice(
      requirements.additional_deals,
      ENTERPRISE_ADDON_PRICING.additional_deals.tiers
    )
    add_ons.push({
      name: 'Additional Deals',
      quantity: requirements.additional_deals,
      unit_price: pricing.unit_price,
      total: pricing.total
    })
  }
  
  if (requirements.additional_whatsapp_messages && requirements.additional_whatsapp_messages > 0) {
    const pricing = calculateTieredPrice(
      requirements.additional_whatsapp_messages,
      ENTERPRISE_ADDON_PRICING.additional_whatsapp_messages.tiers
    )
    add_ons.push({
      name: 'Additional WhatsApp Messages',
      quantity: requirements.additional_whatsapp_messages,
      unit_price: pricing.unit_price,
      total: pricing.total
    })
  }
  
  if (requirements.additional_email_campaigns && requirements.additional_email_campaigns > 0) {
    const pricing = calculateTieredPrice(
      requirements.additional_email_campaigns,
      ENTERPRISE_ADDON_PRICING.additional_email_campaigns.tiers
    )
    add_ons.push({
      name: 'Additional Email Campaigns',
      quantity: requirements.additional_email_campaigns,
      unit_price: pricing.unit_price,
      total: pricing.total
    })
  }
  
  if (requirements.additional_surveys && requirements.additional_surveys > 0) {
    const pricing = calculateTieredPrice(
      requirements.additional_surveys,
      ENTERPRISE_ADDON_PRICING.additional_surveys.tiers
    )
    add_ons.push({
      name: 'Additional Surveys',
      quantity: requirements.additional_surveys,
      unit_price: pricing.unit_price,
      total: pricing.total
    })
  }
  
  if (requirements.additional_storage_gb && requirements.additional_storage_gb > 0) {
    const pricing = calculateTieredPrice(
      requirements.additional_storage_gb,
      ENTERPRISE_ADDON_PRICING.additional_storage_gb.tiers
    )
    add_ons.push({
      name: 'Additional Storage',
      quantity: requirements.additional_storage_gb,
      unit_price: pricing.unit_price,
      total: pricing.total
    })
  }
  
  if (requirements.additional_api_calls && requirements.additional_api_calls > 0) {
    const pricing = calculateTieredPrice(
      requirements.additional_api_calls,
      ENTERPRISE_ADDON_PRICING.additional_api_calls.tiers
    )
    add_ons.push({
      name: 'Additional API Calls (per 1000)',
      quantity: requirements.additional_api_calls,
      unit_price: pricing.unit_price,
      total: pricing.total
    })
  }
  
  // Calculate premium features
  const premium_features: any[] = []
  let one_time_fees = 0
  
  if (requirements.premium_features && requirements.premium_features.length > 0) {
    requirements.premium_features.forEach(feature_key => {
      const feature = PREMIUM_FEATURES[feature_key as keyof typeof PREMIUM_FEATURES]
      if (feature) {
        premium_features.push({
          name: feature.name,
          price: feature.price,
          is_one_time: feature.oneTime || false
        })
        
        if (feature.oneTime) {
          one_time_fees += feature.price
        }
      }
    })
  }
  
  // Calculate subtotal
  const add_ons_total = add_ons.reduce((sum, addon) => sum + addon.total, 0)
  const recurring_premium_total = premium_features
    .filter(f => !f.is_one_time)
    .reduce((sum, f) => sum + f.price, 0)
  
  const subtotal = base_plan_price + add_ons_total + recurring_premium_total
  
  // Apply contract discount
  let contract_discount = null
  let discounted_amount = subtotal
  
  if (requirements.contract_period) {
    const discount_info = CONTRACT_DISCOUNTS[requirements.contract_period]
    if (discount_info && discount_info.discount > 0) {
      const discount_amount = subtotal * discount_info.discount
      contract_discount = {
        type: discount_info.label,
        percentage: discount_info.discount * 100,
        amount: discount_amount
      }
      discounted_amount = subtotal - discount_amount
    }
  }
  
  // Apply promotional discount
  let promotional_discount = null
  let final_monthly = discounted_amount
  
  if (requirements.promotional_code) {
    const promo_info = PROMOTIONAL_DISCOUNTS[requirements.promotional_code]
    if (promo_info) {
      const promo_amount = discounted_amount * promo_info.discount
      promotional_discount = {
        type: promo_info.label,
        percentage: promo_info.discount * 100,
        amount: promo_amount,
        duration_months: promo_info.duration_months
      }
      final_monthly = discounted_amount - promo_amount
    }
  }
  
  // Calculate annual estimate
  const monthly_base = contract_discount ? discounted_amount : final_monthly
  const estimated_annual = monthly_base * 12
  
  // Calculate savings
  const monthly_price_no_discount = subtotal
  const savings_vs_monthly = (monthly_price_no_discount * 12) - estimated_annual
  
  return {
    base_plan_price,
    add_ons,
    premium_features,
    subtotal,
    contract_discount,
    promotional_discount,
    total_monthly: final_monthly,
    total_first_month: final_monthly + one_time_fees,
    estimated_annual,
    savings_vs_monthly
  }
}

/**
 * Format pricing breakdown for display
 */
export function formatEnterprisePricingBreakdown(breakdown: EnterprisePricingBreakdown): string {
  let output = '=== ENTERPRISE PRICING BREAKDOWN ===\n\n'
  
  output += `Base Plan: $${breakdown.base_plan_price.toFixed(2)}/month\n\n`
  
  if (breakdown.add_ons.length > 0) {
    output += 'Add-ons:\n'
    breakdown.add_ons.forEach(addon => {
      output += `  • ${addon.name}: ${addon.quantity} × $${addon.unit_price.toFixed(2)} = $${addon.total.toFixed(2)}\n`
    })
    output += '\n'
  }
  
  if (breakdown.premium_features.length > 0) {
    output += 'Premium Features:\n'
    breakdown.premium_features.forEach(feature => {
      const type = feature.is_one_time ? '(one-time)' : '/month'
      output += `  • ${feature.name}: $${feature.price.toFixed(2)} ${type}\n`
    })
    output += '\n'
  }
  
  output += `Subtotal: $${breakdown.subtotal.toFixed(2)}/month\n`
  
  if (breakdown.contract_discount) {
    output += `${breakdown.contract_discount.type}: -$${breakdown.contract_discount.amount.toFixed(2)}\n`
  }
  
  if (breakdown.promotional_discount) {
    output += `${breakdown.promotional_discount.type}: -$${breakdown.promotional_discount.amount.toFixed(2)} (for ${breakdown.promotional_discount.duration_months} months)\n`
  }
  
  output += `\nMonthly Total: $${breakdown.total_monthly.toFixed(2)}\n`
  
  if (breakdown.total_first_month !== breakdown.total_monthly) {
    output += `First Month (with one-time fees): $${breakdown.total_first_month.toFixed(2)}\n`
  }
  
  output += `Estimated Annual Cost: $${breakdown.estimated_annual.toFixed(2)}\n`
  
  if (breakdown.savings_vs_monthly > 0) {
    output += `Annual Savings: $${breakdown.savings_vs_monthly.toFixed(2)}\n`
  }
  
  return output
}

/**
 * Save custom quote to database
 */
export async function saveEnterpriseQuote(
  companyId: string,
  requirements: EnterpriseRequirements,
  breakdown: EnterprisePricingBreakdown,
  createdBy: string
) {
  const supabase = getSupabaseAdminClient()
  
  const quoteId = crypto.randomUUID()
  const now = new Date().toISOString()
  
  const { error } = await supabase
    .from('enterprise_quotes')
    .insert({
      id: quoteId,
      company_id: companyId,
      requirements: JSON.stringify(requirements),
      pricing_breakdown: JSON.stringify(breakdown),
      total_monthly: breakdown.total_monthly,
      total_annual: breakdown.estimated_annual,
      status: 'pending',
      valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // Valid for 30 days
      created_by: createdBy,
      created_at: now,
      updated_at: now
    })
  
  if (error) {
    console.error('Error saving enterprise quote:', error)
    throw new Error('Failed to save quote')
  }
  
  return quoteId
}
