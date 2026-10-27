/**
 * Team Size Update Utility
 * Automatically updates subscription pricing when team members are added/removed
 */

export async function updateSubscriptionForTeamSizeChange(companyId: string) {
  try {
    // Call the update API
    const response = await fetch('/api/subscription/update-team-size', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
      }
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Failed to update subscription:', error)
      return { success: false, error: error.error }
    }

    const result = await response.json()
    console.log(' Subscription updated:', result)
    return { success: true, data: result }
  } catch (error) {
    console.error('Error updating subscription:', error)
    return { success: false, error }
  }
}

/**
 * Call this function after:
 * - Adding a new team member
 * - Removing a team member
 * - Inviting a user who accepts
 * 
 * Example usage:
 * ```typescript
 * // After adding a user
 * const result = await addUserToTeam(userData)
 * if (result.success) {
 *   await updateSubscriptionForTeamSizeChange(companyId)
 * }
 * ```
 */
