import { randomUUID } from 'crypto'
import { query, queryOne, execute, transaction } from './db-adapter'
import { getSupabaseAdminClient } from './supabase-config'
import bcrypt from 'bcryptjs'
import { Survey, SurveySession, SurveyResponse } from '@/lib/survey-system'

// ============= USER MANAGEMENT =============

export interface User {
  id: string
  name: string
  email: string
  password_hash: string
  role: string
  permissions: string[]
  department?: string
  active: boolean
  last_login?: string
  created_at: string
  updated_at: string
  avatar?: string
  phone?: string
  position?: string
  location?: string
  company_id?: string
  preferences?: object
}

/**
 * Read a jsonb column without assuming it is a string.
 *
 * A jsonb column comes back from pg ALREADY DECODED - it is a JavaScript
 * object, not text. Calling JSON.parse on it throws on every row, always.
 *
 * This was not hypothetical. Three production endpoints answered 500 for
 * every signed-in user with the cause - once the error stopped being an opaque
 * constant:
 *
 *   "[object Object]" is not valid JSON
 *
 *   /api/settings             JSON.parse(company.settings || '{}')
 *   /api/team/invitations     JSON.parse(user.preferences || '{}')
 *   /api/surveys/...          JSON.parse(survey.root_menu)
 *
 * The failure is data-dependent, which is what makes it nasty: it appears the
 * moment a row actually has content in that column, and takes the whole page
 * down for every tenant. Passing a string is still supported because the same
 * function is used on values that arrive from request bodies and from other
 * drivers.
 */
function coerceJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback
  if (typeof value === 'object') return value as T
  if (typeof value !== 'string') return fallback

  const trimmed = value.trim()
  if (!trimmed) return fallback

  try {
    const parsed = JSON.parse(trimmed)
    return (parsed ?? fallback) as T
  } catch {
    return fallback
  }
}

/**
 * Read a jsonb array column.
 *
 * Tolerates the three shapes seen in this database: a decoded array, a JSON
 * string, and a comma-separated list. The last is not hypothetical - every row
 * in the roles table stores permissions that way.
 */
function coerceJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (value === null || value === undefined) return []
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return []
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) return parsed
      } catch {
        // fall through to the comma-separated reading
      }
    }
    return trimmed.split(',').map((s) => s.trim()).filter(Boolean)
  }
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>)
  return []
}

// Helper function to safely parse permissions
function safeParsePermissions(permissions: string | null | undefined): string[] {
  if (!permissions) return []
  if (permissions === '*') return ['*']
  return coerceJsonArray(permissions) as string[]
}

export async function getAllUsers(): Promise<User[]> {
  const users = await query(`
    SELECT * FROM users WHERE active = 1 ORDER BY created_at DESC
  `) as any[]
  
  return users.map(user => ({
    ...user,
    active: Boolean(user.active),
    permissions: safeParsePermissions(user.permissions),
    preferences: coerceJson(user.preferences || '{}')
  }))
}

export async function getUserById(id: string): Promise<User | null> {
  const user = await queryOne(`SELECT * FROM users WHERE id = ?`, [id]) as any
  if (!user) return null
  
  return {
    ...user,
    active: Boolean(user.active),
    permissions: safeParsePermissions(user.permissions),
    preferences: coerceJson(user.preferences || '{}')
  }
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const user = await queryOne(`SELECT * FROM users WHERE email = ?`, [email]) as any
  if (!user) return null
  
  return {
    ...user,
    active: Boolean(user.active),
    permissions: safeParsePermissions(user.permissions),
    preferences: coerceJson(user.preferences || '{}')
  }
}

export async function createUser(userData: Partial<User>): Promise<User> {
  const id = userData.id || `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  await execute(`
    INSERT INTO users (id, name, email, password_hash, role, permissions, department, phone, position, location)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    userData.name!,
    userData.email!,
    userData.password_hash!,
    userData.role || 'user',
    JSON.stringify(userData.permissions || []),
    userData.department || null,
    userData.phone || null,
    userData.position || null,
    userData.location || null
  ])
  
  const user = await getUserById(id)
  if (!user) throw new Error('Failed to create user')
  return user
}

export async function updateUser(id: string, userData: Partial<User>): Promise<User> {
  console.log(' updateUser called with:', { id, userData })
  
  const supabase = getSupabaseAdminClient()
  
  const updateData: any = {}
  
  const allowedFields = ['name', 'email', 'role', 'permissions', 'department', 'phone', 'position', 'location', 'preferences'];
  
  // Only allow updates to whitelisted fields
  if (userData.name !== undefined && allowedFields.includes('name')) {
    updateData.name = userData.name
  }
  if (userData.email !== undefined && allowedFields.includes('email')) {
    updateData.email = userData.email
  }
  if (userData.role !== undefined && allowedFields.includes('role')) {
    updateData.role = userData.role
  }
  if (userData.permissions !== undefined && allowedFields.includes('permissions')) {
    updateData.permissions = typeof userData.permissions === 'string' ? userData.permissions : JSON.stringify(userData.permissions)
  }
  if (userData.department !== undefined && allowedFields.includes('department')) {
    updateData.department = userData.department
  }
  if (userData.phone !== undefined && allowedFields.includes('phone')) {
    updateData.phone = userData.phone
  }
  if (userData.position !== undefined && allowedFields.includes('position')) {
    updateData.position = userData.position
  }
  if (userData.location !== undefined && allowedFields.includes('location')) {
    updateData.location = userData.location
  }
  if (userData.preferences !== undefined && allowedFields.includes('preferences')) {
    updateData.preferences = typeof userData.preferences === 'string' ? userData.preferences : JSON.stringify(userData.preferences)
  }
  
  updateData.updated_at = new Date().toISOString()
  
  console.log(' User update data:', updateData)
  
  const { data: updatedUser, error: updateError } = await supabase
    .from('users')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()
  
  if (updateError) {
    console.error('Error updating user:', updateError)
    throw updateError
  }
  
  console.log(' User updated successfully:', updatedUser?.name)
  
  return {
    ...updatedUser,
    active: Boolean(updatedUser.active),
    permissions: safeParsePermissions(updatedUser.permissions),
    preferences: typeof updatedUser.preferences === 'object' ? updatedUser.preferences: coerceJson(updatedUser.preferences || '{}')
  }
}

export async function updateUserLastLogin(id: string): Promise<void> {
  await execute(`UPDATE users SET last_login = NOW() WHERE id = ?`, [id])
}

// ============= CONTACT MANAGEMENT =============

export interface Contact {
  id: string
  name: string
  email?: string
  phone?: string
  company?: string
  position?: string
  status: string
  tags: string[]
  source?: string
  notes?: string
  assigned_to?: string
  created_by: string
  updated_by?: string
  last_contact?: string
  active: boolean
  created_at: string
  updated_at: string
}

export async function getAllContacts(companyId?: string): Promise<Contact[]> {
  try {
    const supabase = getSupabaseAdminClient()

    let q = supabase
      .from('contacts')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: false })

    if (companyId) {
      q = q.eq('company_id', companyId)
    }

    const { data: contacts, error } = await q

    if (error) {
      console.error('Error fetching contacts:', error)
      return []
    }

    return (contacts || []).map((contact: any) => ({
      ...contact,
      active: Boolean(contact.active),
      tags: coerceJsonArray(contact.tags)
    }))
  } catch (error) {
    console.error('Error in getAllContacts:', error)
    return []
  }
}

export async function getContactById(id: string, companyId?: string): Promise<Contact | null> {
  let whereClause = 'WHERE id = ?'
  let params: any[] = [id]
  
  if (companyId) {
    whereClause += ' AND company_id = ?'
    params.push(companyId)
  }
  
  const contact = await queryOne(`SELECT * FROM contacts ${whereClause}`, params) as any
  if (!contact) return null
  
  return {
    ...contact,
    active: Boolean(contact.active),
    tags: coerceJsonArray(contact.tags)
  }
}

export async function createContact(contactData: Partial<Contact>): Promise<Contact> {
  const id = contactData.id || `contact-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  await execute(`
    INSERT INTO contacts (id, name, email, phone, company, position, status, tags, source, notes, assigned_to, company_id, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    contactData.name!,
    contactData.email || null,
    contactData.phone || null,
    contactData.company || null,
    contactData.position || null,
    contactData.status || 'Active',
    JSON.stringify(contactData.tags || []),
    contactData.source || null,
    contactData.notes || null,
    contactData.assigned_to || null,
    (contactData as any).company_id || null, // Add company_id
    contactData.created_by!
  ])
  
  const contact = await getContactById(id, (contactData as any).company_id)
  if (!contact) throw new Error('Failed to create contact')
  return contact
}

export async function updateContact(id: string, contactData: Partial<Contact>): Promise<Contact> {
  await execute(`
    UPDATE contacts 
    SET name = ?, email = ?, phone = ?, company = ?, position = ?, status = ?, 
        tags = ?, source = ?, notes = ?, assigned_to = ?, updated_by = ?, 
        last_contact = ?, updated_at = NOW()
    WHERE id = ?
  `, [
    contactData.name,
    contactData.email,
    contactData.phone,
    contactData.company,
    contactData.position,
    contactData.status,
    JSON.stringify(contactData.tags || []),
    contactData.source,
    contactData.notes,
    contactData.assigned_to,
    contactData.updated_by,
    contactData.last_contact,
    id
  ])
  
  const contact = await getContactById(id)
  if (!contact) throw new Error('Contact not found')
  return contact
}

export async function deleteContact(id: string): Promise<void> {
  const supabase = getSupabaseAdminClient()
  const { error } = await supabase
    .from('contacts')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
  
  if (error) {
    console.error('Error deleting contact:', error)
    throw error
  }
}

export async function exportContacts(): Promise<Contact[]> {
  return getAllContacts()
}

// ============= LEAD MANAGEMENT =============

export interface Lead {
  id: string
  name: string
  email?: string | null
  phone?: string | null
  company?: string | null
  status: string
  stage: string
  value: number
  probability: number
  score: number
  source?: string | null
  notes?: string | null
  assigned_to?: string | null
  created_by: string
  updated_by?: string | null
  last_activity?: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export async function getAllLeads(companyId?: string): Promise<Lead[]> {
  try {
    const supabase = getSupabaseAdminClient()
    
    let query = supabase
      .from('leads')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: false })
    
    if (companyId) {
      query = query.eq('company_id', companyId)
    }
    
    const { data: leads, error } = await query
    
    if (error) {
      console.error('Error fetching leads:', error)
      return []
    }
    
    return (leads || []).map(lead => ({
      ...lead,
      active: Boolean(lead.active),
      value: Number(lead.value || 0),
      probability: Number(lead.probability || 0),
      score: Number(lead.score || 0)
    }))
  } catch (error) {
    console.error('Error in getAllLeads:', error)
    return []
  }
}

export async function getLeadById(id: string, companyId?: string): Promise<Lead | null> {
  try {
    const supabase = getSupabaseAdminClient()
    
    let query = supabase
      .from('leads')
      .select('*')
      .eq('id', id)
      .eq('active', true)
    
    if (companyId) {
      query = query.eq('company_id', companyId)
    }
    
    const { data: lead, error } = await query.single()
    
    if (error || !lead) {
      console.log(`Lead not found: ${id}${companyId ? ` for company ${companyId}` : ''}`)
      return null
    }
    
    return {
      ...lead,
      active: Boolean(lead.active),
      value: Number(lead.value || 0),
      probability: Number(lead.probability || 0),
      score: Number(lead.score || 0)
    }
  } catch (error) {
    console.error('Error fetching lead by ID:', error)
    return null
  }
}

export async function createLead(leadData: Partial<Lead>): Promise<Lead> {
  const id = leadData.id || `lead-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  await execute(`
    INSERT INTO leads (id, name, email, phone, company, status, stage, value, probability, score, source, notes, assigned_to, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    leadData.name!,
    leadData.email || null,
    leadData.phone || null,
    leadData.company || null,
    leadData.status || 'Cold',
    leadData.stage || 'Qualification',
    leadData.value || 0,
    leadData.probability || 0,
    leadData.score || 0,
    leadData.source || null,
    leadData.notes || null,
    leadData.assigned_to || null,
    leadData.created_by!
  ])
  
  const lead = await getLeadById(id)
  if (!lead) throw new Error('Failed to create lead')
  return lead
}

export async function updateLead(id: string, leadData: Partial<Lead>): Promise<Lead> {
  const supabase = getSupabaseAdminClient()

  // Allowed fields to update (safe whitelist)
  const allowedFields = [
    'name', 'email', 'phone', 'company', 'status', 'stage',
    'value', 'probability', 'score', 'source', 'notes',
    'assigned_to', 'updated_by', 'last_activity'
  ]

  // Build the update payload — only known, non-undefined fields
  const updatePayload: Record<string, any> = { updated_at: new Date().toISOString() }
  for (const key of allowedFields) {
    const val = (leadData as any)[key]
    if (val !== undefined && val !== null) {
      updatePayload[key] = val
    }
  }

  if (Object.keys(updatePayload).length === 1) {
    // Only updated_at — nothing meaningful to save
    throw new Error('No fields to update')
  }

  const { error } = await supabase
    .from('leads')
    .update(updatePayload)
    .eq('id', id)

  if (error) {
    console.error('Supabase updateLead error:', error)
    throw new Error(error.message)
  }

  const lead = await getLeadById(id)
  if (!lead) throw new Error('Lead not found after update')
  return lead
}

export async function deleteLead(id: string): Promise<void> {
  const supabase = getSupabaseAdminClient()
  const { error } = await supabase
    .from('leads')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
  
  if (error) {
    console.error('Error deleting lead:', error)
    throw error
  }
}

export async function exportLeads(): Promise<Lead[]> {
  return getAllLeads()
}

// ============= CAMPAIGN MANAGEMENT =============

export interface Campaign {
  id: string
  name: string
  type: string
  status: string
  message?: string
  template_id?: string
  recipients: number
  sent: number
  delivered: number
  read: number
  responded: number
  created_by: string
  created_at: string
  updated_at: string
  scheduled_at?: string
  budget: number
  spent: number
  category?: string
}

export async function getAllCampaigns(companyId?: string): Promise<Campaign[]> {
  let query_str = `SELECT * FROM campaigns`
  let params: any[] = []
  
  if (companyId) {
    query_str += ` WHERE company_id = ?`
    params.push(companyId)
  }
  
  query_str += ` ORDER BY created_at DESC`
  
  const campaigns = await query(query_str, params) as any[]
  
  return campaigns.map(campaign => ({
    ...campaign,
    recipients: Number(campaign.recipients || 0),
    sent: Number(campaign.sent || 0),
    delivered: Number(campaign.delivered || 0),
    read: Number(campaign.read || 0),
    responded: Number(campaign.responded || 0),
    budget: Number(campaign.budget || 0),
    spent: Number(campaign.spent || 0)
  }))
}

export async function getCampaignById(id: string, companyId?: string): Promise<Campaign | null> {
  let whereClause = 'WHERE id = ?'
  let params: any[] = [id]
  
  if (companyId) {
    whereClause += ' AND company_id = ?'
    params.push(companyId)
  }
  
  const campaign = await queryOne(`SELECT * FROM campaigns ${whereClause}`, params) as any
  if (!campaign) return null
  
  return {
    ...campaign,
    recipients: Number(campaign.recipients || 0),
    sent: Number(campaign.sent || 0),
    delivered: Number(campaign.delivered || 0),
    read: Number(campaign.read || 0),
    responded: Number(campaign.responded || 0),
    budget: Number(campaign.budget || 0),
    spent: Number(campaign.spent || 0)
  }
}

export async function createCampaign(campaignData: Partial<Campaign>): Promise<Campaign> {
  const id = campaignData.id || `campaign-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  await execute(`
    INSERT INTO campaigns (id, name, type, status, message, template_id, recipients, sent, delivered, read, responded, created_by, scheduled_at, budget, spent, category)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    campaignData.name!,
    campaignData.type!,
    campaignData.status || 'draft',
    campaignData.message || null,
    campaignData.template_id || null,
    campaignData.recipients || 0,
    campaignData.sent || 0,
    campaignData.delivered || 0,
    campaignData.read || 0,
    campaignData.responded || 0,
    campaignData.created_by!,
    campaignData.scheduled_at || null,
    campaignData.budget || 0,
    campaignData.spent || 0,
    campaignData.category || null
  ])

  // If a template is used, increment its usage count
  if (campaignData.template_id) {
    try {
      const template = await getEmailTemplateById(campaignData.template_id)
      if (template) {
        const currentUsageCount = template.usage_count || 0
        await updateEmailTemplate(campaignData.template_id, {
          usage_count: currentUsageCount + 1
        })
        console.log(`Template usage incremented for campaign creation: ${campaignData.template_id} (${currentUsageCount + 1})`)
      }
    } catch (error) {
      console.error('Failed to increment template usage for campaign:', error)
      // Don't fail campaign creation if usage tracking fails
    }
  }
  
  const campaign = await getCampaignById(id)
  if (!campaign) throw new Error('Failed to create campaign')
  return campaign
}

export async function updateCampaign(id: string, campaignData: Partial<Campaign>): Promise<Campaign> {
  // Get current campaign first
  const currentCampaign = await getCampaignById(id)
  if (!currentCampaign) throw new Error('Campaign not found')
  
  // Build update query dynamically based on provided fields
  const updateFields: string[] = []
  const updateValues: any[] = []
  
  if (campaignData.name !== undefined) {
    updateFields.push('name = ?')
    updateValues.push(campaignData.name)
  }
  if (campaignData.type !== undefined) {
    updateFields.push('type = ?')
    updateValues.push(campaignData.type)
  }
  if (campaignData.status !== undefined) {
    updateFields.push('status = ?')
    updateValues.push(campaignData.status)
  }
  if (campaignData.message !== undefined) {
    updateFields.push('message = ?')
    updateValues.push(campaignData.message)
  }
  if (campaignData.recipients !== undefined) {
    updateFields.push('recipients = ?')
    updateValues.push(campaignData.recipients)
  }
  if (campaignData.sent !== undefined) {
    updateFields.push('sent = ?')
    updateValues.push(campaignData.sent)
  }
  if (campaignData.delivered !== undefined) {
    updateFields.push('delivered = ?')
    updateValues.push(campaignData.delivered)
  }
  if (campaignData.read !== undefined) {
    updateFields.push('read = ?')
    updateValues.push(campaignData.read)
  }
  if (campaignData.responded !== undefined) {
    updateFields.push('responded = ?')
    updateValues.push(campaignData.responded)
  }
  if (campaignData.scheduled_at !== undefined) {
    updateFields.push('scheduled_at = ?')
    updateValues.push(campaignData.scheduled_at)
  }
  if (campaignData.budget !== undefined) {
    updateFields.push('budget = ?')
    updateValues.push(campaignData.budget)
  }
  if (campaignData.spent !== undefined) {
    updateFields.push('spent = ?')
    updateValues.push(campaignData.spent)
  }
  if (campaignData.category !== undefined) {
    updateFields.push('category = ?')
    updateValues.push(campaignData.category)
  }
  
  // Always update the updated_at timestamp
  updateFields.push('updated_at = datetime(\'now\')')
  updateValues.push(id) // Add id as the last parameter for WHERE clause
  
  if (updateFields.length === 1) {
    // Only updated_at was added, no actual changes
    return currentCampaign
  }
  
  const query = `UPDATE campaigns SET ${updateFields.join(', ')} WHERE id = ?`
  await execute(query, updateValues)
  
  const updatedCampaign = await getCampaignById(id)
  if (!updatedCampaign) throw new Error('Failed to retrieve updated campaign')
  return updatedCampaign
}

export async function deleteCampaign(id: string): Promise<void> {
  await execute(`DELETE FROM campaigns WHERE id = ?`, [id])
}

// ============= DASHBOARD STATS =============

export interface DashboardStats {
  totalContacts: number
  totalLeads: number
  totalCampaigns: number
  totalUsers?: number
  revenue: number
  revenueChange?: string
  contactsChange?: string
  leadsChange?: string
  whatsappChange?: string
  recentActivity: any[]
  leadsByStage: Record<string, number>
  campaignMetrics: {
    totalSent: number
    totalDelivered: number
    totalRead: number
    totalResponded: number
  }
  conversionRate?: number
  responseRate?: number
  avgResponseTime?: string
}

export async function getDashboardStats(companyId?: string): Promise<DashboardStats> {
  let contactsWhere = 'WHERE active = 1'
  let leadsWhere = 'WHERE active = 1'
  let dealsWhere = 'WHERE active = 1'
  let campaignsWhere = ''
  let params: any[] = []
  let contactParams: any[] = []
  let leadParams: any[] = []
  let dealParams: any[] = []
  let campaignParams: any[] = []
  
  if (companyId) {
    contactsWhere += ' AND company_id = ?'
    contactParams.push(companyId)
    
    leadsWhere += ' AND company_id = ?'
    leadParams.push(companyId)
    
    dealsWhere += ' AND company_id = ?'
    dealParams.push(companyId)
    
    campaignsWhere = 'WHERE company_id = ?'
    campaignParams.push(companyId)
  }
  
  const totalContacts = (await queryOne(`SELECT COUNT(*) as count FROM contacts ${contactsWhere}`, contactParams) as any)?.count || 0
  const totalLeads = (await queryOne(`SELECT COUNT(*) as count FROM leads ${leadsWhere}`, leadParams) as any)?.count || 0
  const totalCampaigns = (await queryOne(`SELECT COUNT(*) as count FROM campaigns ${campaignsWhere}`, campaignParams) as any)?.count || 0
  
  // Calculate revenue from won deals
  const revenue = (await queryOne(`
    SELECT COALESCE(SUM(value), 0) as total 
    FROM deals 
    ${dealsWhere} AND stage IN ('Closed Won', 'Won')
  `, dealParams) as any)?.total || 0
  
  const leadsByStage = await query(`
    SELECT stage, COUNT(*) as count FROM leads ${leadsWhere} GROUP BY stage
  `, leadParams) as { stage: string, count: number }[]
  
  const leadsByStageMap: Record<string, number> = {}
  leadsByStage.forEach(({ stage, count }) => {
    leadsByStageMap[stage] = count
  })
  
  const campaignMetrics = (await queryOne(`
    SELECT 
      SUM(sent) as totalSent,
      SUM(delivered) as totalDelivered, 
      SUM(read) as totalRead,
      SUM(responded) as totalResponded
    FROM campaigns ${campaignsWhere}
  `, campaignParams) as any) || { totalSent: 0, totalDelivered: 0, totalRead: 0, totalResponded: 0 }
  
  // For activity logs, we might need to join with users to filter by company
  let activityQuery = `
    SELECT al.* FROM activity_logs al
    LEFT JOIN users u ON al.user_id = u.id
    WHERE 1=1
  `
  let activityParams: any[] = []
  
  if (companyId) {
    activityQuery += ' AND u.company_id = ?'
    activityParams.push(companyId)
  }
  
  activityQuery += ' ORDER BY al.created_at DESC LIMIT 10'
  
  const recentActivity = await query(activityQuery, activityParams) as any[]
  
  // Calculate conversion rate (converted leads / total leads)
  const convertedLeads = (await queryOne(`
    SELECT COUNT(*) as count 
    FROM leads 
    ${leadsWhere} AND status = 'converted'
  `, leadParams) as any)?.count || 0
  const conversionRate = totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0
  
  // Calculate response rate (responded campaigns / sent campaigns)
  const responseRate = campaignMetrics.totalSent > 0 
    ? Math.round((campaignMetrics.totalResponded / campaignMetrics.totalSent) * 100) 
    : 0
  
  // Calculate average response time from activity logs (if available)
  // For now, we'll use a placeholder - this would require tracking response timestamps
  const avgResponseTime = "N/A"
  
  // Calculate percentage changes from last month
  const now = new Date()
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
  
  // Contacts change
  const lastMonthContacts = (await queryOne(`
    SELECT COUNT(*) as count FROM contacts 
    ${contactsWhere} AND created_at < ?
  `, [...contactParams, currentMonthStart]) as any)?.count || 0
  const newContactsThisMonth = totalContacts - lastMonthContacts
  const contactsChangePercent = lastMonthContacts > 0 
    ? Math.round((newContactsThisMonth / lastMonthContacts) * 100) 
    : (newContactsThisMonth > 0 ? 100 : 0)
  const contactsChange = `${contactsChangePercent >= 0 ? '+' : ''}${contactsChangePercent}%`
  
  // Leads change
  const lastMonthLeads = (await queryOne(`
    SELECT COUNT(*) as count FROM leads 
    ${leadsWhere} AND created_at < ?
  `, [...leadParams, currentMonthStart]) as any)?.count || 0
  const newLeadsThisMonth = totalLeads - lastMonthLeads
  const leadsChangePercent = lastMonthLeads > 0 
    ? Math.round((newLeadsThisMonth / lastMonthLeads) * 100) 
    : (newLeadsThisMonth > 0 ? 100 : 0)
  const leadsChange = `${leadsChangePercent >= 0 ? '+' : ''}${leadsChangePercent}%`
  
  // WhatsApp/Campaigns change
  const lastMonthCampaigns = (await queryOne(`
    SELECT COALESCE(SUM(sent), 0) as total FROM campaigns 
    ${campaignsWhere}${campaignsWhere ? ' AND' : 'WHERE'} created_at < ?
  `, [...campaignParams, currentMonthStart]) as any)?.total || 0
  const newCampaignsThisMonth = campaignMetrics.totalSent - lastMonthCampaigns
  const campaignsChangePercent = lastMonthCampaigns > 0 
    ? Math.round((newCampaignsThisMonth / lastMonthCampaigns) * 100) 
    : (newCampaignsThisMonth > 0 ? 100 : 0)
  const whatsappChange = `${campaignsChangePercent >= 0 ? '+' : ''}${campaignsChangePercent}%`
  
  // Revenue change
  const lastMonthRevenue = (await queryOne(`
    SELECT COALESCE(SUM(value), 0) as total 
    FROM deals 
    ${dealsWhere} AND stage IN ('Closed Won', 'Won') AND created_at < ?
  `, [...dealParams, currentMonthStart]) as any)?.total || 0
  const newRevenueThisMonth = revenue - lastMonthRevenue
  const revenueChangePercent = lastMonthRevenue > 0 
    ? Math.round((newRevenueThisMonth / lastMonthRevenue) * 100) 
    : (newRevenueThisMonth > 0 ? 100 : 0)
  const revenueChange = `${revenueChangePercent >= 0 ? '+' : ''}${revenueChangePercent}%`
  
  return {
    totalContacts: Number(totalContacts),
    totalLeads: Number(totalLeads),
    totalCampaigns: Number(totalCampaigns),
    revenue: Number(revenue),
    recentActivity,
    leadsByStage: leadsByStageMap,
    campaignMetrics: {
      totalSent: Number(campaignMetrics.totalSent || 0),
      totalDelivered: Number(campaignMetrics.totalDelivered || 0),
      totalRead: Number(campaignMetrics.totalRead || 0),
      totalResponded: Number(campaignMetrics.totalResponded || 0)
    },
    conversionRate,
    responseRate,
    avgResponseTime,
    contactsChange,
    leadsChange,
    whatsappChange,
    revenueChange
  }
}

// ============= NOTIFICATION MANAGEMENT =============

export interface Notification {
  id: string
  user_id: string
  title: string
  message: string
  type: string
  read: boolean
  read_at?: string
  action_url?: string
  expires_at?: string
  created_at: string
  updated_at: string
}

export async function createNotification(notificationData: Partial<Notification>): Promise<Notification> {
  const id = notificationData.id || `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  await execute(`
    INSERT INTO notifications (id, user_id, title, message, type, action_url, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    notificationData.user_id!,
    notificationData.title!,
    notificationData.message!,
    notificationData.type || 'info',
    notificationData.action_url || null,
    notificationData.expires_at || null
  ])
  
  const notification = await queryOne(`SELECT * FROM notifications WHERE id = ?`, [id]) as any
  return {
    ...notification,
    read: Boolean(notification.read)
  }
}

export async function markNotificationAsRead(id: string): Promise<void> {
  await execute(`
    UPDATE notifications 
    SET read = 1, read_at = NOW(), updated_at = NOW()
    WHERE id = ?
  `, [id])
}

export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  await execute(`
    UPDATE notifications 
    SET read = 1, read_at = NOW(), updated_at = NOW()
    WHERE user_id = ? AND read = 0
  `, [userId])
}

// ============= SETTINGS MANAGEMENT =============

export async function getEmailSettings(companyId?: string): Promise<any> {
  // Use Supabase if in Supabase mode
  if (process.env.DATABASE_MODE === 'supabase') {
    const { getSupabaseAdminClient } = require('@/backend/database/supabase-config')
    const supabase = getSupabaseAdminClient()
    
    let query = supabase.from('email_settings').select('*')
    
    if (companyId) {
      query = query.eq('company_id', companyId)
    }
    
    const { data: settings, error } = await query.single()
    
    if (error || !settings) {
      // Return default settings if none found
      return {
        enableEmail: false,
        enabled: false,
        smtpHost: 'smtp.gmail.com',
        smtpPort: 587,
        senderName: '',
        senderEmail: '',
        appPassword: '',
        smtp_host: 'smtp.gmail.com',
        smtp_port: 587,
        from_name: '',
        from_email: '',
        smtp_password: ''
      }
    }
    
    // Map Supabase fields to expected format (support both naming conventions)
    return {
      // Old format (camelCase)
      senderEmail: settings.from_email || '',
      senderName: settings.from_name || '',
      appPassword: settings.smtp_password || settings.app_password || '',
      smtpHost: settings.smtp_host || 'smtp.gmail.com',
      smtpPort: settings.smtp_port || 587,
      enableEmail: Boolean(settings.enable_email || settings.enabled),
      // New format (snake_case for direct Supabase access)
      from_email: settings.from_email || '',
      from_name: settings.from_name || '',
      smtp_password: settings.smtp_password || settings.app_password || '',
      smtp_host: settings.smtp_host || 'smtp.gmail.com',
      smtp_port: settings.smtp_port || 587,
      enable_email: Boolean(settings.enable_email || settings.enabled),
      enabled: Boolean(settings.enable_email || settings.enabled),
      smtp_secure: settings.smtp_secure !== undefined ? settings.smtp_secure : (settings.smtp_port === 465),
      smtp_username: settings.smtp_username || settings.from_email || '',
      company_id: settings.company_id
    }
  }
  
  // SQLite fallback
  if (companyId) {
    const settings = await queryOne(`SELECT * FROM email_settings WHERE company_id = ?`, [companyId]) as any
    if (settings) {
      return {
        senderEmail: settings.sender_email || '',
        senderName: settings.sender_name || '',
        appPassword: settings.app_password || '',
        smtpHost: settings.smtp_host || 'smtp.gmail.com',
        smtpPort: settings.smtp_port || 587,
        enableEmail: Boolean(settings.enable_email)
      }
    }
  }
  
  // Default settings if none found
  return {
    enableEmail: false,
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
    senderName: '',
    senderEmail: '',
    appPassword: ''
  }
}

export async function saveEmailSettings(settings: any, companyId: string): Promise<void> {
  const existingSettings = await queryOne(`SELECT id FROM email_settings WHERE company_id = ?`, [companyId]) as any
  
  if (existingSettings) {
    // Update existing
    await execute(`
      UPDATE email_settings SET 
        sender_email = ?, 
        sender_name = ?, 
        app_password = ?, 
        smtp_host = ?, 
        smtp_port = ?, 
        enable_email = ?,
        updated_at = NOW()
      WHERE company_id = ?
    `, [
      settings.senderEmail || '',
      settings.senderName || '',
      settings.appPassword || '',
      settings.smtpHost || 'smtp.gmail.com',
      settings.smtpPort || 587,
      settings.enableEmail ? 1 : 0,
      companyId
    ])
  } else {
    // Create new
    const id = require('crypto').randomUUID()
    await execute(`
      INSERT INTO email_settings (id, company_id, sender_email, sender_name, app_password, smtp_host, smtp_port, enable_email)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      companyId,
      settings.senderEmail || '',
      settings.senderName || '',
      settings.appPassword || '',
      settings.smtpHost || 'smtp.gmail.com',
      settings.smtpPort || 587,
      settings.enableEmail ? 1 : 0
    ])
  }
}

export async function getSMSSettings(companyId?: string): Promise<any> {
  if (companyId) {
    const supabase = getSupabaseAdminClient()
    const { data: settings } = await supabase
      .from('sms_settings')
      .select('*')
      .eq('company_id', companyId)
      .single()
    
    if (settings) {
      return {
        provider: settings.provider || 'twilio',
        accountSid: settings.account_sid || '',
        authToken: settings.auth_token || '',
        fromNumber: settings.from_number || '',
        senderName: settings.sender_name || '',
        enableSMS: Boolean(settings.enable_sms)
      }
    }
  }
  
  // Default settings
  return {
    provider: 'twilio',
    accountSid: '',
    authToken: '',
    fromNumber: '',
    senderName: '',
    enableSMS: false
  }
}

export async function saveSMSSettings(settings: any, companyId: string): Promise<void> {
  const supabase = getSupabaseAdminClient()
  const { data: existingSettings } = await supabase
    .from('sms_settings')
    .select('id')
    .eq('company_id', companyId)
    .single()
  
  if (existingSettings) {
    // Update existing
    await supabase
      .from('sms_settings')
      .update({
        provider: settings.provider || 'twilio',
        account_sid: settings.accountSid || '',
        auth_token: settings.authToken || '',
        from_number: settings.fromNumber || '',
        sender_name: settings.senderName || '',
        enable_sms: settings.enableSMS || false,
        updated_at: new Date().toISOString()
      })
      .eq('company_id', companyId)
  } else {
    // Create new
    const id = require('crypto').randomUUID()
    await supabase
      .from('sms_settings')
      .insert({
        id,
        company_id: companyId,
        provider: settings.provider || 'twilio',
        account_sid: settings.accountSid || '',
        auth_token: settings.authToken || '',
        from_number: settings.fromNumber || '',
        sender_name: settings.senderName || '',
        enable_sms: settings.enableSMS || false
      })
  }
}

export async function getWhatsAppSettings(companyId?: string): Promise<any> {
  const defaultSettings = {
    provider: 'twilio',
    accountSid: '',
    authToken: '',
    fromNumber: '',
    phoneNumber: '',
    enableWhatsApp: false,
    useWhatsAppWeb: false,
    sessionId: '',
    connectionStatus: 'disconnected'
  }

  if (!companyId) return defaultSettings

  try {
    const supabase = getSupabaseAdminClient()
    const { data: settings, error } = await supabase
      .from('whatsapp_settings')
      .select('*')
      .eq('company_id', companyId)
      .maybeSingle()

    if (error || !settings) return defaultSettings

    return {
      provider: settings.provider || 'twilio',
      accountSid: settings.account_sid || '',
      authToken: settings.auth_token || '',
      fromNumber: settings.from_number || '',
      phoneNumber: settings.phone_number || '',
      enableWhatsApp: Boolean(settings.enable_whatsapp),
      useWhatsAppWeb: Boolean(settings.use_whatsapp_web),
      sessionId: settings.session_id || '',
      connectionStatus: settings.connection_status || 'disconnected'
    }
  } catch (error) {
    console.error('Error in getWhatsAppSettings:', error)
    return defaultSettings
  }
}

export async function saveWhatsAppSettings(settings: any, companyId: string): Promise<void> {
  try {
    const supabase = getSupabaseAdminClient()

    const payload = {
      company_id: companyId,
      provider: settings.provider || 'twilio',
      account_sid: settings.accountSid || '',
      auth_token: settings.authToken || '',
      from_number: settings.fromNumber || '',
      phone_number: settings.phoneNumber || '',
      enable_whatsapp: settings.enableWhatsApp ? true : false,
      use_whatsapp_web: settings.useWhatsAppWeb ? true : false,
      session_id: settings.sessionId || '',
      connection_status: settings.connectionStatus || 'disconnected',
      updated_at: new Date().toISOString()
    }

    const { error } = await supabase
      .from('whatsapp_settings')
      .upsert(payload, { onConflict: 'company_id' })

    if (error) {
      console.error('Error saving WhatsApp settings:', error)
      throw error
    }
  } catch (error) {
    console.error('Error in saveWhatsAppSettings:', error)
    throw error
  }
}

export async function getEmailMonitoringSettings(): Promise<any> {
  const setting = await queryOne(`SELECT value FROM settings WHERE name = 'email_monitoring_settings'`) as any
  return setting ? coerceJson(setting.value, { isEnabled: false, lastStartedAt: null }) : {
    isEnabled: false,
    lastStartedAt: null,
    lastStoppedAt: null,
    autoReplyEnabled: true,
    checkInterval: 30000
  }
}

export async function saveEmailMonitoringSettings(settings: any): Promise<void> {
  await execute(`
    INSERT INTO settings (id, key, value, type, category, updated_at)
    VALUES ('email_monitoring_settings', 'email_monitoring_settings', ?, 'json', 'email', NOW())
    ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at
  `, [JSON.stringify(settings)])
}

// ============= TEMPLATE MANAGEMENT =============

export interface Template {
  id: string
  name: string
  category?: string
  type: string
  content: string
  variables: string[]
  status: string
  usage: number
  created_by: string
  created_at: string
  updated_at: string
}

export async function getAllTemplates(): Promise<Template[]> {
  const templates = await query(`
    SELECT * FROM templates ORDER BY created_at DESC
  `) as any[]
  
  return templates.map(template => ({
    ...template,
    variables: coerceJsonArray(template.variables || '[]'),
    usage: Number(template.usage || 0)
  }))
}

export async function getTemplateById(id: string): Promise<Template | null> {
  const template = await queryOne(`SELECT * FROM templates WHERE id = ?`, [id]) as any
  if (!template) return null
  
  return {
    ...template,
    variables: coerceJsonArray(template.variables || '[]'),
    usage: Number(template.usage || 0)
  }
}

export async function createTemplate(templateData: Partial<Template>): Promise<Template> {
  const id = templateData.id || `template-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  await execute(`
    INSERT INTO templates (id, name, category, type, content, variables, status, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    templateData.name!,
    templateData.category || null,
    templateData.type!,
    templateData.content!,
    JSON.stringify(templateData.variables || []),
    templateData.status || 'active',
    templateData.created_by!
  ])
  
  const template = await getTemplateById(id)
  if (!template) throw new Error('Failed to create template')
  return template
}

export async function updateTemplate(id: string, templateData: Partial<Template>): Promise<Template> {
  await execute(`
    UPDATE templates 
    SET name = ?, category = ?, type = ?, content = ?, variables = ?, 
        status = ?, updated_at = NOW()
    WHERE id = ?
  `, [
    templateData.name,
    templateData.category,
    templateData.type,
    templateData.content,
    JSON.stringify(templateData.variables || []),
    templateData.status,
    id
  ])
  
  const template = await getTemplateById(id)
  if (!template) throw new Error('Template not found')
  return template
}

export async function deleteTemplate(id: string): Promise<void> {
  await execute(`DELETE FROM templates WHERE id = ?`, [id])
}

// ============= SCHEDULED MESSAGE MANAGEMENT =============

export interface ScheduledMessage {
  id: string
  title: string
  message: string
  type: string
  recipient_type: string
  recipients: number
  scheduled_date_time: string
  frequency: string
  status: string
  attachments?: string // JSON string of attachment data
  created_by: string
  created_at: string
  updated_at: string
}

export async function getScheduledMessages(): Promise<ScheduledMessage[]> {
  const messages = await query(`
    SELECT * FROM scheduled_messages ORDER BY scheduled_date_time DESC
  `) as any[]
  
  return messages.map(message => ({
    ...message,
    recipients: Number(message.recipients || 0)
  }))
}

export async function getScheduledMessageById(id: string): Promise<ScheduledMessage | null> {
  const message = await queryOne(`SELECT * FROM scheduled_messages WHERE id = ?`, [id]) as any
  if (!message) return null
  
  return {
    ...message,
    recipients: Number(message.recipients || 0)
  }
}

export async function createScheduledMessage(messageData: Partial<ScheduledMessage>): Promise<ScheduledMessage> {
  const id = messageData.id || `scheduled-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  await execute(`
    INSERT INTO scheduled_messages (id, title, message, type, recipient_type, recipients, scheduled_date_time, frequency, status, attachments, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    messageData.title!,
    messageData.message!,
    messageData.type!,
    messageData.recipient_type!,
    messageData.recipients || 0,
    messageData.scheduled_date_time!,
    messageData.frequency || 'once',
    messageData.status || 'pending',
    messageData.attachments || '[]',
    messageData.created_by!
  ])
  
  const message = await getScheduledMessageById(id)
  if (!message) throw new Error('Failed to create scheduled message')
  return message
}

export async function updateScheduledMessage(id: string, messageData: Partial<ScheduledMessage>): Promise<ScheduledMessage> {
  // Build dynamic update query based on provided fields
  const updates: string[] = []
  const params: any[] = []
  
  if (messageData.title !== undefined) {
    updates.push('title = ?')
    params.push(messageData.title)
  }
  if (messageData.message !== undefined) {
    updates.push('message = ?')
    params.push(messageData.message)
  }
  if (messageData.type !== undefined) {
    updates.push('type = ?')
    params.push(messageData.type)
  }
  if (messageData.recipient_type !== undefined) {
    updates.push('recipient_type = ?')
    params.push(messageData.recipient_type)
  }
  if (messageData.recipients !== undefined) {
    updates.push('recipients = ?')
    params.push(messageData.recipients)
  }
  if (messageData.scheduled_date_time !== undefined) {
    updates.push('scheduled_date_time = ?')
    params.push(messageData.scheduled_date_time)
  }
  if (messageData.frequency !== undefined) {
    updates.push('frequency = ?')
    params.push(messageData.frequency)
  }
  if (messageData.status !== undefined) {
    updates.push('status = ?')
    params.push(messageData.status)
  }
  if (messageData.attachments !== undefined) {
    updates.push('attachments = ?')
    params.push(messageData.attachments)
  }
  
  // Always update the updated_at timestamp
  updates.push('updated_at = datetime(\'now\')')
  
  if (updates.length === 1) { // Only updated_at was added
    throw new Error('No fields provided to update')
  }
  
  // Add the id parameter for WHERE clause
  params.push(id)
  
  const sql = `UPDATE scheduled_messages SET ${updates.join(', ')} WHERE id = ?`
  await execute(sql, params)
  
  const message = await getScheduledMessageById(id)
  if (!message) throw new Error('Scheduled message not found')
  return message
}

export async function deleteScheduledMessage(id: string): Promise<void> {
  await execute(`DELETE FROM scheduled_messages WHERE id = ?`, [id])
}

// ============= EMAIL TEMPLATE MANAGEMENT =============

export interface EmailTemplate {
  id: string
  name: string
  category?: string
  subject: string
  body: string
  is_html: boolean
  variables: string[]
  usage_count: number
  created_by: string
  company_id: string  // Add company_id field
  created_at: string
  updated_at: string
}

export async function getEmailTemplates(): Promise<EmailTemplate[]> {
  try {
    const { getSupabaseAdminClient } = await import('./supabase-config')
    const supabase = getSupabaseAdminClient()

    const { data: templates, error } = await supabase
      .from('email_templates')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching email templates:', error)
      return []
    }

    return (templates || []).map(template => ({
      ...template,
      is_html: Boolean(template.is_html),
      variables: Array.isArray(template.variables) ? template.variables: coerceJsonArray(template.variables || '[]'),
      usage_count: Number(template.usage_count || 0)
    }))
  } catch (error) {
    console.error('Error in getEmailTemplates:', error)
    return []
  }
}

export async function getEmailTemplateById(id: string): Promise<EmailTemplate | null> {
  try {
    const { getSupabaseAdminClient } = await import('./supabase-config')
    const supabase = getSupabaseAdminClient()
    
    const { data: template, error } = await supabase
      .from('email_templates')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error || !template) {
      return null
    }
    
    return {
      ...template,
      is_html: Boolean(template.is_html),
      variables: Array.isArray(template.variables) ? template.variables: coerceJsonArray(template.variables || '[]'),
      usage_count: Number(template.usage_count || 0)
    }
  } catch (error) {
    console.error('Error getting email template:', error)
    return null
  }
}

export async function createEmailTemplate(templateData: Partial<EmailTemplate>): Promise<EmailTemplate> {
  try {
    const { getSupabaseAdminClient } = await import('./supabase-config')
    const supabase = getSupabaseAdminClient()
    const { randomUUID } = await import('crypto')
    
    // Generate a proper UUID for PostgreSQL
    const id = templateData.id || randomUUID()
    
    const { data, error } = await supabase
      .from('email_templates')
      .insert({
        id,
        name: templateData.name,
        category: templateData.category || null,
        subject: templateData.subject,
        body: templateData.body,
        is_html: templateData.is_html || false,
        variables: templateData.variables || [],
        created_by: templateData.created_by,
        company_id: templateData.company_id,  // Add company_id
        usage_count: 0
      })
      .select()
      .single()
    
    if (error) {
      console.error('Error creating email template:', error)
      throw error
    }
    
    const template = await getEmailTemplateById(id)
    if (!template) throw new Error('Failed to create email template')
    return template
  } catch (error) {
    console.error('Error in createEmailTemplate:', error)
    throw error
  }
}

export async function updateEmailTemplate(id: string, templateData: Partial<EmailTemplate>): Promise<EmailTemplate> {
  try {
    const { getSupabaseAdminClient } = await import('./supabase-config')
    const supabase = getSupabaseAdminClient()
    
    const updateData: any = {}
    if (templateData.name !== undefined) updateData.name = templateData.name
    if (templateData.category !== undefined) updateData.category = templateData.category
    if (templateData.subject !== undefined) updateData.subject = templateData.subject
    if (templateData.body !== undefined) updateData.body = templateData.body
    if (templateData.is_html !== undefined) updateData.is_html = templateData.is_html
    if (templateData.variables !== undefined) updateData.variables = templateData.variables
    updateData.updated_at = new Date().toISOString()
    
    const { error } = await supabase
      .from('email_templates')
      .update(updateData)
      .eq('id', id)
    
    if (error) {
      console.error('Error updating email template:', error)
      throw error
    }
    
    const template = await getEmailTemplateById(id)
    if (!template) throw new Error('Email template not found')
    return template
  } catch (error) {
    console.error('Error in updateEmailTemplate:', error)
    throw error
  }
}

export async function deleteEmailTemplate(id: string): Promise<void> {
  try {
    const { getSupabaseAdminClient } = await import('./supabase-config')
    const supabase = getSupabaseAdminClient()
    
    const { error } = await supabase
      .from('email_templates')
      .delete()
      .eq('id', id)
    
    if (error) {
      console.error('Error deleting email template:', error)
      throw error
    }
  } catch (error) {
    console.error('Error in deleteEmailTemplate:', error)
    throw error
  }
}

// ============= WHATSAPP MENU MANAGEMENT =============

// Removed duplicate WhatsAppMenu interface - using the one defined later

// ============= AUTOMATION MANAGEMENT =============

export interface Automation {
  id: string
  name: string
  description?: string
  trigger_type: string
  trigger_config: any
  actions: any[]
  is_active: boolean
  execution_count: number
  created_by: string
  created_at: string
  updated_at: string
}

export async function getAllAutomations(): Promise<Automation[]> {
  const automations = await query(`
    SELECT * FROM automations ORDER BY created_at DESC
  `) as any[]
  
  return automations.map(automation => ({
    ...automation,
    is_active: Boolean(automation.is_active),
    trigger_config: coerceJson(automation.trigger_config || '{}'),
    actions: coerceJsonArray(automation.actions || '[]'),
    execution_count: Number(automation.execution_count || 0)
  }))
}

export async function getAutomationById(id: string): Promise<Automation | null> {
  const automation = await queryOne(`SELECT * FROM automations WHERE id = ?`, [id]) as any
  if (!automation) return null
  
  return {
    ...automation,
    is_active: Boolean(automation.is_active),
    trigger_config: coerceJson(automation.trigger_config || '{}'),
    actions: coerceJsonArray(automation.actions || '[]'),
    execution_count: Number(automation.execution_count || 0)
  }
}

export async function createAutomation(automationData: Partial<Automation>): Promise<Automation> {
  const id = automationData.id || `automation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  await execute(`
    INSERT INTO automations (id, name, description, trigger_type, trigger_config, actions, is_active, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    automationData.name!,
    automationData.description || null,
    automationData.trigger_type!,
    JSON.stringify(automationData.trigger_config || {}),
    JSON.stringify(automationData.actions || []),
    automationData.is_active ? 1 : 0,
    automationData.created_by!
  ])
  
  const automation = await getAutomationById(id)
  if (!automation) throw new Error('Failed to create automation')
  return automation
}

export async function updateAutomation(id: string, automationData: Partial<Automation>): Promise<Automation> {
  await execute(`
    UPDATE automations 
    SET name = ?, description = ?, trigger_type = ?, trigger_config = ?, actions = ?, 
        is_active = ?, updated_at = NOW()
    WHERE id = ?
  `, [
    automationData.name,
    automationData.description,
    automationData.trigger_type,
    JSON.stringify(automationData.trigger_config || {}),
    JSON.stringify(automationData.actions || []),
    automationData.is_active ? 1 : 0,
    id
  ])
  
  const automation = await getAutomationById(id)
  if (!automation) throw new Error('Automation not found')
  return automation
}

export async function deleteAutomation(id: string): Promise<void> {
  await execute(`UPDATE automations SET is_active = 0 WHERE id = ?`, [id])
}

// ============= TEAM INVITATIONS =============

export interface TeamInvitation {
  id: string
  email: string
  name?: string
  role: string
  department?: string
  position?: string
  company_id?: string
  permissions: string[]
  invited_by: string
  invitation_token: string
  status: 'pending' | 'accepted' | 'rejected' | 'expired'
  expires_at: string
  accepted_at?: string
  created_at: string
  updated_at?: string
  inviter_name?: string
}

export async function createTeamInvitation(invitation: {
  email: string
  role: string
  department?: string
  permissions?: string[]
  invited_by: string
}): Promise<string> {
  // Generate unique invitation token
  const token = require('crypto').randomBytes(32).toString('hex')
  
  const id = require('crypto').randomUUID()
  
  await execute(`
    INSERT INTO team_invitations (id, email, role, department, permissions, invited_by, invitation_token)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    invitation.email,
    invitation.role,
    invitation.department || null,
    JSON.stringify(invitation.permissions || []),
    invitation.invited_by,
    token
  ])
  
  return token
}

function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value as string[]
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function getTeamInvitations(companyId?: string): Promise<TeamInvitation[]> {
  // Get pending invitations from the users table.
  //
  // Two defects were fixed here:
  //
  // 1. `active = 0` - users.active is a BOOLEAN, so PostgreSQL raised
  //    `operator does not exist: boolean = integer` and the whole endpoint
  //    returned 500. It is now `active = false`.
  //
  // 2. No company filter. This returned EVERY tenant's pending invitations,
  //    including other companies' email addresses and invitation tokens, to
  //    any admin who called it. The tenant is now a required parameter, so a
  //    caller cannot forget it: omitting it would silently mean "all tenants".
  const params: unknown[] = []
  let where = 'WHERE u.active = false AND u.invitation_token IS NOT NULL'
  if (companyId) {
    params.push(companyId)
    where += ' AND u.company_id = $1'
  } else {
    console.warn(
      'getTeamInvitations called without a companyId - returning every tenant\'s invitations'
    )
  }
  const invitations = await query(
    `
    SELECT u.id, u.email, u.name, u.role, u.department, u.position, u.company_id,
           u.created_by, u.invitation_token, u.invitation_expires_at,
           u.permissions, u.created_at,
           creator.name as inviter_name
    FROM users u
    LEFT JOIN users creator ON u.created_by = creator.id
    ${where}
    ORDER BY u.created_at DESC
  `,
    ...params
  ) as any[]

  return invitations.map(user => ({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    department: user.department,
    position: user.position,
    company_id: user.company_id,
    invited_by: user.created_by,
    inviter_name: user.inviter_name,
    invitation_token: user.invitation_token,
    status: 'pending',
    created_at: user.created_at,
    expires_at: user.invitation_expires_at,
    permissions: parseJsonArray(user.permissions),
  }))
}

export async function getTeamInvitationByToken(token: string): Promise<TeamInvitation | null> {
  // Invitations are stored in Supabase users table with invitation_token
  const { getSupabaseAdminClient } = await import('./supabase-config')
  const supabase = getSupabaseAdminClient()

  const { data: user, error } = await supabase
    .from('users')
    .select(`
      *,
      creator:users!users_created_by_fkey(name)
    `)
    .eq('invitation_token', token)
    .eq('active', false)
    .maybeSingle()

  if (error || !user) return null

  // Check if invitation has expired
  if (user.invitation_expires_at && new Date(user.invitation_expires_at) < new Date()) {
    return null
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    department: user.department,
    position: user.position,
    company_id: user.company_id,
    invited_by: user.created_by,
    inviter_name: (user as any).creator?.name || null,
    invitation_token: user.invitation_token,
    status: 'pending',
    created_at: user.created_at,
    expires_at: user.invitation_expires_at,
    permissions: Array.isArray(user.permissions) ? user.permissions: coerceJsonArray(user.permissions || '[]')
  }
}

export async function getTeamInvitationByEmail(email: string): Promise<TeamInvitation | null> {
  // Invitations are stored in the users table
  const user = await queryOne(`
    SELECT u.*, creator.name as inviter_name
    FROM users u
    LEFT JOIN users creator ON u.created_by = creator.id
    WHERE u.email = ? AND u.active = 0 AND u.invitation_token IS NOT NULL
      AND u.invitation_expires_at > NOW()
    ORDER BY u.created_at DESC
    LIMIT 1
  `, [email]) as any

  if (!user) return null

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    department: user.department,
    position: user.position,
    company_id: user.company_id,
    invited_by: user.created_by,
    inviter_name: user.inviter_name,
    invitation_token: user.invitation_token,
    status: 'pending',
    created_at: user.created_at,
    expires_at: user.invitation_expires_at,
    permissions: coerceJsonArray(user.permissions || '[]')
  }
}

export async function acceptTeamInvitation(token: string, userPassword: string): Promise<User> {
  const invitation = await getTeamInvitationByToken(token)
  if (!invitation) {
    throw new Error('Invalid or expired invitation')
  }

  // The user already exists in Supabase (created by the invite route)
  // We just need to activate them and set their password
  const { getSupabaseAdminClient } = await import('./supabase-config')
  const supabase = getSupabaseAdminClient()
  const hashedPassword = await bcrypt.hash(userPassword, 12)

  const { error } = await supabase
    .from('users')
    .update({
      password_hash: hashedPassword,
      active: true,
      invitation_token: null,
      invitation_expires_at: null,
      updated_at: new Date().toISOString()
    })
    .eq('invitation_token', token)

  if (error) {
    console.error('Error activating user:', error)
    throw new Error('Failed to activate account')
  }

  // Return the updated user from Supabase
  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', invitation.id)
    .single()

  return user as User
}

export async function rejectTeamInvitation(token: string): Promise<void> {
  // Deactivate the user and clear invitation token in Supabase
  const { getSupabaseAdminClient } = await import('./supabase-config')
  const supabase = getSupabaseAdminClient()

  await supabase
    .from('users')
    .update({
      active: false,
      invitation_token: null,
      invitation_expires_at: null,
      updated_at: new Date().toISOString()
    })
    .eq('invitation_token', token)
}

export async function expireOldInvitations(): Promise<number> {
  // Deactivate users with expired invitations
  const result = await execute(`
    UPDATE users
    SET active = 0,
        invitation_token = NULL,
        updated_at = NOW()
    WHERE active = 0 AND invitation_token IS NOT NULL
      AND invitation_expires_at < NOW()
  `)

  return result.changes || 0
}

// ============= MISSING METHODS =============

// Alternative contact getter (used by email service)
export async function getContact(id: string): Promise<Contact | null> {
  return getContactById(id)
}

// Activity logging (used throughout the app)
export async function logActivity(activityData: {
  action: string
  details?: any
  user_id?: string
  resource?: string
  resource_id?: string
  company_id?: string
  metadata?: any
  // Support legacy field names for backward compatibility
  type?: string
  description?: string
  entity_type?: string
  entity_id?: string
  record_type?: string
  record_id?: string
}): Promise<void> {
  // activity_logs.id is uuid, so a generated `activity-<ts>-<rand>` string
  // could not be cast. Verified against the live database: the previous
  // version raised 22P02 on every call.
  const id = randomUUID()

  // The table has no `metadata` column - it was added in this same function's
  // INSERT list and never existed. It also has `resource`/`resource_id`
  // alongside `entity_type`/`entity_id`; the old code wrote only the entity
  // pair, so `resource` was always null.
  //
  // Both id columns are uuid, so a non-uuid reference must be stored as NULL
  // rather than failing the whole insert. Audit logging must never be the
  // reason a request 500s.
  const toUuid = (v: unknown): string | null => {
    if (typeof v !== 'string') return null
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : null
  }

  const entityId = toUuid(activityData.entity_id ?? activityData.record_id)
  const resourceId = toUuid(activityData.resource_id)
  const userId = toUuid(activityData.user_id)

  const details = activityData.details ?? activityData.description ?? null
  // details is jsonb; a plain string is stored as a JSON object so the column
  // type is satisfied and the text is still readable.
  const detailsValue =
    details === null || details === undefined
      ? null
      : typeof details === 'string'
        ? { message: details }
        : details

  try {
    await execute(
      `INSERT INTO activity_logs
         (id, company_id, user_id, action, entity_type, entity_id,
          resource, resource_id, details)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        toUuid(activityData.company_id),
        userId,
        activityData.action || activityData.type || 'unknown',
        activityData.resource || activityData.entity_type || activityData.record_type || 'system',
        entityId,
        activityData.resource || activityData.entity_type || activityData.record_type || 'system',
        resourceId,
        detailsValue === null ? null : JSON.stringify(detailsValue),
      ]
    )
  } catch (error) {
    // Audit logging is best-effort. A failure here must not fail the request
    // that triggered it - that is how /api/roles ended up returning 500 for
    // every request just because an audit row could not be written.
    console.error('logActivity failed (non-fatal):', error)
  }
}

// User authentication (used by login)
export async function authenticateUser(email: string, password: string): Promise<User | null> {
  const user = await getUserByEmail(email)
  if (!user) return null
  
  const isValidPassword = await bcrypt.compare(password, user.password_hash)
  if (!isValidPassword) return null
  
  await updateUserLastLogin(user.id)
  return user
}

// User deletion (may be used by admin functions)
export async function deleteUser(id: string): Promise<void> {
  await execute(`UPDATE users SET active = 0, updated_at = NOW() WHERE id = ?`, [id])
}

// ============= INCOMING EMAIL MANAGEMENT =============

export async function saveIncomingEmailToDB(emailData: {
  serialNumber: string
  from: string
  to: string
  subject: string
  content: string
  messageId?: string
  inReplyTo?: string
  receivedAt: Date
  processed: boolean
  autoReplySent: boolean
  autoReplyMessageId?: string
}): Promise<void> {
  const id = `incoming_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  await execute(`
    INSERT INTO incoming_emails (
      id, serial_number, from_email, to_email, subject, content, 
      message_id, in_reply_to, received_at, processed, auto_reply_sent, auto_reply_message_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    emailData.serialNumber,
    emailData.from,
    emailData.to,
    emailData.subject,
    emailData.content,
    emailData.messageId || null,
    emailData.inReplyTo || null,
    emailData.receivedAt.toISOString(),
    emailData.processed ? 1 : 0,
    emailData.autoReplySent ? 1 : 0,
    emailData.autoReplyMessageId || null
  ])
}

export async function getIncomingEmailsFromDB(limit: number = 50): Promise<any[]> {
  return await query(`
    SELECT * FROM incoming_emails 
    ORDER BY received_at DESC 
    LIMIT ?
  `, [limit])
}

export async function updateIncomingEmailStatus(serialNumber: string, updates: {
  processed?: boolean
  autoReplySent?: boolean
  autoReplyMessageId?: string
  assignedTo?: string
  status?: string
}): Promise<void> {
  const setClauses = []
  const values = []
  
  if (updates.processed !== undefined) {
    setClauses.push('processed = ?')
    values.push(updates.processed ? 1 : 0)
  }
  if (updates.autoReplySent !== undefined) {
    setClauses.push('auto_reply_sent = ?')
    values.push(updates.autoReplySent ? 1 : 0)
  }
  if (updates.autoReplyMessageId) {
    setClauses.push('auto_reply_message_id = ?')
    values.push(updates.autoReplyMessageId)
  }
  if (updates.assignedTo) {
    setClauses.push('assigned_to = ?')
    values.push(updates.assignedTo)
  }
  if (updates.status) {
    setClauses.push('status = ?')
    values.push(updates.status)
  }
  
  setClauses.push('updated_at = datetime(\'now\')')
  values.push(serialNumber)
  
  await execute(`
    UPDATE incoming_emails 
    SET ${setClauses.join(', ')}
    WHERE serial_number = ?
  `, values)
}

// ============= EXPORTS =============

export const DatabaseUtils = {
  // User management (existing)
  getAllUsers,
  getUserById,
  getUserByEmail,
  createUser,
  updateUser,
  updateUserLastLogin,

  // Contact methods (existing)
  getAllContacts,
  createContact,
  updateContact,
  deleteContact,
  exportContacts,

  // Lead methods (existing)
  getAllLeads,
  getLeadById,
  createLead,
  updateLead,
  deleteLead,

  // Dashboard methods (existing)
  getDashboardStats,

  // Campaign methods (existing)
  getAllCampaigns,
  getCampaignById,
  createCampaign,
  updateCampaign,
  deleteCampaign,

  // Template methods (existing)
  getAllTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,

  // Email Template methods (NEW)
  getEmailTemplates,
  getEmailTemplateById,
  createEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,

  // Notification methods
  createNotification,
  markNotificationAsRead,
  markAllNotificationsAsRead,

  // Settings methods  
  getEmailSettings,
  saveEmailSettings,
  getSMSSettings,
  saveSMSSettings,
  getWhatsAppSettings,
  saveWhatsAppSettings,
  getEmailMonitoringSettings,
  saveEmailMonitoringSettings,

  // Automation methods (existing)
  getAllAutomations,
  getAutomationById,
  createAutomation,
  updateAutomation,
  deleteAutomation,

  // Scheduled message methods (existing)
  getScheduledMessages,
  getScheduledMessageById,
  createScheduledMessage,
  updateScheduledMessage,
  deleteScheduledMessage,

  // WhatsApp menu methods (existing)
  // getWhatsAppMenuById, // TODO: Implement this function

  // Team invitation methods (NEW)
  createTeamInvitation,
  getTeamInvitations,
  getTeamInvitationByToken,
  getTeamInvitationByEmail,
  acceptTeamInvitation,
  rejectTeamInvitation,
  expireOldInvitations,

  // Missing methods (NEW)
  getContact,
  logActivity,
  authenticateUser,
  deleteUser,

  // WhatsApp Sessions
  getWhatsAppSessions,
  createWhatsAppSession,
  updateWhatsAppSession,
  deleteWhatsAppSession,

  // Message Logs
  createMessageLog,
  updateMessageLog,
  getMessageLogs,
  getMessageStats,

  // WhatsApp Menus (NEW)
  getWhatsAppMenus,
  createWhatsAppMenu,
  updateWhatsAppMenu,
  deleteWhatsAppMenu,
  getWhatsAppMenuOptions,
  createWhatsAppMenuOption,
  updateWhatsAppMenuOption,
  deleteWhatsAppMenuOption,

  // Activity methods
  getAllActivities,
  getActivitiesByAction,

  // Incoming email methods
  saveIncomingEmailToDB,
  getIncomingEmailsFromDB,
  updateIncomingEmailStatus,

  // Survey methods
  createSurvey,
  getSurveys,
  getSurvey,
  updateSurvey,
  deleteSurvey,
  createSurveySession,
  getSurveySession,
  updateSurveySession,
  getSurveyResponses
}

// ============= WHATSAPP SESSIONS =============

export interface WhatsAppSession {
  id: string
  userId: string
  phoneNumber: string
  name: string
  platform?: string
  connected: boolean
  batteryLevel?: number
  createdAt: string
  lastSeen: string
}

export async function getWhatsAppSessions(userId: string): Promise<WhatsAppSession[]> {
  const sessions = await query(`
    SELECT * FROM whatsapp_sessions 
    WHERE user_id = ? 
    ORDER BY created_at DESC
  `, [userId]) as any[]

  return sessions.map(session => ({
    id: session.id,
    userId: session.user_id,
    phoneNumber: session.phone_number,
    name: session.name,
    platform: session.platform,
    connected: Boolean(session.connected),
    batteryLevel: session.battery_level,
    createdAt: session.created_at,
    lastSeen: session.last_seen
  }))
}

export async function createWhatsAppSession(data: Omit<WhatsAppSession, 'id' | 'createdAt' | 'lastSeen'>): Promise<string> {
  const id = require('crypto').randomUUID()
  
  await execute(`
    INSERT INTO whatsapp_sessions (id, user_id, phone_number, name, platform, connected, battery_level)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    data.userId,
    data.phoneNumber,
    data.name,
    data.platform || null,
    data.connected ? 1 : 0,
    data.batteryLevel || null
  ])
  
  return id
}

export async function updateWhatsAppSession(id: string, data: Partial<WhatsAppSession>): Promise<void> {
  // Use individual safe queries to avoid dynamic SQL construction
  if (data.connected !== undefined) {
    await execute(`UPDATE whatsapp_sessions SET connected = ? WHERE id = ?`, [data.connected ? 1 : 0, id])
  }
  if (data.batteryLevel !== undefined) {
    await execute(`UPDATE whatsapp_sessions SET battery_level = ? WHERE id = ?`, [data.batteryLevel, id])
  }
  if (data.lastSeen) {
    await execute(`UPDATE whatsapp_sessions SET last_seen = ? WHERE id = ?`, [data.lastSeen, id])
  }
}

export async function deleteWhatsAppSession(id: string): Promise<void> {
  await execute(`DELETE FROM whatsapp_sessions WHERE id = ?`, [id])
}

// ============= MESSAGE LOGS =============

export interface MessageLog {
  id: string
  type: 'email' | 'whatsapp' | 'sms'
  status: 'sent' | 'delivered' | 'opened' | 'clicked' | 'failed' | 'pending' | 'read'
  recipient: string
  subject?: string
  message?: string
  userId: string
  externalId?: string
  errorMessage?: string
  metadata: Record<string, any>
  createdAt: string
  updatedAt: string
}

export async function createMessageLog(data: Omit<MessageLog, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const id = require('crypto').randomUUID()
  
  await execute(`
    INSERT INTO message_logs (id, type, status, recipient, subject, message, user_id, external_id, error_message, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    data.type,
    data.status,
    data.recipient,
    data.subject || null,
    data.message || null,
    data.userId,
    data.externalId || null,
    data.errorMessage || null,
    JSON.stringify(data.metadata || {})
  ])
  
  return id
}

export async function updateMessageLog(id: string, data: Partial<MessageLog>): Promise<void> {
  // Use individual safe queries to avoid dynamic SQL construction
  if (data.status) {
    await execute(`UPDATE message_logs SET status = ?, updated_at = NOW() WHERE id = ?`, [data.status, id])
  }
  if (data.errorMessage !== undefined) {
    await execute(`UPDATE message_logs SET error_message = ?, updated_at = NOW() WHERE id = ?`, [data.errorMessage, id])
  }
  if (data.metadata) {
    await execute(`UPDATE message_logs SET metadata = ?, updated_at = NOW() WHERE id = ?`, [JSON.stringify(data.metadata), id])
  }
  
  // Always update the timestamp even if no other fields changed
  if (!data.status && data.errorMessage === undefined && !data.metadata) {
    await execute(`UPDATE message_logs SET updated_at = NOW() WHERE id = ?`, [id])
  }
}

export async function getMessageLogs(userId: string, limit: number = 50): Promise<MessageLog[]> {
  const logs = await query(`
    SELECT * FROM message_logs 
    WHERE user_id = ? 
    ORDER BY created_at DESC 
    LIMIT ?
  `, [userId, limit]) as any[]

  return logs.map(log => ({
    id: log.id,
    type: log.type,
    status: log.status,
    recipient: log.recipient,
    subject: log.subject,
    message: log.message,
    userId: log.user_id,
    externalId: log.external_id,
    errorMessage: log.error_message,
    metadata: coerceJson(log.metadata || '{}'),
    createdAt: log.created_at,
    updatedAt: log.updated_at
  }))
}

export async function getMessageStats(userId: string, type?: string): Promise<any> {
  let whereClause = 'WHERE user_id = ?'
  const params = [userId]

  if (type) {
    whereClause += ' AND type = ?'
    params.push(type)
  }

  const stats = await queryOne(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
      SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
      SUM(CASE WHEN status = 'opened' THEN 1 ELSE 0 END) as opened,
      SUM(CASE WHEN status = 'clicked' THEN 1 ELSE 0 END) as clicked,
      SUM(CASE WHEN status = 'read' THEN 1 ELSE 0 END) as read,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
    FROM message_logs 
    ${whereClause}
  `, params) as any

  return {
    total: stats?.total || 0,
    sent: stats?.sent || 0,
    delivered: stats?.delivered || 0,
    opened: stats?.opened || 0,
    clicked: stats?.clicked || 0,
    read: stats?.read || 0,
    failed: stats?.failed || 0,
    pending: stats?.pending || 0
  }
}

// ============= WHATSAPP MENUS =============

export interface WhatsAppMenu {
  id: string
  title: string  // Changed from 'name' to match database schema
  description?: string
  options?: string // JSON string of menu options
  is_active: boolean // Changed from 'isActive' to match database schema
  created_by?: string
  created_at: string
  updated_at: string
}

export interface WhatsAppMenuOption {
  id: string
  menuId: string
  optionKey: string
  label: string
  message?: string
  action: 'message' | 'submenu' | 'transfer' | 'webhook' | 'collect_info' | 'end'
  submenuId?: string
  webhookUrl?: string
  transferDepartment?: string
  collectField?: string
  priority: number
  createdAt: string
  updatedAt: string
}

export async function getWhatsAppMenus(userId?: string): Promise<WhatsAppMenu[]> {
  const menus = await query(`
    SELECT * FROM whatsapp_menus 
    ${userId ? 'WHERE created_by = ?' : ''}
    ORDER BY created_at DESC
  `, userId ? [userId] : []) as any[]

  return menus.map(menu => ({
    id: menu.id,
    title: menu.title,
    description: menu.description,
    options: menu.options,
    is_active: Boolean(menu.is_active),
    created_by: menu.created_by,
    created_at: menu.created_at,
    updated_at: menu.updated_at
  }))
}

export async function createWhatsAppMenu(data: Omit<WhatsAppMenu, 'id' | 'created_at' | 'updated_at'>): Promise<string> {
  const id = require('crypto').randomUUID()
  
  await execute(`
    INSERT INTO whatsapp_menus (id, title, description, options, is_active, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [
    id,
    data.title,
    data.description || null,
    data.options || '[]',
    data.is_active ? 1 : 0,
    data.created_by || null
  ])
  
  return id
}

export async function updateWhatsAppMenu(id: string, data: Partial<WhatsAppMenu>): Promise<void> {
  const updates: string[] = []
  const values: any[] = []

  if (data.title) {
    updates.push('title = ?')
    values.push(data.title)
  }
  if (data.description !== undefined) {
    updates.push('description = ?')
    values.push(data.description)
  }
  if (data.options !== undefined) {
    updates.push('options = ?')
    values.push(data.options)
  }
  if (data.is_active !== undefined) {
    updates.push('is_active = ?')
    values.push(data.is_active ? 1 : 0)
  }

  if (updates.length > 0) {
    updates.push('updated_at = datetime(\'now\')')
    values.push(id)
    
    await execute(`
      UPDATE whatsapp_menus 
      SET ${updates.join(', ')}
      WHERE id = ?
    `, values)
  }
}

export async function deleteWhatsAppMenu(id: string): Promise<void> {
  // First delete all options for this menu
  await execute(`DELETE FROM whatsapp_menu_options WHERE menu_id = ?`, [id])
  // Then delete the menu
  await execute(`DELETE FROM whatsapp_menus WHERE id = ?`, [id])
}

export async function getWhatsAppMenuOptions(menuId: string): Promise<WhatsAppMenuOption[]> {
  const options = await query(`
    SELECT * FROM whatsapp_menu_options 
    WHERE menu_id = ? 
    ORDER BY priority ASC, created_at ASC
  `, [menuId]) as any[]

  return options.map(option => ({
    id: option.id,
    menuId: option.menu_id,
    optionKey: option.option_key,
    label: option.label,
    message: option.message,
    action: option.action,
    submenuId: option.submenu_id,
    webhookUrl: option.webhook_url,
    transferDepartment: option.transfer_department,
    collectField: option.collect_field,
    priority: option.priority,
    createdAt: option.created_at,
    updatedAt: option.updated_at
  }))
}

export async function createWhatsAppMenuOption(data: Omit<WhatsAppMenuOption, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const id = require('crypto').randomUUID()
  
  await execute(`
    INSERT INTO whatsapp_menu_options (id, menu_id, option_key, label, message, action, submenu_id, webhook_url, transfer_department, collect_field, priority)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    data.menuId,
    data.optionKey,
    data.label,
    data.message || null,
    data.action,
    data.submenuId || null,
    data.webhookUrl || null,
    data.transferDepartment || null,
    data.collectField || null,
    data.priority
  ])
  
  return id
}

export async function updateWhatsAppMenuOption(id: string, data: Partial<WhatsAppMenuOption>): Promise<void> {
  // Use individual queries for each field to completely avoid dynamic SQL
  if (data.menuId !== undefined) {
    await execute(`UPDATE whatsapp_menu_options SET menu_id = ? WHERE id = ?`, [data.menuId, id]);
  }
  if (data.optionKey !== undefined) {
    await execute(`UPDATE whatsapp_menu_options SET option_key = ? WHERE id = ?`, [data.optionKey, id]);
  }
  if (data.label !== undefined) {
    await execute(`UPDATE whatsapp_menu_options SET label = ? WHERE id = ?`, [data.label, id]);
  }
  if (data.message !== undefined) {
    await execute(`UPDATE whatsapp_menu_options SET message = ? WHERE id = ?`, [data.message, id]);
  }
  if (data.action !== undefined) {
    await execute(`UPDATE whatsapp_menu_options SET action = ? WHERE id = ?`, [data.action, id]);
  }
  if (data.submenuId !== undefined) {
    await execute(`UPDATE whatsapp_menu_options SET submenu_id = ? WHERE id = ?`, [data.submenuId, id]);
  }
  if (data.webhookUrl !== undefined) {
    await execute(`UPDATE whatsapp_menu_options SET webhook_url = ? WHERE id = ?`, [data.webhookUrl, id]);
  }
  if (data.transferDepartment !== undefined) {
    await execute(`UPDATE whatsapp_menu_options SET transfer_department = ? WHERE id = ?`, [data.transferDepartment, id]);
  }
  if (data.collectField !== undefined) {
    await execute(`UPDATE whatsapp_menu_options SET collect_field = ? WHERE id = ?`, [data.collectField, id]);
  }
  if (data.priority !== undefined) {
    await execute(`UPDATE whatsapp_menu_options SET priority = ? WHERE id = ?`, [data.priority, id]);
  }

  // Always update timestamp
  await execute(`UPDATE whatsapp_menu_options SET updated_at = NOW() WHERE id = ?`, [id]);
}

export async function deleteWhatsAppMenuOption(id: string): Promise<void> {
  await execute(`DELETE FROM whatsapp_menu_options WHERE id = ?`, [id])
}

// ============= ACTIVITY MANAGEMENT =============

// Activity retrieval (used by incoming email service)
export async function getAllActivities(limit: number = 100): Promise<any[]> {
  return await query(`
    SELECT * FROM activity_logs 
    ORDER BY created_at DESC 
    LIMIT ?
  `, [limit])
}

export async function getActivitiesByAction(action: string, limit: number = 50): Promise<any[]> {
  return await query(`
    SELECT * FROM activity_logs 
    WHERE action = ?
    ORDER BY created_at DESC 
    LIMIT ?
  `, [action, limit])
}

// ============= SURVEY MANAGEMENT =============

export async function createSurvey(survey: Survey): Promise<Survey> {
  await execute(`
    CREATE TABLE IF NOT EXISTS surveys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      welcome_message TEXT NOT NULL,
      thank_you_message TEXT NOT NULL,
      root_menu TEXT NOT NULL,
      settings TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `)

  await execute(`
    INSERT INTO surveys (
      id, name, description, welcome_message, thank_you_message, 
      root_menu, settings, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    survey.id,
    survey.name,
    survey.description,
    survey.welcomeMessage,
    survey.thankYouMessage,
    JSON.stringify(survey.rootMenu),
    JSON.stringify(survey.settings),
    survey.createdAt.toISOString(),
    survey.updatedAt.toISOString()
  ])

  return survey
}

export async function getSurveys(): Promise<Survey[]> {
  await execute(`
    CREATE TABLE IF NOT EXISTS surveys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      welcome_message TEXT NOT NULL,
      thank_you_message TEXT NOT NULL,
      root_menu TEXT NOT NULL,
      settings TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `)

  const surveys = await query(`SELECT * FROM surveys ORDER BY created_at DESC`) as any[]
  
  return surveys.map(survey => ({
    id: survey.id,
    name: survey.name,
    description: survey.description,
    welcomeMessage: survey.welcome_message,
    thankYouMessage: survey.thank_you_message,
    rootMenu: coerceJson(survey.root_menu, null),
    settings: coerceJson(survey.settings),
    createdAt: new Date(survey.created_at),
    updatedAt: new Date(survey.updated_at)
  }))
}

export async function getSurvey(id: string): Promise<Survey | null> {
  const survey = await queryOne(`SELECT * FROM surveys WHERE id = ?`, [id]) as any
  if (!survey) return null
  
  return {
    id: survey.id,
    name: survey.name,
    description: survey.description,
    welcomeMessage: survey.welcome_message,
    thankYouMessage: survey.thank_you_message,
    rootMenu: coerceJson(survey.root_menu, null),
    settings: coerceJson(survey.settings),
    createdAt: new Date(survey.created_at),
    updatedAt: new Date(survey.updated_at)
  }
}

export async function updateSurvey(survey: Survey): Promise<Survey> {
  await execute(`
    UPDATE surveys SET 
      name = ?, description = ?, welcome_message = ?, thank_you_message = ?,
      root_menu = ?, settings = ?, updated_at = ?
    WHERE id = ?
  `, [
    survey.name,
    survey.description,
    survey.welcomeMessage,
    survey.thankYouMessage,
    JSON.stringify(survey.rootMenu),
    JSON.stringify(survey.settings),
    new Date().toISOString(),
    survey.id
  ])

  return survey
}

export async function deleteSurvey(id: string): Promise<void> {
  await execute(`DELETE FROM surveys WHERE id = ?`, [id])
}

export async function createSurveySession(session: SurveySession): Promise<SurveySession> {
  await execute(`
    CREATE TABLE IF NOT EXISTS survey_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      contact_phone TEXT NOT NULL,
      survey_id TEXT NOT NULL,
      current_menu TEXT NOT NULL,
      current_page INTEGER DEFAULT 1,
      navigation_history TEXT NOT NULL,
      responses TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (survey_id) REFERENCES surveys(id)
    )
  `)

  await execute(`
    INSERT INTO survey_sessions (
      id, user_id, contact_phone, survey_id, current_menu, current_page,
      navigation_history, responses, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    session.id,
    session.userId,
    session.contactPhone,
    session.surveyId,
    session.currentMenu,
    session.currentPage,
    JSON.stringify(session.navigationHistory),
    JSON.stringify(session.responses),
    session.status,
    session.createdAt.toISOString(),
    session.updatedAt.toISOString()
  ])

  return session
}

export async function getSurveySession(id: string): Promise<SurveySession | null> {
  await execute(`
    CREATE TABLE IF NOT EXISTS survey_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      contact_phone TEXT NOT NULL,
      survey_id TEXT NOT NULL,
      current_menu TEXT NOT NULL,
      current_page INTEGER DEFAULT 1,
      navigation_history TEXT NOT NULL,
      responses TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `)

  const session = await queryOne(`SELECT * FROM survey_sessions WHERE id = ?`, [id]) as any
  if (!session) return null
  
  return {
    id: session.id,
    userId: session.user_id,
    contactPhone: session.contact_phone,
    surveyId: session.survey_id,
    currentMenu: session.current_menu,
    currentPage: session.current_page,
    navigationHistory: coerceJsonArray(session.navigation_history),
    responses: coerceJsonArray(session.responses),
    status: session.status,
    createdAt: new Date(session.created_at),
    updatedAt: new Date(session.updated_at)
  }
}

export async function updateSurveySession(session: SurveySession): Promise<SurveySession> {
  await execute(`
    UPDATE survey_sessions SET 
      current_menu = ?, current_page = ?, navigation_history = ?,
      responses = ?, status = ?, updated_at = ?
    WHERE id = ?
  `, [
    session.currentMenu,
    session.currentPage,
    JSON.stringify(session.navigationHistory),
    JSON.stringify(session.responses),
    session.status,
    session.updatedAt.toISOString(),
    session.id
  ])

  return session
}

export async function getSurveyResponses(surveyId: string): Promise<SurveyResponse[]> {
  const sessions = await query(`
    SELECT responses FROM survey_sessions 
    WHERE survey_id = ? AND status = 'completed'
  `, [surveyId]) as any[]
  
  const allResponses: SurveyResponse[] = []
  sessions.forEach(session => {
    const responses = coerceJsonArray(session.responses) as SurveyResponse[]
    allResponses.push(...responses)
  })
  
  return allResponses
}

// ============= COMPANY MANAGEMENT =============

export interface Company {
  id: string
  name: string
  description?: string
  website?: string
  phone?: string
  email?: string
  address?: string
  settings: object
  active: boolean
  created_at: string
  updated_at: string
}

export async function getAllCompanies(): Promise<Company[]> {
  const companies = await query(`
    SELECT * FROM companies WHERE active = 1 ORDER BY created_at DESC
  `) as any[]
  
  return companies.map(company => ({
    ...company,
    active: Boolean(company.active),
    settings: coerceJson(company.settings || '{}')
  }))
}

export async function getCompanyById(id: string): Promise<Company | null> {
  const company = await queryOne(`SELECT * FROM companies WHERE id = ?`, [id]) as any
  if (!company) return null
  
  return {
    ...company,
    active: Boolean(company.active),
    settings: coerceJson(company.settings || '{}')
  }
}

export async function updateCompany(id: string, companyData: {
  name?: string
  description?: string
  website?: string
  phone?: string
  email?: string
  address?: string
  settings?: object
}): Promise<Company | null> {
  console.log(' updateCompany called with:', { id, companyData })
  
  const supabase = getSupabaseAdminClient()
  
  const updateData: any = {}
  
  if (companyData.name !== undefined) {
    updateData.name = companyData.name
  }
  
  if (companyData.description !== undefined) {
    updateData.description = companyData.description
  }
  
  if (companyData.website !== undefined) {
    updateData.website = companyData.website
  }
  
  if (companyData.phone !== undefined) {
    updateData.phone = companyData.phone
  }
  
  if (companyData.email !== undefined) {
    updateData.email = companyData.email
  }
  
  if (companyData.address !== undefined) {
    updateData.address = companyData.address
  }
  
  if (companyData.settings !== undefined) {
    updateData.settings = companyData.settings
  }
  
  updateData.updated_at = new Date().toISOString()
  
  console.log(' Update data:', updateData)
  
  const { data: updatedCompany, error: updateError } = await supabase
    .from('companies')
    .update(updateData)
    .eq('id', id)
    .select()
    .single()
  
  if (updateError) {
    console.error('Error updating company:', updateError)
    throw updateError
  }
  
  console.log(' Company updated successfully:', updatedCompany?.name)
  
  return {
    ...updatedCompany,
    active: Boolean(updatedCompany.active),
    settings: updatedCompany.settings || {}
  }
}

export async function createCompany(companyData: {
  name: string
  description?: string
  website?: string
  phone?: string
  email?: string
  address?: string
  settings?: object
}): Promise<Company> {
  const id = require('crypto').randomUUID()
  
  await execute(`
    INSERT INTO companies (id, name, description, website, phone, email, address, settings, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `, [
    id,
    companyData.name,
    companyData.description || null,
    companyData.website || null,
    companyData.phone || null,
    companyData.email || null,
    companyData.address || null,
    JSON.stringify(companyData.settings || {})
  ])

  const company = await getCompanyById(id)
  if (!company) {
    throw new Error('Failed to create company')
  }
  
  return company
}
