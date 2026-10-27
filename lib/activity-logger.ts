// Activity logging utility for frontend components
export interface ActivityLogData {
  action: string
  resource: string
  resource_id?: string
  details?: string
  metadata?: Record<string, any>
}

export class ActivityLogger {
  private static getAuthToken(): string | null {
    if (typeof window === "undefined") return null
    return localStorage.getItem("auth_token")
  }

  static async logActivity(activityData: ActivityLogData): Promise<void> {
    try {
      const token = this.getAuthToken()
      if (!token) {
        console.warn("No auth token available for activity logging")
        return
      }

      const response = await fetch("/api/activity", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(activityData)
      })

      if (!response.ok) {
        console.error("Failed to log activity:", response.statusText)
      }
    } catch (error) {
      console.error("Activity logging error:", error)
    }
  }

  // Convenience methods for common actions
  static async logLogin() {
    await this.logActivity({
      action: "logged_in",
      resource: "system",
      details: "User logged into the system"
    })
  }

  static async logLogout() {
    await this.logActivity({
      action: "logged_out", 
      resource: "system",
      details: "User logged out of the system"
    })
  }

  static async logPageView(page: string) {
    await this.logActivity({
      action: "viewed",
      resource: "page",
      resource_id: page,
      details: `Viewed ${page} page`
    })
  }

  static async logContactCreate(contactId: string, contactName: string) {
    await this.logActivity({
      action: "created",
      resource: "contact",
      resource_id: contactId,
      details: `Created new contact: ${contactName}`,
      metadata: { contactName }
    })
  }

  static async logContactUpdate(contactId: string, contactName: string, changes: Record<string, any>) {
    await this.logActivity({
      action: "updated",
      resource: "contact",
      resource_id: contactId,
      details: `Updated contact: ${contactName}`,
      metadata: { contactName, changes }
    })
  }

  static async logContactDelete(contactId: string, contactName: string) {
    await this.logActivity({
      action: "deleted",
      resource: "contact", 
      resource_id: contactId,
      details: `Deleted contact: ${contactName}`,
      metadata: { contactName }
    })
  }

  static async logCampaignSend(campaignId: string, campaignName: string, recipients: number) {
    await this.logActivity({
      action: "sent",
      resource: "campaign",
      resource_id: campaignId,
      details: `Sent campaign: ${campaignName} to ${recipients} recipients`,
      metadata: { campaignName, recipients }
    })
  }

  static async logAutomationCreate(automationId: string, automationName: string) {
    await this.logActivity({
      action: "created",
      resource: "automation",
      resource_id: automationId,
      details: `Created automation: ${automationName}`,
      metadata: { automationName }
    })
  }

  static async logAutomationToggle(automationId: string, automationName: string, enabled: boolean) {
    await this.logActivity({
      action: enabled ? "enabled" : "disabled",
      resource: "automation",
      resource_id: automationId,
      details: `${enabled ? "Enabled" : "Disabled"} automation: ${automationName}`,
      metadata: { automationName, enabled }
    })
  }

  static async logDataExport(resourceType: string, recordCount?: number) {
    await this.logActivity({
      action: "exported",
      resource: resourceType,
      details: `Exported ${resourceType} data${recordCount ? ` (${recordCount} records)` : ""}`,
      metadata: { resourceType, recordCount }
    })
  }

  static async logTeamInvite(email: string, role: string) {
    await this.logActivity({
      action: "invited",
      resource: "user",
      details: `Sent team invitation to ${email} as ${role}`,
      metadata: { email, role }
    })
  }

  static async logRoleUpdate(roleId: string, roleName: string, permissionsCount: number) {
    await this.logActivity({
      action: "updated",
      resource: "role",
      resource_id: roleId,
      details: `Updated role permissions: ${roleName}`,
      metadata: { roleName, permissionsCount }
    })
  }
}
