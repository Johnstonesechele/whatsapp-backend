import { NextResponse } from 'next/server'

/**
 * Validate an assignee before it is written.
 *
 * WHY THIS EXISTS
 *
 * `assigned_to` columns are plain `REFERENCES users(id)`. That constraint
 * proves the id names a real user; it says nothing about WHICH TENANT that
 * user belongs to. So a task could be assigned to a user in a different
 * company and the database would accept it happily.
 *
 * That was demonstrated against the live app: creating a task with
 * assigned_to set to a user in another tenant returned 201, and the task
 * then also fired a notification into that other tenant's user. The task's
 * own company_id stayed correct, so the leak was in the assignment and the
 * notification rather than the row - which is exactly the kind of bug a
 * foreign-key check will never catch.
 *
 * The rule: an assignee must be an ACTIVE user in the SAME company as the
 * caller. Rejecting with 400 rather than silently dropping the assignee,
 * because a caller who asked to assign someone and got no error would
 * reasonably believe the task is assigned when it is not.
 */

export type AssigneeCheck =
  | { ok: true; assignee: { id: string; name: string | null } | null }
  | { ok: false; response: NextResponse }

/**
 * @param supabase   a Supabase client
 * @param assigneeId the requested assignee, or null/undefined for "unassigned"
 * @param companyId  the tenant the work belongs to
 */
export async function validateAssignee(
  supabase: any,
  assigneeId: unknown,
  companyId: string
): Promise<AssigneeCheck> {
  // Absent means unassigned, which is legitimate - not an error.
  if (assigneeId === null || assigneeId === undefined || assigneeId === '') {
    return { ok: true, assignee: null }
  }

  if (typeof assigneeId !== 'string' || !/^[0-9a-f-]{36}$/i.test(assigneeId)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Invalid assignee id' },
        { status: 400 }
      ),
    }
  }

  const { data, error } = await supabase
    .from('users')
    .select('id, name, company_id, active')
    .eq('id', assigneeId)
    .maybeSingle()

  if (error) {
    console.error('Assignee lookup failed:', error)
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Failed to verify assignee' },
        { status: 500 }
      ),
    }
  }

  if (!data) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Assignee not found' },
        { status: 400 }
      ),
    }
  }

  // The load-bearing check. A user id from another company is refused here.
  if (data.company_id !== companyId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Assignee is not a member of this company' },
        { status: 400 }
      ),
    }
  }

  if (!data.active) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Assignee is not an active member' },
        { status: 400 }
      ),
    }
  }

  return { ok: true, assignee: { id: data.id, name: data.name ?? null } }
}
