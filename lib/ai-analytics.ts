import { GoogleGenerativeAI } from '@google/generative-ai'
import { AILearningSystem } from './ai-learning-system'

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
  source?: 'mistral' | 'internal' | 'hybrid'
  learning_metadata?: any
}

class AIAnalyticsService {
  private genAI: GoogleGenerativeAI | null = null
  private mistralApiKey: string | null = null
  private learningSystem: AILearningSystem

  constructor() {
    console.log('AI Analytics Service initializing...')
    console.log('Mistral API Key available:', !!process.env.MISTRAL_API_KEY)
    console.log('Gemini API Key available:', !!process.env.GEMINI_API_KEY)
    
    // Initialize learning system
    this.learningSystem = new AILearningSystem()
    console.log('AI Learning System initialized')
    
    // Prefer Mistral AI over Gemini
    if (process.env.MISTRAL_API_KEY) {
      this.mistralApiKey = process.env.MISTRAL_API_KEY
      console.log('Mistral AI configured (validation pending)')
    } else if (process.env.GEMINI_API_KEY) {
      this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
      console.log('Gemini AI configured (validation pending)')
    } else {
      console.log('No AI API key found, using intelligent rule-based analysis only')
    }
  }

  /**
   * Generate AI-powered insights from CRM data
   * Now uses teacher-student learning with Mistral AI as teacher
   */
  async generateInsights(request: AIAnalyticsRequest): Promise<AIInsight[]> {
    try {
      const { data, query, analysisType } = request
      console.log('AI Analytics Service - generateInsights called with:', {
        analysisType,
        hasQuery: !!query,
        query: query?.slice(0, 50) + '...',
        hasMistralAI: !!this.mistralApiKey,
        hasGeminiAI: !!this.genAI
      })
      
      // For custom queries or insights with specific queries, use learning system
      if ((analysisType === 'custom' || analysisType === 'insights') && query) {
        console.log('Using AI Learning System for intelligent response...')
        
        try {
          const learningResult = await this.learningSystem.processIntelligentRequest(data, query)
          
          // Transform learning result to AIInsight format
          const insights = this.formatLearningResultToInsights(learningResult)
          
          // Add learning metadata to insights
          insights.forEach(insight => {
            insight.source = learningResult.source
            insight.learning_metadata = learningResult.learning_data
          })
          
          console.log(`AI Learning System response - Source: ${learningResult.source}, Confidence: ${learningResult.confidence}`)
          return insights
          
        } catch (learningError) {
          console.log('AI Learning System failed, falling back to traditional methods:', learningError)
          
          // Fallback to original logic
          if (this.mistralApiKey) {
            try {
              return await this.generateMistralInsights(data, query)
            } catch (mistralError) {
              console.log('Mistral AI also failed, using contextual insights')
              return await this.generateContextualInsights(data, query)
            }
          } else if (this.genAI) {
            try {
              return await this.generateGeminiInsights(data, query)
            } catch (geminiError) {
              console.log('Gemini AI failed, using contextual insights')
              return await this.generateContextualInsights(data, query)
            }
          } else {
            return await this.generateContextualInsights(data, query)
          }
        }
      }

      // Default to rule-based analysis for non-query requests
      console.log('Using rule-based insights for analysis type:', analysisType)
      return await this.generateRuleBasedInsights(data, analysisType)
      
    } catch (error) {
      console.error('AI Analytics Service Error:', error)
      // Final fallback to rule-based analysis
      return await this.generateRuleBasedInsights(request.data, request.analysisType)
    }
  }

  /**
   * Transform learning system result to AIInsight format
   */
  private formatLearningResultToInsights(learningResult: any): AIInsight[] {
    if (learningResult.response && learningResult.response.insights) {
      return learningResult.response.insights.map((insight: any) => ({
        ...insight,
        confidence: Math.round(learningResult.confidence * 100),
        source: learningResult.source
      }))
    }
    
    // Fallback single insight
    return [{
      id: `learning-${Date.now()}`,
      type: 'recommendation',
      title: 'AI Learning System Response',
      description: 'The AI learning system provided a response but in an unexpected format.',
      confidence: Math.round(learningResult.confidence * 100),
      impact: 'medium',
      actionable: true,
      source: learningResult.source,
      data: learningResult.response
    }]
  }

  /**
   * Get AI learning system metrics and performance
   */
  async getLearningMetrics() {
    try {
      const metrics = this.learningSystem.getModelMetrics()
      console.log('Metrics from learning system:', JSON.stringify(metrics, null, 2))
      return metrics
    } catch (error) {
      console.error('Failed to get learning metrics:', error)
      return {
        error: 'Unable to retrieve learning metrics',
        total_interactions: 0,
        internal_model_usage_rate: 0,
        user_satisfaction: {
          average: 0,
          total_feedback: 0,
          high_satisfaction_rate: 0,
          low_satisfaction_rate: 0,
          recent_trend: 0
        },
        response_effectiveness: 0
      }
    }
  }

  /**
   * Generate insights using Google Gemini AI
   */
  private async generateGeminiInsights(data: any, query: string): Promise<AIInsight[]> {
    console.log('Attempting to generate Gemini AI insights...')
    console.log('Query:', query)
    console.log('Data summary:', {
      contacts: data.contacts?.length || 0,
      leads: data.leads?.length || 0,
      campaigns: data.campaigns?.length || 0
    })
    
    if (!this.genAI) {
      console.log('Gemini AI not configured, falling back to contextual insights')
      throw new Error('Gemini AI not configured')
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-pro' })
      console.log('Gemini model initialized')

      const dataContext = {
        totalContacts: data.contacts?.length || 0,
        totalLeads: data.leads?.length || 0,
        totalCampaigns: data.campaigns?.length || 0,
        leadsByStage: this.groupLeadsByStage(data.leads),
        contactsBySource: this.groupContactsBySource(data.contacts),
        campaignPerformance: this.analyzeCampaignPerformance(data.campaigns)
      }

      const prompt = `You are an AI CRM analytics expert. Analyze the following CRM data and provide actionable business insights in JSON format.

Data Context:
${JSON.stringify(dataContext, null, 2)}

User Query: ${query}

Please provide insights in this exact JSON format:
{
  "insights": [
    {
      "id": "unique-id",
      "type": "prediction|recommendation|alert|trend",
      "title": "Insight Title",
      "description": "Detailed description",
      "confidence": 85,
      "impact": "high|medium|low",
      "actionable": true
    }
  ]
}

Focus on:
1. Conversion patterns and bottlenecks
2. Customer acquisition trends  
3. Campaign effectiveness
4. Revenue opportunities
5. Risk factors and alerts`

      console.log('Sending request to Gemini API with prompt length:', prompt.length)
      const result = await model.generateContent(prompt)
      const response = result.response.text()
      console.log('Gemini API response received (first 200 chars):', response.slice(0, 200))
      
      if (!response) {
        throw new Error('No AI response received')
      }

      // Try to extract JSON from the response
      let jsonString = response
      
      // If response is wrapped in markdown code blocks, extract the JSON
      const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/) || response.match(/```\n?([\s\S]*?)\n?```/)
      if (jsonMatch) {
        jsonString = jsonMatch[1]
        console.log('Extracted JSON from markdown blocks')
      }

      try {
        const parsed = JSON.parse(jsonString)
        console.log('Successfully parsed AI response, insights count:', parsed.insights?.length || 0)
        return parsed.insights || []
      } catch (parseError) {
        console.log('Failed to parse JSON, error:', parseError)
        console.log('Creating fallback insight from response')
        // If JSON parsing fails, create a single insight from the response
        return [{
          id: `gemini-${Date.now()}`,
          type: 'recommendation',
          title: 'AI Analysis Result',
          description: response.slice(0, 500).replace(/[{}[\]"]/g, ''), // Clean up and truncate
          confidence: 75,
          impact: 'medium',
          actionable: true
        }]
      }
    } catch (error) {
      console.error('Gemini API call error:', error)
      throw error
    }
  }

  /**
   * Generate insights using Mistral AI
   */
  private async generateMistralInsights(data: any, query: string): Promise<AIInsight[]> {
    console.log('Attempting to generate Mistral AI insights...')
    console.log('Query:', query)
    console.log('Data summary:', {
      contacts: data.contacts?.length || 0,
      leads: data.leads?.length || 0,
      campaigns: data.campaigns?.length || 0
    })
    
    if (!this.mistralApiKey) {
      console.log('Mistral AI not configured, throwing error')
      throw new Error('Mistral AI not configured')
    }

    try {
      const dataContext = {
        totalContacts: data.contacts?.length || 0,
        totalLeads: data.leads?.length || 0,
        totalCampaigns: data.campaigns?.length || 0,
        leadsByStage: this.groupLeadsByStage(data.leads),
        contactsBySource: this.groupContactsBySource(data.contacts),
        campaignPerformance: this.analyzeCampaignPerformance(data.campaigns)
      }

      const messages: MistralMessage[] = [
        {
          role: 'system',
          content: 'You are an AI CRM analytics expert. Analyze CRM data and provide actionable business insights in JSON format.'
        },
        {
          role: 'user',
          content: `Analyze the following CRM data and provide actionable business insights:

Data Context:
${JSON.stringify(dataContext, null, 2)}

User Query: ${query}

IMPORTANT: Respond with ONLY valid JSON. Do not use markdown formatting, bold text, or special characters in the JSON values. Use plain text only.

Provide insights in this EXACT JSON format:
{
  "insights": [
    {
      "id": "unique-id-here",
      "type": "recommendation",
      "title": "Clear insight title without special formatting",
      "description": "Detailed description using only plain text without bold, italic, or special characters",
      "confidence": 85,
      "impact": "high",
      "actionable": true
    }
  ]
}

Focus your analysis on:
1. Conversion patterns and bottlenecks
2. Customer acquisition trends  
3. Campaign effectiveness
4. Revenue opportunities
5. Risk factors and alerts

Return only the JSON object, no other text or formatting.`
        }
      ]

      console.log('Sending request to Mistral API...')
      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.mistralApiKey}`
        },
        body: JSON.stringify({
          model: 'mistral-large-latest',
          messages: messages,
          temperature: 0.7,
          max_tokens: 2000
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Mistral API error:', response.status, errorText)
        throw new Error(`Mistral API error: ${response.status} ${errorText}`)
      }

      const result: MistralResponse = await response.json()
      console.log('Mistral API response received')
      
      if (!result.choices || !result.choices[0]?.message?.content) {
        throw new Error('No valid response from Mistral API')
      }

      const content = result.choices[0].message.content
      console.log('Mistral response content (first 200 chars):', content.slice(0, 200))

      // Try to extract JSON from the response
      let jsonString = content
      
      // If response is wrapped in markdown code blocks, extract the JSON
      const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || content.match(/```\n?([\s\S]*?)\n?```/)
      if (jsonMatch) {
        jsonString = jsonMatch[1]
        console.log('Extracted JSON from markdown blocks')
      }

      // Clean up common formatting issues in AI responses
      jsonString = jsonString
        .replace(/\*\*/g, '') // Remove bold markdown
        .replace(/\*/g, '') // Remove italic markdown
        .replace(/\\n/g, ' ') // Replace escaped newlines with spaces
        .replace(/\n/g, ' ') // Replace actual newlines with spaces
        .replace(/\r/g, ' ') // Replace carriage returns
        .replace(/\t/g, ' ') // Replace tabs
        .replace(/\u000b/g, ' ') // Remove vertical tab
        .replace(/\u000c/g, ' ') // Remove form feed
        .replace(/\u0008/g, '') // Remove backspace
        .replace(/[\u0000-\u001f]/g, ' ') // Remove all other control characters
        .trim()

      try {
        const parsed = JSON.parse(jsonString)
        console.log('Successfully parsed Mistral response, insights count:', parsed.insights?.length || 0)
        return parsed.insights || []
      } catch (parseError) {
        console.log('Failed to parse JSON, error:', parseError)
        console.log('Cleaned JSON string:', jsonString.slice(0, 200) + '...')
        console.log('Creating fallback insight from response')
        // If JSON parsing fails, create a single insight from the response
        return [{
          id: `mistral-${Date.now()}`,
          type: 'recommendation',
          title: 'AI Analysis Result',
          description: content.slice(0, 500).replace(/[{}[\]"*]/g, '').replace(/[\u0000-\u001f]/g, ' '), // Clean up and truncate
          confidence: 80,
          impact: 'medium',
          actionable: true
        }]
      }
    } catch (error) {
      console.error('Mistral API call error:', error)
      throw error
    }
  }

  /**
   * Generate contextual insights without AI API but with query context
   */
  private async generateContextualInsights(data: any, query: string): Promise<AIInsight[]> {
    const insights: AIInsight[] = []
    const { contacts, leads, campaigns } = data
    const lowerQuery = query.toLowerCase()

    // Analyze query intent and provide relevant insights
    if (lowerQuery.includes('conversion') || lowerQuery.includes('close') || lowerQuery.includes('win')) {
      const totalLeads = leads?.length || 0
      const convertedLeads = leads?.filter((lead: any) => 
        lead.stage?.toLowerCase().includes('won') || 
        lead.stage?.toLowerCase().includes('closed') ||
        lead.status?.toLowerCase().includes('won')
      ).length || 0
      const conversionRate = totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0

      insights.push({
        id: `contextual-conversion-${Date.now()}`,
        type: 'recommendation',
        title: 'Conversion Rate Analysis',
        description: `Your current conversion rate is ${conversionRate.toFixed(1)}% (${convertedLeads} out of ${totalLeads} leads). ${conversionRate < 15 ? 'This is below industry average - consider improving follow-up processes.' : conversionRate > 25 ? 'Excellent performance - document your winning strategies!' : 'Solid performance with room for optimization.'}`,
        confidence: 85,
        impact: conversionRate < 15 ? 'high' : 'medium',
        actionable: true
      })
    }

    if (lowerQuery.includes('campaign') || lowerQuery.includes('marketing') || lowerQuery.includes('email')) {
      const totalCampaigns = campaigns?.length || 0
      const activeCampaigns = campaigns?.filter((c: any) => c.status?.toLowerCase() === 'active').length || 0
      
      insights.push({
        id: `contextual-campaigns-${Date.now()}`,
        type: 'recommendation',
        title: 'Campaign Performance Insights',
        description: `You have ${totalCampaigns} total campaigns with ${activeCampaigns} currently active. ${activeCampaigns > 5 ? 'Consider focusing on fewer campaigns for better management.' : activeCampaigns < 2 ? 'You may benefit from running more targeted campaigns.' : 'Your campaign load appears well-managed.'}`,
        confidence: 80,
        impact: 'medium',
        actionable: true
      })
    }

    if (lowerQuery.includes('contact') || lowerQuery.includes('database') || lowerQuery.includes('lead')) {
      const totalContacts = contacts?.length || 0
      const totalLeads = leads?.length || 0
      const leadToContactRatio = totalContacts > 0 ? (totalLeads / totalContacts) * 100 : 0

      insights.push({
        id: `contextual-database-${Date.now()}`,
        type: 'trend',
        title: 'Database Growth Analysis',
        description: `Your database contains ${totalContacts} contacts and ${totalLeads} leads (${leadToContactRatio.toFixed(1)}% lead ratio). ${totalContacts < 100 ? 'Focus on expanding your contact base through networking and content marketing.' : totalContacts > 1000 ? 'Large database - consider advanced segmentation strategies.' : 'Healthy database size with growth opportunities.'}`,
        confidence: 90,
        impact: totalContacts < 100 ? 'high' : 'medium',
        actionable: true
      })
    }

    if (lowerQuery.includes('recommend') || lowerQuery.includes('improve') || lowerQuery.includes('suggest')) {
      // Provide general recommendations based on data
      const totalContacts = contacts?.length || 0
      const totalLeads = leads?.length || 0
      const totalCampaigns = campaigns?.length || 0

      insights.push({
        id: `contextual-recommendations-${Date.now()}`,
        type: 'recommendation',
        title: 'Strategic Recommendations',
        description: `Based on your current data (${totalContacts} contacts, ${totalLeads} leads, ${totalCampaigns} campaigns), I recommend: 1) ${totalContacts < 200 ? 'Prioritize lead generation and networking' : 'Implement advanced segmentation'}, 2) ${totalLeads < 50 ? 'Focus on converting contacts to leads' : 'Optimize your sales funnel'}, 3) ${totalCampaigns < 3 ? 'Increase marketing campaign frequency' : 'Analyze campaign ROI and optimize top performers'}.`,
        confidence: 85,
        impact: 'high',
        actionable: true
      })
    }

    // If no specific insights match, provide a general analysis
    if (insights.length === 0) {
      insights.push({
        id: `contextual-general-${Date.now()}`,
        type: 'recommendation',
        title: 'CRM Analysis Summary',
        description: `Your CRM data shows ${contacts?.length || 0} contacts, ${leads?.length || 0} leads, and ${campaigns?.length || 0} campaigns. Consider focusing on areas with the highest impact: lead conversion optimization, database expansion, and campaign performance tracking.`,
        confidence: 75,
        impact: 'medium',
        actionable: true
      })
    }

    return insights
  }

  /**
   * Generate insights using business rules and algorithms
   */
  private async generateRuleBasedInsights(data: any, analysisType: string): Promise<AIInsight[]> {
    const insights: AIInsight[] = []
    const { contacts, leads, campaigns } = data

    // Ensure data is in array format
    const contactsArray = Array.isArray(contacts) ? contacts : []
    const leadsArray = Array.isArray(leads) ? leads : []
    const campaignsArray = Array.isArray(campaigns) ? campaigns : []

    console.log('Generating rule-based insights with data:', {
      contacts: contactsArray.length,
      leads: leadsArray.length,
      campaigns: campaignsArray.length
    })

    // Conversion Rate Analysis
    const totalLeads = leadsArray.length
    const convertedLeads = leadsArray.filter((lead: any) => 
      lead.stage?.toLowerCase() === 'closed won' || lead.status?.toLowerCase() === 'won'
    ).length
    
    const conversionRate = totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0

    if (conversionRate < 15) {
      insights.push({
        id: `conv-rate-${Date.now()}`,
        type: 'alert',
        title: 'Low Conversion Rate Detected',
        description: `Your conversion rate is ${conversionRate.toFixed(1)}%, below the industry average of 15-20%. Consider improving lead qualification and follow-up processes.`,
        confidence: 95,
        impact: 'high',
        actionable: true,
        data: { currentRate: conversionRate, benchmark: 15 }
      })
    }

    // Lead Source Performance
    const leadSources = this.analyzeLeadSources(leadsArray)
    const topSource = leadSources.sort((a, b) => b.conversionRate - a.conversionRate)[0]
    
    if (topSource && topSource.conversionRate > 25) {
      insights.push({
        id: `top-source-${Date.now()}`,
        type: 'recommendation',
        title: `${topSource.source} is Your Best Performer`,
        description: `${topSource.source} has a ${topSource.conversionRate.toFixed(1)}% conversion rate with ${topSource.total} leads. Consider allocating more budget to this channel.`,
        confidence: 88,
        impact: 'high',
        actionable: true,
        data: topSource
      })
    }

    // Stale Leads Detection
    const staleLeads = this.findStaleLeads(leads)
    if (staleLeads.length > totalLeads * 0.15) {
      insights.push({
        id: `stale-leads-${Date.now()}`,
        type: 'alert',
        title: 'High Number of Stale Leads',
        description: `${staleLeads.length} leads (${((staleLeads.length/totalLeads)*100).toFixed(1)}%) haven't been updated in 30+ days. These need immediate attention to prevent lost opportunities.`,
        confidence: 100,
        impact: 'medium',
        actionable: true,
        data: { staleCount: staleLeads.length, percentage: (staleLeads.length/totalLeads)*100 }
      })
    }

    // Revenue Prediction
    const revenueInsight = this.predictRevenue(leads, convertedLeads)
    if (revenueInsight) {
      insights.push(revenueInsight)
    }

    // Campaign Performance Analysis
    const campaignInsights = this.analyzeCampaignInsights(campaigns)
    insights.push(...campaignInsights)

    // Growth Trend Analysis
    const growthInsight = this.analyzeGrowthTrends(leads, contacts)
    if (growthInsight) {
      insights.push(growthInsight)
    }

    return insights
  }

  private groupLeadsByStage(leads: any[]): Record<string, number> {
    const groups: Record<string, number> = {}
    leads?.forEach(lead => {
      const stage = lead.stage || lead.status || 'Unknown'
      groups[stage] = (groups[stage] || 0) + 1
    })
    return groups
  }

  private groupContactsBySource(contacts: any[]): Record<string, number> {
    const groups: Record<string, number> = {}
    contacts?.forEach(contact => {
      const source = contact.source || 'Unknown'
      groups[source] = (groups[source] || 0) + 1
    })
    return groups
  }

  private analyzeCampaignPerformance(campaigns: any[]) {
    return campaigns?.map(campaign => ({
      id: campaign.id,
      name: campaign.name,
      sent: campaign.sent || 0,
      delivered: campaign.delivered || 0,
      opened: campaign.opened || 0,
      clicked: campaign.clicked || 0,
      deliveryRate: campaign.sent > 0 ? (campaign.delivered / campaign.sent) * 100 : 0,
      openRate: campaign.delivered > 0 ? (campaign.opened / campaign.delivered) * 100 : 0,
      clickRate: campaign.opened > 0 ? (campaign.clicked / campaign.opened) * 100 : 0
    })) || []
  }

  private analyzeLeadSources(leads: any[]) {
    const sources: Record<string, { total: number, converted: number }> = {}
    
    leads?.forEach(lead => {
      const source = lead.source || 'Unknown'
      if (!sources[source]) sources[source] = { total: 0, converted: 0 }
      sources[source].total++
      if (lead.stage?.toLowerCase() === 'closed won' || lead.status?.toLowerCase() === 'won') {
        sources[source].converted++
      }
    })

    return Object.entries(sources).map(([source, data]) => ({
      source,
      total: data.total,
      converted: data.converted,
      conversionRate: data.total > 0 ? (data.converted / data.total) * 100 : 0
    }))
  }

  private findStaleLeads(leads: any[]): any[] {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    return leads?.filter(lead => {
      const lastUpdate = new Date(lead.updated_at || lead.updatedAt || lead.created_at)
      const isActive = !['closed won', 'closed lost', 'won', 'lost'].includes(
        (lead.stage || lead.status || '').toLowerCase()
      )
      return isActive && lastUpdate < thirtyDaysAgo
    }) || []
  }

  private predictRevenue(leads: any[], convertedLeads: number): AIInsight | null {
    const activeLeads = leads?.filter(lead => 
      !['closed won', 'closed lost', 'won', 'lost'].includes(
        (lead.stage || lead.status || '').toLowerCase()
      )
    ) || []

    if (activeLeads.length === 0) return null

    const avgDealSize = convertedLeads > 0 ? 
      leads?.filter(lead => lead.stage?.toLowerCase() === 'closed won' || lead.status?.toLowerCase() === 'won')
        .reduce((sum, lead) => {
          const value = typeof lead.value === 'string' ? 
            parseFloat(lead.value.replace(/[$,]/g, '')) || 0 : 
            (lead.value || lead.deal_size || 0)
          return sum + value
        }, 0) / convertedLeads : 5000 // Default average

    const conversionRate = leads.length > 0 ? (convertedLeads / leads.length) : 0.15 // Default 15%
    const projectedRevenue = activeLeads.length * conversionRate * avgDealSize

    if (projectedRevenue > 10000) {
      return {
        id: `revenue-pred-${Date.now()}`,
        type: 'prediction',
        title: 'Strong Revenue Pipeline',
        description: `Based on ${activeLeads.length} active leads and current performance, your pipeline could generate $${projectedRevenue.toLocaleString()} in revenue over the next quarter.`,
        confidence: 75,
        impact: 'high',
        actionable: true,
        data: { 
          projected: projectedRevenue, 
          activeLeads: activeLeads.length,
          avgDealSize: avgDealSize,
          conversionRate: conversionRate * 100
        }
      }
    }

    return null
  }

  private analyzeCampaignInsights(campaigns: any[]): AIInsight[] {
    const insights: AIInsight[] = []
    
    if (!campaigns || campaigns.length === 0) return insights

    const avgOpenRate = campaigns.reduce((sum, c) => {
      const rate = c.delivered > 0 ? (c.opened / c.delivered) * 100 : 0
      return sum + rate
    }, 0) / campaigns.length

    if (avgOpenRate < 20) {
      insights.push({
        id: `low-open-rate-${Date.now()}`,
        type: 'alert',
        title: 'Low Campaign Open Rates',
        description: `Your average open rate is ${avgOpenRate.toFixed(1)}%, below the industry standard of 20-25%. Consider improving subject lines and send timing.`,
        confidence: 90,
        impact: 'medium',
        actionable: true,
        data: { currentRate: avgOpenRate, benchmark: 22 }
      })
    }

    return insights
  }

  private analyzeGrowthTrends(leads: any[], contacts: any[]): AIInsight | null {
    const now = new Date()
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)

    const thisMonthLeads = leads?.filter(lead => {
      const createdDate = new Date(lead.created_at || lead.createdAt)
      return createdDate >= thisMonth
    }).length || 0

    const lastMonthLeads = leads?.filter(lead => {
      const createdDate = new Date(lead.created_at || lead.createdAt)
      return createdDate >= lastMonth && createdDate < thisMonth
    }).length || 0

    if (lastMonthLeads === 0) return null

    const growthRate = ((thisMonthLeads - lastMonthLeads) / lastMonthLeads) * 100

    if (Math.abs(growthRate) > 15) {
      const isPositive = growthRate > 0
      return {
        id: `growth-trend-${Date.now()}`,
        type: 'trend',
        title: `${isPositive ? 'Strong' : 'Declining'} Lead Generation Trend`,
        description: `Your lead generation is ${isPositive ? 'up' : 'down'} ${Math.abs(growthRate).toFixed(1)}% month-over-month. ${isPositive ? 'This positive trend indicates effective marketing efforts.' : 'This decline needs immediate attention to maintain pipeline health.'}`,
        confidence: 85,
        impact: isPositive ? 'high' : 'high',
        actionable: true,
        data: { 
          growthRate, 
          thisMonth: thisMonthLeads, 
          lastMonth: lastMonthLeads,
          trend: isPositive ? 'positive' : 'negative'
        }
      }
    }

    return null
  }

  /**
   * Generate predictive insights using AI and statistical analysis
   */
  async generatePredictiveInsights(data: any): Promise<AIInsight[]> {
    console.log('Generating predictive insights...')
    
    const predictiveInsights: AIInsight[] = []
    const { contacts, leads, campaigns } = data

    try {
      // If Mistral AI is available, get AI-powered predictions
      if (this.mistralApiKey) {
        try {
          const aiPredictions = await this.generateMistralPredictions(data)
          predictiveInsights.push(...aiPredictions)
        } catch (error) {
          console.log('AI predictions failed, using statistical models:', error)
        }
      }

      // Generate statistical predictions
      const statisticalPredictions = await this.generateStatisticalPredictions(data)
      predictiveInsights.push(...statisticalPredictions)

      return predictiveInsights

    } catch (error) {
      console.error('Error generating predictive insights:', error)
      return this.generateFallbackPredictions(data)
    }
  }

  /**
   * Generate AI-powered predictions using Mistral
   */
  private async generateMistralPredictions(data: any): Promise<AIInsight[]> {
    console.log('Generating AI-powered predictions...')
    
    if (!this.mistralApiKey) {
      throw new Error('Mistral AI not available')
    }

    const dataContext = {
      totalContacts: data.contacts?.length || 0,
      totalLeads: data.leads?.length || 0,
      totalCampaigns: data.campaigns?.length || 0,
      leadsByStage: this.groupLeadsByStage(data.leads),
      contactsBySource: this.groupContactsBySource(data.contacts),
      campaignPerformance: this.analyzeCampaignPerformance(data.campaigns),
      historicalTrends: this.calculateHistoricalTrends(data)
    }

    const messages: MistralMessage[] = [
      {
        role: 'system',
        content: 'You are a predictive analytics expert. Analyze historical CRM data and generate accurate forecasts and predictions.'
      },
      {
        role: 'user',
        content: `Based on the following CRM data, generate predictive insights for the next 30, 60, and 90 days:

Data Context:
${JSON.stringify(dataContext, null, 2)}

IMPORTANT: Respond with ONLY valid JSON. Use plain text without markdown formatting.

Generate predictions in this EXACT JSON format:
{
  "insights": [
    {
      "id": "prediction-unique-id",
      "type": "prediction",
      "title": "Clear prediction title",
      "description": "Detailed prediction with specific numbers and timeframes",
      "confidence": 85,
      "impact": "high",
      "actionable": true
    }
  ]
}

Focus on predicting:
1. Lead conversion rates for next 30/60/90 days
2. Revenue projections based on current pipeline
3. Campaign performance forecasts
4. Contact acquisition trends
5. Potential risks and opportunities

Provide specific numbers, percentages, and timeframes in your predictions.`
      }
    ]

    try {
      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.mistralApiKey}`
        },
        body: JSON.stringify({
          model: 'mistral-large-latest',
          messages: messages,
          temperature: 0.3, // Lower temperature for more consistent predictions
          max_tokens: 4000
        })
      })

      if (!response.ok) {
        throw new Error(`Mistral API error: ${response.status}`)
      }

      const result: MistralResponse = await response.json()
      const content = result.choices[0]?.message?.content

      if (!content) {
        throw new Error('No content from Mistral API')
      }

      // Parse AI predictions
      return this.parseAIResponse(content, 'mistral-pred')

    } catch (error) {
      console.error('Mistral predictions error:', error)
      throw error
    }
  }

  /**
   * Generate statistical predictions based on data analysis
   */
  private async generateStatisticalPredictions(data: any): Promise<AIInsight[]> {
    console.log('Generating statistical predictions...')
    const predictions: AIInsight[] = []
    const { contacts, leads, campaigns } = data

    // 1. Lead Conversion Rate Prediction
    const conversionPrediction = this.predictLeadConversion(leads)
    if (conversionPrediction) predictions.push(conversionPrediction)

    // 2. Revenue Forecast
    const revenuePrediction = this.predictRevenueForecasting(leads)
    if (revenuePrediction) predictions.push(revenuePrediction)

    // 3. Contact Growth Prediction
    const growthPrediction = this.predictContactGrowth(contacts)
    if (growthPrediction) predictions.push(growthPrediction)

    // 4. Campaign Performance Prediction
    const campaignPrediction = this.predictCampaignPerformance(campaigns)
    if (campaignPrediction) predictions.push(campaignPrediction)

    return predictions
  }

  /**
   * Predict lead conversion rates
   */
  private predictLeadConversion(leads: any[]): AIInsight | null {
    if (!leads || leads.length === 0) return null

    const totalLeads = leads.length
    const convertedLeads = leads.filter(lead => 
      lead.stage?.toLowerCase() === 'closed won' || 
      lead.stage?.toLowerCase() === 'won' ||
      lead.status?.toLowerCase() === 'won'
    ).length

    const currentConversionRate = totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0
    
    // Simple trend analysis (in real app, you'd use historical data)
    const activeLeads = leads.filter(lead => 
      !['closed won', 'closed lost', 'won', 'lost'].includes(
        (lead.stage || lead.status || '').toLowerCase()
      )
    ).length

    // Predict next 30 days conversions
    const predictedConversions = Math.round(activeLeads * (currentConversionRate / 100))
    const predictedRevenue = predictedConversions * 5000 // Average deal size

    return {
      id: `lead-conversion-pred-${Date.now()}`,
      type: 'prediction',
      title: 'Lead Conversion Forecast - Next 30 Days',
      description: `Based on your current conversion rate of ${currentConversionRate.toFixed(1)}%, we predict ${predictedConversions} leads will convert in the next 30 days from your ${activeLeads} active leads. This could generate approximately $${predictedRevenue.toLocaleString()} in revenue.`,
      confidence: activeLeads > 5 ? 85 : 60,
      impact: predictedConversions > 3 ? 'high' : 'medium',
      actionable: true
    }
  }

  /**
   * Predict revenue based on pipeline (for forecasting)
   */
  private predictRevenueForecasting(leads: any[]): AIInsight | null {
    if (!leads || leads.length === 0) return null

    const pipelineValue = leads.reduce((total, lead) => {
      if (lead.value && !['closed lost', 'lost'].includes((lead.stage || lead.status || '').toLowerCase())) {
        return total + (parseFloat(lead.value) || 0)
      }
      return total
    }, 0)

    const qualifiedLeads = leads.filter(lead => 
      ['qualified', 'proposal', 'negotiation'].includes((lead.stage || '').toLowerCase())
    ).length

    const qualifiedValue = leads
      .filter(lead => ['qualified', 'proposal', 'negotiation'].includes((lead.stage || '').toLowerCase()))
      .reduce((total, lead) => total + (parseFloat(lead.value) || 5000), 0)

    // Predict revenue based on stage probabilities
    const predictedRevenue = Math.round(qualifiedValue * 0.6) // 60% close rate for qualified leads

    if (pipelineValue === 0) return null

    return {
      id: `revenue-pred-${Date.now()}`,
      type: 'prediction',
      title: 'Revenue Forecast - Next Quarter',
      description: `Your current pipeline value is $${pipelineValue.toLocaleString()}. Based on ${qualifiedLeads} qualified leads, we predict $${predictedRevenue.toLocaleString()} in revenue over the next 90 days. Focus on moving leads from 'New' to 'Qualified' stage to improve this forecast.`,
      confidence: qualifiedLeads > 3 ? 80 : 65,
      impact: 'high',
      actionable: true
    }
  }

  /**
   * Predict contact growth trends
   */
  private predictContactGrowth(contacts: any[]): AIInsight | null {
    if (!contacts || contacts.length < 10) return null

    const totalContacts = contacts.length
    // Simulate growth rate (in real app, you'd analyze historical data)
    const monthlyGrowthRate = totalContacts > 100 ? 0.15 : 0.25 // 15-25% monthly growth
    
    const predictedNext30 = Math.round(totalContacts * (1 + monthlyGrowthRate))
    const predictedNext90 = Math.round(totalContacts * Math.pow(1 + monthlyGrowthRate, 3))

    return {
      id: `contact-growth-pred-${Date.now()}`,
      type: 'prediction',
      title: 'Contact Database Growth Projection',
      description: `Your database is growing at an estimated ${(monthlyGrowthRate * 100).toFixed(1)}% monthly rate. Current: ${totalContacts} contacts. Projected: ${predictedNext30} contacts in 30 days, ${predictedNext90} contacts in 90 days. Consider implementing lead magnets to accelerate growth.`,
      confidence: 75,
      impact: 'medium',
      actionable: true
    }
  }

  /**
   * Predict campaign performance
   */
  private predictCampaignPerformance(campaigns: any[]): AIInsight | null {
    if (!campaigns || campaigns.length === 0) return null

    const activeCampaigns = campaigns.filter(c => c.status?.toLowerCase() === 'active')
    const avgOpenRate = campaigns.reduce((sum, c) => {
      const rate = c.delivered > 0 ? (c.opened / c.delivered) * 100 : 0
      return sum + rate
    }, 0) / campaigns.length

    const avgClickRate = campaigns.reduce((sum, c) => {
      const rate = c.opened > 0 ? (c.clicked / c.opened) * 100 : 0
      return sum + rate
    }, 0) / campaigns.length

    if (isNaN(avgOpenRate) || isNaN(avgClickRate)) return null

    const predictedPerformance = avgOpenRate > 20 && avgClickRate > 5 ? 'excellent' : 
                                avgOpenRate > 15 && avgClickRate > 3 ? 'good' : 'needs improvement'

    return {
      id: `campaign-pred-${Date.now()}`,
      type: 'prediction',
      title: 'Campaign Performance Forecast',
      description: `Based on historical data, your campaigns average ${avgOpenRate.toFixed(1)}% open rate and ${avgClickRate.toFixed(1)}% click rate. With ${activeCampaigns.length} active campaigns, performance is predicted to be ${predictedPerformance}. ${predictedPerformance === 'needs improvement' ? 'Consider A/B testing subject lines and content.' : 'Maintain current strategies for continued success.'}`,
      confidence: campaigns.length > 2 ? 80 : 65,
      impact: predictedPerformance === 'excellent' ? 'high' : 'medium',
      actionable: true
    }
  }

  /**
   * Generate fallback predictions when AI fails
   */
  private generateFallbackPredictions(data: any): AIInsight[] {
    return [{
      id: `fallback-pred-${Date.now()}`,
      type: 'prediction',
      title: 'Basic Forecast Available',
      description: `Based on your current data (${data.contacts?.length || 0} contacts, ${data.leads?.length || 0} leads), basic statistical predictions suggest steady growth. Expand your dataset for more accurate AI-powered forecasts.`,
      confidence: 50,
      impact: 'low',
      actionable: true
    }]
  }

  /**
   * Calculate historical trends for better predictions
   */
  private calculateHistoricalTrends(data: any) {
    // In a real implementation, you'd analyze timestamps and calculate actual trends
    // This is a simplified version
    const { contacts, leads, campaigns } = data
    
    return {
      contactGrowthTrend: contacts?.length > 50 ? 'increasing' : 'steady',
      leadConversionTrend: leads?.length > 20 ? 'stable' : 'variable', 
      campaignEffectivenessTrend: campaigns?.length > 2 ? 'improving' : 'new'
    }
  }

  /**
   * Parse AI response for predictions
   */
  private parseAIResponse(content: string, prefix: string): AIInsight[] {
    let jsonString = content
    
    // Extract JSON from markdown blocks
    const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) || content.match(/```\n?([\s\S]*?)\n?```/)
    if (jsonMatch) {
      jsonString = jsonMatch[1]
    }

    // Clean up formatting issues
    jsonString = jsonString
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/[\u0000-\u001f]/g, ' ')
      .trim()

    try {
      const parsed = JSON.parse(jsonString)
      return parsed.insights || []
    } catch (error) {
      console.log('Failed to parse AI prediction response, creating fallback')
      return [{
        id: `${prefix}-${Date.now()}`,
        type: 'prediction',
        title: 'AI Prediction Analysis',
        description: content.slice(0, 400).replace(/[{}[\]"*]/g, '').replace(/[\u0000-\u001f]/g, ' '),
        confidence: 75,
        impact: 'medium',
        actionable: true
      }]
    }
  }
}

export default new AIAnalyticsService()
export { AIAnalyticsService }
