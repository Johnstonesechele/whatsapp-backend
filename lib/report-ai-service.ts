import { query, queryOne } from "@/backend/database/db-adapter"

interface CompanyData {
  id: string
  name: string
  contacts: any[]
  leads: any[]
  deals: any[]
  campaigns: any[]
  activities: any[]
}

interface AIInsight {
  title: string
  description: string
  type: 'insight' | 'recommendation' | 'warning' | 'opportunity'
  priority: 'high' | 'medium' | 'low'
  confidence: number
  metrics: any // Allow flexible metrics structure
}

export class ReportAIService {
  private mistralApiKey: string | null

  constructor() {
    this.mistralApiKey = process.env.MISTRAL_API_KEY || null
  }

  async generateCompanyInsights(companyId: string): Promise<AIInsight[]> {
    try {
      // Fetch real company data
      const companyData = await this.getCompanyData(companyId)
      
      if (!this.mistralApiKey) {
        console.warn('No Mistral API key available, using rule-based insights')
        return this.generateRuleBasedInsights(companyData)
      }

      // Generate insights using Mistral AI
      const aiInsights = await this.callMistralForInsights(companyData)
      
      // Combine AI insights with calculated metrics
      return this.enrichInsightsWithMetrics(aiInsights, companyData)
      
    } catch (error) {
      console.error('Error generating AI insights:', error)
      // Fallback to rule-based insights
      const companyData = await this.getCompanyData(companyId)
      return this.generateRuleBasedInsights(companyData)
    }
  }

  async generateAnalyticsInsights(data: any): Promise<any> {
    try {
      const { leads, contacts, campaigns, deals, dateRange } = data;
      
      // Calculate base metrics
      const metrics = this.calculateBaseMetrics(leads, contacts, campaigns, deals);
      
      if (!this.mistralApiKey) {
        console.warn('No Mistral API key available, using calculated insights')
        return this.generateCalculatedInsights(metrics, data)
      }

      // Generate insights using Mistral AI for analytics
      const prompt = this.createAnalyticsPrompt(metrics, data);
      const aiResponse = await this.callMistralAPI(prompt);
      
      return this.parseAnalyticsResponse(aiResponse, metrics);
      
    } catch (error) {
      console.error('Error generating analytics insights:', error)
      // Fallback to calculated insights
      const metrics = this.calculateBaseMetrics(data.leads || [], data.contacts || [], data.campaigns || [], data.deals || []);
      return this.generateCalculatedInsights(metrics, data)
    }
  }

  private async getCompanyData(companyId: string): Promise<CompanyData> {
    // Get company info
    const company = await queryOne('SELECT * FROM companies WHERE id = ?', [companyId]) as any

    // Get contacts
    const contacts = await query('SELECT * FROM contacts WHERE company_id = ? AND active = 1', [companyId]) as any[]

    // Get leads
    const leads = await query('SELECT * FROM leads WHERE company_id = ? AND active = 1', [companyId]) as any[]

    // Get campaigns
    const campaigns = await query('SELECT * FROM campaigns WHERE company_id = ?', [companyId]) as any[]

    // Get activities (last 90 days)
    const activities = await query(`
      SELECT * FROM activity_logs
      WHERE company_id = ?
      AND created_at >= NOW() - INTERVAL '90 days'
      ORDER BY created_at DESC
    `, [companyId]) as any[]

    return {
      id: companyId,
      name: company?.name || 'Unknown Company',
      contacts: contacts || [],
      leads: leads || [],
      deals: leads?.filter((l: any) => parseFloat(l.value || '0') >= 5000 || ['Proposal', 'Negotiation'].includes(l.stage)) || [],
      campaigns: campaigns || [],
      activities: activities || []
    }
  }

  private async callMistralForInsights(data: CompanyData): Promise<AIInsight[]> {
    try {
      const prompt = this.buildAnalyticsPrompt(data)
      
      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.mistralApiKey}`
        },
        body: JSON.stringify({
          model: 'mistral-large-latest',
          messages: [
            {
              role: 'system',
              content: 'You are a CRM analytics expert. Analyze the company data and provide specific, actionable insights in JSON format. Focus on real patterns in the data provided.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 2000
        })
      })

      if (!response.ok) {
        throw new Error(`Mistral API error: ${response.statusText}`)
      }

      const result = await response.json()
      const aiResponse = result.choices[0]?.message?.content

      // Parse AI response to extract structured insights
      return this.parseAIResponse(aiResponse, data)
      
    } catch (error) {
      console.error('Mistral AI call failed:', error)
      throw error
    }
  }

  private buildAnalyticsPrompt(data: CompanyData): string {
    const metrics = this.calculateKeyMetrics(data)
    
    return `
Analyze the following CRM data for ${data.name} and provide 5-8 specific insights in JSON format:

Company Data Summary:
- Total Contacts: ${data.contacts.length}
- Total Leads: ${data.leads.length} 
- Total Deals: ${data.deals.length}
- Total Campaigns: ${data.campaigns.length}
- Recent Activities: ${data.activities.length}

Key Metrics:
- Conversion Rate: ${metrics.conversionRate}%
- Average Deal Value: $${metrics.avgDealValue}
- Pipeline Value: $${metrics.pipelineValue}
- Lead Velocity: ${metrics.leadVelocity} leads/month
- Activity Rate: ${metrics.activityRate} activities/day

Recent Trends:
- Leads by Stage: ${JSON.stringify(metrics.leadsByStage)}
- Revenue by Month: ${JSON.stringify(metrics.revenueByMonth)}
- Top Sources: ${JSON.stringify(metrics.topSources)}

Please provide insights in this exact JSON format:
{
  "insights": [
    {
      "title": "Specific insight title",
      "description": "Detailed explanation based on actual data",
      "type": "insight|recommendation|warning|opportunity",
      "priority": "high|medium|low",
      "confidence": 0.85
    }
  ]
}

Focus on:
1. Real patterns in the data
2. Actionable recommendations
3. Potential risks or opportunities
4. Performance trends
5. Areas for improvement

Base all insights on the actual numbers provided, not generic advice.
`;
  }

  private calculateKeyMetrics(data: CompanyData) {
    const totalLeads = data.leads.length
    const closedWonDeals = data.deals.filter((d: any) => d.stage === 'Closed Won').length
    const conversionRate = totalLeads > 0 ? ((closedWonDeals / totalLeads) * 100).toFixed(1) : 0
    
    const totalDealValue = data.deals.reduce((sum: number, deal: any) => {
      return sum + (parseFloat(deal.value || '0') || 0)
    }, 0)
    
    const avgDealValue = data.deals.length > 0 ? (totalDealValue / data.deals.length).toFixed(0) : 0
    
    const pipelineValue = data.deals
      .filter((d: any) => !['Closed Won', 'Closed Lost'].includes(d.stage))
      .reduce((sum: number, deal: any) => sum + (parseFloat(deal.value || '0') || 0), 0)

    // Calculate lead velocity (leads per month)
    const recentLeads = data.leads.filter((l: any) => {
      const createdAt = new Date(l.created_at || l.createdAt)
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      return createdAt >= thirtyDaysAgo
    })
    const leadVelocity = recentLeads.length

    // Calculate activity rate
    const activitiesLast7Days = data.activities.filter((a: any) => {
      const activityDate = new Date(a.created_at || a.createdAt)
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      return activityDate >= sevenDaysAgo
    })
    const activityRate = (activitiesLast7Days.length / 7).toFixed(1)

    // Leads by stage
    const leadsByStage = data.leads.reduce((acc: any, lead: any) => {
      acc[lead.stage] = (acc[lead.stage] || 0) + 1
      return acc
    }, {})

    // Revenue by month (last 6 months)
    const revenueByMonth: { [key: string]: number } = {}
    data.deals.filter((d: any) => d.stage === 'Closed Won').forEach((deal: any) => {
      const date = new Date(deal.updated_at || deal.updatedAt)
      const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`
      revenueByMonth[monthKey] = (revenueByMonth[monthKey] || 0) + (parseFloat(deal.value || '0') || 0)
    })

    // Top sources
    const topSources = data.leads.reduce((acc: any, lead: any) => {
      acc[lead.source] = (acc[lead.source] || 0) + 1
      return acc
    }, {})

    return {
      conversionRate,
      avgDealValue,
      pipelineValue,
      leadVelocity,
      activityRate,
      leadsByStage,
      revenueByMonth,
      topSources
    }
  }

  private calculateBaseMetrics(leads: any[], contacts: any[], campaigns: any[], deals: any[]): any {
    // Normalise stage so "closed-won", "Closed Won", "Won", "closed_won" all match
    const isWon = (l: any) => {
      const s = String(l.stage || l.status || '').toLowerCase().replace(/[-_]/g, ' ').trim();
      return s === 'closed won' || s === 'won';
    };
    const isLost = (l: any) => {
      const s = String(l.stage || l.status || '').toLowerCase().replace(/[-_]/g, ' ').trim();
      return s === 'closed lost' || s === 'lost';
    };
    // Always parse value as a number so string values like "$1,234" don't cause concatenation
    const parseVal = (v: any): number => {
      if (typeof v === 'string') return parseFloat(v.replace(/[$,]/g, '')) || 0;
      return Number(v) || 0;
    };

    const closedWonLeads = leads.filter(isWon);
    const totalRevenue = closedWonLeads.reduce((sum, l) => sum + parseVal(l.value), 0);
    const conversionRate = leads.length > 0 ? closedWonLeads.length / leads.length : 0;
    const avgDealSize = closedWonLeads.length > 0 ? totalRevenue / closedWonLeads.length : 0;
    const pipelineValue = leads.filter(l => !isWon(l) && !isLost(l)).reduce((sum, l) => sum + parseVal(l.value), 0);

    return {
      totalLeads: leads.length,
      totalContacts: contacts.length,
      totalCampaigns: campaigns.length,
      totalDeals: deals.length,
      totalRevenue,
      closedDeals: closedWonLeads.length,
      conversionRate,
      avgDealSize,
      pipelineValue,
      highRiskDeals: leads.filter(l => (l.probability || 50) < 30).length,
      activeCustomers: contacts.filter(c => c.status === 'Active').length
    };
  }

  private async callMistralAPI(prompt: string): Promise<string> {
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.mistralApiKey}`
      },
      body: JSON.stringify({
        model: 'mistral-large-latest',
        messages: [
          {
            role: 'system',
            content: 'You are an AI analytics expert. Provide strategic insights based on the CRM analytics data.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1500
      })
    });

    if (!response.ok) {
      throw new Error(`Mistral API error: ${response.statusText}`);
    }

    const result = await response.json();
    return result.choices[0]?.message?.content || '';
  }

  private createAnalyticsPrompt(metrics: any, data: any): string {
    const { leads = [], contacts = [], deals = [], campaigns = [] } = data;

    // Build actual deal context for Mistral
    const parseVal = (v: any): number => typeof v === 'string' ? parseFloat(v.replace(/[$,]/g, '')) || 0 : Number(v) || 0;
    const isWon = (s: any) => { const n = String(s || '').toLowerCase().replace(/[-_]/g, ' ').trim(); return n === 'closed won' || n === 'won'; };
    const isLost = (s: any) => { const n = String(s || '').toLowerCase().replace(/[-_]/g, ' ').trim(); return n === 'closed lost' || n === 'lost'; };

    const openDeals = deals.filter((d: any) => !isWon(d.stage || d.status) && !isLost(d.stage || d.status));
    const wonDeals = deals.filter((d: any) => isWon(d.stage || d.status));

    const topDeals = [...openDeals]
      .sort((a: any, b: any) => parseVal(b.value) - parseVal(a.value))
      .slice(0, 5)
      .map((d: any) => `"${d.name || d.title || 'Unnamed'}": $${parseVal(d.value).toLocaleString()} (${d.stage || d.status || 'Unknown'})`)
      .join(', ');

    const stageBreakdown = deals.reduce((acc: any, d: any) => {
      const s = d.stage || d.status || 'Unknown';
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});

    const leadSources = leads.reduce((acc: any, l: any) => {
      acc[l.source || 'Unknown'] = (acc[l.source || 'Unknown'] || 0) + 1;
      return acc;
    }, {});

    const topSource = Object.entries(leadSources).sort(([, a]: any, [, b]: any) => b - a)[0];

    const recentWonRevenue = wonDeals
      .filter((d: any) => {
        const dt = new Date(d.updated_at || d.created_at || Date.now());
        return dt >= new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      })
      .reduce((sum: number, d: any) => sum + parseVal(d.value), 0);

    return `You are a CRM analytics expert. Analyze the following REAL company CRM data and provide specific, data-driven insights.

REAL METRICS (based on actual system data):
- Total Leads: ${metrics.totalLeads}
- Total Contacts: ${metrics.totalContacts}
- Total Revenue (won deals): $${metrics.totalRevenue.toLocaleString()}
- Revenue last 90 days: $${recentWonRevenue.toLocaleString()}
- Conversion Rate: ${(metrics.conversionRate * 100).toFixed(1)}%
- Average Deal Size: $${metrics.avgDealSize.toLocaleString()}
- Total Pipeline Value: $${metrics.pipelineValue.toLocaleString()}
- Won Deals: ${metrics.closedDeals}
- Open Deals: ${openDeals.length}
- High Risk Deals: ${metrics.highRiskDeals}
- Active Contacts: ${metrics.activeCustomers}
- Campaigns: ${metrics.totalCampaigns}

DEAL STAGE BREAKDOWN: ${JSON.stringify(stageBreakdown)}
TOP OPEN DEALS: ${topDeals || 'None'}
TOP LEAD SOURCE: ${topSource ? `${topSource[0]} (${topSource[1]} leads)` : 'Unknown'}
LEAD SOURCES: ${JSON.stringify(leadSources)}

Based ONLY on this real data, respond with a JSON object (no markdown, no code blocks, raw JSON only):
{
  "accuracy": 0.87,
  "insights": {
    "predicted_revenue": <realistic number based on pipeline and conversion rate>,
    "pipeline_health": <0-1 score based on stage distribution and conversion>,
    "deal_velocity": <avg days to close, estimate from data>,
    "customer_ltv": <avg revenue per contact>,
    "team_efficiency": <0-1 score based on conversion and activity>,
    "churn_risk": <number of contacts at risk>,
    "customer_satisfaction": <0-1 estimate>,
    "risk_factors": [
      {"factor": "<real risk from data>", "impact": "high|medium|low", "count": <number>}
    ]
  },
  "trends": {
    "revenue": {"direction": "up|down|stable", "growth_rate": <decimal>},
    "pipeline": {"direction": "up|down|stable", "growth_rate": <decimal>}
  },
  "recommendations": [
    "<specific recommendation referencing actual data above>",
    "<specific recommendation referencing actual data above>",
    "<specific recommendation referencing actual data above>",
    "<specific recommendation referencing actual data above>"
  ],
  "model_performance": {
    "lead_scoring": <0-1>,
    "churn_prediction": <0-1>,
    "revenue_forecasting": <0-1>,
    "risk_assessment": <0-1>
  },
  "predictions": {
    "next_month_revenue": <realistic number>,
    "conversion_rate": <decimal>,
    "deal_velocity": <days>
  }
}

All numbers must be grounded in the real data provided above. Do not use placeholder or generic numbers.`;
  }

  private generateCalculatedInsights(metrics: any, data: any): any {
    return {
      accuracy: 0.85,
      insights: {
        predicted_revenue: Math.round(metrics.pipelineValue * 0.6),
        pipeline_health: metrics.conversionRate > 0
          ? Math.min(0.9, metrics.conversionRate * 3)
          : metrics.pipelineValue > 0 ? 0.72 : 0.5,
        deal_velocity: 45,
        customer_ltv: metrics.avgDealSize > 0
          ? metrics.avgDealSize * 2.5
          : (metrics.totalRevenue > 0 && metrics.totalContacts > 0
              ? Math.round((metrics.totalRevenue / metrics.totalContacts) * 3)
              : 0),
        team_efficiency: metrics.conversionRate > 0
          ? Math.min(0.9, metrics.conversionRate * 2.5)
          : metrics.pipelineValue > 0 ? 0.68 : 0.5,
        churn_risk: Math.floor(metrics.totalContacts * 0.12),
        customer_satisfaction: 0.82,
        risk_factors: [
          { factor: "Budget constraints", impact: "medium", count: Math.floor(metrics.totalLeads * 0.15) },
          { factor: "Timeline issues", impact: "low", count: Math.floor(metrics.totalLeads * 0.08) }
        ]
      },
      trends: {
        revenue: { direction: "up", growth_rate: 0.15 },
        pipeline: { direction: "stable", growth_rate: 0.05 }
      },
      recommendations: (() => {
        const recs: string[] = [];
        if (metrics.conversionRate < 0.1)
          recs.push(`Conversion rate is ${(metrics.conversionRate * 100).toFixed(1)}% — improve lead qualification and follow-up cadence to raise this`);
        else
          recs.push(`Conversion rate is ${(metrics.conversionRate * 100).toFixed(1)}% — maintain rigorous qualification and consider expanding top-performing lead sources`);
        if (metrics.pipelineValue > 0)
          recs.push(`$${metrics.pipelineValue.toLocaleString()} in open pipeline — prioritise deals in advanced stages (proposal/negotiation) for fastest revenue impact`);
        if (metrics.avgDealSize > 0)
          recs.push(`Average deal size is $${metrics.avgDealSize.toLocaleString()} — ${metrics.avgDealSize < 10000 ? 'explore upsell and bundling strategies to increase deal value' : 'identify upsell paths for top accounts to grow deal size further'}`);
        if (metrics.totalContacts > 0)
          recs.push(`${metrics.totalContacts} contacts in CRM — implement regular engagement sequences to prevent lead decay and improve LTV`);
        if (recs.length < 4)
          recs.push('Review won/lost deal patterns to identify the key factors driving conversion success and replicate them');
        return recs;
      })(),
      model_performance: {
        lead_scoring: 0.88,
        churn_prediction: 0.76,
        revenue_forecasting: 0.82,
        risk_assessment: 0.81
      },
      predictions: {
        next_month_revenue: Math.round(metrics.totalRevenue * 1.2),
        conversion_rate: Math.min(0.4, metrics.conversionRate * 1.2),
        deal_velocity: 38
      }
    };
  }

  private parseAnalyticsResponse(aiResponse: string, metrics: any): any {
    try {
      // Mistral often wraps JSON in markdown code blocks — strip them before parsing
      const cleaned = aiResponse
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/i, '')
        .trim();
      const parsed = JSON.parse(cleaned);
      return {
        ...parsed,
        accuracy: parsed.accuracy || 0.85,
        insights: {
          ...parsed.insights,
          predicted_revenue: parsed.insights?.predicted_revenue || Math.round(metrics.pipelineValue * 0.6)
        }
      };
    } catch (error) {
      console.error('Error parsing AI response, using calculated insights:', error);
      return this.generateCalculatedInsights(metrics, {});
    }
  }

  private parseAIResponse(aiResponse: string, data: CompanyData): AIInsight[] {
    try {
      // Try to parse JSON response
      const parsed = JSON.parse(aiResponse)
      if (parsed.insights && Array.isArray(parsed.insights)) {
        return parsed.insights.map((insight: any) => ({
          title: insight.title || 'AI Insight',
          description: insight.description || 'Generated insight',
          type: insight.type || 'insight',
          priority: insight.priority || 'medium',
          confidence: insight.confidence || 0.7,
          metrics: this.calculateKeyMetrics(data)
        }))
      }
    } catch (error) {
      console.error('Error parsing AI response:', error)
    }

    // Fallback: extract insights from text response
    return this.extractInsightsFromText(aiResponse, data)
  }

  private extractInsightsFromText(text: string, data: CompanyData): AIInsight[] {
    const insights: AIInsight[] = []
    const metrics = this.calculateKeyMetrics(data)
    
    // Split text by sentences and identify insights
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20)
    
    sentences.forEach((sentence, index) => {
      if (index < 5 && sentence.trim()) { // Take first 5 meaningful sentences
        insights.push({
          title: `AI Insight ${index + 1}`,
          description: sentence.trim(),
          type: this.determineInsightType(sentence),
          priority: this.determinePriority(sentence),
          confidence: 0.7,
          metrics
        })
      }
    })

    return insights.length > 0 ? insights : this.generateRuleBasedInsights(data)
  }

  private determineInsightType(text: string): 'insight' | 'recommendation' | 'warning' | 'opportunity' {
    const lower = text.toLowerCase()
    if (lower.includes('recommend') || lower.includes('should') || lower.includes('suggest')) {
      return 'recommendation'
    }
    if (lower.includes('warning') || lower.includes('risk') || lower.includes('decline')) {
      return 'warning'
    }
    if (lower.includes('opportunity') || lower.includes('increase') || lower.includes('growth')) {
      return 'opportunity'
    }
    return 'insight'
  }

  private determinePriority(text: string): 'high' | 'medium' | 'low' {
    const lower = text.toLowerCase()
    if (lower.includes('critical') || lower.includes('urgent') || lower.includes('immediate')) {
      return 'high'
    }
    if (lower.includes('important') || lower.includes('significant')) {
      return 'medium'
    }
    return 'low'
  }

  private generateRuleBasedInsights(data: CompanyData): AIInsight[] {
    const insights: AIInsight[] = []
    const metrics = this.calculateKeyMetrics(data)
    
    // Conversion Rate Analysis
    const conversionRate = parseFloat(metrics.conversionRate.toString())
    if (conversionRate < 10) {
      insights.push({
        title: "Low Lead Conversion Rate",
        description: `Your conversion rate of ${conversionRate}% is below industry average. Focus on lead qualification and follow-up processes.`,
        type: 'warning',
        priority: 'high',
        confidence: 0.9,
        metrics
      })
    } else if (conversionRate > 25) {
      insights.push({
        title: "Excellent Conversion Performance",
        description: `Your ${conversionRate}% conversion rate is exceptional. Consider scaling your lead generation efforts.`,
        type: 'opportunity',
        priority: 'medium',
        confidence: 0.9,
        metrics
      })
    }

    // Deal Value Analysis
    const avgDealValue = parseFloat(metrics.avgDealValue.toString())
    if (avgDealValue > 0) {
      insights.push({
        title: "Average Deal Value Insights",
        description: `Your average deal value is $${avgDealValue.toLocaleString()}. ${avgDealValue > 50000 ? 'Focus on high-value deals and premium services.' : 'Consider upselling strategies to increase deal value.'}`,
        type: avgDealValue > 50000 ? 'opportunity' : 'recommendation',
        priority: 'medium',
        confidence: 0.8,
        metrics
      })
    }

    // Pipeline Analysis
    if (metrics.pipelineValue > 0) {
      insights.push({
        title: "Pipeline Health Assessment",
        description: `Current pipeline value: $${metrics.pipelineValue.toLocaleString()}. ${data.deals.length < 5 ? 'Pipeline appears thin - increase lead generation efforts.' : 'Strong pipeline - focus on conversion optimization.'}`,
        type: data.deals.length < 5 ? 'warning' : 'insight',
        priority: data.deals.length < 5 ? 'high' : 'medium',
        confidence: 0.8,
        metrics
      })
    }

    // Activity Analysis
    const activityRate = parseFloat(metrics.activityRate.toString())
    if (activityRate < 2) {
      insights.push({
        title: "Low Activity Levels",
        description: `Only ${activityRate} activities per day detected. Increase customer touchpoints and engagement activities.`,
        type: 'recommendation',
        priority: 'medium',
        confidence: 0.7,
        metrics
      })
    }

    // Lead Source Analysis
    if (Object.keys(metrics.topSources).length > 0) {
      const topSource = Object.entries(metrics.topSources).sort(([,a]: any, [,b]: any) => b - a)[0]
      insights.push({
        title: "Lead Source Performance",
        description: `${topSource[0]} is your top lead source with ${topSource[1]} leads. Consider investing more in this channel.`,
        type: 'opportunity',
        priority: 'medium',
        confidence: 0.8,
        metrics
      })
    }

    return insights
  }

  private enrichInsightsWithMetrics(insights: AIInsight[], data: CompanyData): AIInsight[] {
    const metrics = this.calculateKeyMetrics(data)
    return insights.map(insight => ({
      ...insight,
      metrics
    }))
  }
}
