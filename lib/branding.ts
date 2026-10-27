import { getSupabaseAdminClient } from '@/backend/database/supabase-config'

const supabase = getSupabaseAdminClient()

export interface CompanyBranding {
  id: string
  company_id: string
  custom_domain: string | null
  custom_domain_verified: boolean
  logo_url: string | null
  favicon_url: string | null
  primary_color: string
  secondary_color: string
  accent_color: string
  background_color: string
  text_color: string
  font_family: string
  login_background_url: string | null
  email_from_name: string | null
  email_from_address: string | null
  email_header_html: string | null
  email_footer_html: string | null
  login_page_title: string | null
  login_page_subtitle: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

const DEFAULT_BRANDING: Partial<CompanyBranding> = {
  primary_color: '#3b82f6',
  secondary_color: '#1e40af',
  accent_color: '#10b981',
  background_color: '#ffffff',
  text_color: '#1f2937',
  font_family: 'Inter'
}

export async function getBranding(companyId: string): Promise<CompanyBranding | null> {
  const { data, error } = await supabase
    .from('company_branding')
    .select('*')
    .eq('company_id', companyId)
    .single()

  if (error || !data) return null
  return data
}

export async function getBrandingByDomain(domain: string): Promise<CompanyBranding | null> {
  const { data } = await supabase
    .from('company_branding')
    .select('*')
    .eq('custom_domain', domain)
    .eq('custom_domain_verified', true)
    .eq('is_active', true)
    .single()

  return data || null
}

export async function upsertBranding(
  companyId: string,
  input: Partial<Omit<CompanyBranding, 'id' | 'company_id' | 'created_at' | 'updated_at'>>
): Promise<CompanyBranding> {
  const { data: existing } = await supabase
    .from('company_branding')
    .select('id')
    .eq('company_id', companyId)
    .single()

  if (existing) {
    const { data, error } = await supabase
      .from('company_branding')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single()

    if (error) throw error
    return data
  }

  const { data, error } = await supabase
    .from('company_branding')
    .insert({
      company_id: companyId,
      ...DEFAULT_BRANDING,
      ...input
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export function generateCSSVariables(branding: CompanyBranding): string {
  return `
    :root {
      --brand-primary: ${branding.primary_color};
      --brand-secondary: ${branding.secondary_color};
      --brand-accent: ${branding.accent_color};
      --brand-background: ${branding.background_color};
      --brand-text: ${branding.text_color};
      --brand-font: '${branding.font_family}', sans-serif;
    }
  `
}

export async function resolveBrandingFromRequest(request: Request): Promise<CompanyBranding | null> {
  const host = request.headers.get('host')
  if (!host) return null

  const domain = host.split(':')[0]
  if (domain === 'localhost' || domain.includes('vercel.app') || domain.includes('netlify.app')) {
    return null
  }

  return getBrandingByDomain(domain)
}
