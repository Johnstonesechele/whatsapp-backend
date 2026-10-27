/**
 * Plan Features Display Utilities
 * Centralizes all plan feature and limit display logic for consistency across
 * pricing, upgrade, and subscription pages
 */

export interface PlanLimits {
  max_contacts: number
  max_users: number
  max_leads: number
  max_deals: number
  max_whatsapp_messages: number
  max_email_campaigns: number
  max_surveys: number
  storage_gb: number
  max_api_calls: number
}

export interface PlanCapabilities {
  has_whatsapp_integration: boolean
  has_email_integration: boolean
  has_advanced_analytics: boolean
  has_automation: boolean
  has_ai_features: boolean
  has_team_collaboration: boolean
  has_role_management: boolean
  has_api_access: boolean
  has_custom_integrations: boolean
  has_white_label: boolean
  has_priority_support: boolean
  has_dedicated_manager: boolean
  // Enterprise features
  has_sso_saml: boolean
  has_sso_oidc: boolean
  has_scim_provisioning: boolean
  has_custom_roles: boolean
  has_advanced_audit_logs: boolean
  has_api_key_management: boolean
  has_organizational_hierarchy: boolean
  has_data_compliance: boolean
  has_branding: boolean
  has_audit_log_export: boolean
  has_compliance_reports: boolean
  has_consent_management: boolean
  has_data_retention: boolean
}

export interface PlanFeature {
  label: string
  value: string | number
  icon?: string
  available: boolean
  isLimit?: boolean
}

/**
 * Format a number for display (Unlimited, 1K, 1M, etc.)
 */
export function formatNumber(num: number): string {
  if (num === -1) return "Unlimited"
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`.replace('.0', '')
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`.replace('.0', '')
  return num.toString()
}

/**
 * Get all monthly/period limits for a plan
 */
export function getPlanLimits(plan: any): PlanFeature[] {
  return [
    {
      label: 'Contacts',
      value: formatNumber(plan.max_contacts || 0),
      icon: '',
      available: true,
      isLimit: true
    },
    {
      label: 'Users',
      value: formatNumber(plan.max_users || 1),
      icon: '',
      available: true,
      isLimit: true
    },
    {
      label: 'Leads',
      value: formatNumber(plan.max_leads || 0),
      icon: '',
      available: true,
      isLimit: true
    },
    {
      label: 'Deals',
      value: formatNumber(plan.max_deals || 0),
      icon: '',
      available: true,
      isLimit: true
    },
    {
      label: 'WhatsApp Messages/month',
      value: formatNumber(plan.max_whatsapp_messages || 0),
      icon: '',
      available: plan.has_whatsapp_integration,
      isLimit: true
    },
    {
      label: 'Email Campaigns/month',
      value: formatNumber(plan.max_email_campaigns || 0),
      icon: '',
      available: plan.has_email_integration,
      isLimit: true
    },
    {
      label: 'Surveys/month',
      value: formatNumber(plan.max_surveys || 0),
      icon: '',
      available: true,
      isLimit: true
    },
    {
      label: 'Storage',
      value: `${plan.storage_gb || 0}GB`,
      icon: '',
      available: true,
      isLimit: true
    },
    {
      label: 'API Calls/month',
      value: formatNumber(plan.max_api_calls || 0),
      icon: '',
      available: plan.has_api_access,
      isLimit: true
    }
  ].filter(feature => feature.available)
}

/**
 * Get all feature capabilities for a plan
 */
export function getPlanCapabilities(plan: any): PlanFeature[] {
  const features: PlanFeature[] = []

  if (plan.has_whatsapp_integration) {
    features.push({
      label: 'WhatsApp Integration',
      value: 'Available',
      icon: '',
      available: true
    })
  }

  if (plan.has_email_integration) {
    features.push({
      label: 'Email Campaigns',
      value: 'Available',
      icon: '',
      available: true
    })
  }

  if (plan.has_team_collaboration) {
    features.push({
      label: 'Team Collaboration',
      value: 'Available',
      icon: '',
      available: true
    })
  }

  if (plan.has_role_management) {
    features.push({
      label: 'Role Management',
      value: 'Available',
      icon: '',
      available: true
    })
  }

  if (plan.has_advanced_analytics) {
    features.push({
      label: 'Advanced Analytics',
      value: 'Available',
      icon: '',
      available: true
    })
  }

  if (plan.has_automation) {
    features.push({
      label: 'Automation',
      value: 'Available',
      icon: '',
      available: true
    })
  }

  if (plan.has_ai_features) {
    features.push({
      label: 'AI-Powered Features',
      value: 'Available',
      icon: '',
      available: true
    })
  }

  if (plan.has_api_access) {
    features.push({
      label: 'API Access',
      value: 'Available',
      icon: '',
      available: true
    })
  }

  if (plan.has_custom_integrations) {
    features.push({
      label: 'Custom Integrations',
      value: 'Available',
      icon: '',
      available: true
    })
  }

  if (plan.has_white_label) {
    features.push({
      label: 'White Label',
      value: 'Available',
      icon: '',
      available: true
    })
  }

  if (plan.has_priority_support) {
    features.push({
      label: 'Priority Support',
      value: 'Available',
      icon: '',
      available: true
    })
  }

  if (plan.has_dedicated_manager) {
    features.push({
      label: 'Dedicated Account Manager',
      value: 'Available',
      icon: '',
      available: true
    })
  }

  // Enterprise-only features
  if (plan.has_sso_saml || plan.has_sso_oidc) {
    features.push({
      label: 'SSO / SAML / OIDC',
      value: 'Available',
      icon: '',
      available: true
    })
  }

  if (plan.has_scim_provisioning) {
    features.push({
      label: 'SCIM User Provisioning',
      value: 'Available',
      icon: '',
      available: true
    })
  }

  if (plan.has_custom_roles) {
    features.push({
      label: 'Custom Roles & Permissions',
      value: 'Available',
      icon: '',
      available: true
    })
  }

  if (plan.has_advanced_audit_logs) {
    features.push({
      label: 'Advanced Audit Logging',
      value: 'Available',
      icon: '',
      available: true
    })
  }

  if (plan.has_api_key_management) {
    features.push({
      label: 'API Key Management',
      value: 'Available',
      icon: '',
      available: true
    })
  }

  if (plan.has_organizational_hierarchy) {
    features.push({
      label: 'Organizational Hierarchy',
      value: 'Available',
      icon: '',
      available: true
    })
  }

  if (plan.has_data_compliance) {
    features.push({
      label: 'Data Export & Compliance (GDPR/SOC2)',
      value: 'Available',
      icon: '',
      available: true
    })
  }

  if (plan.has_branding) {
    features.push({
      label: 'White-label Branding',
      value: 'Available',
      icon: '',
      available: true
    })
  }

  return features
}

/**
 * Get all features combined (limits + capabilities)
 */
export function getAllPlanFeatures(plan: any): {
  limits: PlanFeature[]
  capabilities: PlanFeature[]
} {
  return {
    limits: getPlanLimits(plan),
    capabilities: getPlanCapabilities(plan)
  }
}

/**
 * Get feature comparison between two plans
 */
export function comparePlans(oldPlan: any, newPlan: any): {
  improved: PlanFeature[]
  unchanged: PlanFeature[]
  downgraded: PlanFeature[]
} {
  const improved: PlanFeature[] = []
  const unchanged: PlanFeature[] = []
  const downgraded: PlanFeature[] = []

  const limitFields: Array<keyof PlanLimits> = [
    'max_contacts',
    'max_users',
    'max_leads',
    'max_deals',
    'max_whatsapp_messages',
    'max_email_campaigns',
    'max_surveys',
    'storage_gb',
    'max_api_calls'
  ]

  limitFields.forEach(field => {
    const oldValue = oldPlan[field] || 0
    const newValue = newPlan[field] || 0

    if (newValue > oldValue || (newValue === -1 && oldValue !== -1)) {
      improved.push({
        label: field.replace('max_', '').replace(/_/g, ' '),
        value: formatNumber(newValue),
        available: true,
        isLimit: true
      })
    } else if (newValue < oldValue || (oldValue === -1 && newValue !== -1)) {
      downgraded.push({
        label: field.replace('max_', '').replace(/_/g, ' '),
        value: formatNumber(newValue),
        available: true,
        isLimit: true
      })
    } else {
      unchanged.push({
        label: field.replace('max_', '').replace(/_/g, ' '),
        value: formatNumber(newValue),
        available: true,
        isLimit: true
      })
    }
  })

  return { improved, unchanged, downgraded }
}

/**
 * Get usage percentage for display
 */
export function getUsagePercentage(current: number, max: number): number {
  if (max === -1) return 0 // Unlimited
  if (max === 0) return 100 // No limit means fully used
  return Math.min((current / max) * 100, 100)
}

/**
 * Get usage status color
 */
export function getUsageColor(percentage: number): string {
  if (percentage >= 90) return 'text-red-500'
  if (percentage >= 75) return 'text-[#0D5C3A]'
  if (percentage >= 50) return 'text-[#0D5C3A]'
  return 'text-green-500'
}

/**
 * Format usage display
 */
export function formatUsage(current: number, max: number): string {
  if (max === -1) return `${formatNumber(current)} (Unlimited)`
  return `${formatNumber(current)} / ${formatNumber(max)}`
}
