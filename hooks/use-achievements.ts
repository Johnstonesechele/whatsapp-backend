"use client"

import { useState, useEffect, useCallback } from "react"
import { toast } from "@/components/ui/use-toast"

export function useAchievements() {
  const [earnedAchievements, setEarnedAchievements] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadAchievements = async () => {
      try {
        const token = localStorage.getItem("auth_token")
        if (!token) return

        const response = await fetch("/api/user/achievements", {
          headers: { Authorization: `Bearer ${token}` },
        })

        if (response.ok) {
          const data = await response.json()
          setEarnedAchievements(data.achievements || [])
        }
      } catch {
        // Non-fatal
      } finally {
        setIsLoading(false)
      }
    }

    loadAchievements()
  }, [])

  const awardAchievement = useCallback(
    async (achievementId: string) => {
      // Don't award if already earned
      if (earnedAchievements.includes(achievementId)) {
        return false
      }

      try {
        const token = localStorage.getItem("auth_token")
        if (!token) return false

        const response = await fetch("/api/user/achievements", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ achievementId }),
        })

        if (response.ok) {
          const data = await response.json()

          if (data.newlyEarned) {
            setEarnedAchievements((prev) => [...prev, achievementId])

            // Show toast notification
            toast({
              title: "Achievement Unlocked!",
              description: data.message,
              duration: 5000,
            })

            return true
          }
        }
      } catch {
        // Non-fatal
      }

      return false
    },
    [earnedAchievements]
  )

  const hasAchievement = useCallback(
    (achievementId: string) => {
      return earnedAchievements.includes(achievementId)
    },
    [earnedAchievements]
  )

  return {
    earnedAchievements,
    isLoading,
    awardAchievement,
    hasAchievement,
  }
}
