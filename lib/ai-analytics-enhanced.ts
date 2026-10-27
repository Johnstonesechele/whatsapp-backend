// Enhanced AI Analytics Service with Real Data Processing
import { GoogleGenerativeAI } from '@google/generative-ai'

interface MistralMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface MistralResponse {
  choices: Array<{
    message: {
      content: string
    }
  }>
}

interface AIAnalyticsRequest {
  data: {
    contacts: any[]
    leads: any[]
    campaigns: any[]
  }
  query?: string
  analysisType: 'insights' | 'predictions' | 'recommendations' | 'custom'
}

export interface AIInsight {
  id: string
  type: 'prediction' | 'recommendation' | 'alert' | 'trend'
  title: string
  description: string
  confidence: number
  impact: 'high' | 'medium' | 'low'
  actionable: boolean
  data?: any
}

class EnhancedAIAnalyticsService {
  private genAI: GoogleGenerativeAI | null = null
  private mistralApiKey: string | null = null

  constructor() {
    console.log('Enhanced AI Analytics Service initializing...')
    
    if (process.env.MISTRAL_API_KEY) {
      this.mistralApiKey = process.env.MISTRAL_API_KEY
      console.log('Mistral AI configured for fallback testing')
    }
    
    if (process.env.GEMINI_API_KEY) {
      this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
      console.log('Gemini AI configured for fallback testing')
    }
    
    console.log('Primary mode: Enhanced rule-based analysis with real system data')
  }

  /**
   * Main entry point - uses enhanced rule-based analysis with real data
   */
  async generateInsights(request: AIAnalyticsRequest): Promise<AIInsight[]> {
    try {
      const { data, query, analysisType } = request
      
      console.log('Processing analytics request:', {
        analysisType,
        hasQuery: !!query,
        dataStats: {
          contacts: data.contacts?.length || 0,
          leads: data.leads?.length || 0,
          campaigns: data.campaigns?.length || 0
        }
      })
      
      // Always use enhanced rule-based analysis for reliability
      return await this.generateEnhancedRuleBasedInsights(data, query || '', analysisType)
      
    } catch (error) {
      console.error('Analytics service error:', error)
      return this.getFallbackInsights()
    }
  }

  /**
   * Enhanced rule-based insights using comprehensive data analysis
   */
  private async generateEnhancedRuleBasedInsights(data: any, query: string, analysisType: string): Promise<AIInsight[]> {
    console.log('Generating enhanced insights from real system data...')
    const { contacts, leads, campaigns } = data
    const insights: AIInsight[] = []

    try {
      // Ensure data is properly formatted
      const contactsArray = Array.isArray(contacts) ? contacts : []
      const leadsArray = Array.isArray(leads) ? leads : []
      const campaignsArray = Array.isArray(campaigns) ? campaigns : []

      console.log('Processing real data:', {
        contacts: contactsArray.length,
        leads: leadsArray.length,
        campaigns: campaignsArray.length
      })

      // 1. Critical Business Metrics
      insights.push(...this.analyzeConversionMetrics(leadsArray))
      
      // 2. Lead Source Performance
      insights.push(...this.analyzeLeadSourcePerformance(leadsArray))
      
      // 3. Pipeline Health Analysis  
      insights.push(...this.analyzePipelineHealth(leadsArray))
      
      // 4. Revenue Opportunities
      insights.push(...this.analyzeRevenueOpportunities(leadsArray))
      
      // 5. Contact Database Analysis
      insights.push(...this.analyzeContactDatabase(contactsArray))
      
      // 6. Campaign Performance
      insights.push(...this.analyzeCampaignPerformance(campaignsArray))
      
      // 7. Risk Analysis
      insights.push(...this.analyzeBusinessRisks(leadsArray, campaignsArray))
      
      // 8. Growth Opportunities
      insights.push(...this.analyzeGrowthOpportunities(leadsArray, contactsArray))

      // 9. Custom Query Analysis (if provided)
      if (query && query.trim()) {
        insights.push(...this.analyzeCustomQuery(query, { contacts: contactsArray, leads: leadsArray, campaigns: campaignsArray }))
      }

      console.log(`Generated ${insights.length} enhanced insights from real data`)
      return insights.slice(0, 10) // Limit to top 10 insights

    } catch (error) {
      console.error('Error in enhanced analysis:', error)
      return this.getFallbackInsights()
    }
  }

  // Enhanced Analysis Functions

  private analyzeConversionMetrics(leads: any[]): AIInsight[] {
    const insights: AIInsight[] = []
    if (!leads || leads.length === 0) {
      insights.push({
        id: `no-leads-${Date.now()}`,
        type: 'alert',
        title: 'No Lead Data Available',
        description: 'No leads found in your system. Start by importing or creating leads to track your sales pipeline performance.',
        confidence: 100,
        impact: 'high',
        actionable: true,
        data: { leadCount: 0 }
      })
      return insights
    }

    const totalLeads = leads.length
    const convertedLeads = leads.filter(lead => 
      ['closed won', 'won', 'customer', 'converted', 'sale'].some(status => 
        (lead.stage || lead.status || '').toLowerCase().includes(status)
      )
    ).length

    const conversionRate = (convertedLeads / totalLeads) * 100
    const industryBenchmark = 20

    if (conversionRate === 0) {
      insights.push({
        id: `zero-conversion-${Date.now()}`,
        type: 'alert',
        title: 'Critical: Zero Conversions Detected',
        description: `None of your ${totalLeads} leads have converted to customers yet. This requires immediate attention to your sales process, follow-up strategy, and lead qualification.`,
        confidence: 100,
        impact: 'high',
        actionable: true,
        data: { totalLeads, convertedLeads: 0, conversionRate: 0 }
      })
    } else if (conversionRate < 10) {
      insights.push({
        id: `low-conversion-${Date.now()}`,
        type: 'alert',
        title: 'Very Low Conversion Rate',
        description: `Your conversion rate is only ${conversionRate.toFixed(1)}% (${convertedLeads}/${totalLeads}), far below the ${industryBenchmark}% industry average. Focus on lead qualification, sales training, and follow-up processes.`,
        confidence: 95,
        impact: 'high',
        actionable: true,
        data: { totalLeads, convertedLeads, conversionRate, benchmark: industryBenchmark }
      })
    } else if (conversionRate < industryBenchmark) {
      insights.push({
        id: `below-benchmark-${Date.now()}`,
        type: 'recommendation',
        title: 'Conversion Rate Below Industry Average',
        description: `Your conversion rate of ${conversionRate.toFixed(1)}% is below the industry benchmark of ${industryBenchmark}%. Improving your sales process could convert ${Math.ceil(totalLeads * (industryBenchmark/100) - convertedLeads)} more leads.`,
        confidence: 85,
        impact: 'medium',
        actionable: true,
        data: { totalLeads, convertedLeads, conversionRate, benchmark: industryBenchmark }
      })
    } else {
      insights.push({
        id: `good-conversion-${Date.now()}`,
        type: 'trend',
        title: 'Strong Conversion Performance',
        description: `Excellent! Your ${conversionRate.toFixed(1)}% conversion rate (${convertedLeads}/${totalLeads}) exceeds industry standards. Consider scaling your lead generation to capitalize on this strong performance.`,
        confidence: 90,
        impact: 'high',
        actionable: true,
        data: { totalLeads, convertedLeads, conversionRate, benchmark: industryBenchmark }
      })
    }

    return insights
  }

  private analyzeLeadSourcePerformance(leads: any[]): AIInsight[] {
    const insights: AIInsight[] = []
    if (!leads || leads.length === 0) return insights

    const sourceStats: Record<string, { total: number; converted: number }> = {}
    
    leads.forEach(lead => {
      const source = lead.source || 'Unknown'
      if (!sourceStats[source]) sourceStats[source] = { total: 0, converted: 0 }
      sourceStats[source].total++
      
      if (['closed won', 'won', 'customer', 'converted'].some(status => 
        (lead.stage || lead.status || '').toLowerCase().includes(status)
      )) {
        sourceStats[source].converted++
      }
    })

    const sourcePerformance = Object.entries(sourceStats)
      .map(([source, stats]) => ({
        source,
        total: stats.total,
        converted: stats.converted,
        conversionRate: stats.total > 0 ? (stats.converted / stats.total) * 100 : 0
      }))
      .filter(s => s.total >= 2) // Only sources with at least 2 leads
      .sort((a, b) => b.conversionRate - a.conversionRate)

    if (sourcePerformance.length === 0) return insights

    // Best performing source
    const bestSource = sourcePerformance[0]
    if (bestSource.conversionRate > 25) {
      insights.push({
        id: `best-source-${Date.now()}`,
        type: 'recommendation',
        title: `${bestSource.source}: Your Top Performing Channel`,
        description: `${bestSource.source} is your best lead source with ${bestSource.conversionRate.toFixed(1)}% conversion rate from ${bestSource.total} leads. Consider increasing investment in this channel.`,
        confidence: 90,
        impact: 'high',
        actionable: true,
        data: bestSource
      })
    }

    // Poor performing source
    const worstSource = sourcePerformance[sourcePerformance.length - 1]
    if (worstSource.conversionRate < 10 && worstSource.total >= 5) {
      insights.push({
        id: `poor-source-${Date.now()}`,
        type: 'alert',
        title: `${worstSource.source}: Underperforming Channel`,
        description: `${worstSource.source} has only ${worstSource.conversionRate.toFixed(1)}% conversion rate from ${worstSource.total} leads. Review this channel's quality or consider reallocating resources.`,
        confidence: 85,
        impact: 'medium',
        actionable: true,
        data: worstSource
      })
    }

    return insights
  }

  private analyzePipelineHealth(leads: any[]): AIInsight[] {
    const insights: AIInsight[] = []
    if (!leads || leads.length === 0) return insights

    const stageStats: Record<string, number> = {}
    leads.forEach(lead => {
      const stage = lead.stage || lead.status || 'Unknown'
      stageStats[stage] = (stageStats[stage] || 0) + 1
    })

    const totalLeads = leads.length
    
    // Check for pipeline bottlenecks
    Object.entries(stageStats).forEach(([stage, count]) => {
      const percentage = (count / totalLeads) * 100
      
      if (percentage > 40 && !stage.toLowerCase().includes('won') && !stage.toLowerCase().includes('closed')) {
        insights.push({
          id: `bottleneck-${stage.replace(/\s+/g, '-')}-${Date.now()}`,
          type: 'alert',
          title: `Pipeline Bottleneck in ${stage}`,
          description: `${percentage.toFixed(1)}% of leads (${count}/${totalLeads}) are stuck in ${stage}. This bottleneck is blocking your sales flow and needs immediate attention.`,
          confidence: 95,
          impact: 'high',
          actionable: true,
          data: { stage, count, percentage, totalLeads }
        })
      }
    })

    // Stale leads analysis
    const staleLeads = this.findStaleLeads(leads)
    if (staleLeads.length > 0) {
      const stalePercentage = (staleLeads.length / totalLeads) * 100
      if (stalePercentage > 15) {
        insights.push({
          id: `stale-leads-${Date.now()}`,
          type: 'alert',
          title: 'High Number of Stale Leads',
          description: `${stalePercentage.toFixed(1)}% of your leads (${staleLeads.length}) haven't been updated in 30+ days. These represent lost opportunities and need immediate follow-up.`,
          confidence: 100,
          impact: 'high',
          actionable: true,
          data: { staleCount: staleLeads.length, percentage: stalePercentage, totalLeads }
        })
      }
    }

    return insights
  }

  private analyzeRevenueOpportunities(leads: any[]): AIInsight[] {
    const insights: AIInsight[] = []
    if (!leads || leads.length === 0) return insights

    const activeLeads = leads.filter(lead => 
      !['closed won', 'closed lost', 'won', 'lost'].some(status => 
        (lead.stage || lead.status || '').toLowerCase().includes(status)
      )
    )

    if (activeLeads.length === 0) return insights

    // Calculate pipeline value
    const pipelineValue = activeLeads.reduce((sum, lead) => {
      const value = typeof lead.value === 'string' ? 
        parseFloat(lead.value.replace(/[$,]/g, '')) || 0 : 
        (lead.value || lead.deal_size || 5000) // Default deal size
      return sum + value
    }, 0)

    if (pipelineValue > 25000) {
      const avgDealSize = pipelineValue / activeLeads.length
      insights.push({
        id: `pipeline-value-${Date.now()}`,
        type: 'trend',
        title: 'Strong Revenue Pipeline',
        description: `Your active pipeline contains $${pipelineValue.toLocaleString()} in potential revenue from ${activeLeads.length} leads (avg: $${avgDealSize.toLocaleString()}/deal). Focus on conversion optimization to capture this value.`,
        confidence: 85,
        impact: 'high',
        actionable: true,
        data: { pipelineValue, activeLeads: activeLeads.length, avgDealSize }
      })
    }

    return insights
  }

  private analyzeContactDatabase(contacts: any[]): AIInsight[] {
    const insights: AIInsight[] = []
    if (!contacts) return insights

    const totalContacts = contacts.length

    if (totalContacts === 0) {
      insights.push({
        id: `no-contacts-${Date.now()}`,
        type: 'alert',
        title: 'No Contacts in Database',
        description: 'Your contact database is empty. Building a contact list should be your immediate priority through lead magnets, networking, and content marketing.',
        confidence: 100,
        impact: 'high',
        actionable: true,
        data: { contactCount: 0 }
      })
    } else if (totalContacts < 100) {
      insights.push({
        id: `small-database-${Date.now()}`,
        type: 'recommendation',
        title: 'Small Contact Database',
        description: `With ${totalContacts} contacts, growing your database should be a priority. Target 500+ contacts through lead generation campaigns, referrals, and networking.`,
        confidence: 90,
        impact: 'high',
        actionable: true,
        data: { contactCount: totalContacts, target: 500 }
      })
    } else if (totalContacts > 1000) {
      insights.push({
        id: `large-database-${Date.now()}`,
        type: 'trend',
        title: 'Strong Contact Database',
        description: `Excellent! Your ${totalContacts.toLocaleString()} contacts provide a solid foundation. Focus on segmentation and personalized campaigns to maximize conversion.`,
        confidence: 90,
        impact: 'medium',
        actionable: true,
        data: { contactCount: totalContacts }
      })
    }

    return insights
  }

  private analyzeCampaignPerformance(campaigns: any[]): AIInsight[] {
    const insights: AIInsight[] = []
    if (!campaigns || campaigns.length === 0) return insights

    const recentCampaigns = campaigns.filter(c => 
      c.status === 'active' || c.status === 'completed'
    )

    if (recentCampaigns.length === 0) return insights

    // Calculate average open rate
    const totalCampaigns = recentCampaigns.length
    const avgOpenRate = recentCampaigns.reduce((sum, campaign) => {
      const openRate = campaign.delivered > 0 ? (campaign.opened / campaign.delivered) * 100 : 0
      return sum + openRate
    }, 0) / totalCampaigns

    if (avgOpenRate < 20) {
      insights.push({
        id: `low-open-rate-${Date.now()}`,
        type: 'alert',
        title: 'Low Campaign Open Rates',
        description: `Your average open rate is ${avgOpenRate.toFixed(1)}%, below the 20-25% industry benchmark. Improve subject lines, sender reputation, and audience targeting.`,
        confidence: 85,
        impact: 'medium',
        actionable: true,
        data: { currentRate: avgOpenRate, benchmark: 22, campaignCount: totalCampaigns }
      })
    } else if (avgOpenRate > 30) {
      insights.push({
        id: `high-open-rate-${Date.now()}`,
        type: 'trend',
        title: 'Excellent Campaign Engagement',
        description: `Your ${avgOpenRate.toFixed(1)}% average open rate across ${totalCampaigns} campaigns exceeds industry standards. Your audience is highly engaged!`,
        confidence: 90,
        impact: 'medium',
        actionable: true,
        data: { currentRate: avgOpenRate, benchmark: 22, campaignCount: totalCampaigns }
      })
    }

    return insights
  }

  private analyzeBusinessRisks(leads: any[], campaigns: any[]): AIInsight[] {
    const insights: AIInsight[] = []

    // Low activity risk
    if (leads && leads.length > 0) {
      const recentActivity = leads.filter(lead => {
        const lastUpdate = new Date(lead.updated_at || lead.updatedAt || lead.created_at || Date.now())
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
        return lastUpdate > sevenDaysAgo
      })

      if (recentActivity.length === 0) {
        insights.push({
          id: `no-activity-${Date.now()}`,
          type: 'alert',
          title: 'No Recent Sales Activity',
          description: 'No leads have been updated in the past 7 days. Consistent activity is crucial for maintaining momentum and preventing leads from going cold.',
          confidence: 100,
          impact: 'high',
          actionable: true,
          data: { recentActivity: 0, totalLeads: leads.length }
        })
      }
    }

    return insights
  }

  private analyzeGrowthOpportunities(leads: any[], contacts: any[]): AIInsight[] {
    const insights: AIInsight[] = []
    
    const leadCount = leads?.length || 0
    const contactCount = contacts?.length || 0
    
    // Lead generation opportunity
    if (contactCount > 0 && leadCount < contactCount * 0.3) {
      const potential = Math.floor(contactCount * 0.3) - leadCount
      insights.push({
        id: `lead-gen-opportunity-${Date.now()}`,
        type: 'recommendation',
        title: 'Lead Generation Opportunity',
        description: `You have ${contactCount} contacts but only ${leadCount} leads. There's potential to generate ${potential} more qualified leads from your existing contact base through nurturing campaigns.`,
        confidence: 80,
        impact: 'high',
        actionable: true,
        data: { contacts: contactCount, leads: leadCount, potential }
      })
    }

    return insights
  }

  private analyzeCustomQuery(query: string, data: any): AIInsight[] {
    const insights: AIInsight[] = []
    const lowerQuery = query.toLowerCase()
    const { contacts, leads, campaigns } = data

    // Query-specific analysis
    if (lowerQuery.includes('conversion') || lowerQuery.includes('close') || lowerQuery.includes('win')) {
      const conversionInsights = this.analyzeConversionMetrics(leads)
      return conversionInsights.slice(0, 2) // Return top 2 conversion insights
    }

    if (lowerQuery.includes('source') || lowerQuery.includes('channel')) {
      const sourceInsights = this.analyzeLeadSourcePerformance(leads)
      return sourceInsights.slice(0, 2)
    }

    if (lowerQuery.includes('campaign') || lowerQuery.includes('email') || lowerQuery.includes('marketing')) {
      const campaignInsights = this.analyzeCampaignPerformance(campaigns)
      return campaignInsights.slice(0, 2)
    }

    // Generic query response
    insights.push({
      id: `custom-query-${Date.now()}`,
      type: 'recommendation',
      title: 'Custom Analysis Result',
      description: `Based on your query "${query}", here's what the data shows: You have ${contacts?.length || 0} contacts, ${leads?.length || 0} leads, and ${campaigns?.length || 0} campaigns in your system.`,
      confidence: 70,
      impact: 'medium',
      actionable: true,
      data: { query, summary: { contacts: contacts?.length || 0, leads: leads?.length || 0, campaigns: campaigns?.length || 0 } }
    })

    return insights
  }

  // Helper Functions

  private findStaleLeads(leads: any[]): any[] {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    return leads?.filter(lead => {
      const lastUpdate = new Date(lead.updated_at || lead.updatedAt || lead.created_at || Date.now())
      const isActive = !['closed won', 'closed lost', 'won', 'lost'].some(status => 
        (lead.stage || lead.status || '').toLowerCase().includes(status)
      )
      return isActive && lastUpdate < thirtyDaysAgo
    }) || []
  }

  private getFallbackInsights(): AIInsight[] {
    return [{
      id: `fallback-${Date.now()}`,
      type: 'recommendation',
      title: 'System Analysis Available',
      description: 'AI analytics is ready to analyze your CRM data. Add contacts, leads, and campaigns to get personalized insights and recommendations.',
      confidence: 100,
      impact: 'medium',
      actionable: true,
      data: { status: 'ready' }
    }]
  }

  // Predictive insights for future analysis
  async generatePredictiveInsights(data: any): Promise<AIInsight[]> {
    return this.generateEnhancedRuleBasedInsights(data, 'predictive analysis', 'predictions')
  }
}

export default new EnhancedAIAnalyticsService()
export { EnhancedAIAnalyticsService }
