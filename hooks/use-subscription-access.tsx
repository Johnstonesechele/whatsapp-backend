/**
 * Hook to check subscription status and enforce payment requirements
 * Used to block access when trial expires or payment fails
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface SubscriptionStatus {
  status: string
  isExpired: boolean
  daysRemaining: number
  hasPaymentMethod: boolean
  canAccess: boolean
  shouldRedirect: boolean
  redirectTo: string | null
  message: string | null
}

export function useSubscriptionAccess() {
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    checkSubscriptionStatus()
  }, [])

  const checkSubscriptionStatus = async () => {
    try {
      const token = localStorage.getItem('auth_token')
      if (!token) {
        setLoading(false)
        return
      }

      const response = await fetch('/api/subscription/details', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        setLoading(false)
        return
      }

      const data = await response.json()
      const subscription = data.subscription
      const hasPaymentMethod = data.paymentMethods && data.paymentMethods.length > 0

      const status: SubscriptionStatus = {
        status: subscription.status,
        isExpired: subscription.isExpired || false,
        daysRemaining: subscription.daysRemaining || 0,
        hasPaymentMethod,
        canAccess: true,
        shouldRedirect: false,
        redirectTo: null,
        message: null
      }

      // Determine access rules
      if (subscription.status === 'trial' && subscription.isExpired && !hasPaymentMethod) {
        status.canAccess = false
        status.shouldRedirect = true
        status.redirectTo = '/subscription/payment-methods'
        status.message = 'Your trial has expired. Please add a payment method to continue.'
      } else if (subscription.status === 'suspended') {
        status.canAccess = false
        status.shouldRedirect = true
        status.redirectTo = '/subscription/payment-methods'
        status.message = 'Your account is suspended due to payment issues. Please update your payment method.'
      } else if (subscription.status === 'past_due') {
        // Allow limited access but show warnings
        status.canAccess = true
        status.shouldRedirect = false
        status.message = 'Your payment is past due. Please update your payment method soon.'
      } else if (subscription.status === 'cancelled') {
        status.canAccess = false
        status.shouldRedirect = true
        status.redirectTo = '/subscription/upgrade'
        status.message = 'Your subscription has been cancelled. Please reactivate to continue.'
      }

      setSubscriptionStatus(status)
      setLoading(false)

      // Auto-redirect if needed (except on payment/subscription pages)
      const currentPath = window.location.pathname
      const exemptPaths = ['/subscription', '/subscription/payment-methods', '/subscription/upgrade', '/logout', '/settings']
      
      if (status.shouldRedirect && status.redirectTo && !exemptPaths.some(p => currentPath.startsWith(p))) {

        router.push(status.redirectTo)
      }

    } catch (error) {
      console.error('Error checking subscription status:', error)
      setLoading(false)
    }
  }

  const refreshStatus = () => {
    setLoading(true)
    checkSubscriptionStatus()
  }

  return {
    subscriptionStatus,
    loading,
    refreshStatus
  }
}
