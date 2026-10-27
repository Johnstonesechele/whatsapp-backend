// Backend API for WhatsApp integration
export interface WhatsAppMessage {
  id: string
  recipient: string
  message: string
  mediaUrl?: string
  scheduledAt?: string
  sentAt?: string
  status: "Pending" | "Sent" | "Delivered" | "Read" | "Failed"
  campaignId?: string
}

export interface WhatsAppCampaign {
  id: string
  name: string
  message: string
  recipients: string[]
  scheduledAt?: string
  status: "Draft" | "Scheduled" | "Sending" | "Sent" | "Completed"
  createdAt: string
  sentCount: number
  deliveredCount: number
  readCount: number
}

export class WhatsAppAPI {
  private static messages: WhatsAppMessage[] = []
  private static campaigns: WhatsAppCampaign[] = []

  static async sendMessage(recipient: string, message: string, mediaUrl?: string): Promise<WhatsAppMessage> {
    const newMessage: WhatsAppMessage = {
      id: `msg_${Date.now()}`,
      recipient,
      message,
      mediaUrl,
      sentAt: new Date().toISOString(),
      status: "Sent",
    }

    this.messages.push(newMessage)

    // Simulate API call to WhatsApp Business API
    await this.simulateWhatsAppAPI(newMessage)

    return newMessage
  }

  static async scheduleMessage(
    recipient: string,
    message: string,
    scheduledAt: string,
    mediaUrl?: string,
  ): Promise<WhatsAppMessage> {
    const scheduledMessage: WhatsAppMessage = {
      id: `msg_${Date.now()}`,
      recipient,
      message,
      mediaUrl,
      scheduledAt,
      status: "Pending",
    }

    this.messages.push(scheduledMessage)
    return scheduledMessage
  }

  static async createCampaign(
    name: string,
    message: string,
    recipients: string[],
    scheduledAt?: string,
  ): Promise<WhatsAppCampaign> {
    const campaign: WhatsAppCampaign = {
      id: `camp_${Date.now()}`,
      name,
      message,
      recipients,
      scheduledAt,
      status: scheduledAt ? "Scheduled" : "Draft",
      createdAt: new Date().toISOString(),
      sentCount: 0,
      deliveredCount: 0,
      readCount: 0,
    }

    this.campaigns.push(campaign)
    return campaign
  }

  static async sendCampaign(campaignId: string): Promise<boolean> {
    const campaign = this.campaigns.find((c) => c.id === campaignId)
    if (!campaign) return false

    campaign.status = "Sending"

    // Send messages to all recipients
    for (const recipient of campaign.recipients) {
      await this.sendMessage(recipient, campaign.message)
      campaign.sentCount++
    }

    campaign.status = "Completed"
    return true
  }

  static async getCampaigns(): Promise<WhatsAppCampaign[]> {
    return this.campaigns
  }

  static async getMessages(): Promise<WhatsAppMessage[]> {
    return this.messages
  }

  static async getMessageStatus(messageId: string): Promise<WhatsAppMessage | null> {
    return this.messages.find((msg) => msg.id === messageId) || null
  }

  private static async simulateWhatsAppAPI(message: WhatsAppMessage): Promise<void> {
    // Simulate API delay
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Simulate delivery status updates
    setTimeout(() => {
      message.status = "Delivered"
    }, 2000)

    setTimeout(() => {
      if (Math.random() > 0.3) {
        // 70% read rate
        message.status = "Read"
      }
    }, 5000)
  }

  static async getAnalytics(): Promise<{
    totalSent: number
    deliveryRate: number
    readRate: number
    failureRate: number
  }> {
    const totalMessages = this.messages.length
    const delivered = this.messages.filter((m) => ["Delivered", "Read"].includes(m.status)).length
    const read = this.messages.filter((m) => m.status === "Read").length
    const failed = this.messages.filter((m) => m.status === "Failed").length

    return {
      totalSent: totalMessages,
      deliveryRate: totalMessages > 0 ? (delivered / totalMessages) * 100 : 0,
      readRate: totalMessages > 0 ? (read / totalMessages) * 100 : 0,
      failureRate: totalMessages > 0 ? (failed / totalMessages) * 100 : 0,
    }
  }
}

