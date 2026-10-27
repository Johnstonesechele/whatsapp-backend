// Backend API for lead management
export interface Lead {
  id: number
  name: string
  email: string
  phone: string
  company: string
  status: "Hot" | "Warm" | "Cold"
  stage: "Qualification" | "Proposal" | "Negotiation" | "Closed Won" | "Closed Lost"
  value: number
  source: string
  assignedTo: string
  lastActivity: string
  notes: string[]
  createdAt: string
  updatedAt: string
}

export interface LeadActivity {
  id: string
  leadId: number
  type: "Call" | "Email" | "Meeting" | "Note" | "Status Change"
  description: string
  createdAt: string
  createdBy: string
}

export class LeadsAPI {
  private static leads: Lead[] = [
    {
      id: 1,
      name: "Alice Cooper",
      email: "alice@innovation.com",
      phone: "+1234567890",
      company: "Innovation Labs",
      status: "Hot",
      stage: "Proposal",
      value: 15000,
      source: "Website",
      assignedTo: "John Doe",
      lastActivity: "2024-01-16",
      notes: ["Initial contact made", "Interested in premium package"],
      createdAt: "2024-01-10",
      updatedAt: "2024-01-16",
    },
    // Add more sample leads...
  ]

  private static activities: LeadActivity[] = []

  static async getAllLeads(): Promise<Lead[]> {
    return this.leads
  }

  static async getLeadById(id: number): Promise<Lead | null> {
    return this.leads.find((lead) => lead.id === id) || null
  }

  static async createLead(leadData: Omit<Lead, "id" | "createdAt" | "updatedAt">): Promise<Lead> {
    const newLead: Lead = {
      ...leadData,
      id: Math.max(...this.leads.map((l) => l.id)) + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    this.leads.push(newLead)

    // Log activity
    await this.addActivity(newLead.id, "Note", `Lead created from ${newLead.source}`, "System")

    return newLead
  }

  static async updateLead(id: number, updates: Partial<Lead>): Promise<Lead | null> {
    const leadIndex = this.leads.findIndex((lead) => lead.id === id)
    if (leadIndex === -1) return null

    const oldLead = { ...this.leads[leadIndex] }
    this.leads[leadIndex] = {
      ...this.leads[leadIndex],
      ...updates,
      updatedAt: new Date().toISOString(),
    }

    // Log status/stage changes
    if (updates.status && updates.status !== oldLead.status) {
      await this.addActivity(
        id,
        "Status Change",
        `Status changed from ${oldLead.status} to ${updates.status}`,
        "System",
      )
    }
    if (updates.stage && updates.stage !== oldLead.stage) {
      await this.addActivity(id, "Status Change", `Stage changed from ${oldLead.stage} to ${updates.stage}`, "System")
    }

    return this.leads[leadIndex]
  }

  static async deleteLead(id: number): Promise<boolean> {
    const leadIndex = this.leads.findIndex((lead) => lead.id === id)
    if (leadIndex === -1) return false

    this.leads.splice(leadIndex, 1)
    return true
  }

  static async addActivity(
    leadId: number,
    type: LeadActivity["type"],
    description: string,
    createdBy: string,
  ): Promise<LeadActivity> {
    const activity: LeadActivity = {
      id: `act_${Date.now()}`,
      leadId,
      type,
      description,
      createdAt: new Date().toISOString(),
      createdBy,
    }

    this.activities.push(activity)

    // Update lead's last activity
    const lead = this.leads.find((l) => l.id === leadId)
    if (lead) {
      lead.lastActivity = new Date().toISOString().split("T")[0]
      lead.updatedAt = new Date().toISOString()
    }

    return activity
  }

  static async getLeadActivities(leadId: number): Promise<LeadActivity[]> {
    return this.activities.filter((activity) => activity.leadId === leadId)
  }

  static async getLeadsByStage(stage: string): Promise<Lead[]> {
    return this.leads.filter((lead) => lead.stage.toLowerCase() === stage.toLowerCase())
  }

  static async getLeadsByStatus(status: string): Promise<Lead[]> {
    return this.leads.filter((lead) => lead.status.toLowerCase() === status.toLowerCase())
  }

  static async getLeadAnalytics(): Promise<{
    totalLeads: number
    hotLeads: number
    pipelineValue: number
    conversionRate: number
    stageDistribution: Record<string, number>
    sourceDistribution: Record<string, number>
  }> {
    const totalLeads = this.leads.length
    const hotLeads = this.leads.filter((l) => l.status === "Hot").length
    const pipelineValue = this.leads.reduce((sum, lead) => sum + lead.value, 0)
    const closedWon = this.leads.filter((l) => l.stage === "Closed Won").length
    const conversionRate = totalLeads > 0 ? (closedWon / totalLeads) * 100 : 0

    const stageDistribution: Record<string, number> = {}
    const sourceDistribution: Record<string, number> = {}

    this.leads.forEach((lead) => {
      stageDistribution[lead.stage] = (stageDistribution[lead.stage] || 0) + 1
      sourceDistribution[lead.source] = (sourceDistribution[lead.source] || 0) + 1
    })

    return {
      totalLeads,
      hotLeads,
      pipelineValue,
      conversionRate,
      stageDistribution,
      sourceDistribution,
    }
  }
}

