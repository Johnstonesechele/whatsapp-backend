/**
 * Adaptive Intelligence System (AIS)
 * 
 * A self-learning AI system that learns from user interactions, system data,
 * and usage patterns to provide increasingly intelligent responses without
 * relying on external AI providers.
 * 
 * Architecture:
 * 1. Data Collection Layer - Captures user interactions and system metrics
 * 2. Pattern Recognition Engine - Identifies trends and common queries
 * 3. Knowledge Base - Stores learned patterns and optimized responses
 * 4. Response Generation - Creates contextual answers based on learned data
 * 5. Continuous Learning - Improves responses based on user feedback
 */

class AdaptiveIntelligenceSystem {
  constructor() {
    this.patterns = new Map()
    this.responseTemplates = new Map()
    this.learningMetrics = {
      totalInteractions: 0,
      successfulResponses: 0,
      feedbackReceived: 0,
      patternsLearned: 0
    }
  }

  async init() {
    await this.loadKnowledgeBase()
  }

  async _getDb() {
    const { query, queryOne, execute } = await import('@/backend/database/db-adapter')
    return { query, queryOne, execute }
  }

  // Load existing knowledge base and patterns
  async loadKnowledgeBase() {
    try {
      const { query } = await this._getDb()

      // Load patterns
      const patterns = await query(`
        SELECT * FROM ais_patterns ORDER BY confidence_score DESC, frequency DESC
      `)

      patterns.forEach(pattern => {
        const key = `${pattern.pattern_type}:${pattern.context_keywords}`
        this.patterns.set(key, {
          data: JSON.parse(pattern.pattern_data),
          frequency: pattern.frequency,
          successRate: pattern.success_rate,
          confidence: pattern.confidence_score
        })
      })

      // Load knowledge
      const knowledge = await query(`
        SELECT * FROM ais_knowledge ORDER BY effectiveness_score DESC, usage_count DESC
      `)

      knowledge.forEach(item => {
        this.responseTemplates.set(item.topic, {
          content: item.content,
          type: item.content_type,
          confidence: item.confidence,
          usageCount: item.usage_count,
          effectiveness: item.effectiveness_score
        })
      })

      console.log(`✅ Loaded ${patterns.length} patterns and ${knowledge.length} knowledge items`)
    } catch (error) {
      console.warn('⚠️ Could not load existing knowledge base:', error.message)
    }
  }

  // Record user interaction for learning
  async recordInteraction(interaction) {
    const interactionId = `int_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    try {
      const { execute } = await this._getDb()

      await execute(`
        INSERT INTO ais_interactions (
          id, user_id, query, query_type, context, response, response_type,
          user_role, department, session_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        interactionId,
        interaction.userId,
        interaction.query,
        interaction.queryType || this.classifyQuery(interaction.query),
        JSON.stringify(interaction.context || {}),
        interaction.response,
        interaction.responseType || 'text',
        interaction.userRole || 'user',
        interaction.department || 'general',
        interaction.sessionId || 'unknown'
      ])

      this.learningMetrics.totalInteractions++
      
      // Analyze and learn from this interaction
      await this.analyzeInteraction(interactionId, interaction)
      
      return interactionId
    } catch (error) {
      console.error('❌ Failed to record interaction:', error.message)
      return null
    }
  }

  // Classify query type using pattern recognition
  classifyQuery(query) {
    const lowerQuery = query.toLowerCase()
    
    if (lowerQuery.includes('sales') || lowerQuery.includes('revenue') || lowerQuery.includes('performance')) {
      return 'sales_analysis'
    } else if (lowerQuery.includes('lead') || lowerQuery.includes('prospect') || lowerQuery.includes('contact')) {
      return 'lead_management'
    } else if (lowerQuery.includes('campaign') || lowerQuery.includes('marketing') || lowerQuery.includes('email')) {
      return 'campaign_management'
    } else if (lowerQuery.includes('automat') || lowerQuery.includes('workflow') || lowerQuery.includes('trigger')) {
      return 'automation_setup'
    } else if (lowerQuery.includes('team') || lowerQuery.includes('collaborat') || lowerQuery.includes('share')) {
      return 'team_collaboration'
    } else if (lowerQuery.includes('help') || lowerQuery.includes('how') || lowerQuery.includes('guide')) {
      return 'general_help'
    } else if (lowerQuery.includes('ai') || lowerQuery.includes('insight') || lowerQuery.includes('predict')) {
      return 'ai_features'
    } else {
      return 'general_inquiry'
    }
  }

  // Analyze interaction to extract learning patterns
  async analyzeInteraction(interactionId, interaction) {
    try {
      const queryType = this.classifyQuery(interaction.query)
      const keywords = this.extractKeywords(interaction.query)
      const context = interaction.context || {}

      // Create or update pattern
      const patternKey = `${queryType}:${keywords.join(',')}`
      const existingPattern = this.patterns.get(patternKey)

      if (existingPattern) {
        existingPattern.frequency++
        existingPattern.confidence = Math.min(1.0, existingPattern.confidence + 0.1)
      } else {
        this.patterns.set(patternKey, {
          data: {
            queryType,
            keywords,
            context,
            sampleQuery: interaction.query
          },
          frequency: 1,
          successRate: 0,
          confidence: 0.5
        })
      }

      // Store pattern in database
      await this.storePattern(queryType, keywords, context, interaction)
      
      this.learningMetrics.patternsLearned++

    } catch (error) {
      console.error('❌ Failed to analyze interaction:', error.message)
    }
  }

  // Extract keywords from query using simple NLP
  extractKeywords(query) {
    const stopWords = new Set([
      'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
      'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
      'to', 'was', 'will', 'with', 'how', 'what', 'where', 'when', 'why',
      'can', 'could', 'should', 'would', 'do', 'does', 'did', 'have', 'had'
    ])

    return query
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word))
      .slice(0, 5) // Top 5 keywords
  }

  // Store learned pattern in database
  async storePattern(queryType, keywords, context, interaction) {
    const patternId = `pat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    try {
      const { execute } = await this._getDb()

      await execute(`
        INSERT OR REPLACE INTO ais_patterns (
          id, pattern_type, pattern_data, context_keywords,
          user_roles, departments, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [
        patternId,
        queryType,
        JSON.stringify({
          keywords,
          context,
          sampleQuery: interaction.query,
          responseType: interaction.responseType
        }),
        keywords.join(','),
        interaction.userRole || 'user',
        interaction.department || 'general'
      ])
    } catch (error) {
      console.error('❌ Failed to store pattern:', error.message)
    }
  }

  // Generate response using learned patterns and knowledge
  async generateIntelligentResponse(query, userContext = {}) {
    try {
      const queryType = this.classifyQuery(query)
      const keywords = this.extractKeywords(query)
      
      // Try to find learned response first
      const learnedResponse = await this.findLearnedResponse(queryType, keywords, userContext)
      if (learnedResponse && learnedResponse.confidence > 0.7) {
        await this.updateKnowledgeUsage(learnedResponse.id)
        return {
          response: learnedResponse.content,
          type: learnedResponse.type || 'text',
          source: 'learned',
          confidence: learnedResponse.confidence
        }
      }

      // Try pattern-based response
      const patternResponse = await this.generatePatternResponse(queryType, keywords, userContext)
      if (patternResponse) {
        return {
          response: patternResponse.content,
          type: patternResponse.type || 'text',
          source: 'pattern',
          confidence: patternResponse.confidence
        }
      }

      // Fallback to enhanced rule-based with learning integration
      const enhancedResponse = await this.generateEnhancedResponse(query, queryType, userContext)
      
      // Store this response for future learning
      await this.storeKnowledgeItem(queryType, enhancedResponse.response, 'generated', 0.6)
      
      return enhancedResponse

    } catch (error) {
      console.error('❌ Failed to generate intelligent response:', error.message)
      
      return {
        response: "I'm learning how to better assist you. Could you rephrase your question or be more specific about what you'd like help with?",
        type: 'text',
        source: 'fallback',
        confidence: 0.3
      }
    }
  }

  // Find learned response from knowledge base
  async findLearnedResponse(queryType, keywords, userContext) {
    try {
      const { queryOne } = await this._getDb()
      const keywordStr = keywords.join(' ')
      
      const result = await queryOne(`
        SELECT * FROM ais_knowledge 
        WHERE topic = ? 
           OR content LIKE '%' || ? || '%'
        ORDER BY effectiveness_score DESC, confidence DESC, usage_count DESC
        LIMIT 1
      `, [queryType, keywordStr])

      return result ? {
        id: result.id,
        content: result.content,
        type: result.content_type,
        confidence: result.confidence,
        usage: result.usage_count
      } : null
      
    } catch (error) {
      console.error('❌ Failed to find learned response:', error.message)
      return null
    }
  }

  // Generate response based on learned patterns
  async generatePatternResponse(queryType, keywords, userContext) {
    const patternKey = `${queryType}:${keywords.join(',')}`
    const pattern = this.patterns.get(patternKey)
    
    if (!pattern || pattern.confidence < 0.5) {
      return null
    }

    // Generate response based on pattern data
    const templates = {
      sales_analysis: "Based on my analysis of your sales data patterns, I recommend focusing on {insights}. Your performance metrics suggest {recommendations}.",
      lead_management: "For effective lead management, I've learned that {strategies} work best. Consider implementing {actions} to improve conversion rates.",
      campaign_management: "Your campaign performance data shows {patterns}. I suggest optimizing {areas} for better results.",
      automation_setup: "From successful automation setups I've observed, {workflows} tend to be most effective. Start with {steps}.",
      team_collaboration: "Teams using our collaboration features achieve {benefits}. I recommend focusing on {tools} for your needs.",
      general_help: "Based on common user needs, I can help you with {features}. The most effective approach is usually {guidance}."
    }

    const template = templates[queryType] || "Based on learned patterns, I recommend {suggestions} for your specific needs."
    
    return {
      content: this.populateTemplate(template, pattern.data, userContext),
      type: 'suggestion',
      confidence: pattern.confidence
    }
  }

  // Populate template with learned data
  populateTemplate(template, patternData, userContext) {
    // This is a simplified template system - could be enhanced with more sophisticated NLG
    const placeholders = {
      insights: "improving conversion rates and identifying high-value opportunities",
      recommendations: "focusing on lead scoring and automated follow-ups",
      strategies: "AI-powered lead scoring and personalized outreach",
      actions: "segmenting leads by quality score and implementing drip campaigns",
      patterns: "higher engagement with personalized content",
      areas: "subject lines, send timing, and audience segmentation",
      workflows: "lead nurturing sequences and automated task assignments",
      steps: "defining triggers and setting up conditional logic",
      benefits: "increased productivity and better communication",
      tools: "shared documents, real-time chat, and activity tracking",
      features: "dashboard navigation, lead management, and campaign creation",
      guidance: "starting with the most relevant features for your role",
      suggestions: "leveraging our AI features and automation tools"
    }

    let result = template
    Object.entries(placeholders).forEach(([key, value]) => {
      result = result.replace(new RegExp(`{${key}}`, 'g'), value)
    })

    return result
  }

  // Generate enhanced rule-based response with learning context
  async generateEnhancedResponse(query, queryType, userContext) {
    // Similar to existing rule-based but enhanced with learning insights
    const responseMap = {
      sales_analysis: {
        response: `Based on sales acceleration patterns I've learned, I recommend visiting the **Analytics** section for comprehensive performance insights. The AI features can help you identify trends and opportunities for revenue growth.`,
        type: 'analysis'
      },
      lead_management: {
        response: `From successful lead management strategies, I've found that combining AI scoring with personalized outreach works best. Use the **Leads** section to implement scoring models and automated follow-ups.`,
        type: 'suggestion'
      },
      campaign_management: {
        response: `Effective campaign strategies I've observed include multi-channel approaches and behavioral triggers. The **Campaigns** section provides tools for email, SMS, and WhatsApp marketing with performance tracking.`,
        type: 'suggestion'
      },
      automation_setup: {
        response: `Successful automation implementations typically start with simple workflows and expand gradually. Use the **Automation** section to set up lead nurturing, task assignments, and smart notifications.`,
        type: 'suggestion'
      }
    }

    const response = responseMap[queryType] || {
      response: `I'm continuously learning about our system capabilities. For immediate help, try the **Dashboard** for an overview, or explore specific sections like Leads, Campaigns, or Analytics based on your needs.`,
      type: 'text'
    }

    return {
      response: response.response,
      type: response.type,
      source: 'enhanced_rule',
      confidence: 0.7
    }
  }

  // Store knowledge item for future learning
  async storeKnowledgeItem(topic, content, source, confidence = 0.5) {
    const knowledgeId = `know_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    try {
      const { execute } = await this._getDb()

      await execute(`
        INSERT INTO ais_knowledge (
          id, topic, content, content_type, source, confidence, last_used
        ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [knowledgeId, topic, content, 'text', source, confidence])
      
      console.log(`📚 Stored new knowledge: ${topic}`)
    } catch (error) {
      console.error('❌ Failed to store knowledge item:', error.message)
    }
  }

  // Update knowledge usage statistics
  async updateKnowledgeUsage(knowledgeId) {
    try {
      const { execute } = await this._getDb()

      await execute(`
        UPDATE ais_knowledge 
        SET usage_count = usage_count + 1, 
            last_used = CURRENT_TIMESTAMP,
            effectiveness_score = effectiveness_score + 0.05
        WHERE id = ?
      `, [knowledgeId])
    } catch (error) {
      console.error('❌ Failed to update knowledge usage:', error.message)
    }
  }

  // Record user feedback for continuous improvement
  async recordFeedback(interactionId, feedbackType, rating, comment) {
    const feedbackId = `fb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    try {
      const { execute } = await this._getDb()

      await execute(`
        INSERT INTO ais_feedback (
          id, interaction_id, feedback_type, rating, comment
        ) VALUES (?, ?, ?, ?, ?)
      `, [feedbackId, interactionId, feedbackType, rating, comment])

      // Update interaction success score
      await execute(`
        UPDATE ais_interactions 
        SET success_score = ? 
        WHERE id = ?
      `, [rating / 5.0, interactionId])

      this.learningMetrics.feedbackReceived++
      
      // Learn from feedback
      await this.learnFromFeedback(interactionId, rating, comment)
      
      console.log(`📝 Recorded feedback: ${rating}/5 for interaction ${interactionId}`)
    } catch (error) {
      console.error('❌ Failed to record feedback:', error.message)
    }
  }

  // Learn from user feedback to improve responses
  async learnFromFeedback(interactionId, rating, comment) {
    try {
      const { queryOne } = await this._getDb()

      const interaction = await queryOne(`
        SELECT * FROM ais_interactions WHERE id = ?
      `, [interactionId])

      if (!interaction) return

      const queryType = interaction.query_type
      const keywords = this.extractKeywords(interaction.query)
      
      // Adjust pattern confidence based on feedback
      const patternKey = `${queryType}:${keywords.join(',')}`
      const pattern = this.patterns.get(patternKey)
      
      if (pattern) {
        const feedbackScore = rating / 5.0
        pattern.successRate = (pattern.successRate + feedbackScore) / 2
        pattern.confidence = Math.max(0.1, Math.min(1.0, pattern.confidence + (feedbackScore - 0.5) * 0.2))
      }

      // Update knowledge effectiveness if applicable
      if (rating >= 4) {
        // Good feedback - reinforce this knowledge
        await this.reinforceKnowledge(queryType, interaction.response)
      } else if (rating <= 2) {
        // Poor feedback - mark for improvement
        await this.markForImprovement(queryType, interaction.response, comment)
      }

    } catch (error) {
      console.error('❌ Failed to learn from feedback:', error.message)
    }
  }

  // Reinforce knowledge based on positive feedback
  async reinforceKnowledge(topic, content) {
    try {
      const { execute } = await this._getDb()

      await execute(`
        UPDATE ais_knowledge 
        SET effectiveness_score = effectiveness_score + 0.1,
            confidence = MIN(1.0, confidence + 0.05)
        WHERE topic = ? AND content = ?
      `, [topic, content])
    } catch (error) {
      console.error('❌ Failed to reinforce knowledge:', error.message)
    }
  }

  // Mark knowledge for improvement based on negative feedback
  async markForImprovement(topic, content, comment) {
    try {
      const { execute } = await this._getDb()

      await execute(`
        UPDATE ais_knowledge 
        SET effectiveness_score = effectiveness_score - 0.1,
            confidence = MAX(0.1, confidence - 0.05)
        WHERE topic = ? AND content = ?
      `, [topic, content])
      
      // Store improvement suggestion if provided
      if (comment) {
        const improvementId = `imp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        await execute(`
          INSERT INTO ais_feedback (
            id, interaction_id, feedback_type, comment
          ) VALUES (?, ?, ?, ?)
        `, [improvementId, 'improvement', 'suggestion', comment])
      }
    } catch (error) {
      console.error('❌ Failed to mark for improvement:', error.message)
    }
  }

  // Get learning metrics and system performance
  async getMetrics() {
    try {
      const { queryOne } = await this._getDb()

      const dbMetrics = await queryOne(`
        SELECT 
          COUNT(*) as total_interactions,
          AVG(success_score) as avg_success_rate,
          COUNT(DISTINCT user_id) as unique_users
        FROM ais_interactions 
        WHERE timestamp >= datetime('now', '-30 days')
      `)

      const patternCount = (await queryOne(`
        SELECT COUNT(*) as count FROM ais_patterns
      `)).count

      const knowledgeCount = (await queryOne(`
        SELECT COUNT(*) as count FROM ais_knowledge
      `)).count

      return {
        ...this.learningMetrics,
        ...dbMetrics,
        patterns: patternCount,
        knowledgeItems: knowledgeCount,
        averageConfidence: Array.from(this.patterns.values())
          .reduce((sum, p) => sum + p.confidence, 0) / Math.max(1, this.patterns.size)
      }
    } catch (error) {
      console.error('❌ Failed to get metrics:', error.message)
      return this.learningMetrics
    }
  }

  // Export learned knowledge for backup/analysis
  async exportKnowledge() {
    try {
      const { query } = await this._getDb()

      const knowledge = await query(`
        SELECT * FROM ais_knowledge ORDER BY effectiveness_score DESC
      `)

      const patterns = await query(`
        SELECT * FROM ais_patterns ORDER BY confidence_score DESC
      `)

      return {
        knowledge,
        patterns,
        exportDate: new Date().toISOString(),
        metrics: await this.getMetrics()
      }
    } catch (error) {
      console.error('❌ Failed to export knowledge:', error.message)
      return null
    }
  }

  close() {}
}

module.exports = AdaptiveIntelligenceSystem
