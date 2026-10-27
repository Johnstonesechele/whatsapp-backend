import { getSupabaseAdminClient } from '@/backend/database/supabase-config'

const supabase = getSupabaseAdminClient()

export interface Department {
  id: string
  company_id: string
  parent_id: string | null
  name: string
  description: string | null
  head_user_id: string | null
  budget: number | null
  member_count: number
  metadata: Record<string, any>
  created_at: string
  updated_at: string
  children?: Department[]
  head_name?: string
}

export interface DepartmentTreeNode extends Department {
  children: DepartmentTreeNode[]
}

export async function getDepartments(companyId: string): Promise<Department[]> {
  const { data, error } = await supabase
    .from('departments')
    .select('*')
    .eq('company_id', companyId)
    .order('name')

  if (error) throw error
  return (data || []).map(d => ({
    ...d,
    metadata: typeof d.metadata === 'object' ? d.metadata : JSON.parse(d.metadata || '{}')
  }))
}

export async function getDepartmentById(deptId: string, companyId: string): Promise<Department | null> {
  const { data } = await supabase
    .from('departments')
    .select('*')
    .eq('id', deptId)
    .eq('company_id', companyId)
    .single()

  if (!data) return null
  return {
    ...data,
    metadata: typeof data.metadata === 'object' ? data.metadata : JSON.parse(data.metadata || '{}')
  }
}

export async function createDepartment(
  companyId: string,
  input: { name: string; description?: string; parent_id?: string; head_user_id?: string; budget?: number }
): Promise<Department> {
  const { data, error } = await supabase
    .from('departments')
    .insert({
      company_id: companyId,
      name: input.name,
      description: input.description || null,
      parent_id: input.parent_id || null,
      head_user_id: input.head_user_id || null,
      budget: input.budget || null,
      member_count: 0
    })
    .select()
    .single()

  if (error) throw error
  return { ...data, metadata: typeof data.metadata === 'object' ? data.metadata : {} }
}

export async function updateDepartment(
  deptId: string,
  companyId: string,
  input: Partial<{ name: string; description: string; parent_id: string; head_user_id: string; budget: number }>
): Promise<Department> {
  const updateData: Record<string, any> = { updated_at: new Date().toISOString() }
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) updateData[key] = value
  }

  const { data, error } = await supabase
    .from('departments')
    .update(updateData)
    .eq('id', deptId)
    .eq('company_id', companyId)
    .select()
    .single()

  if (error) throw error
  return { ...data, metadata: typeof data.metadata === 'object' ? data.metadata : {} }
}

export async function deleteDepartment(deptId: string, companyId: string): Promise<boolean> {
  const { error } = await supabase
    .from('departments')
    .delete()
    .eq('id', deptId)
    .eq('company_id', companyId)

  return !error
}

export async function getDepartmentMembers(deptId: string, companyId: string): Promise<any[]> {
  const { data } = await supabase
    .from('users')
    .select('id, name, email, role, department_id')
    .eq('company_id', companyId)
    .eq('department_id', deptId)

  return data || []
}

export async function assignUserToDepartment(
  userId: string,
  deptId: string,
  companyId: string
): Promise<boolean> {
  const { error } = await supabase
    .from('users')
    .update({ department_id: deptId, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .eq('company_id', companyId)

  return !error
}

export async function removeUserFromDepartment(userId: string, companyId: string): Promise<boolean> {
  const { error } = await supabase
    .from('users')
    .update({ department_id: null, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .eq('company_id', companyId)

  return !error
}

export function buildDepartmentTree(departments: Department[]): DepartmentTreeNode[] {
  const map = new Map<string, DepartmentTreeNode>()
  const roots: DepartmentTreeNode[] = []

  for (const dept of departments) {
    map.set(dept.id, { ...dept, children: [] })
  }

  for (const dept of departments) {
    const node = map.get(dept.id)!
    if (dept.parent_id && map.has(dept.parent_id)) {
      map.get(dept.parent_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  return roots
}

export async function getDepartmentHierarchy(companyId: string): Promise<DepartmentTreeNode[]> {
  const departments = await getDepartments(companyId)
  return buildDepartmentTree(departments)
}
