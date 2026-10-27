/**
 * Shared Zod validation schemas and helpers for API routes.
 * Centralizes input validation to prevent injection, data corruption, and abuse.
 */
import { z } from 'zod'
import { NextResponse } from 'next/server'

// ── Common Schemas ──────────────────────────────────────────────────────────

export const emailSchema = z.string().email('Invalid email format').max(255)
export const nameSchema = z.string().min(1, 'Name is required').max(200).trim()
export const phoneSchema = z.string().max(50).optional()
export const idSchema = z.string().min(1, 'ID is required').max(100)
export const searchTermSchema = z.string().max(200).optional()
export const pageSchema = z.coerce.number().int().min(1).default(1)
export const limitSchema = z.coerce.number().int().min(1).max(100).default(50)

// ── Contact Schemas ─────────────────────────────────────────────────────────

export const createContactSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema,
  company: z.string().max(200).optional(),
  notes: z.string().max(5000).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  source: z.string().max(100).optional(),
  assigned_to: idSchema.optional(),
})

export const updateContactSchema = z.object({
  id: idSchema,
  name: nameSchema.optional(),
  email: emailSchema.optional(),
  phone: phoneSchema,
  company: z.string().max(200).optional(),
  notes: z.string().max(5000).optional(),
  status: z.enum(['Active', 'Inactive', 'Lead', 'Customer']).optional(),
})

// ── Lead Schemas ────────────────────────────────────────────────────────────

export const createLeadSchema = z.object({
  name: nameSchema,
  email: emailSchema.optional(),
  phone: phoneSchema,
  company: z.string().max(200).optional(),
  source: z.string().max(100).optional(),
  value: z.number().min(0).max(100000000).optional(),
  stage: z.enum(['new', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost']).optional(),
})

export const updateLeadSchema = z.object({
  id: idSchema,
  name: nameSchema.optional(),
  email: emailSchema.optional(),
  phone: phoneSchema,
  company: z.string().max(200).optional(),
  value: z.number().min(0).max(100000000).optional(),
  stage: z.enum(['new', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost']).optional(),
})

// ── Deal Schemas ────────────────────────────────────────────────────────────

export const createDealSchema = z.object({
  title: z.string().min(1, 'Title is required').max(300).trim(),
  description: z.string().max(5000).optional(),
  value: z.number().min(0).max(100000000).optional(),
  stage: z.enum(['new', 'qualification', 'proposal', 'negotiation', 'closed_won', 'closed_lost']).optional(),
  probability: z.number().min(0).max(100).optional(),
  contact_id: idSchema.optional(),
  service_id: idSchema.optional(),
})

// ── Campaign Schemas ────────────────────────────────────────────────────────

export const createCampaignSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200).trim().optional().default('Untitled Campaign'),
  type: z.enum(['WhatsApp', 'Email', 'SMS', 'Survey', 'email', 'sms', 'whatsapp']).optional().default('WhatsApp'),
  message: z.string().max(10000).optional(),
  // The campaigns table has a subject column (04_communications.sql) and the
  // new-campaign form collects one, but this schema never declared it. Zod
  // strips undeclared keys, so every campaign was created with subject NULL
  // regardless of what the client sent - an email campaign with no subject.
  subject: z.string().max(500).optional().nullable(),
  category: z.string().max(100).optional().default('General'),
  budget: z.union([z.number(), z.string()]).optional().transform((val) => {
    if (typeof val === 'string') {
      const parsed = parseFloat(val)
      return isNaN(parsed) ? 0 : parsed
    }
    return val || 0
  }),
  scheduledAt: z.string().optional(),
  status: z.enum(['Draft', 'draft', 'Scheduled', 'scheduled', 'Active', 'active', 'Paused', 'paused', 'draft']).optional().default('Draft'),
  recipients: z.number().optional().default(0),
  email_template_id: z.string().nullable().optional(),
})

// ── Auth Schemas ────────────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(200),
})

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'Password must be at least 8 characters').max(128),
})

// ── Settings Schemas ────────────────────────────────────────────────────────

export const companySettingsSchema = z.object({
  name: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  website: z.string().url().max(500).optional().or(z.literal('')),
  phone: z.string().max(50).optional(),
  email: emailSchema.optional(),
  address: z.string().max(500).optional(),
  industry: z.string().max(100).optional(),
})

// ── Validation Helper ───────────────────────────────────────────────────────

export function validateBody<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown
): { success: true; data: z.infer<T> } | { success: false; error: NextResponse } {
  const result = schema.safeParse(data)
  if (!result.success) {
    const firstError = result.error.errors[0]
    return {
      success: false,
      error: NextResponse.json(
        { error: firstError.message },
        { status: 400 }
      ),
    }
  }
  return { success: true, data: result.data }
}

/**
 * Validate query parameters from a URL.
 */
export function validateQuery<T extends z.ZodTypeAny>(
  schema: T,
  searchParams: URLSearchParams
): { success: true; data: z.infer<T> } | { success: false; error: NextResponse } {
  const data: Record<string, unknown> = {}
  searchParams.forEach((value, key) => {
    data[key] = value
  })
  return validateBody(schema, data)
}
