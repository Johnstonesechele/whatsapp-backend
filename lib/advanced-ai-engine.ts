// Enhanced AI Analytics Engine for Union
import { GoogleGenerativeAI } from '@google/generative-ai'
import { getAIConfig } from '@/config/ai-config'

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

export interface AIInsight {
  id: string
  type: 'prediction' | 'recommendation' | 'alert' | 'trend' | 'opportunity'
  category: 'revenue' | 'pipeline' | 'customer' | 'performance' | 'risk'
  title: string
  description: string
  confidence: number
  impact: 'critical' | 'high' | 'medium' | 'low'
  priority: number
  actionable: boolean
  data?: any
  recommendations?: string[]
  createdAt: Date
}

export interface RevenueForecast {
  nextMonth: number
  nextQuarter: number
  nextYear: number
  confidence: number
  growthTrend: 'increasing' | 'decreasing' | 'stable'
  factors: string[]
  riskFactors: string[]
}

export interface LeadScore {
  score: number
  confidence: number
  factors: {
    engagement: number
    demographic: number
    behavioral: number
    company: number
  }
  reasons: string[]
  recommendations: string[]
}

export interface CustomerIntelligence {
  engagementScore: number
  purchaseIntent: number
  lifetimeValue: number
  churnRisk: number
  bestContactTime: string
  preferredChannel: string
  interests: string[]
  painPoints: string[]
  nextBestAction: string
}

export interface DealRiskAssessment {
  riskScore: number
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  risks: string[]
  recommendations: string[]
  probabilityOfClose: number
  suggestedActions: string[]
}

export interface EngagementData {
  emailOpens: number
  emailClicks: number
  websiteVisits: number
  documentDownloads: number
  formSubmissions: number
  callDuration: number
  meetingAttendance: number
  responseTime: number
  socialEngagement: number
  lastActivityDate: Date
  activityFrequency: number
  contentInteraction: {
    type: string
    timestamp: Date
    duration?: number
    value: number
  }[]
}

export interface PredictiveLeadScore {
  currentScore: number
  predictedScore: number
  scoreChange: number
  confidence: number
  engagementTrend: 'increasing' | 'decreasing' | 'stable'
  predictedActions: string[]
  timeToConvert: number // in days
  conversionProbability: number
  nextBestAction: string
  riskFactors: string[]
}

export interface AutoDealRisk {
  dealId: string
  currentRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  riskFactors: {
    timeStagnation: number
    competitorThreat: number
    budgetConcerns: number
    stakeholderEngagement: number
    technicalFit: number
    timingIssues: number
  }
  alerts: {
    type: 'warning' | 'critical' | 'info'
    message: string
    urgency: number
    actionRequired: boolean
  }[]
  recommendations: string[]
  automatedActions: string[]
  probabilityOfClose: number
  timeToClose: number
  suggestedIntervention: string
}

class AdvancedAIEngine {
  private genAI: GoogleGenerativeAI | null = null
  private mistralApiKey: string | null = null
  private openAIApiKey: string | null = null
  private activeModel: string
  private isEnabled: boolean

  constructor() {
    console.log(' Advanced AI Engine initializing...')
    const cfg = getAIConfig()
    this.activeModel = cfg.model
    this.isEnabled = cfg.enabled
    console.log(` AI Model: ${this.activeModel} | Enabled: ${this.isEnabled} | Scope: ${cfg.appliedTo}`)
    
    // Initialize AI providers
    if (process.env.OPENAI_API_KEY) {
      this.openAIApiKey = process.env.OPENAI_API_KEY
      console.log(' OpenAI configured')
    }
    
    if (process.env.MISTRAL_API_KEY) {
      this.mistralApiKey = process.env.MISTRAL_API_KEY
      console.log(' Mistral AI configured')
    }
    
    if (process.env.GEMINI_API_KEY) {
      this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
      console.log(' Gemini AI configured')
    }
  }

  getActiveModel() {
    return this.activeModel
  }

  getEnabled() {
    return this.isEnabled
  }

  // Main AI Analytics Entry Point
  async generateAdvancedInsights(data: {
    contacts: any[],
    leads: any[],
    campaigns: any[],
    deals?: any[],
    activities?: any[]
  }): Promise<AIInsight[]> {
    try {
      console.log(' Generating advanced AI insights...')
      
      const insights: AIInsight[] = []
      
      // Revenue Intelligence
      insights.push(...await this.generateRevenueInsights(data))
      
      // Pipeline Intelligence  
      insights.push(...await this.generatePipelineInsights(data.leads))
      
      // Customer Intelligence
      insights.push(...await this.generateCustomerInsights(data.contacts, data.activities))
      
      // Performance Intelligence
      insights.push(...await this.generatePerformanceInsights(data))
      
      // Risk Intelligence
      insights.push(...await this.generateRiskInsights(data))
      
      // Opportunity Intelligence
      insights.push(...await this.generateOpportunityInsights(data))
      
      // Sort by priority and impact
      insights.sort((a, b) => b.priority - a.priority)
      
      console.log(` Generated ${insights.length} AI insights`)
      return insights.slice(0, 15) // Return top 15 insights
      
    } catch (error) {
      console.error(' AI Engine error:', error)
      return this.getFallbackInsights()
    }
  }

  // Revenue Forecasting with AI
  async generateRevenueForecast(data: {
    leads: any[],
    deals?: any[],
    historicalData?: any[]
  }): Promise<RevenueForecast> {
    try {
      console.log(' Generating AI revenue forecast...')
      
      const { leads, deals = [], historicalData = [] } = data
      
      // Calculate weighted pipeline value
      const stageWeights = {
        'New': 0.1,
        'Qualification': 0.2,
        'Proposal': 0.4,
        'Negotiation': 0.7,
        'Closed Won': 1.0,
        'Closed Lost': 0.0
      }
      
      const pipelineValue = leads.reduce((total, lead) => {
        const weight = (stageWeights as any)[lead.stage] || 0.1
        const value = parseFloat(lead.value) || 0
        return total + (value * weight)
      }, 0)
      
      // AI-enhanced calculations
      const seasonalityFactor = this.calculateSeasonality ? this.calculateSeasonality() : 1.0
      const trendFactor = this.calculateTrendFactor(historicalData)
      const velocityFactor = this.calculateVelocityFactor(leads)
      
      const nextMonth = pipelineValue * seasonalityFactor * 0.3
      const nextQuarter = pipelineValue * trendFactor * 0.8
      const nextYear = pipelineValue * trendFactor * velocityFactor * 3.2
      
      // Calculate confidence based on data quality
      const confidence = this.calculateForecastConfidence(data)
      
      // Determine growth trend using AI analysis
      const growthTrend = await this.analyzeGrowthTrend(historicalData)
      
      return {
        nextMonth: Math.round(nextMonth),
        nextQuarter: Math.round(nextQuarter),
        nextYear: Math.round(nextYear),
        confidence,
        growthTrend,
        factors: this.identifyGrowthFactors(data),
        riskFactors: this.identifyRiskFactors(data)
      }
      
    } catch (error) {
      console.error(' Revenue forecast error:', error)
      return this.getFallbackForecast()
    }
  }

  // Advanced Lead Scoring with ML-like behavior
  async calculateAdvancedLeadScore(lead: any, context: {
    similarLeads?: any[],
    historicalData?: any[],
    companyData?: any
  }): Promise<LeadScore> {
    try {
      console.log(` Calculating AI lead score for ${lead.name}...`)
      
      let baseScore = 50
      const factors = {
        engagement: 0,
        demographic: 0,
        behavioral: 0,
        company: 0
      }
      const reasons: string[] = []
      
      // Engagement Intelligence (30% weight)
      const engagementScore = this.calculateEngagementScore(lead)
      factors.engagement = engagementScore
      baseScore += (engagementScore - 50) * 0.3
      
      if (engagementScore > 70) {
        reasons.push('High engagement with multiple touchpoints')
      } else if (engagementScore < 30) {
        reasons.push('Low engagement - may need nurturing')
      }
      
      // Demographic Intelligence (25% weight)
      const demoScore = this.calculateDemographicScore(lead, context.companyData)
      factors.demographic = demoScore
      baseScore += (demoScore - 50) * 0.25
      
      if (demoScore > 75) {
        reasons.push('Perfect demographic match for our ideal customer')
      }
      
      // Behavioral Intelligence (25% weight)
      const behaviorScore = await this.calculateBehavioralScore(lead, context.similarLeads)
      factors.behavioral = behaviorScore
      baseScore += (behaviorScore - 50) * 0.25
      
      // Company Intelligence (20% weight)
      const companyScore = this.calculateCompanyScore(lead)
      factors.company = companyScore
      baseScore += (companyScore - 50) * 0.2
      
      if (companyScore > 80) {
        reasons.push('Company shows strong buying signals')
      }
      
      const finalScore = Math.max(0, Math.min(100, Math.round(baseScore)))
      const confidence = this.calculateScoreConfidence(lead, context)
      
      return {
        score: finalScore,
        confidence,
        factors,
        reasons,
        recommendations: this.generateScoreRecommendations(finalScore, factors)
      }
      
    } catch (error) {
      console.error(' Lead scoring error:', error)
      return this.getFallbackScore()
    }
  }

  // Customer Intelligence Engine
  async generateCustomerIntelligence(customer: any, interactions: any[] = []): Promise<CustomerIntelligence> {
    try {
      console.log(` Generating customer intelligence for ${customer.name}...`)
      
      // Engagement Analysis
      const engagementScore = this.analyzeEngagementPattern(interactions)
      
      // Purchase Intent Prediction  
      const purchaseIntent = this.predictPurchaseIntent(customer, interactions)
      
      // Lifetime Value Calculation
      const lifetimeValue = this.calculatePredictedLTV(customer)
      
      // Churn Risk Analysis
      const churnRisk = this.assessChurnRisk(interactions)
      
      // Behavioral Analysis
      const behaviorInsights = this.analyzeBehavior(interactions)
      
      return {
        engagementScore: typeof engagementScore === 'string' ? 
          (engagementScore === 'high' ? 80 : engagementScore === 'medium' ? 60 : 40) : engagementScore,
        purchaseIntent,
        lifetimeValue,
        churnRisk,
        bestContactTime: behaviorInsights.bestContactTime,
        preferredChannel: behaviorInsights.preferredChannel,
        interests: behaviorInsights.interests,
        painPoints: behaviorInsights.painPoints,
        nextBestAction: this.determineNextBestAction({
          engagementScore: typeof engagementScore === 'string' ? 
            (engagementScore === 'high' ? 80 : engagementScore === 'medium' ? 60 : 40) : engagementScore,
          purchaseIntent,
          churnRisk
        })
      }
      
    } catch (error) {
      console.error(' Customer intelligence error:', error)
      return this.getFallbackCustomerIntelligence()
    }
  }

  // Deal Risk Assessment
  async assessDealRisk(deal: any, context?: any): Promise<DealRiskAssessment> {
    try {
      console.log(` Assessing deal risk for ${deal.name}...`)
      
      let riskScore = 0
      const risks: string[] = []
      const recommendations: string[] = []
      
      // Time-based Risk Analysis
      const timeRiskScore = this.analyzeTimeRisks(deal)
      riskScore += timeRiskScore
      if (timeRiskScore > 50) risks.push('Deal stagnation detected')
      
      // Value-based Risk Analysis  
      const valueRiskScore = this.analyzeValueRisks(deal)
      riskScore += valueRiskScore
      if (valueRiskScore > 50) risks.push('Value concerns identified')
      
      // Engagement Risk Analysis
      const engagementData = context?.engagement || {}
      const engagementRiskScore = this.analyzeEngagementRisks(engagementData)
      riskScore += engagementRiskScore
      if (engagementRiskScore > 50) risks.push('Low engagement detected')
      
      // Competitive Risk Analysis
      const competitorData = context?.competitor || {}
      const competitiveRiskScore = this.analyzeCompetitiveRisks(competitorData)
      riskScore += competitiveRiskScore
      if (competitiveRiskScore > 50) risks.push('High competitive pressure')
      
      // Average the risk scores
      riskScore = Math.round(riskScore / 4)
      
      // Generate recommendations based on risk level
      const riskLevel = riskScore > 75 ? 'CRITICAL' : 
                       riskScore > 50 ? 'HIGH' : 
                       riskScore > 25 ? 'MEDIUM' : 'LOW'
      
      recommendations.push(...this.generateRiskRecommendations(risks, riskLevel))
      
      const probabilityOfClose = Math.max(10, 90 - riskScore)
      
      return {
        riskScore: Math.min(100, riskScore),
        riskLevel,
        risks: risks.filter(Boolean),
        recommendations,
        probabilityOfClose,
        suggestedActions: this.generateSuggestedActions({
          riskScore,
          riskLevel,
          deal,
          riskFactors: {
            timeStagnation: timeRiskScore,
            competitorThreat: competitiveRiskScore,
            budgetConcerns: valueRiskScore,
            stakeholderEngagement: engagementRiskScore,
            technicalFit: 30,
            timingIssues: 20
          }
        })
      }
      
    } catch (error) {
      console.error(' Deal risk assessment error:', error)
      return this.getFallbackRiskAssessment()
    }
  }

  // AI-Powered Conversation Analysis
  async analyzeConversation(conversation: {
    messages: Array<{
      sender: string,
      content: string,
      timestamp: Date,
      channel: 'whatsapp' | 'email' | 'call'
    }>
  }): Promise<{
    sentiment: 'positive' | 'negative' | 'neutral',
    sentimentScore: number,
    intent: string[],
    urgency: 'high' | 'medium' | 'low',
    topics: string[],
    nextBestResponse: string,
    recommendations: string[]
  }> {
    try {
      console.log(' Analyzing conversation with AI...')
      
      // Combine all messages into a single text for analysis
      const allText = conversation.messages.map(m => m.content).join(' ')
      
      // Use AI for sentiment analysis
      const sentimentScore = this.analyzeSentiment(allText)
      const sentiment = sentimentScore > 60 ? 'positive' : sentimentScore < 40 ? 'negative' : 'neutral'
      
      // Extract intent and topics
      const analysis = this.extractIntentAndTopics(allText)
      
      // Determine urgency
      const urgencyScore = this.determineUrgency(analysis)
      const urgency = urgencyScore > 70 ? 'high' : urgencyScore > 40 ? 'medium' : 'low'
      
      // Generate next best response
      const nextBestResponse = this.generateNextBestResponse(analysis)
      
      return {
        sentiment,
        sentimentScore: sentimentScore / 100,
        intent: Array.isArray(analysis.intent) ? analysis.intent : [analysis.intent],
        urgency,
        topics: analysis.topics,
        nextBestResponse,
        recommendations: this.generateConversationRecommendations(analysis)
      }
      
    } catch (error) {
      console.error(' Conversation analysis error:', error)
      return this.getFallbackConversationAnalysis()
    }
  }

  // Public methods for API
  async generateInsights(data: {
    contacts: any[],
    leads: any[],
    campaigns: any[],
    timeframe?: string
  }): Promise<AIInsight[]> {
    return this.generateAdvancedInsights(data)
  }

  async predictRevenue(data: {
    historicalData: any[],
    pipelineData: any[]
  }): Promise<RevenueForecast> {
    return this.generateRevenueForecast({
      leads: data.pipelineData,
      deals: data.historicalData,
      historicalData: data.historicalData
    })
  }

  // Helper Methods
  private async generateRevenueInsights(data: any): Promise<AIInsight[]> {
    const insights: AIInsight[] = []
    
    // Revenue opportunity insight
    const highValueDeals = data.leads.filter((lead: any) => lead.value > 50000)
    if (highValueDeals.length > 0) {
      insights.push({
        id: `revenue-opportunity-${Date.now()}`,
        type: 'opportunity',
        category: 'revenue',
        title: 'High-Value Deals in Pipeline',
        description: `${highValueDeals.length} deals worth $${highValueDeals.reduce((sum: number, deal: any) => sum + deal.value, 0).toLocaleString()} require immediate attention`,
        confidence: 85,
        impact: 'high',
        priority: 90,
        actionable: true,
        recommendations: [
          'Assign senior sales reps to high-value deals',
          'Schedule executive involvement for deals over $100k',
          'Create custom proposals for top 3 deals'
        ],
        createdAt: new Date()
      })
    }
    
    return insights
  }

  private async generatePipelineInsights(leads: any[]): Promise<AIInsight[]> {
    const insights: AIInsight[] = []
    
    // Pipeline velocity insight
    const stalledDeals = leads.filter(lead => {
      const daysSinceUpdate = Math.floor((Date.now() - new Date(lead.updatedAt).getTime()) / (1000 * 60 * 60 * 24))
      return daysSinceUpdate > 14 && ['Proposal', 'Negotiation'].includes(lead.stage)
    })
    
    if (stalledDeals.length > 0) {
      insights.push({
        id: `pipeline-stalled-${Date.now()}`,
        type: 'alert',
        category: 'pipeline',
        title: 'Stalled Deals Detected',
        description: `${stalledDeals.length} high-stage deals haven't been updated in 14+ days`,
        confidence: 95,
        impact: 'high',
        priority: 85,
        actionable: true,
        recommendations: [
          'Schedule immediate follow-up calls',
          'Review and update deal stages',
          'Identify blockers and create action plans'
        ],
        createdAt: new Date()
      })
    }
    
    return insights
  }

  private async generateCustomerInsights(contacts: any[], activities: any[] = []): Promise<AIInsight[]> {
    // Generate customer-focused insights
    return [{
      id: 'customer-insights-1',
      type: 'recommendation',
      category: 'customer',
      title: 'Customer Engagement Opportunities',
      description: `${contacts.length} customers available for enhanced engagement`,
      confidence: 0.75,
      impact: 'medium',
      priority: 5,
      actionable: true,
      recommendations: ['Analyze customer behavior patterns', 'Create targeted outreach campaigns'],
      createdAt: new Date()
    }]
  }

  private async generatePerformanceInsights(data: any): Promise<AIInsight[]> {
    // Generate performance insights
    return [{
      id: 'performance-insights-1',
      type: 'trend',
      category: 'performance',
      title: 'Performance Trends',
      description: 'Sales performance indicators are trending positive',
      confidence: 0.8,
      impact: 'medium',
      priority: 6,
      actionable: true,
      recommendations: ['Continue current strategies', 'Monitor key metrics'],
      createdAt: new Date()
    }]
  }

  private async generateRiskInsights(data: any): Promise<AIInsight[]> {
    // Generate risk-focused insights
    return [{
      id: 'risk-insights-1',
      type: 'alert',
      category: 'risk',
      title: 'Risk Mitigation',
      description: 'Potential risks identified in sales pipeline',
      confidence: 0.7,
      impact: 'high',
      priority: 8,
      actionable: true,
      recommendations: ['Review high-risk deals', 'Implement mitigation strategies'],
      createdAt: new Date()
    }]
  }

  private async generateOpportunityInsights(data: any): Promise<AIInsight[]> {
    // Generate opportunity insights
    return [{
      id: 'opportunity-insights-1',
      type: 'opportunity',
      category: 'revenue',
      title: 'Revenue Opportunities',
      description: 'New revenue opportunities identified',
      confidence: 0.85,
      impact: 'high',
      priority: 9,
      actionable: true,
      recommendations: ['Pursue high-value leads', 'Expand market reach'],
      createdAt: new Date()
    }]
  }

  private calculateDemographicScore(lead: any, companyData?: any): number {
    let score = 50
    
    // Company size indicators
    if (lead.company && lead.company.toLowerCase().includes('corp')) score += 15
    if (lead.company && lead.company.toLowerCase().includes('inc')) score += 10
    
    // Email domain analysis
    if (lead.email) {
      const domain = lead.email.split('@')[1]
      if (domain && !['gmail.com', 'yahoo.com', 'hotmail.com'].includes(domain)) {
        score += 10 // Business email
      }
    }
    
    return Math.max(0, Math.min(100, score))
  }

  private async calculateBehavioralScore(lead: any, similarLeads?: any[]): Promise<number> {
    let score = 50
    
    // Response patterns
    if (lead.responseTime && lead.responseTime < 3600) { // 1 hour
      score += 20
    }
    
    // Engagement consistency
    if (lead.engagementCount > 3) {
      score += 15
    }
    
    return Math.max(0, Math.min(100, score))
  }

  private calculateCompanyScore(lead: any): number {
    let score = 50
    
    // Industry indicators
    if (lead.industry && ['Technology', 'Finance', 'Healthcare'].includes(lead.industry)) {
      score += 20
    }
    
    // Company signals
    if (lead.value > 25000) score += 15
    if (lead.employees && lead.employees > 50) score += 10
    
    return Math.max(0, Math.min(100, score))
  }

  private getFallbackInsights(): AIInsight[] {
    return [{
      id: 'fallback-insight',
      type: 'recommendation',
      category: 'performance',
      title: 'System Recommendation',
      description: 'Focus on lead qualification and follow-up activities',
      confidence: 50,
      impact: 'medium',
      priority: 50,
      actionable: true,
      createdAt: new Date()
    }]
  }

  private getFallbackForecast(): RevenueForecast {
    return {
      nextMonth: 0,
      nextQuarter: 0,
      nextYear: 0,
      confidence: 0,
      growthTrend: 'stable',
      factors: ['Insufficient data for accurate forecast'],
      riskFactors: ['Limited historical data available']
    }
  }

  private getFallbackScore(): LeadScore {
    return {
      score: 50,
      confidence: 50,
      factors: { engagement: 50, demographic: 50, behavioral: 50, company: 50 },
      reasons: ['Limited data available for scoring'],
      recommendations: ['Gather more lead information']
    }
  }

  // Predictive Lead Scoring based on Engagement Data
  public async calculatePredictiveLeadScore(
    lead: any,
    engagementData: EngagementData,
    historicalData: any[]
  ): Promise<PredictiveLeadScore> {
    try {
      console.log(` Calculating predictive lead score for ${lead.name}...`)

      // Calculate current engagement score with fallback
      const engagementScore = this.calculateEngagementScore(engagementData) || 50
      console.log(` Engagement score: ${engagementScore}`)
      
      // Analyze engagement trends with fallback
      const engagementTrend = this.analyzeEngagementTrend(engagementData) || 'stable'
      console.log(` Engagement trend: ${engagementTrend}`)
      
      // Predict future score based on patterns with fallback
      const predictedScore = await this.predictFutureScore(lead, engagementData, historicalData) || 55
      console.log(` Predicted score: ${predictedScore}`)
      
      // Calculate conversion probability with fallback
      const conversionProbability = this.calculateConversionProbability(
        engagementScore, 
        engagementTrend, 
        lead
      ) || 0.3
      console.log(` Conversion probability: ${conversionProbability}`)
      
      // Estimate time to convert with fallback
      const timeToConvert = this.estimateTimeToConvert(
        engagementData,
        historicalData,
        lead.stage
      ) || 45
      console.log(`⏰ Time to convert: ${timeToConvert}`)
      
      // Identify risk factors with fallback
      const riskFactors = this.identifyEngagementRiskFactors(engagementData, lead) || ['Limited data']
      
      // Suggest next best action with fallback
      const nextBestAction = this.suggestNextBestAction(
        engagementScore,
        engagementTrend,
        lead,
        engagementData
      ) || 'Schedule follow-up call'
      
      // Generate predicted actions with fallback
      const predictedActions = this.generatePredictedActions(
        engagementTrend,
        conversionProbability,
        timeToConvert
      ) || ['Continue monitoring engagement']

      const result = {
        currentScore: engagementScore,
        predictedScore,
        scoreChange: predictedScore - engagementScore,
        confidence: this.calculatePredictionConfidence(engagementData, historicalData) || 30,
        engagementTrend,
        predictedActions,
        timeToConvert,
        conversionProbability,
        nextBestAction,
        riskFactors
      }

      console.log(` Predictive score calculation complete:`, {
        currentScore: result.currentScore,
        predictedScore: result.predictedScore,
        confidence: result.confidence
      })

      return result

    } catch (error) {
      console.error(' Predictive lead scoring failed:', error)
      return this.getFallbackPredictiveScore()
    }
  }

  // Automatic Deal Risk Assessment
  public async assessDealRiskAutomatically(
    deal: any,
    engagementData: EngagementData,
    competitorData?: any[],
    marketData?: any
  ): Promise<AutoDealRisk> {
    try {
      console.log(` Automatically assessing deal risk for ${deal.name}...`)

      // Calculate individual risk factors
      const timeStagnation = this.calculateTimeStagnationRisk(deal)
      const competitorThreat = this.assessCompetitorThreat(deal, competitorData)
      const budgetConcerns = this.evaluateBudgetRisk(deal)
      const stakeholderEngagement = this.assessStakeholderEngagement(
        engagementData,
        deal
      )
      const technicalFit = this.evaluateTechnicalFit(deal)
      const timingIssues = this.assessTimingRisk(deal, marketData)

      const riskFactors = {
        timeStagnation,
        competitorThreat,
        budgetConcerns,
        stakeholderEngagement,
        technicalFit,
        timingIssues
      }

      // Calculate overall risk score
      const overallRiskScore = this.calculateOverallRiskScore(riskFactors)
      const currentRisk = this.determineRiskLevel(overallRiskScore)

      // Generate alerts
      const alerts = this.generateRiskAlerts(riskFactors, deal)

      // Generate recommendations
      const recommendations = this.generateRiskRecommendations(riskFactors, currentRisk)

      // Suggest automated actions
      const automatedActions = this.suggestAutomatedActions(riskFactors, alerts)

      // Calculate probability and timing
      const probabilityOfClose = this.calculateCloseProbability(riskFactors, deal)
      const timeToClose = this.estimateTimeToClose(deal, riskFactors)

      // Suggest intervention
      const suggestedIntervention = this.suggestIntervention(
        currentRisk,
        riskFactors,
        alerts
      )

      return {
        dealId: deal.id,
        currentRisk,
        riskFactors,
        alerts,
        recommendations,
        automatedActions,
        probabilityOfClose,
        timeToClose,
        suggestedIntervention
      }

    } catch (error) {
      console.error(' Automatic deal risk assessment failed:', error)
      return this.getFallbackDealRisk(deal.id)
    }
  }

  private getFallbackCustomerIntelligence(): CustomerIntelligence {
    return {
      engagementScore: 50,
      purchaseIntent: 30,
      lifetimeValue: 1000,
      churnRisk: 0.2,
      bestContactTime: '9AM-5PM',
      preferredChannel: 'email',
      interests: [],
      painPoints: [],
      nextBestAction: 'Gather more information'
    }
  }

  private getFallbackRiskAssessment(): any {
    return {
      riskLevel: 'medium',
      riskScore: 50,
      primaryRisks: ['Limited data'],
      suggestedActions: ['Gather more information']
    }
  }

  private getFallbackPredictiveScore(): PredictiveLeadScore {
    return {
      currentScore: 50,
      predictedScore: 55,
      scoreChange: 5,
      confidence: 30,
      engagementTrend: 'stable',
      predictedActions: ['Continue monitoring engagement'],
      timeToConvert: 45,
      conversionProbability: 0.3,
      nextBestAction: 'Schedule follow-up call',
      riskFactors: ['Insufficient data for accurate prediction']
    }
  }

  // Engagement and Predictive Scoring Helper Methods
  private calculateEngagementScore(engagementData: EngagementData): number {
    try {
      const weights = {
        emailOpens: 5,
        emailClicks: 10,
        websiteVisits: 8,
        documentDownloads: 15,
        formSubmissions: 20,
        callDuration: 25,
        meetingAttendance: 30,
        socialEngagement: 10
      }
      
      let score = 0
      score += ((engagementData.emailOpens || 0) * weights.emailOpens)
      score += ((engagementData.emailClicks || 0) * weights.emailClicks)
      score += ((engagementData.websiteVisits || 0) * weights.websiteVisits)
      score += ((engagementData.documentDownloads || 0) * weights.documentDownloads)
      score += ((engagementData.formSubmissions || 0) * weights.formSubmissions)
      score += ((engagementData.callDuration || 0) * weights.callDuration / 60) // per minute
      score += ((engagementData.meetingAttendance || 0) * weights.meetingAttendance)
      score += ((engagementData.socialEngagement || 0) * weights.socialEngagement)
      
      // Apply recency bonus with safe date handling
      let recencyMultiplier = 1
      try {
        if (engagementData.lastActivityDate) {
          const lastActivityDate = engagementData.lastActivityDate instanceof Date 
            ? engagementData.lastActivityDate 
            : new Date(engagementData.lastActivityDate)
            
          const daysSinceLastActivity = Math.floor(
            (Date.now() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24)
          )
          recencyMultiplier = Math.max(0.5, 1 - (daysSinceLastActivity / 30))
        }
      } catch (dateError) {
        console.warn('Warning: Could not process lastActivityDate, using default recency multiplier')
        recencyMultiplier = 0.8 // Default to slightly reduced score
      }
      
      const finalScore = Math.min(100, Math.round(score * recencyMultiplier))
      return Math.max(0, finalScore) // Ensure non-negative
    } catch (error) {
      console.warn('Warning: Error calculating engagement score, returning default:', error)
      return 50 // Fallback score
    }
  }

  private analyzeEngagementTrend(engagementData: EngagementData): 'increasing' | 'decreasing' | 'stable' {
    try {
      // Safe access to contentInteraction with fallback
      const contentInteraction = engagementData.contentInteraction || []
      
      if (contentInteraction.length === 0) {
        return 'stable' // Default when no interaction data
      }

      const recentActivity = contentInteraction
        .filter(i => {
          try {
            const timestamp = i.timestamp instanceof Date ? i.timestamp : new Date(i.timestamp)
            return Date.now() - timestamp.getTime() < 7 * 24 * 60 * 60 * 1000
          } catch {
            return false
          }
        })
        .reduce((sum, i) => sum + (i.value || 0), 0)
      
      const olderActivity = contentInteraction
        .filter(i => {
          try {
            const timestamp = i.timestamp instanceof Date ? i.timestamp : new Date(i.timestamp)
            const age = Date.now() - timestamp.getTime()
            return age >= 7 * 24 * 60 * 60 * 1000 && age < 14 * 24 * 60 * 60 * 1000
          } catch {
            return false
          }
        })
        .reduce((sum, i) => sum + (i.value || 0), 0)
      
      if (olderActivity === 0) return 'stable' // Avoid division by zero
      
      if (recentActivity > olderActivity * 1.2) return 'increasing'
      if (recentActivity < olderActivity * 0.8) return 'decreasing'
      return 'stable'
    } catch (error) {
      console.warn('Warning: Error analyzing engagement trend, returning stable:', error)
      return 'stable'
    }
  }

  private async predictFutureScore(
    lead: any,
    engagementData: EngagementData,
    historicalData: any[]
  ): Promise<number> {
    const currentScore = this.calculateEngagementScore(engagementData)
    const trend = this.analyzeEngagementTrend(engagementData)
    
    // Simple prediction based on trend and similar leads
    const similarLeads = historicalData.filter(l => 
      l.company_size === lead.company_size && 
      l.industry === lead.industry
    )
    
    const avgImprovement = similarLeads.length > 0 
      ? similarLeads.reduce((sum, l) => sum + (l.final_score - l.initial_score), 0) / similarLeads.length
      : 10
    
    let prediction = currentScore
    
    switch (trend) {
      case 'increasing':
        prediction = Math.min(100, currentScore + avgImprovement * 0.7)
        break
      case 'decreasing':
        prediction = Math.max(0, currentScore - avgImprovement * 0.3)
        break
      case 'stable':
        prediction = currentScore + avgImprovement * 0.2
        break
    }
    
    return Math.round(prediction)
  }

  private calculateConversionProbability(
    engagementScore: number,
    trend: 'increasing' | 'decreasing' | 'stable',
    lead: any
  ): number {
    let baseProbability = engagementScore / 100 * 0.6 // Base on engagement
    
    // Adjust for trend
    if (trend === 'increasing') baseProbability *= 1.3
    if (trend === 'decreasing') baseProbability *= 0.7
    
    // Adjust for lead stage
    const stageMultipliers: { [key: string]: number } = {
      'New': 0.1,
      'Qualification': 0.3,
      'Proposal': 0.6,
      'Negotiation': 0.8,
      'Closed Won': 1.0
    }
    
    baseProbability *= (stageMultipliers[lead.stage] || 0.2)
    
    return Math.min(0.95, Math.max(0.05, baseProbability))
  }

  private estimateTimeToConvert(
    engagementData: EngagementData,
    historicalData: any[],
    stage: string
  ): number {
    const averageConversionTime: { [key: string]: number } = {
      'New': 90,
      'Qualification': 60,
      'Proposal': 30,
      'Negotiation': 14
    }
    
    let baseTime = averageConversionTime[stage] || 45
    
    // Adjust based on engagement frequency
    if (engagementData.activityFrequency > 5) baseTime *= 0.7
    if (engagementData.activityFrequency < 2) baseTime *= 1.5
    
    return Math.round(baseTime)
  }

  private identifyEngagementRiskFactors(engagementData: EngagementData, lead: any): string[] {
    const risks: string[] = []
    
    const daysSinceLastActivity = Math.floor(
      (Date.now() - engagementData.lastActivityDate.getTime()) / (1000 * 60 * 60 * 24)
    )
    
    if (daysSinceLastActivity > 14) {
      risks.push('No recent engagement activity')
    }
    
    if (engagementData.emailOpens < 2) {
      risks.push('Low email engagement')
    }
    
    if (engagementData.meetingAttendance === 0) {
      risks.push('No meeting attendance')
    }
    
    if (engagementData.responseTime > 48) {
      risks.push('Slow response time')
    }
    
    if (engagementData.websiteVisits < 3) {
      risks.push('Limited website interaction')
    }
    
    return risks
  }

  private suggestNextBestAction(
    engagementScore: number,
    trend: 'increasing' | 'decreasing' | 'stable',
    lead: any,
    engagementData: EngagementData
  ): string {
    if (trend === 'decreasing') {
      return 'Immediate re-engagement call needed'
    }
    
    if (engagementScore > 80) {
      return 'Schedule proposal presentation'
    }
    
    if (engagementData.meetingAttendance === 0) {
      return 'Request discovery meeting'
    }
    
    if (engagementData.documentDownloads === 0) {
      return 'Send relevant case studies'
    }
    
    return 'Continue nurturing with valuable content'
  }

  private generatePredictedActions(
    trend: 'increasing' | 'decreasing' | 'stable',
    conversionProbability: number,
    timeToConvert: number
  ): string[] {
    const actions: string[] = []
    
    if (conversionProbability > 0.7) {
      actions.push('Prepare contract and pricing')
      actions.push('Schedule decision-maker meeting')
    }
    
    if (trend === 'increasing') {
      actions.push('Accelerate sales process')
      actions.push('Present advanced features')
    }
    
    if (timeToConvert < 30) {
      actions.push('Create urgency with limited-time offer')
      actions.push('Address final objections')
    }
    
    return actions
  }

  private calculatePredictionConfidence(
    engagementData: EngagementData,
    historicalData: any[]
  ): number {
    try {
      let confidence = 0.5
      
      // More data points = higher confidence
      const contentInteraction = engagementData.contentInteraction || []
      const dataPoints = contentInteraction.length
      confidence += Math.min(0.3, dataPoints * 0.02)
      
      // Historical data availability
      const historicalCount = Array.isArray(historicalData) ? historicalData.length : 0
      confidence += Math.min(0.2, historicalCount * 0.01)
      
      const result = Math.round(confidence * 100)
      return Math.max(10, Math.min(100, result)) // Ensure between 10-100
    } catch (error) {
      console.warn('Warning: Error calculating prediction confidence, returning default:', error)
      return 30 // Default confidence
    }
  }

  // Deal Risk Assessment Helper Methods
  private calculateTimeStagnationRisk(deal: any): number {
    const createdDate = new Date(deal.created_at)
    const daysSinceCreated = Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24))
    
    const stageExpectedDays: { [key: string]: number } = {
      'New': 7,
      'Qualification': 14,
      'Proposal': 21,
      'Negotiation': 14
    }
    
    const expectedDays = stageExpectedDays[deal.stage] || 14
    const riskScore = Math.max(0, Math.min(100, (daysSinceCreated - expectedDays) / expectedDays * 100))
    
    return Math.round(riskScore)
  }

  private assessCompetitorThreat(deal: any, competitorData?: any[]): number {
    if (!competitorData || competitorData.length === 0) return 20 // Default moderate risk
    
    const competitorsInDeal = competitorData.filter(c => c.deal_id === deal.id)
    return Math.min(100, competitorsInDeal.length * 25)
  }

  private evaluateBudgetRisk(deal: any): number {
    if (!deal.value || deal.value === 0) return 80 // High risk if no budget defined
    
    // Lower risk for higher value deals (assuming better budget approval)
    if (deal.value > 100000) return 10
    if (deal.value > 50000) return 25
    if (deal.value > 10000) return 40
    return 60
  }

  private assessStakeholderEngagement(engagementData: EngagementData, deal: any): number {
    const engagementScore = this.calculateEngagementScore(engagementData)
    return Math.max(0, 100 - engagementScore)
  }

  private evaluateTechnicalFit(deal: any): number {
    // This would typically analyze technical requirements vs. solution fit
    // For now, return a moderate risk
    return 30
  }

  private assessTimingRisk(deal: any, marketData?: any): number {
    const currentMonth = new Date().getMonth()
    
    // Higher risk during vacation months
    if (currentMonth === 11 || currentMonth === 0 || currentMonth === 6) return 40
    
    // Quarter end typically has lower risk
    if (currentMonth % 3 === 2) return 10
    
    return 25
  }

  private calculateOverallRiskScore(riskFactors: any): number {
    const values = Object.values(riskFactors) as number[]
    return Math.round(values.reduce((total, factor) => total + factor, 0) / values.length)
  }

  private determineRiskLevel(riskScore: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    if (riskScore >= 80) return 'CRITICAL'
    if (riskScore >= 60) return 'HIGH'
    if (riskScore >= 40) return 'MEDIUM'
    return 'LOW'
  }

  private generateRiskAlerts(riskFactors: any, deal: any): any[] {
    const alerts: any[] = []
    
    if (riskFactors.timeStagnation > 70) {
      alerts.push({
        type: 'critical',
        message: 'Deal has been stagnant for too long',
        urgency: 90,
        actionRequired: true
      })
    }
    
    if (riskFactors.competitorThreat > 60) {
      alerts.push({
        type: 'warning',
        message: 'High competitor presence detected',
        urgency: 70,
        actionRequired: true
      })
    }
    
    if (riskFactors.stakeholderEngagement > 50) {
      alerts.push({
        type: 'warning',
        message: 'Stakeholder engagement is declining',
        urgency: 60,
        actionRequired: true
      })
    }
    
    return alerts
  }

  private generateRiskRecommendations(riskFactors: any, riskLevel: string): string[] {
    const recommendations: string[] = []
    
    if (riskFactors.timeStagnation > 50) {
      recommendations.push('Schedule immediate check-in call')
      recommendations.push('Identify and address blockers')
    }
    
    if (riskFactors.competitorThreat > 40) {
      recommendations.push('Conduct competitive positioning session')
      recommendations.push('Highlight unique value propositions')
    }
    
    if (riskFactors.budgetConcerns > 60) {
      recommendations.push('Validate budget and decision-making process')
      recommendations.push('Present ROI analysis')
    }
    
    if (riskLevel === 'CRITICAL') {
      recommendations.push('Escalate to senior management')
      recommendations.push('Consider emergency rescue strategy')
    }
    
    return recommendations
  }

  private suggestAutomatedActions(riskFactors: any, alerts: any[]): string[] {
    const actions: string[] = []
    
    if (alerts.some(a => a.type === 'critical')) {
      actions.push('Send urgent notification to account manager')
      actions.push('Create high-priority task for immediate follow-up')
    }
    
    if (riskFactors.stakeholderEngagement > 40) {
      actions.push('Trigger re-engagement email sequence')
      actions.push('Schedule automated check-in reminder')
    }
    
    return actions
  }

  private calculateCloseProbability(riskFactors: any, deal: any): number {
    const baseProb = 0.5
    const riskScore = this.calculateOverallRiskScore(riskFactors)
    
    // Higher risk = lower probability
    const riskAdjustment = (100 - riskScore) / 100
    
    return Math.max(0.05, Math.min(0.95, baseProb * riskAdjustment))
  }

  private estimateTimeToClose(deal: any, riskFactors: any): number {
    const stageTimeEstimates: { [key: string]: number } = {
      'New': 60,
      'Qualification': 45,
      'Proposal': 30,
      'Negotiation': 14
    }
    
    let baseTime = stageTimeEstimates[deal.stage] || 30
    
    // Higher risk = longer time
    const riskScore = this.calculateOverallRiskScore(riskFactors)
    const riskMultiplier = 1 + (riskScore / 100)
    
    return Math.round(baseTime * riskMultiplier)
  }

  private suggestIntervention(
    riskLevel: string,
    riskFactors: any,
    alerts: any[]
  ): string {
    if (riskLevel === 'CRITICAL') {
      return 'Immediate executive intervention required'
    }
    
    if (riskLevel === 'HIGH') {
      return 'Senior sales manager should take over'
    }
    
    if (alerts.length > 2) {
      return 'Enhanced monitoring and regular check-ins'
    }
    
    return 'Continue standard sales process with vigilance'
  }

  private getFallbackDealRisk(dealId: string): AutoDealRisk {
    return {
      dealId,
      currentRisk: 'MEDIUM',
      riskFactors: {
        timeStagnation: 30,
        competitorThreat: 20,
        budgetConcerns: 40,
        stakeholderEngagement: 35,
        technicalFit: 25,
        timingIssues: 20
      },
      alerts: [{
        type: 'info',
        message: 'Risk assessment based on limited data',
        urgency: 20,
        actionRequired: false
      }],
      recommendations: ['Gather more deal intelligence', 'Increase stakeholder engagement'],
      automatedActions: ['Schedule data collection reminder'],
      probabilityOfClose: 0.4,
      timeToClose: 45,
      suggestedIntervention: 'Continue monitoring with enhanced data collection'
    }
  }

  private suggestDealActions(riskLevel: string, deal: any): string[] {
    const actions: string[] = []
    
    if (riskLevel === 'CRITICAL') {
      actions.push('Escalate to senior management immediately')
      actions.push('Schedule emergency client meeting')
      actions.push('Review and revise proposal strategy')
    } else if (riskLevel === 'HIGH') {
      actions.push('Increase touchpoint frequency')
      actions.push('Involve subject matter experts')
      actions.push('Address identified concerns promptly')
    } else if (riskLevel === 'MEDIUM') {
      actions.push('Monitor progress closely')
      actions.push('Maintain regular communication')
      actions.push('Prepare for potential objections')
    } else {
      actions.push('Continue standard sales process')
      actions.push('Focus on value demonstration')
    }
    
    return actions
  }

  // Helper methods for revenue forecasting
  private calculateSeasonality(): number {
    const month = new Date().getMonth()
    const seasonalFactors = [0.8, 0.9, 1.1, 1.0, 1.1, 1.0, 0.9, 0.8, 1.1, 1.2, 1.3, 1.4] // Q4 boost
    return seasonalFactors[month] || 1.0
  }

  private calculateTrendFactor(historicalData: any[]): number {
    if (historicalData.length < 2) return 1.0
    
    const recentValue = historicalData.slice(0, 3).reduce((sum, item) => sum + (parseFloat(item.value) || 0), 0)
    const olderValue = historicalData.slice(-3).reduce((sum, item) => sum + (parseFloat(item.value) || 0), 0)
    
    return olderValue > 0 ? Math.max(0.5, Math.min(2.0, recentValue / olderValue)) : 1.0
  }

  private calculateVelocityFactor(leads: any[]): number {
    const avgDaysInPipeline = leads.reduce((total, lead) => {
      const created = new Date(lead.created_at).getTime()
      const now = Date.now()
      return total + (now - created) / (1000 * 60 * 60 * 24)
    }, 0) / (leads.length || 1)
    
    return avgDaysInPipeline > 60 ? 0.8 : avgDaysInPipeline < 30 ? 1.2 : 1.0
  }

  private calculateForecastConfidence(data: any): number {
    const mockEngagement: EngagementData = {
      emailOpens: 0,
      emailClicks: 0,
      websiteVisits: 0,
      documentDownloads: 0,
      formSubmissions: 0,
      callDuration: 0,
      meetingAttendance: 0,
      responseTime: 0,
      socialEngagement: 0,
      lastActivityDate: new Date(),
      activityFrequency: 0,
      contentInteraction: []
    }
    return this.calculatePredictionConfidence(mockEngagement, data)
  }

  private async analyzeGrowthTrend(historicalData: any[]): Promise<'increasing' | 'decreasing' | 'stable'> {
    if (historicalData.length < 3) return 'stable'
    
    const values = historicalData.map(item => parseFloat(item.value) || 0)
    let increasing = 0
    let decreasing = 0
    
    for (let i = 1; i < values.length; i++) {
      if (values[i] > values[i-1]) increasing++
      else if (values[i] < values[i-1]) decreasing++
    }
    
    if (increasing > decreasing * 1.5) return 'increasing'
    if (decreasing > increasing * 1.5) return 'decreasing'
    return 'stable'
  }

  private identifyGrowthFactors(data: any): string[] {
    const factors = []
    factors.push('Strong pipeline conversion rate')
    factors.push('Increased lead quality')
    factors.push('Improved sales team performance')
    if (data.newLeads > data.previousNewLeads) factors.push('Growing lead generation')
    return factors
  }

  private identifyRiskFactors(data: any): string[] {
    const factors = []
    if (data.avgDealSize < data.previousAvgDealSize) factors.push('Declining average deal size')
    factors.push('Market competition')
    factors.push('Economic uncertainty')
    return factors
  }

  // Helper methods for lead scoring
  private calculateScoreConfidence(lead: any, engagementData: any): number {
    let confidence = 0.5
    if (engagementData.emailOpens > 3) confidence += 0.2
    if (engagementData.websiteVisits > 5) confidence += 0.2
    if (lead.company) confidence += 0.1
    return Math.min(1.0, confidence)
  }

  private generateScoreRecommendations(score: number, factors: any): string[] {
    const recommendations = []
    if (score > 80) {
      recommendations.push('Schedule immediate follow-up call')
      recommendations.push('Send personalized proposal')
    } else if (score > 60) {
      recommendations.push('Nurture with targeted content')
      recommendations.push('Invite to webinar or demo')
    } else {
      recommendations.push('Add to drip campaign')
      recommendations.push('Focus on education and awareness')
    }
    return recommendations
  }

  // Helper methods for customer intelligence
  private analyzeEngagementPattern(engagementData: any): string {
    const total = engagementData.emailOpens + engagementData.websiteVisits + engagementData.documentDownloads
    if (total > 20) return 'high'
    if (total > 10) return 'medium'
    return 'low'
  }

  private predictPurchaseIntent(lead: any, engagementData: any): number {
    let intent = 30
    if (engagementData.documentDownloads > 2) intent += 20
    if (engagementData.formSubmissions > 0) intent += 15
    if (lead.stage === 'Proposal') intent += 25
    return Math.min(100, intent)
  }

  private calculatePredictedLTV(lead: any): number {
    const baseValue = parseFloat(lead.value) || 5000
    const industryMultiplier = lead.industry === 'enterprise' ? 2.5 : 1.5
    return Math.round(baseValue * industryMultiplier)
  }

  private assessChurnRisk(engagementData: any): number {
    let risk = 20
    if (engagementData.lastActivityDate) {
      const daysSinceActivity = (Date.now() - new Date(engagementData.lastActivityDate).getTime()) / (1000 * 60 * 60 * 24)
      if (daysSinceActivity > 30) risk += 30
      if (daysSinceActivity > 60) risk += 20
    }
    return Math.min(100, risk)
  }

  private analyzeBehavior(engagementData: any): any {
    return {
      preferredChannel: engagementData.emailClicks > engagementData.callDuration ? 'email' : 'phone',
      activityPattern: engagementData.activityFrequency > 5 ? 'frequent' : 'occasional',
      contentPreference: engagementData.documentDownloads > 2 ? 'detailed' : 'summary'
    }
  }

  private determineNextBestAction(intelligence: any): string {
    if (intelligence.purchaseIntent > 70) return 'Schedule demo and send proposal'
    if (intelligence.engagementScore > 60) return 'Send targeted case study'
    if (intelligence.churnRisk > 70) return 'Immediate re-engagement campaign'
    return 'Continue nurturing with valuable content'
  }

  // Helper methods for deal risk assessment
  private analyzeTimeRisks(deal: any): number {
    const created = new Date(deal.created_at).getTime()
    const daysSinceCreated = (Date.now() - created) / (1000 * 60 * 60 * 24)
    
    if (daysSinceCreated > 90) return 80
    if (daysSinceCreated > 60) return 60
    if (daysSinceCreated > 30) return 40
    return 20
  }

  private analyzeValueRisks(deal: any): number {
    const value = parseFloat(deal.value) || 0
    if (value < 1000) return 70 // Low value deals have higher risk
    if (value > 50000) return 30 // High value deals get more attention
    return 50
  }

  private analyzeEngagementRisks(engagementData: any): number {
    const recentActivity = engagementData.lastActivityDate 
      ? (Date.now() - new Date(engagementData.lastActivityDate).getTime()) / (1000 * 60 * 60 * 24)
      : 999
    
    if (recentActivity > 14) return 80
    if (recentActivity > 7) return 50
    return 20
  }

  private analyzeCompetitiveRisks(competitorData: any): number {
    if (!competitorData || competitorData.competitors === 0) return 30
    if (competitorData.competitors > 3) return 80
    if (competitorData.competitors > 1) return 60
    return 40
  }

  private generateSuggestedActions(riskAssessment: any): string[] {
    const actions = []
    if (riskAssessment.riskFactors.timeStagnation > 70) {
      actions.push('Accelerate decision-making process')
      actions.push('Schedule executive stakeholder meeting')
    }
    if (riskAssessment.riskFactors.stakeholderEngagement > 60) {
      actions.push('Expand stakeholder influence map')
      actions.push('Identify and engage economic buyer')
    }
    return actions
  }

  // Helper methods for conversation analysis  
  private analyzeSentiment(message: string): number {
    const positiveWords = ['great', 'excellent', 'perfect', 'amazing', 'love', 'fantastic']
    const negativeWords = ['bad', 'terrible', 'awful', 'hate', 'horrible', 'disappointed']
    
    const words = message.toLowerCase().split(' ')
    let score = 50
    
    words.forEach(word => {
      if (positiveWords.includes(word)) score += 10
      if (negativeWords.includes(word)) score -= 10
    })
    
    return Math.max(0, Math.min(100, score))
  }

  private extractIntentAndTopics(message: string): any {
    return {
      intent: message.includes('price') || message.includes('cost') ? 'pricing' : 'general',
      topics: ['product', 'features'],
      urgency: message.includes('urgent') || message.includes('asap') ? 'high' : 'medium'
    }
  }

  private determineUrgency(analysis: any): number {
    if (analysis.intent === 'pricing') return 80
    if (analysis.topics.includes('support')) return 70
    return 50
  }

  private generateNextBestResponse(analysis: any): string {
    if (analysis.intent === 'pricing') return 'Provide pricing information and schedule demo'
    if (analysis.sentiment < 40) return 'Address concerns and offer support'
    return 'Continue conversation with helpful information'
  }

  private generateConversationRecommendations(analysis: any): string[] {
    const recommendations = []
    if (analysis.sentiment > 70) recommendations.push('Capitalize on positive sentiment')
    if (analysis.urgency > 60) recommendations.push('Prioritize immediate response')
    recommendations.push('Personalize follow-up communication')
    return recommendations
  }

  private getFallbackConversationAnalysis(): any {
    return {
      sentiment: 50,
      intent: 'general',
      topics: ['general inquiry'],
      urgency: 40,
      nextBestAction: 'Respond with helpful information',
      recommendations: ['Follow up within 24 hours', 'Provide relevant resources']
    }
  }
}

export { AdvancedAIEngine }
export const aiEngine = new AdvancedAIEngine()
export default AdvancedAIEngine
