"use client"

import { useState, useEffect, useCallback } from "react"

export function useTeamMembers() {
  const [teamMembers, setTeamMembers] = useState<Array<{ id: string; name: string }>>([])

  const fetchTeamMembers = useCallback(async () => {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
      if (!token) return
      const response = await fetch('/api/users', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (response.ok) {
        const data = await response.json()
        const users = data.users || data || []
        setTeamMembers(users.map((u: any) => ({ id: u.id, name: u.name })))
      }
    } catch (error) {
      console.error('Failed to fetch team members:', error)
    }
  }, [])

  useEffect(() => {
    fetchTeamMembers()
  }, [fetchTeamMembers])

  return { teamMembers, refetchTeamMembers: fetchTeamMembers }
}
