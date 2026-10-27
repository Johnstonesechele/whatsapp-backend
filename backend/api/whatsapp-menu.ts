// WhatsApp Interactive Menu System
export interface MenuOption {
  id: string
  text: string
  description?: string
  submenu?: MenuOption[]
  departmentId?: string
  staffMembers?: string[]
}

export interface UserSession {
  phoneNumber: string
  currentMenu: string
  menuHistory: string[]
  selectedOptions: Record<string, string>
  createdAt: string
  lastActivity: string
}

export interface MenuResponse {
  phoneNumber: string
  menuId: string
  optionSelected: string
  timestamp: string
  userMessage: string
  responseGenerated: string
}

export class WhatsAppMenuAPI {
  private static sessions: Map<string, UserSession> = new Map()
  private static responses: MenuResponse[] = []

  // Main menu structure for the company
  private static mainMenu: MenuOption = {
    id: "main",
    text: " Welcome to Our Company! Please select a service:",
    submenu: [
      {
        id: "insurance",
        text: " Insurance Services",
        description: "Comprehensive insurance solutions",
        submenu: [
          {
            id: "motor_insurance",
            text: " Motor Insurance",
            description: "Car, motorcycle, and vehicle insurance",
            departmentId: "insurance_motor",
            staffMembers: ["John Smith", "Sarah Wilson"],
          },
          {
            id: "life_insurance",
            text: " Life Insurance",
            description: "Life and family protection plans",
            departmentId: "insurance_life",
            staffMembers: ["Michael Brown", "Lisa Davis"],
          },
          {
            id: "health_insurance",
            text: " Health Insurance",
            description: "Medical and health coverage",
            departmentId: "insurance_health",
            staffMembers: ["Dr. James Lee", "Nurse Mary Johnson"],
          },
          {
            id: "property_insurance",
            text: " Property Insurance",
            description: "Home and property protection",
            departmentId: "insurance_property",
            staffMembers: ["Robert Taylor", "Emma Anderson"],
          },
        ],
      },
      {
        id: "technology",
        text: " Technology Services",
        description: "Digital solutions and tech services",
        submenu: [
          {
            id: "web_development",
            text: " Web Development",
            description: "Custom websites and web applications",
            departmentId: "tech_web",
            staffMembers: ["Alex Chen", "Maria Rodriguez"],
          },
          {
            id: "mobile_apps",
            text: " Mobile App Development",
            description: "iOS and Android applications",
            departmentId: "tech_mobile",
            staffMembers: ["David Kim", "Jennifer White"],
          },
          {
            id: "software_development",
            text: " Software Development",
            description: "Custom software solutions",
            departmentId: "tech_software",
            staffMembers: ["Thomas Miller", "Rachel Green"],
          },
          {
            id: "it_support",
            text: " IT Support & Maintenance",
            description: "Technical support and system maintenance",
            departmentId: "tech_support",
            staffMembers: ["Kevin Park", "Amanda Clark"],
          },
        ],
      },
      {
        id: "training",
        text: " Training & Education",
        description: "Professional development and courses",
        submenu: [
          {
            id: "tech_training",
            text: " Technology Training",
            description: "Programming, web design, and IT courses",
            departmentId: "training_tech",
            staffMembers: ["Prof. William Jones", "Dr. Susan Lee"],
          },
          {
            id: "business_training",
            text: " Business & Management",
            description: "Leadership, management, and business skills",
            departmentId: "training_business",
            staffMembers: ["MBA John Wilson", "Coach Lisa Brown"],
          },
          {
            id: "insurance_training",
            text: " Insurance Certification",
            description: "Insurance industry training and certification",
            departmentId: "training_insurance",
            staffMembers: ["Expert Mark Davis", "Trainer Jane Smith"],
          },
          {
            id: "soft_skills",
            text: " Soft Skills Development",
            description: "Communication, presentation, and interpersonal skills",
            departmentId: "training_soft",
            staffMembers: ["Coach Emily Taylor", "Trainer Mike Johnson"],
          },
        ],
      },
      {
        id: "support",
        text: "🆘 Customer Support",
        description: "General inquiries and support",
        departmentId: "customer_support",
        staffMembers: ["Support Team Lead", "Customer Care Agent"],
      },
    ],
  }

  static async processIncomingMessage(phoneNumber: string, message: string): Promise<string> {
    let session = this.sessions.get(phoneNumber)

    if (!session) {
      // Create new session
      session = {
        phoneNumber,
        currentMenu: "main",
        menuHistory: [],
        selectedOptions: {},
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
      }
      this.sessions.set(phoneNumber, session)
    } else {
      session.lastActivity = new Date().toISOString()
    }

    // Process the message
    const response = await this.generateMenuResponse(session, message)

    // Log the interaction
    this.responses.push({
      phoneNumber,
      menuId: session.currentMenu,
      optionSelected: message,
      timestamp: new Date().toISOString(),
      userMessage: message,
      responseGenerated: response,
    })

    return response
  }

  private static async generateMenuResponse(session: UserSession, userInput: string): Promise<string> {
    const currentMenu = this.findMenuById(session.currentMenu)

    if (!currentMenu) {
      return "Sorry, something went wrong. Let me restart the menu for you.\n\n" + this.formatMenu(this.mainMenu)
    }

    // Handle menu navigation
    if (userInput.toLowerCase() === "0" || userInput.toLowerCase() === "back") {
      return this.handleBackNavigation(session)
    }

    if (userInput.toLowerCase() === "menu" || userInput.toLowerCase() === "main") {
      session.currentMenu = "main"
      session.menuHistory = []
      return this.formatMenu(this.mainMenu)
    }

    // Handle SUPPORT keyword
    if (userInput.toUpperCase() === "SUPPORT") {
      return " *Customer Support*\n\nWe are here to help!\n\n *Email:* support@company.com\n *Phone:* +1234567890\n\n*A specialist will contact you within 2 hours.*\n\nType *MENU* to return to the main menu."
    }

        // Handle option selection
    const optionIndex = Number.parseInt(userInput) - 1

    if (currentMenu.submenu && optionIndex >= 0 && optionIndex < currentMenu.submenu.length) {
      const selectedOption = currentMenu.submenu[optionIndex]
      session.selectedOptions[session.currentMenu] = selectedOption.id

      if (selectedOption.submenu && selectedOption.submenu.length > 0) {
        // Navigate to submenu
        session.menuHistory.push(session.currentMenu)
        session.currentMenu = selectedOption.id
        return this.formatMenu(selectedOption)
      } else {
        // Final selection - connect to department
        return this.handleFinalSelection(session, selectedOption)
      }
    } else {
      return (
        `Invalid option. Please select a number between 1 and ${currentMenu.submenu?.length || 0}.\n\n` +
        this.formatMenu(currentMenu)
      )
    }
  }

  private static handleBackNavigation(session: UserSession): string {
    if (session.menuHistory.length > 0) {
      session.currentMenu = session.menuHistory.pop()!
      const menu = this.findMenuById(session.currentMenu)
      return menu ? this.formatMenu(menu) : this.formatMenu(this.mainMenu)
    } else {
      session.currentMenu = "main"
      return this.formatMenu(this.mainMenu)
    }
  }

  private static handleFinalSelection(session: UserSession, option: MenuOption): string {
    const staffList = option.staffMembers?.join(", ") || "our team"

    let response = ` Thank you for selecting *${option.text}*!\n\n`
    response += ` *Service Details:*\n${option.description}\n\n`
    response += ` *Available Staff:* ${staffList}\n\n`
    response += `⏰ *Next Steps:*\n`
    response += `• A specialist will contact you within 2 hours\n`
    response += `• Please keep your phone available\n`
    response += `• You can also call us directly at +1234567890\n\n`
    response += ` *Additional Information:*\n`
    response += `• Email: ${option.departmentId}@company.com\n`
    response += `• Business Hours: Mon-Fri 9AM-6PM\n\n`
    response += `Type *MENU* to return to main menu or *SUPPORT* for immediate assistance.`

    // Reset session for next interaction
    session.currentMenu = "main"
    session.menuHistory = []

    return response
  }

  private static formatMenu(menu: MenuOption): string {
    let response = `${menu.text}\n\n`

    if (menu.submenu) {
      menu.submenu.forEach((option, index) => {
        response += `*${index + 1}.* ${option.text}\n`
        if (option.description) {
          response += `   ${option.description}\n`
        }
        response += `\n`
      })
    }

    response += `\n *Instructions:*\n`
    response += `• Reply with the number of your choice\n`
    response += `• Type *0* or *BACK* to go back\n`
    response += `• Type *MENU* for main menu\n`
    response += `• Type *SUPPORT* for immediate help`

    return response
  }

  private static findMenuById(menuId: string): MenuOption | null {
    const searchMenu = (menu: MenuOption): MenuOption | null => {
      if (menu.id === menuId) return menu

      if (menu.submenu) {
        for (const submenu of menu.submenu) {
          const found = searchMenu(submenu)
          if (found) return found
        }
      }

      return null
    }

    return searchMenu(this.mainMenu)
  }

  static async getUserSession(phoneNumber: string): Promise<UserSession | null> {
    return this.sessions.get(phoneNumber) || null
  }

  static async getUserResponses(phoneNumber: string): Promise<MenuResponse[]> {
    return this.responses.filter((response) => response.phoneNumber === phoneNumber)
  }

  static async getAllResponses(): Promise<MenuResponse[]> {
    return this.responses
  }

  static async getAnalytics(): Promise<{
    totalSessions: number
    activeMenus: Record<string, number>
    popularOptions: Record<string, number>
    departmentRequests: Record<string, number>
  }> {
    const totalSessions = this.sessions.size
    const activeMenus: Record<string, number> = {}
    const popularOptions: Record<string, number> = {}
    const departmentRequests: Record<string, number> = {}

    // Analyze active sessions
    this.sessions.forEach((session) => {
      activeMenus[session.currentMenu] = (activeMenus[session.currentMenu] || 0) + 1
    })

    // Analyze responses
    this.responses.forEach((response) => {
      popularOptions[response.optionSelected] = (popularOptions[response.optionSelected] || 0) + 1
    })

    return {
      totalSessions,
      activeMenus,
      popularOptions,
      departmentRequests,
    }
  }

  static async clearExpiredSessions(): Promise<void> {
    const now = new Date()
    const expiredThreshold = 24 * 60 * 60 * 1000 // 24 hours

    this.sessions.forEach((session, phoneNumber) => {
      const lastActivity = new Date(session.lastActivity)
      if (now.getTime() - lastActivity.getTime() > expiredThreshold) {
        this.sessions.delete(phoneNumber)
      }
    })
  }
}

