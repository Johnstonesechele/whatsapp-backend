// USSD-Style Survey System for WhatsApp and SMS
// Supports nested menus, pagination, and various response types

export interface SurveyOption {
  id: string
  text: string
  value: string | number
  type: 'menu' | 'question' | 'rating' | 'text' | 'yesno'
  subMenu?: SurveyMenu
  question?: SurveyQuestion
}

export interface SurveyQuestion {
  id: string
  text: string
  type: 'rating' | 'text' | 'yesno' | 'multiple_choice'
  required: boolean
  validation?: {
    min?: number
    max?: number
    pattern?: string
  }
  options?: string[] // For multiple choice
}

export interface SurveyMenu {
  id: string
  title: string
  description?: string
  options: SurveyOption[]
  pagination: {
    enabled: boolean
    itemsPerPage: number
    currentPage: number
    totalPages: number
  }
}

export interface SurveySession {
  id: string
  userId: string
  contactPhone: string
  surveyId: string
  currentMenu: string
  currentPage: number
  navigationHistory: string[]
  responses: SurveyResponse[]
  status: 'active' | 'completed' | 'abandoned'
  createdAt: Date
  updatedAt: Date
  /**
   * The question currently awaiting an answer, if any.
   *
   * A USSD dialogue alternates: the user picks a menu option, is shown a
   * question, then types the ANSWER. Without this field the engine cannot tell
   * those two apart and treats every answer as another menu selection, so no
   * response is ever stored. It is persisted with the session, so a USSD
   * session that resumes after a dropped connection still knows the pending
   * question.
   */
  pendingQuestion?: {
    questionId: string
    menuId: string
    /** The question object, needed to validate and re-prompt on bad input. */
    question: SurveyQuestion
    /** Menu option id to advance to once this question is answered. */
    returnToOptionId?: string
  } | null
}

export interface SurveyResponse {
  questionId: string
  menuId: string
  response: string | number
  responseType: 'rating' | 'text' | 'yesno' | 'multiple_choice' | 'menu_selection'
  timestamp: Date
}

export interface Survey {
  id: string
  name: string
  description: string
  welcomeMessage: string
  thankYouMessage: string
  rootMenu: SurveyMenu
  settings: {
    allowBack: boolean
    allowExit: boolean
    maxDepth: number
    sessionTimeout: number // minutes
    enablePagination: boolean
  }
  createdAt: Date
  updatedAt: Date
  response_count?: number
  completion_rate?: number
  last_sent?: string
  questions?: any[]
}

export class USSDSurveySystem {
  private static readonly COMMANDS = {
    BACK: '0',
    BACK_TO_START: '00',
    EXIT: '000',
    NEXT_PAGE: '98'
  } as const

  static createDefaultSurvey(): Survey {
    return {
      id: `survey_${Date.now()}`,
      name: 'Customer Satisfaction Survey',
      description: 'Tech Service Customer Satisfaction Survey',
      welcomeMessage: ' Welcome to our Customer Satisfaction Survey!\n\nThis will take approximately 5 minutes of your time.\n\n1. Continue with Survey\n2. Exit Survey\n\nPlease reply with 1 or 2:',
      thankYouMessage: ' Thank you for participating in our survey! Your feedback is valuable to us.',
      rootMenu: {
        id: 'main_menu',
        title: 'Main Survey Menu',
        description: 'Please select a category to provide feedback:',
        options: [
          {
            id: 'service_quality',
            text: 'Service Quality',
            value: 1,
            type: 'menu',
            subMenu: {
              id: 'service_quality_menu',
              title: 'Service Quality Feedback',
              description: 'Rate our service quality:',
              options: [
                {
                  id: 'overall_satisfaction',
                  text: 'Overall Satisfaction',
                  value: 1,
                  type: 'question',
                  question: {
                    id: 'q_overall_satisfaction',
                    text: 'How would you rate your overall satisfaction with our service?\n\nPlease rate from 1-10 (1=Very Poor, 10=Excellent):',
                    type: 'rating',
                    required: true,
                    validation: { min: 1, max: 10 }
                  }
                },
                {
                  id: 'response_time',
                  text: 'Response Time',
                  value: 2,
                  type: 'question',
                  question: {
                    id: 'q_response_time',
                    text: 'How would you rate our response time?\n\nPlease rate from 1-10 (1=Very Slow, 10=Very Fast):',
                    type: 'rating',
                    required: true,
                    validation: { min: 1, max: 10 }
                  }
                },
                {
                  id: 'technical_expertise',
                  text: 'Technical Expertise',
                  value: 3,
                  type: 'question',
                  question: {
                    id: 'q_technical_expertise',
                    text: 'How would you rate the technical expertise of our team?\n\nPlease rate from 1-10 (1=Poor, 10=Excellent):',
                    type: 'rating',
                    required: true,
                    validation: { min: 1, max: 10 }
                  }
                }
              ],
              pagination: {
                enabled: true,
                itemsPerPage: 10,
                currentPage: 1,
                totalPages: 1
              }
            }
          },
          {
            id: 'support_experience',
            text: 'Support Experience',
            value: 2,
            type: 'menu',
            subMenu: {
              id: 'support_menu',
              title: 'Support Experience',
              description: 'Tell us about your support experience:',
              options: [
                {
                  id: 'support_helpful',
                  text: 'Was support helpful?',
                  value: 1,
                  type: 'question',
                  question: {
                    id: 'q_support_helpful',
                    text: 'Was our support team helpful in resolving your issue?\n\n1. Yes, very helpful\n2. Somewhat helpful\n3. Not helpful\n\nPlease reply with 1, 2, or 3:',
                    type: 'multiple_choice',
                    required: true,
                    options: ['Yes, very helpful', 'Somewhat helpful', 'Not helpful']
                  }
                },
                {
                  id: 'support_feedback',
                  text: 'Additional Feedback',
                  value: 2,
                  type: 'question',
                  question: {
                    id: 'q_support_feedback',
                    text: 'Please provide any additional feedback about your support experience (or type "none" if no feedback):',
                    type: 'text',
                    required: false
                  }
                }
              ],
              pagination: {
                enabled: true,
                itemsPerPage: 10,
                currentPage: 1,
                totalPages: 1
              }
            }
          },
          {
            id: 'recommendations',
            text: 'Recommendations',
            value: 3,
            type: 'question',
            question: {
              id: 'q_recommend',
              text: 'Would you recommend our service to others?\n\n1. Yes\n2. No\n\nPlease reply with 1 or 2:',
              type: 'yesno',
              required: true
            }
          }
        ],
        pagination: {
          enabled: true,
          itemsPerPage: 10,
          currentPage: 1,
          totalPages: 1
        }
      },
      settings: {
        allowBack: true,
        allowExit: true,
        maxDepth: 5,
        sessionTimeout: 30,
        enablePagination: true
      },
      createdAt: new Date(),
      updatedAt: new Date()
    }
  }

  static formatMenuMessage(menu: SurveyMenu, page: number = 1): string {
    const itemsPerPage = menu.pagination.itemsPerPage
    const startIndex = (page - 1) * itemsPerPage
    const endIndex = Math.min(startIndex + itemsPerPage, menu.options.length)
    const pageItems = menu.options.slice(startIndex, endIndex)

    let message = ` ${menu.title}\n\n`
    if (menu.description) {
      message += `${menu.description}\n\n`
    }

    // Add menu items
    pageItems.forEach((option, index) => {
      const itemNumber = startIndex + index + 1
      message += `${itemNumber}. ${option.text}\n`
    })

    // Add navigation options
    message += '\n'
    
    // Pagination controls
    if (menu.pagination.enabled && menu.options.length > itemsPerPage) {
      const totalPages = Math.ceil(menu.options.length / itemsPerPage)
      if (page < totalPages) {
        message += '98. Next Page →\n'
      }
    }

    // Standard navigation
    message += '0. ← Back\n'
    message += '00. ↩ Back to Start\n'
    message += '000.  Exit Survey\n\n'
    message += 'Please reply with your choice:'

    return message
  }

  static formatQuestionMessage(question: SurveyQuestion): string {
    let message = ` ${question.text}\n\n`

    if (question.type === 'multiple_choice' && question.options) {
      question.options.forEach((option, index) => {
        message += `${index + 1}. ${option}\n`
      })
      message += '\n'
    }

    if (question.required) {
      message += '* This question is required\n'
    }

    message += '\n0. ← Back\n'
    message += '00. ↩ Back to Start\n'
    message += '000.  Exit Survey\n\n'
    message += 'Please reply with your answer:'

    return message
  }

  static validateResponse(response: string, question: SurveyQuestion): { valid: boolean; error?: string } {
    const trimmedResponse = response.trim()

    // Allow navigation commands
    if (['0', '00', '000'].includes(trimmedResponse)) {
      return { valid: true }
    }

    if (question.required && !trimmedResponse) {
      return { valid: false, error: 'This question is required. Please provide an answer.' }
    }

    switch (question.type) {
      case 'rating':
        const rating = parseInt(trimmedResponse)
        if (isNaN(rating)) {
          return { valid: false, error: 'Please enter a valid number.' }
        }
        // Use ?? not ||: a configured min of 0 is falsy, so `min &&` /
        // `||` silently skipped the lower-bound check on 0-based scales and
        // accepted negative scores.
        if (question.validation?.min !== undefined && question.validation.min !== null && rating < question.validation.min) {
          return { valid: false, error: `Please enter a number ${question.validation.min} or higher.` }
        }
        if (question.validation?.max !== undefined && question.validation.max !== null && rating > question.validation.max) {
          return { valid: false, error: `Please enter a number ${question.validation.max} or lower.` }
        }
        break

      case 'multiple_choice':
        const choice = parseInt(trimmedResponse)
        // parseInt('1abc') is 1, so require the input to be purely numeric.
        if (!/^\d+$/.test(trimmedResponse) || isNaN(choice) || choice < 1 || (question.options && choice > question.options.length)) {
          return { valid: false, error: 'Please select a valid option number.' }
        }
        break

      case 'yesno':
        if (!['1', '2'].includes(trimmedResponse)) {
          return { valid: false, error: 'Please reply with 1 for Yes or 2 for No.' }
        }
        break

      case 'text':
        if (question.validation?.pattern) {
          const regex = new RegExp(question.validation.pattern)
          if (!regex.test(trimmedResponse)) {
            return { valid: false, error: 'Please enter a valid response format.' }
          }
        }
        break
    }

    return { valid: true }
  }

  static processUserResponse(
    session: SurveySession,
    response: string,
    survey: Survey
  ): { 
    nextMessage: string
    session: SurveySession
    completed: boolean
    error?: string
  } {
    const trimmedResponse = response.trim()

    // Handle navigation commands
    switch (trimmedResponse) {
      case this.COMMANDS.EXIT:
        session.status = 'abandoned'
        session.pendingQuestion = null
        return {
          nextMessage: survey.thankYouMessage + '\n\n(Survey exited)',
          session,
          completed: true
        }

      case this.COMMANDS.BACK_TO_START:
        session.currentMenu = survey.rootMenu.id
        session.currentPage = 1
        session.navigationHistory = []
        return {
          nextMessage: this.formatMenuMessage(survey.rootMenu),
          session,
          completed: false
        }

      case this.COMMANDS.BACK:
        // Backing out of a pending question abandons the answer and returns to
        // the menu the question was opened from.
        if (session.pendingQuestion) {
          const menuId = session.pendingQuestion.menuId
          session.pendingQuestion = null
          const parent = this.findMenuById(survey, menuId)
          if (parent) {
            session.currentMenu = menuId
            return {
              nextMessage: this.formatMenuMessage(parent, session.currentPage),
              session,
              completed: false
            }
          }
        }
        if (session.navigationHistory.length > 0) {
          const previousMenu = session.navigationHistory.pop()!
          session.currentMenu = previousMenu
          // Find and display the previous menu
          const menu = this.findMenuById(survey, previousMenu)
          if (menu) {
            return {
              nextMessage: this.formatMenuMessage(menu, session.currentPage),
              session,
              completed: false
            }
          }
        }
        // If no history, go to root
        session.currentMenu = survey.rootMenu.id
        return {
          nextMessage: this.formatMenuMessage(survey.rootMenu),
          session,
          completed: false
        }
    }

    // ── ANSWER the pending question ──────────────────────────────────────
    // This must run BEFORE any menu handling. Without it the engine cannot
    // distinguish "the user is answering question 7" from "the user picked
    // option 7", so every answer was parsed as a menu selection and
    // session.responses stayed empty.
    if (session.pendingQuestion?.question) {
      const pending = session.pendingQuestion
      const question = pending.question

      const validation = this.validateResponse(trimmedResponse, question)
      if (!validation.valid) {
        // Re-ask, keep the question pending so the next reply is an answer.
        return {
          nextMessage: `${validation.error}\n\n${this.formatQuestionMessage(question)}`,
          session,
          completed: false,
          error: validation.error
        }
      }

      session.responses.push({
        questionId: question.id,
        menuId: pending.menuId,
        response: trimmedResponse,
        responseType: question.type,
        timestamp: new Date()
      } as SurveyResponse)

      session.pendingQuestion = null
      session.currentMenu = pending.menuId
      session.currentPage = 1

      // More questions in this menu?
      const next = this.findNextQuestionInMenu(survey, pending.menuId, question.id)
      if (next) {
        session.pendingQuestion = {
          questionId: next.question.id,
          menuId: pending.menuId,
          question: next.question
        }
        return {
          nextMessage: this.formatQuestionMessage(next.question),
          session,
          completed: false
        }
      }

      // The menu is exhausted. If the survey has other sections left, return
      // to the root menu so the respondent can continue - finishing one
      // section must NOT end the whole survey.
      if (!this.isLastQuestionInSurvey(survey, session.responses)) {
        session.currentMenu = survey.rootMenu.id
        session.currentPage = 1
        const root = survey.rootMenu
        return {
          nextMessage: this.formatMenuMessage(root),
          session,
          completed: false
        }
      }

      session.status = 'completed'
      return {
        nextMessage: survey.thankYouMessage,
        session,
        completed: true
      }
    }

    // Find current menu/question context
    const currentMenu = this.findMenuById(survey, session.currentMenu)
    if (!currentMenu) {
      return {
        nextMessage: 'Error: Invalid session state. Returning to start.',
        session: { ...session, currentMenu: survey.rootMenu.id },
        completed: false,
        error: 'Invalid session state'
      }
    }

    // Handle pagination
    if (trimmedResponse === this.COMMANDS.NEXT_PAGE) {
      const totalPages = Math.ceil(currentMenu.options.length / currentMenu.pagination.itemsPerPage)
      if (session.currentPage < totalPages) {
        session.currentPage += 1
        return {
          nextMessage: this.formatMenuMessage(currentMenu, session.currentPage),
          session,
          completed: false
        }
      }
    }

    // Process menu selection or question response
    const responseNum = parseInt(trimmedResponse)
    if (isNaN(responseNum)) {
      return {
        nextMessage: 'Please enter a valid number or use navigation commands (0, 00, 000).',
        session,
        completed: false,
        error: 'Invalid input'
      }
    }

    // Calculate actual option index considering pagination
    const startIndex = (session.currentPage - 1) * currentMenu.pagination.itemsPerPage
    const optionIndex = startIndex + responseNum - 1
    const selectedOption = currentMenu.options[optionIndex]

    if (!selectedOption) {
      return {
        nextMessage: 'Invalid selection. Please choose a valid option number.',
        session,
        completed: false,
        error: 'Invalid option'
      }
    }

    // Process the selected option
    if (selectedOption.type === 'menu' && selectedOption.subMenu) {
      // Navigate to submenu
      session.navigationHistory.push(session.currentMenu)
      session.currentMenu = selectedOption.subMenu.id
      session.currentPage = 1
      
      return {
        nextMessage: this.formatMenuMessage(selectedOption.subMenu),
        session,
        completed: false
      }
    } else if (selectedOption.type === 'question' && selectedOption.question) {
      // Remember that we are now awaiting an ANSWER, so the next reply is
      // validated against the question instead of read as a menu choice.
      session.pendingQuestion = {
        questionId: selectedOption.question.id,
        menuId: session.currentMenu,
        question: selectedOption.question
      }
      return {
        nextMessage: this.formatQuestionMessage(selectedOption.question),
        session,
        completed: false
      }
    }

    // If we reach here, something went wrong
    return {
      nextMessage: 'Error processing selection. Please try again.',
      session,
      completed: false,
      error: 'Processing error'
    }
  }

  /** The question that follows `questionId` within the same menu, if any. */
  private static findNextQuestionInMenu(
    survey: Survey,
    menuId: string,
    questionId: string
  ): SurveyOption | null {
    const menu = this.findMenuById(survey, menuId)
    if (!menu) return null
    const options = menu.options || []
    const idx = options.findIndex(
      o => o.type === 'question' && o.question?.id === questionId
    )
    if (idx === -1) return null
    for (let i = idx + 1; i < options.length; i++) {
      if (options[i].type === 'question' && options[i].question) return options[i]
    }
    return null
  }

  /** True when `questionId` is the final question in its menu. */
  private static isLastQuestionInMenu(
    survey: Survey,
    menuId: string,
    questionId: string
  ): boolean {
    return this.findNextQuestionInMenu(survey, menuId, questionId) === null
  }

  /**
   * True when every question in the whole survey has been answered.
   *
   * Needed because a survey is split into sections, each its own menu.
   * Finishing one section must return the respondent to the root menu to
   * continue, not end the survey.
   */
  private static isLastQuestionInSurvey(survey: Survey, responses: SurveyResponse[]): boolean {
    const answered = new Set((responses || []).map(r => r.questionId))
    const walk = (menu: any, seen = new Set<string>()): boolean => {
      if (!menu || seen.has(menu.id)) return true
      seen.add(menu.id)
      for (const opt of menu.options || []) {
        if (opt.type === 'question' && opt.question) {
          if (!answered.has(opt.question.id)) return false
        } else if (opt.subMenu && !walk(opt.subMenu, seen)) {
          return false
        }
      }
      return true
    }
    return walk(survey.rootMenu)
  }

  private static findMenuById(survey: Survey, menuId: string): SurveyMenu | null {
    if (survey.rootMenu.id === menuId) {
      return survey.rootMenu
    }
    return this.findMenuInOptions(survey.rootMenu.options, menuId)
  }

  private static findMenuInOptions(options: SurveyOption[], menuId: string): SurveyMenu | null {
    for (const option of options) {
      if (option.subMenu?.id === menuId) {
        return option.subMenu
      }
      if (option.subMenu) {
        const found = this.findMenuInOptions(option.subMenu.options, menuId)
        if (found) return found
      }
    }
    return null
  }

  // ── 10-Level Deep Template ─────────────────────────────────────────────────
  // Provides a ready-made scaffold users can edit to build their own survey.
  // The "Product Experience" branch drills exactly 10 menu levels deep.
  static createDeepTemplate(): Survey {
    const p = { enabled: false, itemsPerPage: 5, currentPage: 1, totalPages: 1 }

    // ── Level 10 – Final Ratings ──────────────────────────────────────────
    const l10: SurveyMenu = {
      id: 'deep_l10_final_ratings',
      title: '10. Final Ratings',
      description: 'You have reached the deepest level. Please provide your final ratings:',
      options: [
        {
          id: 'deep_l10_opt1',
          text: 'Overall Efficiency Rating',
          value: 1,
          type: 'question',
          question: {
            id: 'q_deep_l10_efficiency',
            text: 'On a scale of 1–5, how much has our platform improved your work efficiency?\n\n1. Significantly worse\n2. Slightly worse\n3. No change\n4. Slightly better\n5. Significantly better\n\nReply with 1–5:',
            type: 'rating',
            required: true,
            validation: { min: 1, max: 5 },
          },
        },
        {
          id: 'deep_l10_opt2',
          text: 'Overall Satisfaction Rating',
          value: 2,
          type: 'question',
          question: {
            id: 'q_deep_l10_satisfaction',
            text: 'How satisfied are you with our platform overall?\n\n1. Extremely satisfied\n2. Satisfied\n3. Neutral\n4. Dissatisfied\n5. Extremely dissatisfied\n\nReply with 1–5:',
            type: 'rating',
            required: true,
            validation: { min: 1, max: 5 },
          },
        },
        {
          id: 'deep_l10_opt3',
          text: 'Additional Comments',
          value: 3,
          type: 'question',
          question: {
            id: 'q_deep_l10_comments',
            text: 'Please share any final comments or suggestions for improving our platform:\n\n(Type your response)',
            type: 'text',
            required: false,
          },
        },
      ],
      pagination: p,
    }

    // ── Level 9 – Work Efficiency ─────────────────────────────────────────
    const l9: SurveyMenu = {
      id: 'deep_l9_work_efficiency',
      title: '9. Work Efficiency Assessment',
      description: 'Assess how our platform has changed your day-to-day work efficiency:',
      options: [
        { id: 'deep_l9_opt1', text: 'Final Ratings →', value: 1, type: 'menu', subMenu: l10 },
        {
          id: 'deep_l9_opt2',
          text: 'Team Collaboration',
          value: 2,
          type: 'question',
          question: {
            id: 'q_deep_l9_collab',
            text: 'Has our platform improved team collaboration?\n\n1. Yes, greatly\n2. Yes, somewhat\n3. No change\n4. Made it harder\n\nReply with 1–4:',
            type: 'multiple_choice',
            required: true,
            options: ['Yes, greatly', 'Yes, somewhat', 'No change', 'Made it harder'],
          },
        },
      ],
      pagination: p,
    }

    // ── Level 8 – Weekly Impact ───────────────────────────────────────────
    const l8: SurveyMenu = {
      id: 'deep_l8_weekly_impact',
      title: '8. Weekly Usage Impact',
      description: 'How does regular usage affect your weekly output?',
      options: [
        { id: 'deep_l8_opt1', text: 'Work Efficiency →', value: 1, type: 'menu', subMenu: l9 },
        {
          id: 'deep_l8_opt2',
          text: 'Overall Performance Change',
          value: 2,
          type: 'question',
          question: {
            id: 'q_deep_l8_performance',
            text: 'How has using our platform affected team performance?\n\n1. Major improvement\n2. Moderate improvement\n3. Minor improvement\n4. No change\n\nReply with 1–4:',
            type: 'multiple_choice',
            required: true,
            options: ['Major improvement', 'Moderate improvement', 'Minor improvement', 'No change'],
          },
        },
      ],
      pagination: p,
    }

    // ── Level 7 – Time Savings ────────────────────────────────────────────
    const l7: SurveyMenu = {
      id: 'deep_l7_time_savings',
      title: '7. Time Savings Analysis',
      description: 'Analyse the time savings you gain from using our platform:',
      options: [
        { id: 'deep_l7_opt1', text: 'Weekly Impact →', value: 1, type: 'menu', subMenu: l8 },
        {
          id: 'deep_l7_opt2',
          text: 'Satisfaction with Time Saved',
          value: 2,
          type: 'question',
          question: {
            id: 'q_deep_l7_time_satisfaction',
            text: 'How satisfied are you with the time you save using our platform?\n\n1. Very satisfied\n2. Satisfied\n3. Neutral\n4. Dissatisfied\n\nReply with 1–4:',
            type: 'multiple_choice',
            required: true,
            options: ['Very satisfied', 'Satisfied', 'Neutral', 'Dissatisfied'],
          },
        },
      ],
      pagination: p,
    }

    // ── Level 6 – Productivity Impact ─────────────────────────────────────
    const l6: SurveyMenu = {
      id: 'deep_l6_productivity',
      title: '6. Productivity Impact',
      description: 'How has our platform affected your productivity?',
      options: [
        { id: 'deep_l6_opt1', text: 'Time Savings →', value: 1, type: 'menu', subMenu: l7 },
        {
          id: 'deep_l6_opt2',
          text: 'Quality of Output',
          value: 2,
          type: 'question',
          question: {
            id: 'q_deep_l6_quality',
            text: 'Has the quality of your work improved since using our platform?\n\n1. Significant improvement\n2. Moderate improvement\n3. No change\n4. Decreased quality\n\nReply with 1–4:',
            type: 'multiple_choice',
            required: true,
            options: ['Significant improvement', 'Moderate improvement', 'No change', 'Decreased quality'],
          },
        },
      ],
      pagination: p,
    }

    // ── Level 5 – Daily Usage ─────────────────────────────────────────────
    const l5: SurveyMenu = {
      id: 'deep_l5_daily_usage',
      title: '5. Daily Usage Patterns',
      description: 'Tell us about your daily usage of our platform:',
      options: [
        { id: 'deep_l5_opt1', text: 'Productivity Impact →', value: 1, type: 'menu', subMenu: l6 },
        {
          id: 'deep_l5_opt2',
          text: 'Daily Challenges',
          value: 2,
          type: 'question',
          question: {
            id: 'q_deep_l5_challenges',
            text: 'What is your biggest daily challenge with our platform?\n\n1. Loading speed\n2. Feature complexity\n3. Integration issues\n4. No challenges\n\nReply with 1–4:',
            type: 'multiple_choice',
            required: true,
            options: ['Loading speed', 'Feature complexity', 'Integration issues', 'No challenges'],
          },
        },
      ],
      pagination: p,
    }

    // ── Level 4 – Feature Usage ───────────────────────────────────────────
    const l4: SurveyMenu = {
      id: 'deep_l4_feature_usage',
      title: '4. Feature Usage Frequency',
      description: 'How frequently do you use our main features?',
      options: [
        { id: 'deep_l4_opt1', text: 'Daily Usage →', value: 1, type: 'menu', subMenu: l5 },
        {
          id: 'deep_l4_opt2',
          text: 'Occasional Usage Barriers',
          value: 2,
          type: 'question',
          question: {
            id: 'q_deep_l4_barriers',
            text: 'What prevents more frequent use?\n\n1. Lack of time\n2. Limited use case\n3. Prefer other tools\n4. Still learning\n\nReply with 1–4:',
            type: 'multiple_choice',
            required: true,
            options: ['Lack of time', 'Limited use case', 'Prefer other tools', 'Still learning'],
          },
        },
      ],
      pagination: p,
    }

    // ── Level 3 – Core Features ───────────────────────────────────────────
    const l3: SurveyMenu = {
      id: 'deep_l3_core_features',
      title: '3. Core Features Feedback',
      description: 'Share your experience with our core product features:',
      options: [
        { id: 'deep_l3_opt1', text: 'Feature Usage Frequency →', value: 1, type: 'menu', subMenu: l4 },
        {
          id: 'deep_l3_opt2',
          text: 'Feature Requests',
          value: 2,
          type: 'question',
          question: {
            id: 'q_deep_l3_requests',
            text: 'Which improvement would most benefit your workflow?\n\n1. Better reporting\n2. More integrations\n3. Mobile app improvements\n4. Automation tools\n\nReply with 1–4:',
            type: 'multiple_choice',
            required: true,
            options: ['Better reporting', 'More integrations', 'Mobile app improvements', 'Automation tools'],
          },
        },
        {
          id: 'deep_l3_opt3',
          text: 'Feature Reliability',
          value: 3,
          type: 'question',
          question: {
            id: 'q_deep_l3_reliability',
            text: 'How reliable are our core features?\n\n1. Very reliable\n2. Mostly reliable\n3. Occasional issues\n4. Frequently unreliable\n\nReply with 1–4:',
            type: 'multiple_choice',
            required: true,
            options: ['Very reliable', 'Mostly reliable', 'Occasional issues', 'Frequently unreliable'],
          },
        },
      ],
      pagination: p,
    }

    // ── Level 2 – Product Experience ──────────────────────────────────────
    const l2: SurveyMenu = {
      id: 'deep_l2_product_experience',
      title: '2. Product Experience',
      description: 'Dive deep into your product experience:',
      options: [
        { id: 'deep_l2_opt1', text: 'Core Features →', value: 1, type: 'menu', subMenu: l3 },
        {
          id: 'deep_l2_opt2',
          text: 'Integrations & APIs',
          value: 2,
          type: 'question',
          question: {
            id: 'q_deep_l2_integrations',
            text: 'How satisfied are you with our integration options?\n\n1. Very satisfied\n2. Satisfied\n3. Needs improvement\n4. Unsatisfied\n\nReply with 1–4:',
            type: 'multiple_choice',
            required: true,
            options: ['Very satisfied', 'Satisfied', 'Needs improvement', 'Unsatisfied'],
          },
        },
        {
          id: 'deep_l2_opt3',
          text: 'User Interface Design',
          value: 3,
          type: 'question',
          question: {
            id: 'q_deep_l2_ui',
            text: 'How would you rate our overall user interface design?\n\n1. Excellent\n2. Good\n3. Average\n4. Poor\n\nReply with 1–4:',
            type: 'multiple_choice',
            required: true,
            options: ['Excellent', 'Good', 'Average', 'Poor'],
          },
        },
      ],
      pagination: p,
    }

    // ── Level 1 – Root Menu ───────────────────────────────────────────────
    const rootMenu: SurveyMenu = {
      id: 'deep_root_menu',
      title: '1. Main Survey Menu',
      description: 'Welcome! Select a category. Follow the arrows (→) to go deeper:',
      options: [
        {
          id: 'deep_root_opt1',
          text: 'Business Profile',
          value: 1,
          type: 'question',
          question: {
            id: 'q_deep_root_business_type',
            text: 'What best describes your organisation?\n\n1. Startup (< 2 years)\n2. SME (2–10 years)\n3. Established (10+ years)\n4. Enterprise\n\nReply with 1–4:',
            type: 'multiple_choice',
            required: true,
            options: ['Startup (< 2 years)', 'SME (2–10 years)', 'Established (10+ years)', 'Enterprise'],
          },
        },
        {
          id: 'deep_root_opt2',
          text: 'Product Experience →',
          value: 2,
          type: 'menu',
          subMenu: l2,
        },
        {
          id: 'deep_root_opt3',
          text: 'Service & Support',
          value: 3,
          type: 'question',
          question: {
            id: 'q_deep_root_service',
            text: 'How would you rate our customer service overall?\n\n1. Excellent\n2. Good\n3. Average\n4. Poor\n\nReply with 1–4:',
            type: 'multiple_choice',
            required: true,
            options: ['Excellent', 'Good', 'Average', 'Poor'],
          },
        },
        {
          id: 'deep_root_opt4',
          text: 'Pricing & Value',
          value: 4,
          type: 'question',
          question: {
            id: 'q_deep_root_pricing',
            text: 'Do you feel our pricing provides good value for money?\n\n1. Excellent value\n2. Good value\n3. Fair value\n4. Poor value\n\nReply with 1–4:',
            type: 'multiple_choice',
            required: true,
            options: ['Excellent value', 'Good value', 'Fair value', 'Poor value'],
          },
        },
        {
          id: 'deep_root_opt5',
          text: 'Likelihood to Recommend',
          value: 5,
          type: 'question',
          question: {
            id: 'q_deep_root_recommend',
            text: 'How likely are you to recommend us to colleagues or partners?\n\n1. Very likely\n2. Likely\n3. Unlikely\n4. Very unlikely\n\nReply with 1–4:',
            type: 'multiple_choice',
            required: true,
            options: ['Very likely', 'Likely', 'Unlikely', 'Very unlikely'],
          },
        },
      ],
      pagination: p,
    }

    return {
      id: `survey_deep_${Date.now()}`,
      name: '10-Level Deep Business Survey',
      description: 'A 10-level deep scaffold covering business profile, product experience, service, pricing, and recommendations',
      welcomeMessage:
        ' Welcome to our Comprehensive Business Survey!\n\nThis survey uses a nested menu system — follow the numbered options at each step, and choose the → options to go deeper.\n\n1. Begin Survey\n2. Exit\n\nReply with 1 or 2:',
      thankYouMessage:
        ' Thank you for completing our comprehensive survey! Your detailed feedback helps us improve every level of our service.',
      rootMenu,
      settings: {
        allowBack: true,
        allowExit: true,
        maxDepth: 10,
        sessionTimeout: 60,
        enablePagination: true,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }
}
