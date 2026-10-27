/**
 * Role vocabulary, in one place.
 *
 * The app had drifted: `admin` vs `system-admin` vs `super_admin`, and
 * `company_manager` vs `company-manager` vs `company_admin`, all appearing
 * in different route files. Two users with the company_manager role exist in
 * the live database and were being refused by /api/api-keys, which allowed
 * only ['system-admin','super_admin','admin'].
 *
 * Roles are compared case- and separator-insensitively so that
 * 'company_manager', 'company-manager' and 'CompanyManager' are one role.
 * That tolerance is deliberate: the data has been inconsistent for long
 * enough that guessing wrong here locks a real user out of their own tenant.
 */

const NORMALISE = (r: string) => r.trim().toLowerCase().replace(/[-_\s]/g, '')

/** Canonical role names as they appear in the live users table. */
export const ROLES = {
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin',
  SYSTEM_ADMIN: 'system_admin',
  COMPANY_MANAGER: 'company_manager',
  SALES_MANAGER: 'sales_manager',
  MARKETING_MANAGER: 'marketing_manager',
  SALES_REP: 'sales_rep',
  TEAM_MEMBER: 'team_member',
  VIEWER: 'viewer',
} as const

export type RoleName = (typeof ROLES)[keyof typeof ROLES]

/** Roles that may administer their own tenant, including its API keys. */
const TENANT_ADMIN_ROLES = new Set(
  [ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.SYSTEM_ADMIN, ROLES.COMPANY_MANAGER].map(NORMALISE)
)

/** Roles that may administer across tenants. */
const PLATFORM_ADMIN_ROLES = new Set(
  [ROLES.SUPER_ADMIN, ROLES.SYSTEM_ADMIN].map(NORMALISE)
)

export function isTenantAdmin(role: string | null | undefined): boolean {
  if (!role) return false
  return TENANT_ADMIN_ROLES.has(NORMALISE(role))
}

export function isPlatformAdmin(role: string | null | undefined): boolean {
  if (!role) return false
  return PLATFORM_ADMIN_ROLES.has(NORMALISE(role))
}

/**
 * Is `role` at least as privileged as `required`?
 *
 * Used where a route wants a floor rather than a list. Ordering runs from
 * most to least privileged; a role not in the ladder is not granted.
 */
const LADDER: string[] = [
  NORMALISE(ROLES.SUPER_ADMIN),
  NORMALISE(ROLES.SYSTEM_ADMIN),
  NORMALISE(ROLES.ADMIN),
  NORMALISE(ROLES.COMPANY_MANAGER),
  NORMALISE(ROLES.SALES_MANAGER),
  NORMALISE(ROLES.MARKETING_MANAGER),
  NORMALISE(ROLES.SALES_REP),
  NORMALISE(ROLES.TEAM_MEMBER),
  NORMALISE(ROLES.VIEWER),
]

export function roleAtLeast(role: string | null | undefined, required: RoleName): boolean {
  if (!role) return false
  const r = NORMALISE(role)
  const from = LADDER.indexOf(r)
  const to = LADDER.indexOf(NORMALISE(required))
  if (from < 0 || to < 0) return false
  return from <= to
}
