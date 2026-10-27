import { query, queryOne, execute } from '@/backend/database/db-adapter'
import crypto from 'crypto'

interface LearningRecord {
  id: string
  timestamp: string
  user_id?: string
  input_context: string
  input_query: string
  mistral_response: string
  mistral_confidence: number
  internal_response?: string
  internal_confidence?: number
  feedback_score?: number
  user_interaction_data?: string // JSON: clicks, time spent, follow-up queries
  user_satisfaction?: number // 1-5 rating
  response_effectiveness?: number // measured by user actions
  learning_stage: 'observation' | 'comparison' | 'independent' | 'validated'
  data_features: string // JSON stringified features
}

interface UserInteractionMetrics {
  user_preferences: Record<string, number>
  response_patterns: Record<string, number>
  satisfaction_trends: Record<string, number>
  topic_interests: Record<string, number>
  interaction_frequency: Record<string, number>
}

interface InternalModelWeights {
  feature_weights: Record<string, number>
  pattern_weights: Record<string, number>
  response_templates: Record<string, string>
  confidence_thresholds: Record<string, number>
  user_preference_weights: Record<string, number>
  personalization_factors: Record<string, number>
}

interface TrainingData {
  input_features: number[]
  target_response: string
  confidence_score: number
  context_type: string
}

interface WeightRow {
  weight_type: string
  weight_key: string
  weight_value: number
}

interface CountRow {
  count: number
}

interface AvgRow {
  avg: number
}

class AILearningSystem {
  private modelWeights: InternalModelWeights = {
    feature_weights: {},
    pattern_weights: {},
    response_templates: {},
    confidence_thresholds: {},
    user_preference_weights: {},
    personalization_factors: {}
  }
  private learningThreshold = 0.9 // 90% confidence threshold to switch to internal model
  private mistralApiKey: string | null = null
  private weightsLoaded = false

  constructor() {
    this.mistralApiKey = process.env.MISTRAL_API_KEY || null
  }

  private async ensureWeightsLoaded() {
    if (!this.weightsLoaded) {
      await this.loadModelWeights()
    }
  }

  private async loadModelWeights() {
    const weights = await query<WeightRow>('SELECT weight_type, weight_key, weight_value FROM model_weights')

    this.modelWeights = {
      feature_weights: {},
      pattern_weights: {},
      response_templates: {},
      confidence_thresholds: {
        'insights': 0.7,
        'predictions': 0.8,
        'recommendations': 0.75,
        'alerts': 0.9
      },
      user_preference_weights: {},
      personalization_factors: {}
    }

    // Load saved weights
    for (const weight of weights) {
      if (weight.weight_type === 'feature_weights') {
        this.modelWeights.feature_weights[weight.weight_key] = weight.weight_value
      } else if (weight.weight_type === 'pattern_weights') {
        this.modelWeights.pattern_weights[weight.weight_key] = weight.weight_value
      } else if (weight.weight_type === 'confidence_thresholds') {
        this.modelWeights.confidence_thresholds[weight.weight_key] = weight.weight_value
      }
    }

    this.weightsLoaded = true
    console.log('Model weights loaded:', Object.keys(this.modelWeights.feature_weights).length, 'features')
  }

  private async saveModelWeights() {
    // Save feature weights
    for (const [key, value] of Object.entries(this.modelWeights.feature_weights)) {
      await execute(
        `INSERT INTO model_weights (weight_type, weight_key, weight_value, last_updated)
         VALUES (?, ?, ?, NOW())
         ON CONFLICT (weight_type, weight_key, user_id) DO UPDATE SET weight_value = EXCLUDED.weight_value, last_updated = NOW()`,
        ['feature_weights', key, value]
      )
    }

    // Save pattern weights
    for (const [key, value] of Object.entries(this.modelWeights.pattern_weights)) {
      await execute(
        `INSERT INTO model_weights (weight_type, weight_key, weight_value, last_updated)
         VALUES (?, ?, ?, NOW())
         ON CONFLICT (weight_type, weight_key, user_id) DO UPDATE SET weight_value = EXCLUDED.weight_value, last_updated = NOW()`,
        ['pattern_weights', key, value]
      )
    }

    // Save confidence thresholds
    for (const [key, value] of Object.entries(this.modelWeights.confidence_thresholds)) {
      await execute(
        `INSERT INTO model_weights (weight_type, weight_key, weight_value, last_updated)
         VALUES (?, ?, ?, NOW())
         ON CONFLICT (weight_type, weight_key, user_id) DO UPDATE SET weight_value = EXCLUDED.weight_value, last_updated = NOW()`,
        ['confidence_thresholds', key, value]
      )
    }
  }

  /**
   * Process a request using teacher-student learning
   * Mistral AI acts as teacher, internal model learns from both AI and user interactions
   */
  async processIntelligentRequest(
    context: any, 
    queryText: string, 
    userId?: string,
    previousInteractions?: any[]
  ): Promise<{
    response: any,
    source: 'mistral' | 'internal' | 'hybrid',
    confidence: number,
    learning_data: any
  }> {
    await this.ensureWeightsLoaded()

    const recordId = crypto.randomUUID()
    const timestamp = new Date().toISOString()
    
    // Extract features from context and query, including user-specific patterns
    const features = await this.extractFeatures(context, queryText, userId, previousInteractions)
    const featuresJson = JSON.stringify(features)

    // Check if internal model can handle this with 90% confidence (personalized for user)
    const internalResult = this.tryInternalModel(features, queryText)
    const canUseInternal = internalResult && internalResult.confidence >= this.learningThreshold

    let mistralResponse = null
    let mistralConfidence = 0
    let finalResponse = null
    let finalConfidence = 0
    let source: 'mistral' | 'internal' | 'hybrid' = 'mistral'

    // Always try Mistral AI first if available (for training or actual response)
    if (this.mistralApiKey) {
      try {
        console.log(`Using Mistral AI - User: ${userId || 'anonymous'} - Internal model confidence: ${internalResult?.confidence || 0}, Threshold: ${this.learningThreshold}`)
        
        // Get personalized Mistral response based on user preferences
        mistralResponse = await this.getMistralResponse(context, queryText)
        mistralConfidence = this.calculateMistralConfidence(mistralResponse)
        
        // If internal model meets 90% threshold, use it but still learn from Mistral
        if (canUseInternal) {
          console.log('Internal model meets 90% threshold - using personalized internal response')
          finalResponse = internalResult.response
          finalConfidence = internalResult.confidence
          source = 'internal'
          
          // Record comparison for continued learning
          await this.recordLearningInteraction(
            recordId, timestamp, userId, context, queryText,
            mistralResponse, mistralConfidence, 
            internalResult.response, internalResult.confidence, 
            featuresJson, 'validated'
          )
          
          // Continue training with user-specific patterns
          await this.trainInternalModel(features, mistralResponse, mistralConfidence, queryText)
          
        } else {
          console.log('Internal model below 90% threshold - using Mistral AI response for training')
          // Use Mistral response as the final answer
          finalResponse = mistralResponse
          finalConfidence = mistralConfidence
          source = 'mistral'

          // Record for learning (observation/training phase)
          await this.recordLearningInteraction(
            recordId, timestamp, userId, context, queryText,
            mistralResponse, mistralConfidence, 
            internalResult?.response, internalResult?.confidence || 0, 
            featuresJson, canUseInternal ? 'comparison' : 'observation'
          )
          
          // Train internal model from Mistral's response with user context
          await this.trainInternalModel(features, mistralResponse, mistralConfidence, queryText)
        }

      } catch (error) {
        console.error('Mistral AI failed:', error)
        
        // Only fallback to internal if it meets threshold
        if (canUseInternal) {
          console.log('Mistral AI failed, using internal model as fallback')
          finalResponse = internalResult.response
          finalConfidence = internalResult.confidence
          source = 'internal'
          
          // Record the failure for analysis
          await this.recordLearningInteraction(
            recordId, timestamp, userId, context, queryText,
            null, 0, internalResult.response, internalResult.confidence, 
            featuresJson, 'independent'
          )
        } else {
          throw new Error('Mistral AI unavailable and internal model not ready (below 90% threshold)')
        }
      }
    } else {
      // No Mistral API key - only use internal if it meets threshold
      if (canUseInternal) {
        console.log('No Mistral API key, using internal model (90%+ confidence)')
        finalResponse = internalResult.response
        finalConfidence = internalResult.confidence
        source = 'internal'
        
        await this.recordLearningInteraction(
          recordId, timestamp, userId, context, queryText,
          null, 0, internalResult.response, internalResult.confidence, 
          featuresJson, 'independent'
        )
      } else {
        throw new Error('No Mistral API key available and internal model not ready (below 90% threshold)')
      }
    }

    return {
      response: finalResponse,
      source,
      confidence: finalConfidence,
      learning_data: {
        record_id: recordId,
        user_id: userId,
        features_count: Object.keys(features).length,
        learning_stage: source === 'mistral' ? 'training' : 'autonomous',
        internal_confidence: internalResult?.confidence || 0,
        meets_threshold: (internalResult?.confidence || 0) >= this.learningThreshold,
        threshold: this.learningThreshold,
        personalization_applied: !!userId && Object.keys(this.modelWeights.user_preference_weights).length > 0
      }
    }
  }

  private async extractFeatures(
    context: any, 
    queryText: string, 
    userId?: string, 
    previousInteractions?: any[]
  ): Promise<Record<string, number>> {
    const features: Record<string, number> = {}

    // Context-based features
    features['contacts_count'] = context.contacts?.length || 0
    features['leads_count'] = context.leads?.length || 0
    features['campaigns_count'] = context.campaigns?.length || 0

    // Query-based features
    const queryWords = queryText.toLowerCase().split(/\s+/)
    features['query_length'] = queryWords.length
    features['has_conversion'] = queryWords.includes('conversion') || queryWords.includes('convert') ? 1 : 0
    features['has_analytics'] = queryWords.includes('analytics') || queryWords.includes('analyze') ? 1 : 0
    features['has_performance'] = queryWords.includes('performance') || queryWords.includes('metric') ? 1 : 0
    features['has_prediction'] = queryWords.includes('predict') || queryWords.includes('forecast') ? 1 : 0
    features['has_recommendation'] = queryWords.includes('recommend') || queryWords.includes('suggest') ? 1 : 0

    // Pattern-based features
    if (context.leads) {
      const stages = this.groupByStage(context.leads)
      features['lead_conversion_rate'] = (stages.converted || 0) / Math.max(context.leads.length, 1)
      features['lead_diversity'] = Object.keys(stages).length / 6 // Normalize to typical stages
    }

    if (context.contacts) {
      const sources = this.groupBySource(context.contacts)
      features['contact_source_diversity'] = Object.keys(sources).length / 5 // Normalize
    }

    // Time-based features
    const currentHour = new Date().getHours()
    features['request_hour'] = currentHour / 24 // Normalize to 0-1
    features['is_business_hours'] = (currentHour >= 9 && currentHour <= 17) ? 1 : 0

    // User-specific features
    if (userId) {
      features['user_specific'] = 1
      
      // Load user preferences from database
      const userPrefs = await this.getUserPreferences(userId)
      for (const [key, value] of Object.entries(userPrefs)) {
        features[`user_pref_${key}`] = value
      }

      // Analyze previous interactions if available
      if (previousInteractions && previousInteractions.length > 0) {
        features['has_interaction_history'] = 1
        features['interaction_count'] = previousInteractions.length
        features['avg_session_length'] = this.calculateAvgSessionLength(previousInteractions)
        features['preferred_response_type'] = this.getPreferredResponseType(previousInteractions)
        features['typical_query_complexity'] = this.calculateQueryComplexity(previousInteractions)
      }
      
      // Time-based user patterns
      const userTimePattern = await this.getUserTimePattern(userId)
      features['user_time_pattern'] = userTimePattern
    } else {
      features['user_specific'] = 0
    }

    return features
  }

  private tryInternalModel(features: Record<string, number>, queryText: string): {response: any, confidence: number} | null {
    // Simple neural network-like calculation
    let confidence = 0
    let responseType = 'recommendation'

    // Calculate confidence based on feature weights
    for (const [feature, value] of Object.entries(features)) {
      const weight = this.modelWeights.feature_weights[feature] || 0
      confidence += value * weight
    }

    // Normalize confidence to 0-1 range
    confidence = Math.min(Math.max(confidence / 10, 0), 1)

    // Determine response type based on query patterns
    if (this.modelWeights.pattern_weights['prediction_queries'] && queryText.includes('predict')) {
      responseType = 'prediction'
      confidence *= this.modelWeights.pattern_weights['prediction_queries']
    } else if (this.modelWeights.pattern_weights['insight_queries'] && queryText.includes('insight')) {
      responseType = 'insights'
      confidence *= this.modelWeights.pattern_weights['insight_queries']
    }

    // Check if confidence meets threshold
    const threshold = this.modelWeights.confidence_thresholds[responseType] || 0.7
    if (confidence < threshold) {
      return null
    }

    // Generate response based on learned patterns
    const response = this.generateInternalResponse(features, queryText, responseType, confidence)
    
    return { response, confidence }
  }

  private generateInternalResponse(features: Record<string, number>, queryText: string, type: string, confidence: number): any {
    // This is a simplified internal response generation
    // In a real implementation, this would use learned patterns and templates
    
    const insights = []

    // Generate insights based on learned patterns
    if (features.lead_conversion_rate < 0.2) {
      insights.push({
        id: crypto.randomUUID(),
        type: 'alert',
        title: 'Low Lead Conversion Rate',
        description: `Current conversion rate is ${(features.lead_conversion_rate * 100).toFixed(1)}%. Consider reviewing your lead nurturing process.`,
        confidence: confidence * 100,
        impact: 'high',
        actionable: true
      })
    }

    if (features.contacts_count > features.campaigns_count * 50) {
      insights.push({
        id: crypto.randomUUID(),
        type: 'recommendation',
        title: 'Increase Campaign Frequency',
        description: `With ${features.contacts_count} contacts and only ${features.campaigns_count} campaigns, you may be under-utilizing your contact base.`,
        confidence: confidence * 100,
        impact: 'medium',
        actionable: true
      })
    }

    if (features.has_prediction && features.leads_count > 10) {
      insights.push({
        id: crypto.randomUUID(),
        type: 'prediction',
        title: 'Lead Conversion Forecast',
        description: `Based on current patterns, expect ${Math.round(features.leads_count * features.lead_conversion_rate)} conversions this month.`,
        confidence: confidence * 100,
        impact: 'medium',
        actionable: true
      })
    }

    return { insights }
  }

  private async getMistralResponse(context: any, queryText: string): Promise<any> {
    if (!this.mistralApiKey) {
      throw new Error('Mistral API key not available')
    }

    const dataContext = {
      totalContacts: context.contacts?.length || 0,
      totalLeads: context.leads?.length || 0,
      totalCampaigns: context.campaigns?.length || 0,
      leadsByStage: this.groupByStage(context.leads),
      contactsBySource: this.groupBySource(context.contacts)
    }

    const messages = [
      {
        role: 'system',
        content: `You are an AI CRM assistant. Provide helpful, actionable responses in clear, conversational format.
        
        Guidelines:
        - Be conversational and helpful
        - Provide actionable insights and recommendations
        - Use bullet points or numbered lists for clarity
        - Keep responses under 300 words
        - Focus on practical business value
        - Use emojis sparingly but appropriately`
      },
      {
        role: 'user',
        content: `Based on this CRM data, please help with: ${queryText}

Data Context:
- Contacts: ${dataContext.totalContacts}
- Leads: ${dataContext.totalLeads}  
- Campaigns: ${dataContext.totalCampaigns}
- Lead Distribution: ${JSON.stringify(dataContext.leadsByStage)}

Please provide a helpful response in plain text format (not JSON).`
      }
    ]

    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.mistralApiKey}`
      },
      body: JSON.stringify({
        model: 'mistral-large-latest',
        messages,
        temperature: 0.7,
        max_tokens: 1000
      })
    })

    if (!response.ok) {
      throw new Error(`Mistral API error: ${response.status}`)
    }

    const result = await response.json()
    const content = result.choices[0]?.message?.content

    if (!content) {
      throw new Error('No response from Mistral')
    }

    // Return the text content directly for conversational responses
    return content
  }

  private calculateMistralConfidence(response: any): number {
    // Calculate confidence based on response quality
    let confidence = 0.85 // Base confidence for Mistral

    if (typeof response === 'string') {
      // For text responses, calculate confidence based on length and content quality
      const length = response.length
      if (length > 100 && length < 1000) {
        confidence += 0.1 // Good length
      }
      
      // Check for actionable content indicators
      const actionableKeywords = ['recommend', 'suggest', 'improve', 'optimize', 'increase', 'focus on']
      const hasActionableContent = actionableKeywords.some(keyword => 
        response.toLowerCase().includes(keyword)
      )
      
      if (hasActionableContent) {
        confidence += 0.05
      }
      
    } else if (response && typeof response === 'object' && response.insights && Array.isArray(response.insights)) {
      // For JSON insights format (legacy)
      const avgInsightConfidence = response.insights.reduce((sum: number, insight: any) => 
        sum + (insight.confidence || 80), 0) / response.insights.length
      confidence = Math.min(avgInsightConfidence / 100, 1)
    }

    return Math.min(confidence, 1) // Cap at 1.0
  }

  private async trainInternalModel(features: Record<string, number>, mistralResponse: any, confidence: number, queryText: string) {
    // Update feature weights based on Mistral's successful response
    const learningRate = 0.1
    const queryWords = queryText.toLowerCase().split(/\s+/)

    // Strengthen weights for features that led to successful responses
    for (const [feature, value] of Object.entries(features)) {
      if (value > 0) {
        const currentWeight = this.modelWeights.feature_weights[feature] || 0
        this.modelWeights.feature_weights[feature] = currentWeight + (learningRate * confidence * value)
      }
    }

    // Learn query patterns
    if (queryWords.includes('predict') || queryWords.includes('forecast')) {
      this.modelWeights.pattern_weights['prediction_queries'] = 
        (this.modelWeights.pattern_weights['prediction_queries'] || 0) + learningRate * confidence
    }

    if (queryWords.includes('insight') || queryWords.includes('analyze')) {
      this.modelWeights.pattern_weights['insight_queries'] = 
        (this.modelWeights.pattern_weights['insight_queries'] || 0) + learningRate * confidence
    }

    // Save updated weights
    await this.saveModelWeights()
    
    console.log(`Internal model trained with ${Object.keys(features).length} features, confidence: ${confidence}`)
  }

  private async recordLearningInteraction(
    recordId: string, 
    timestamp: string, 
    userId: string | undefined,
    context: any, 
    queryText: string, 
    mistralResponse: any, 
    mistralConfidence: number,
    internalResponse: any,
    internalConfidence: number,
    featuresJson: string,
    stage: string = 'observation'
  ) {
    await execute(
      `INSERT INTO learning_records 
       (id, timestamp, user_id, input_context, input_query, mistral_response, mistral_confidence, 
        internal_response, internal_confidence, learning_stage, data_features)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        recordId,
        timestamp,
        userId || null,
        JSON.stringify(context),
        queryText,
        mistralResponse ? JSON.stringify(mistralResponse) : null,
        mistralConfidence || null,
        internalResponse ? JSON.stringify(internalResponse) : null,
        internalConfidence || null,
        stage,
        featuresJson
      ]
    )
  }

  /**
   * Get learning progress and model performance metrics
   */
  async getModelMetrics(): Promise<any> {
    try {
      console.log('Getting model metrics...')
      
      const totalRecords = await queryOne<CountRow>('SELECT COUNT(*) as count FROM learning_records')
      const mistralRecords = await queryOne<CountRow>('SELECT COUNT(*) as count FROM learning_records WHERE mistral_response IS NOT NULL')
      const internalRecords = await queryOne<CountRow>('SELECT COUNT(*) as count FROM learning_records WHERE internal_response IS NOT NULL AND mistral_response IS NULL')
      
      const avgMistralConfidence = await queryOne<AvgRow>('SELECT AVG(mistral_confidence) as avg FROM learning_records WHERE mistral_confidence IS NOT NULL')
      const avgInternalConfidence = await queryOne<AvgRow>('SELECT AVG(internal_confidence) as avg FROM learning_records WHERE internal_confidence IS NOT NULL')

      console.log('Basic metrics retrieved, now getting satisfaction metrics...')

      // User satisfaction metrics
      const avgSatisfaction = await queryOne<AvgRow>('SELECT AVG(user_satisfaction) as avg FROM learning_records WHERE user_satisfaction IS NOT NULL')
      const totalFeedback = await queryOne<CountRow>('SELECT COUNT(*) as count FROM learning_records WHERE user_satisfaction IS NOT NULL')
      const avgResponseEffectiveness = await queryOne<AvgRow>('SELECT AVG(response_effectiveness) as avg FROM learning_records WHERE response_effectiveness IS NOT NULL')
      
      // Satisfaction distribution
      const highSatisfaction = await queryOne<CountRow>('SELECT COUNT(*) as count FROM learning_records WHERE user_satisfaction >= 4')
      const lowSatisfaction = await queryOne<CountRow>('SELECT COUNT(*) as count FROM learning_records WHERE user_satisfaction <= 2')
      
      // Recent satisfaction trend (last 20 interactions)
      const recentSatisfaction = await queryOne<AvgRow>(`
        SELECT AVG(user_satisfaction) as avg FROM (
          SELECT user_satisfaction FROM learning_records 
          WHERE user_satisfaction IS NOT NULL 
          ORDER BY timestamp DESC LIMIT 20
        ) subq
      `)

      console.log('Satisfaction metrics:', {
        avgSatisfaction: avgSatisfaction?.avg,
        totalFeedback: totalFeedback?.count,
        avgResponseEffectiveness: avgResponseEffectiveness?.avg,
        highSatisfaction: highSatisfaction?.count,
        lowSatisfaction: lowSatisfaction?.count,
        recentSatisfaction: recentSatisfaction?.avg
      })

      const result = {
        total_interactions: totalRecords?.count ?? 0,
        mistral_responses: mistralRecords?.count ?? 0,
        internal_responses: internalRecords?.count ?? 0,
        internal_model_usage_rate: (internalRecords?.count ?? 0) / Math.max(totalRecords?.count ?? 0, 1),
        avg_mistral_confidence: avgMistralConfidence?.avg || 0,
        avg_internal_confidence: avgInternalConfidence?.avg || 0,
        feature_count: Object.keys(this.modelWeights.feature_weights).length,
        pattern_count: Object.keys(this.modelWeights.pattern_weights).length,
        // User interaction metrics
        user_satisfaction: {
          average: avgSatisfaction?.avg || 0,
          total_feedback: totalFeedback?.count ?? 0,
          high_satisfaction_rate: (totalFeedback?.count ?? 0) > 0 ? ((highSatisfaction?.count ?? 0) / (totalFeedback?.count ?? 1)) : 0,
          low_satisfaction_rate: (totalFeedback?.count ?? 0) > 0 ? ((lowSatisfaction?.count ?? 0) / (totalFeedback?.count ?? 1)) : 0,
          recent_trend: recentSatisfaction?.avg || 0
        },
        response_effectiveness: avgResponseEffectiveness?.avg || 0
      }

      console.log('Final model metrics:', JSON.stringify(result, null, 2))
      
      return result
    } catch (error) {
      console.error('Error getting model metrics:', error)
      throw error
    }
  }

  private groupByStage(leads: any[]): Record<string, number> {
    const stages: Record<string, number> = {}
    for (const lead of leads || []) {
      stages[lead.stage] = (stages[lead.stage] || 0) + 1
    }
    return stages
  }

  private groupBySource(contacts: any[]): Record<string, number> {
    const sources: Record<string, number> = {}
    for (const contact of contacts || []) {
      sources[contact.source || 'unknown'] = (sources[contact.source || 'unknown'] || 0) + 1
    }
    return sources
  }

  /**
   * Get user preferences from database
   */
  private async getUserPreferences(userId: string): Promise<Record<string, number>> {
    try {
      const prefs = await query<{ preference_key: string, preference_value: number }>(`
        SELECT preference_key, preference_value 
        FROM user_preferences 
        WHERE user_id = ? AND preference_type = 'feature_weight'
      `, [userId])
      
      const preferences: Record<string, number> = {}
      for (const pref of prefs) {
        preferences[pref.preference_key] = pref.preference_value
      }
      return preferences
    } catch (error) {
      console.error('Error loading user preferences:', error)
      return {}
    }
  }

  /**
   * Calculate average session length from user interactions
   */
  private calculateAvgSessionLength(interactions: any[]): number {
    if (!interactions.length) return 0
    
    const totalTime = interactions.reduce((sum, interaction) => {
      const sessionTime = interaction.session_length || 60 // Default 60 seconds
      return sum + sessionTime
    }, 0)
    
    return totalTime / interactions.length / 60 // Convert to minutes and normalize
  }

  /**
   * Determine user's preferred response type from interaction history
   */
  private getPreferredResponseType(interactions: any[]): number {
    if (!interactions.length) return 0.5
    
    const typeScores = {
      'prediction': 0,
      'recommendation': 0,
      'insights': 0,
      'alert': 0
    }
    
    for (const interaction of interactions) {
      const responseType = interaction.response_type || 'recommendation'
      const satisfaction = interaction.user_satisfaction || 3
      typeScores[responseType as keyof typeof typeScores] += satisfaction / 5 // Normalize to 0-1
    }
    
    // Return score for most preferred type
    return Math.max(...Object.values(typeScores)) / Math.max(interactions.length, 1)
  }

  /**
   * Calculate typical query complexity for this user
   */
  private calculateQueryComplexity(interactions: any[]): number {
    if (!interactions.length) return 0.5
    
    const complexitySum = interactions.reduce((sum, interaction) => {
      const queryLength = interaction.query_length || 10
      const hasMultipleConcepts = interaction.multi_concept || false
      const complexity = (queryLength / 20) + (hasMultipleConcepts ? 0.3 : 0) // Normalize
      return sum + Math.min(complexity, 1)
    }, 0)
    
    return complexitySum / interactions.length
  }

  /**
   * Get user's typical interaction time pattern
   */
  private async getUserTimePattern(userId: string): Promise<number> {
    try {
      const result = await queryOne<{ avg_hour: number }>(`
        SELECT AVG(
          EXTRACT(HOUR FROM timestamp::timestamp) + 
          EXTRACT(MINUTE FROM timestamp::timestamp) / 60.0
        ) as avg_hour
        FROM learning_records 
        WHERE user_id = ? 
        AND timestamp >= NOW() - INTERVAL '30 days'
      `, [userId])
      return result ? result.avg_hour / 24 : 0.5 // Normalize to 0-1
    } catch (error) {
      console.error('Error calculating user time pattern:', error)
      return 0.5
    }
  }

  /**
   * Record user feedback and interaction data
   */
  async recordUserFeedback(
    recordId: string,
    userId: string,
    satisfaction: number,
    interactionData: {
      timeSpent?: number,
      followUpQueries?: string[],
      actionsTaken?: string[],
      responseHelpfulness?: number
    }
  ) {
    try {
      const effectiveness = this.calculateResponseEffectiveness(satisfaction, interactionData)
      
      await execute(
        `UPDATE learning_records 
         SET user_satisfaction = ?, user_interaction_data = ?, response_effectiveness = ?
         WHERE id = ? AND user_id = ?`,
        [
          satisfaction,
          JSON.stringify(interactionData),
          effectiveness,
          recordId,
          userId
        ]
      )
      
      // Update user preferences based on feedback
      await this.updateUserPreferences(userId, satisfaction, interactionData)
      
      console.log(`User feedback recorded for ${userId}: satisfaction ${satisfaction}, effectiveness ${effectiveness}`)
    } catch (error) {
      console.error('Error recording user feedback:', error)
    }
  }

  /**
   * Calculate response effectiveness based on user actions
   */
  private calculateResponseEffectiveness(satisfaction: number, interactionData: any): number {
    let effectiveness = satisfaction / 5 // Base on satisfaction (0-1)
    
    // Bonus for follow-up engagement
    if (interactionData.followUpQueries && interactionData.followUpQueries.length > 0) {
      effectiveness += 0.1
    }
    
    // Bonus for actions taken based on response
    if (interactionData.actionsTaken && interactionData.actionsTaken.length > 0) {
      effectiveness += 0.2
    }
    
    // Time spent bonus (longer engagement often means more helpful)
    if (interactionData.timeSpent && interactionData.timeSpent > 30) {
      effectiveness += 0.1
    }
    
    return Math.min(effectiveness, 1) // Cap at 1.0
  }

  /**
   * Update user preferences based on feedback and interaction patterns
   */
  private async updateUserPreferences(userId: string, satisfaction: number, interactionData: any) {
    try {
      // Update response type preference
      if (interactionData.responseType) {
        const responseWeight = satisfaction / 5 // Convert 1-5 to 0-1
        await execute(
          `INSERT INTO user_preferences 
           (user_id, preference_type, preference_key, preference_value, confidence_score, interaction_count, last_updated)
           VALUES (?, ?, ?, ?, ?, 1, NOW())
           ON CONFLICT (user_id, preference_type, preference_key) DO UPDATE SET
             preference_value = EXCLUDED.preference_value,
             confidence_score = EXCLUDED.confidence_score,
             interaction_count = user_preferences.interaction_count + 1,
             last_updated = NOW()`,
          [userId, 'response_type', interactionData.responseType, responseWeight, satisfaction / 5]
        )
      }
      
      // Update timing preference
      const currentHour = new Date().getHours()
      const timeWeight = satisfaction / 5
      await execute(
        `INSERT INTO user_preferences 
         (user_id, preference_type, preference_key, preference_value, confidence_score, interaction_count, last_updated)
         VALUES (?, ?, ?, ?, ?, 1, NOW())
         ON CONFLICT (user_id, preference_type, preference_key) DO UPDATE SET
           preference_value = EXCLUDED.preference_value,
           confidence_score = EXCLUDED.confidence_score,
           interaction_count = user_preferences.interaction_count + 1,
           last_updated = NOW()`,
        [userId, 'time_pattern', `hour_${currentHour}`, timeWeight, satisfaction / 5]
      )
      
      console.log(`Updated preferences for user ${userId} based on satisfaction ${satisfaction}`)
    } catch (error) {
      console.error('Error updating user preferences:', error)
    }
  }
}

export { AILearningSystem, type LearningRecord, type InternalModelWeights, type TrainingData }
