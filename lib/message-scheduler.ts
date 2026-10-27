/**
 * Message Scheduler Service
 * Handles automatic execution of scheduled messages at their designated times
 */

let schedulerInterval: NodeJS.Timeout | null = null
let isSchedulerRunning = false

export class MessageScheduler {
  private static readonly POLL_INTERVAL = 60000 // Check every minute
  private static readonly API_BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'

  /**
   * Start the message scheduler
   * This should be called when the application starts
   */
  static start() {
    if (isSchedulerRunning) {
      console.log('Message scheduler is already running')
      return
    }

    console.log('Starting message scheduler...')
    isSchedulerRunning = true

    // Run immediately and then every minute
    this.executeScheduledMessages()
    
    schedulerInterval = setInterval(() => {
      this.executeScheduledMessages()
    }, this.POLL_INTERVAL)

    console.log(`Message scheduler started. Checking every ${this.POLL_INTERVAL / 1000} seconds`)
  }

  /**
   * Stop the message scheduler
   */
  static stop() {
    if (schedulerInterval) {
      clearInterval(schedulerInterval)
      schedulerInterval = null
    }
    isSchedulerRunning = false
    console.log('Message scheduler stopped')
  }

  /**
   * Check if scheduler is running
   */
  static isRunning(): boolean {
    return isSchedulerRunning
  }

  /**
   * Execute scheduled messages that are due
   */
  private static async executeScheduledMessages() {
    try {
      // Get auth token from localStorage (for client-side) or use server-side auth
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : process.env.SYSTEM_AUTH_TOKEN

      if (!token) {
        console.warn('No auth token available for scheduler')
        return
      }

      // Call the execute API endpoint
      const response = await fetch(`${this.API_BASE_URL}/api/scheduled-messages/execute`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const result = await response.json()
        
        if (result.success && result.results.length > 0) {
          console.log(`Scheduler executed ${result.results.length} messages:`, result.results)
        }
      } else {
        console.error('Scheduler execution failed:', response.statusText)
      }
    } catch (error) {
      console.error('Error in message scheduler:', error)
    }
  }

  /**
   * Manual execution of scheduled messages (for testing)
   */
  static async executeNow(): Promise<boolean> {
    try {
      await this.executeScheduledMessages()
      return true
    } catch (error) {
      console.error('Manual execution failed:', error)
      return false
    }
  }

  /**
   * Get scheduler status
   */
  static getStatus() {
    return {
      isRunning: isSchedulerRunning,
      pollInterval: this.POLL_INTERVAL,
      nextCheck: schedulerInterval ? new Date(Date.now() + this.POLL_INTERVAL) : null
    }
  }
}

// Auto-start scheduler in browser environment
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'production') {
  // Start with a delay to ensure app is fully loaded
  setTimeout(() => {
    MessageScheduler.start()
  }, 5000)
}

export default MessageScheduler
