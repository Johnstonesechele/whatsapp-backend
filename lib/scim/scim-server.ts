import { getSupabaseAdminClient } from '@/backend/database/supabase-config'

const supabase = getSupabaseAdminClient()

export interface SCIMUser {
  schemas: string[]
  id: string
  externalId: string
  userName: string
  name: { familyName: string; givenName: string }
  displayName: string
  active: boolean
  emails: Array<{ value: string; primary: boolean }>
  groups: Array<{ value: string; display: string }>
  meta: { resourceType: string; created: string; lastModified: string; location: string }
}

export interface SCIMGroup {
  schemas: string[]
  id: string
  externalId: string
  displayName: string
  members: Array<{ value: string; display: string }>
  meta: { resourceType: string; created: string; lastModified: string }
}

const SCIM_USER_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User'
const SCIM_GROUP_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:Group'

export function toSCIMUser(user: any, baseUrl: string): SCIMUser {
  const nameParts = (user.name || '').split(' ')
  return {
    schemas: [SCIM_USER_SCHEMA],
    id: user.id,
    externalId: user.external_id || user.id,
    userName: user.email,
    name: {
      familyName: nameParts.slice(1).join(' ') || '',
      givenName: nameParts[0] || ''
    },
    displayName: user.name || user.email,
    active: user.active !== false,
    emails: [{ value: user.email, primary: true }],
    groups: user.department_id ? [{ value: user.department_id, display: '' }] : [],
    meta: {
      resourceType: 'User',
      created: user.created_at,
      lastModified: user.updated_at || user.created_at,
      location: `${baseUrl}/scim/v2/Users/${user.id}`
    }
  }
}

export function toSCIMGroup(dept: any, baseUrl: string): SCIMGroup {
  return {
    schemas: [SCIM_GROUP_SCHEMA],
    id: dept.id,
    externalId: dept.id,
    displayName: dept.name,
    members: [],
    meta: {
      resourceType: 'Group',
      created: dept.created_at,
      lastModified: dept.updated_at || dept.created_at
    }
  }
}

export async function listUsers(
  companyId: string,
  startIndex: number = 1,
  pageSize: number = 50,
  filter?: string
): Promise<{ users: SCIMUser[]; totalResults: number }> {
  let query = supabase
    .from('users')
    .select('*', { count: 'exact' })
    .eq('company_id', companyId)
    .order('created_at', { ascending: true })

  if (filter) {
    const emailMatch = filter.match(/userName eq "([^"]+)"/)
    if (emailMatch) {
      query = query.eq('email', emailMatch[1])
    }
    const activeMatch = filter.match(/active eq (true|false)/)
    if (activeMatch) {
      query = query.eq('active', activeMatch[1] === 'true')
    }
  }

  const { data, count: totalResults } = await query.range(startIndex - 1, startIndex + pageSize - 2)

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return {
    users: (data || []).map(u => toSCIMUser(u, baseUrl)),
    totalResults: totalResults || 0
  }
}

export async function getUser(userId: string, companyId: string): Promise<SCIMUser | null> {
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .eq('company_id', companyId)
    .single()

  if (!data) return null
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return toSCIMUser(data, baseUrl)
}

export async function createUser(
  companyId: string,
  scimData: { userName: string; name: { givenName: string; familyName: string }; active: boolean; emails: Array<{ value: string }> }
): Promise<SCIMUser | null> {
  const email = scimData.emails?.[0]?.value || scimData.userName
  const name = `${scimData.name?.givenName || ''} ${scimData.name?.familyName || ''}`.trim()

  const { data, error } = await supabase
    .from('users')
    .insert({
      email,
      name: name || email,
      active: scimData.active !== false,
      company_id: companyId,
      role: 'team-member',
      auth_provider: 'scim',
      permissions: JSON.stringify(['contacts.view', 'leads.view', 'deals.view'])
    })
    .select()
    .single()

  if (error || !data) return null
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return toSCIMUser(data, baseUrl)
}

export async function updateUser(
  userId: string,
  companyId: string,
  scimData: { active?: boolean; name?: { givenName: string; familyName: string } }
): Promise<SCIMUser | null> {
  const updateData: Record<string, any> = { updated_at: new Date().toISOString() }

  if (scimData.active !== undefined) updateData.active = scimData.active
  if (scimData.name) {
    updateData.name = `${scimData.name.givenName} ${scimData.name.familyName}`.trim()
  }

  const { data, error } = await supabase
    .from('users')
    .update(updateData)
    .eq('id', userId)
    .eq('company_id', companyId)
    .select()
    .single()

  if (error || !data) return null
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return toSCIMUser(data, baseUrl)
}

export async function deprovisionUser(userId: string, companyId: string): Promise<boolean> {
  const { error } = await supabase
    .from('users')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .eq('company_id', companyId)

  return !error
}

export async function listGroups(companyId: string): Promise<SCIMGroup[]> {
  const { data } = await supabase
    .from('departments')
    .select('*')
    .eq('company_id', companyId)
    .order('name')

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return (data || []).map(d => toSCIMGroup(d, baseUrl))
}

export async function getGroup(groupId: string, companyId: string): Promise<SCIMGroup | null> {
  const { data } = await supabase
    .from('departments')
    .select('*')
    .eq('id', groupId)
    .eq('company_id', companyId)
    .single()

  if (!data) return null
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return toSCIMGroup(data, baseUrl)
}

export async function createGroup(
  companyId: string,
  displayName: string
): Promise<SCIMGroup | null> {
  const { data, error } = await supabase
    .from('departments')
    .insert({ company_id: companyId, name: displayName })
    .select()
    .single()

  if (error || !data) return null
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return toSCIMGroup(data, baseUrl)
}

export async function validateSCIMToken(request: Request): Promise<string | null> {
  const authHeader = request.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.substring(7)

  const { data: config } = await supabase
    .from('scim_configurations')
    .select('company_id, is_enabled')
    .eq('bearer_token_encrypted', token)
    .eq('is_enabled', true)
    .single()

  if (!config) return null
  return config.company_id
}

export function getServiceProviderConfig() {
  return {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
    patch: { supported: true },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: 1000 },
    changePassword: { supported: false },
    sort: { supported: false },
    etag: { supported: false },
    authenticationSchemes: [{ type: 'bearer', name: 'Bearer', description: 'Bearer token authentication', specUri: 'https://www.rfc-editor.org/info/rfc6750' }]
  }
}

export function getSchemas() {
  return {
    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
    totalResults: 2,
    Resources: [
      { id: SCIM_USER_SCHEMA, name: 'User', description: 'User Schema', attributes: {} },
      { id: SCIM_GROUP_SCHEMA, name: 'Group', description: 'Group Schema', attributes: {} }
    ]
  }
}
