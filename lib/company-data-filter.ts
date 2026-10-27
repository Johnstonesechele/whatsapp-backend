import jwt from 'jsonwebtoken'

interface User {
  id: string
  name: string
  email: string
  role: string
  company_id?: string
  permissions: string[]
}

/**
 * Utility class for ensuring all calculations and data operations
 * are properly filtered by company context
 */
export class CompanyDataFilter {
  /**
   * Extract company ID from JWT token
   */
  static extractCompanyFromToken(token: string): string | null {
    try {
      const jwtSecret = process.env.JWT_SECRET
      if (!jwtSecret) {
        console.error('JWT_SECRET not configured')
        return null
      }

      const decoded = jwt.verify(token, jwtSecret) as any
      return decoded.companyId || decoded.company_id || null
    } catch (error) {
      console.error('Failed to extract company from token:', error)
      return null
    }
  }

  /**
   * Validate that user has access to specific company data
   */
  static async validateCompanyAccess(
    userId: string, 
    targetCompanyId: string, 
    db: any
  ): Promise<boolean> {
    try {
      const user = db.prepare('SELECT role, company_id FROM users WHERE id = ? AND active = 1')
        .get(userId) as User | undefined

      if (!user) {
        return false
      }

      // System admins can access all companies (handle all role name variations)
      if (user.role === 'system_admin' || user.role === 'super_admin' || user.role === 'system-admin') {
        return true
      }

      // Other users can only access their own company data
      return user.company_id === targetCompanyId
    } catch (error) {
      console.error('Failed to validate company access:', error)
      return false
    }
  }

  /**
   * Add company filter to SQL query
   */
  static addCompanyFilter(
    query: string, 
    params: any[], 
    companyId: string | null,
    tableAlias?: string
  ): { query: string; params: any[] } {
    if (!companyId) {
      return { query, params }
    }

    const column = tableAlias ? `${tableAlias}.company_id` : 'company_id'
    
    // Check if WHERE clause already exists
    const hasWhere = query.toLowerCase().includes('where')
    const connector = hasWhere ? ' AND' : ' WHERE'
    
    return {
      query: `${query}${connector} ${column} = ?`,
      params: [...params, companyId]
    }
  }

  /**
   * Filter array of data objects by company
   */
  static filterDataByCompany<T extends { company_id?: string }>(
    data: T[], 
    companyId: string | null
  ): T[] {
    if (!companyId) {
      return data
    }

    return data.filter(item => item.company_id === companyId)
  }

  /**
   * Calculate metrics for company-specific data
   */
  static calculateCompanyMetrics(data: {
    contacts?: any[]
    leads?: any[]
    campaigns?: any[]
    deals?: any[]
  }, companyId: string | null) {
    // Filter all data by company first
    const filteredData = {
      contacts: this.filterDataByCompany(data.contacts || [], companyId),
      leads: this.filterDataByCompany(data.leads || [], companyId),
      campaigns: this.filterDataByCompany(data.campaigns || [], companyId),
      deals: this.filterDataByCompany(data.deals || [], companyId)
    }

    return {
      // Contact metrics
      totalContacts: filteredData.contacts.length,
      activeContacts: filteredData.contacts.filter(c => c.status === 'active').length,
      
      // Lead metrics
      totalLeads: filteredData.leads.length,
      newLeads: filteredData.leads.filter(l => l.status === 'new').length,
      qualifiedLeads: filteredData.leads.filter(l => l.status === 'qualified').length,
      closedWonLeads: filteredData.leads.filter(l => l.status === 'closed_won').length,
      
      // Lead conversion rate (only for this company's data)
      leadConversionRate: filteredData.leads.length > 0 
        ? (filteredData.leads.filter(l => l.status === 'closed_won').length / filteredData.leads.length * 100)
        : 0,
      
      // Campaign metrics
      totalCampaigns: filteredData.campaigns.length,
      activeCampaigns: filteredData.campaigns.filter(c => c.status === 'active').length,
      
      // Revenue metrics (from deals/leads)
      totalRevenue: filteredData.deals?.reduce((sum, deal) => 
        sum + (parseFloat(deal.value || '0')), 0) || 0,
      
      // Pipeline value
      pipelineValue: filteredData.leads.reduce((sum, lead) => 
        sum + (parseFloat(lead.value || '0')), 0),
      
      // Response rates (company-specific)
      campaignResponseRate: this.calculateCampaignResponseRate(filteredData.campaigns),
      
      // Monthly performance (company-specific)
      monthlyMetrics: this.calculateMonthlyMetrics(filteredData)
    }
  }

  /**
   * Calculate campaign response rate for company data
   */
  private static calculateCampaignResponseRate(campaigns: any[]): number {
    if (campaigns.length === 0) return 0
    
    const totalSent = campaigns.reduce((sum, c) => sum + (c.sent || 0), 0)
    const totalResponses = campaigns.reduce((sum, c) => sum + (c.responded || 0), 0)
    
    return totalSent > 0 ? (totalResponses / totalSent * 100) : 0
  }

  /**
   * Calculate monthly metrics for company data
   */
  private static calculateMonthlyMetrics(data: any): any {
    const now = new Date()
    const currentMonth = now.getMonth()
    const currentYear = now.getFullYear()
    
    const currentMonthData = {
      contacts: data.contacts.filter((c: any) => {
        const created = new Date(c.created_at)
        return created.getMonth() === currentMonth && created.getFullYear() === currentYear
      }),
      leads: data.leads.filter((l: any) => {
        const created = new Date(l.created_at)
        return created.getMonth() === currentMonth && created.getFullYear() === currentYear
      })
    }
    
    return {
      newContacts: currentMonthData.contacts.length,
      newLeads: currentMonthData.leads.length,
      conversionRate: currentMonthData.leads.length > 0 
        ? (currentMonthData.leads.filter((l: any) => l.status === 'closed_won').length / currentMonthData.leads.length * 100)
        : 0
    }
  }

  /**
   * Ensure analytics data is company-scoped
   */
  static validateAnalyticsScope(
    analyticsData: any, 
    expectedCompanyId: string | null
  ): boolean {
    if (!expectedCompanyId) {
      return true // System admin can see all data
    }

    // Check if all data items have the correct company_id
    const allDataArrays = [
      analyticsData.contacts || [],
      analyticsData.leads || [],
      analyticsData.campaigns || [],
      analyticsData.deals || []
    ]

    for (const dataArray of allDataArrays) {
      for (const item of dataArray) {
        if (item.company_id && item.company_id !== expectedCompanyId) {
          console.error('Data contains records from wrong company:', {
            expected: expectedCompanyId,
            found: item.company_id,
            itemId: item.id
          })
          return false
        }
      }
    }

    return true
  }
}

/**
 * Middleware function to ensure API endpoints filter by company
 */
export function withCompanyFilter(handler: any) {
  return async (request: any, context?: any) => {
    try {
      // Extract token and company
      const authHeader = request.headers.get('authorization')
      if (!authHeader?.startsWith('Bearer ')) {
        return new Response(JSON.stringify({ error: 'Authentication required' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      const token = authHeader.substring(7)
      const companyId = CompanyDataFilter.extractCompanyFromToken(token)
      
      // Add company context to request
      ;(request as any).companyId = companyId
      
      return await handler(request, context)
    } catch (error) {
      console.error('Company filter middleware error:', error)
      return new Response(JSON.stringify({ error: 'Authorization failed' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }
}
