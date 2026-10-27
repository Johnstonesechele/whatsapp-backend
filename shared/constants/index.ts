// Shared constants
export const CONTACT_STATUSES = ["Active", "Inactive", "Pending"] as const
export const LEAD_STATUSES = ["Hot", "Warm", "Cold"] as const
export const LEAD_STAGES = ["Qualification", "Proposal", "Negotiation", "Closed Won", "Closed Lost"] as const
export const LEAD_SOURCES = ["Website", "Referral", "LinkedIn", "Email", "Phone", "Event"] as const

export const WHATSAPP_MESSAGE_STATUSES = ["Pending", "Sent", "Delivered", "Read", "Failed"] as const
export const CAMPAIGN_STATUSES = ["Draft", "Scheduled", "Sending", "Sent", "Completed"] as const

export const USER_ROLES = ["Admin", "Manager", "Agent"] as const

export const COLORS = {
  primary: {
    blue: "#1e40af",
    darkBlue: "#1e3a8a",
    gold: "#d97706",
    darkGold: "#b45309",
  },
  status: {
    success: "#10b981",
    warning: "#f59e0b",
    error: "#ef4444",
    info: "#3b82f6",
  },
} as const

export const API_ENDPOINTS = {
  contacts: "/api/contacts",
  leads: "/api/leads",
  whatsapp: "/api/whatsapp",
  campaigns: "/api/campaigns",
  analytics: "/api/analytics",
} as const
