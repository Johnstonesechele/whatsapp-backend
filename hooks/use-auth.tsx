"use client"

import type React from "react"
import { createContext, useContext, useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  type User,
  type AuthContextType,
  checkPermission,
  isSystemAdmin as checkIsSystemAdmin,
  isCompanyManager as checkIsCompanyManager,
  canAssignLeads as checkCanAssignLeads,
  canInviteUsers as checkCanInviteUsers,
} from "@/lib/auth-utils"

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    // Get initial session — skip Supabase Auth, go straight to old JWT
    const initAuth = async () => {
      try {
        if (typeof window !== "undefined") {
          // The session lives in an httpOnly cookie. The Authorization header
          // is a FALLBACK, not the primary path.
          //
          // This had it the other way round: it read localStorage, found
          // nothing after a normal login, and concluded the user was signed
          // out - so AuthGuard redirected to /login even though the cookie was
          // valid and the server had answered /api/setup-wizard with 200 from
          // that same page. Verified on production: cookie accepted by the API,
          // UI bounced to /login, localStorage empty.
          //
          // httpOnly is the point of the cookie - script cannot read it, which
          // is what makes it safe to rely on. Asking localStorage first meant
          // trusting a token only script can see over one the browser holds
          // securely, and then treating its absence as proof of no session.
          const storedToken = localStorage.getItem("auth_token")
          const headers: Record<string, string> = { credentials: "include" }
          if (storedToken) {
            headers.Authorization = `Bearer ${storedToken}`
          }

          try {
            const response = await fetch("/api/auth/verify", { headers })
            if (response.ok) {
              const userData = await response.json()
              if (userData && userData.user) {
                setUser(userData.user)
              } else {
                // A 200 with no user is not a session. Rendering an empty
                // shell forever is worse than admitting it.
                console.warn("Auth init: verify returned no user")
              }
            } else if (storedToken && response.status === 401) {
              // Only discard the stored copy on a real rejection. A 5xx or a
              // timeout is a server problem, not a signed-out user.
              localStorage.removeItem("auth_token")
            }
          } catch (error) {
            // Being offline is not the same as being signed out. Clearing the
            // token here signs the user out permanently the first time their
            // connection drops during page load.
            console.error("Auth init failed:", error)
          }
        }
      } catch (error) {
        console.error("Auth init failed:", error)
      } finally {
        setIsLoading(false)
      }
    }

    initAuth()
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    // Skip Supabase Auth entirely — go straight to old API route
    // This avoids timeout issues when users aren't in Supabase Auth
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: "Login failed" }))
      throw new Error(errorData.error || "Login failed")
    }

    const loginData = await response.json()

    // Store token for backward compatibility
    if (loginData.token) {
      localStorage.setItem("auth_token", loginData.token)
    }

    if (loginData.user) {
      setUser(loginData.user)
    }

    // Redirect to onboarding if not completed
    if (loginData.user && loginData.user.onboarding_completed === false) {
      router.push("/onboarding")
    }
  }, [router])

  const logout = useCallback(async () => {
    try {
      // Clean up WhatsApp session before signing out
      if (typeof window !== "undefined") {
        const token = localStorage.getItem("auth_token")
        if (token) {
          try {
            await fetch("/api/whatsapp/cleanup-sessions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
            })
          } catch {
            // Non-fatal
          }
        }
        localStorage.removeItem("auth_token")
        // Clear the httpOnly auth_token cookie
        document.cookie = "auth_token=; path=/; max-age=0; SameSite=Strict"
      }

      setUser(null)
      router.push("/")
    } catch (error) {
      if (typeof window !== "undefined") {
        localStorage.removeItem("auth_token")
        document.cookie = "auth_token=; path=/; max-age=0; SameSite=Strict"
      }
      setUser(null)
      router.push("/")
    }
  }, [router])

  const hasPermission = useCallback((permission: string): boolean => {
    if (!user) return false

    let permissions: string[] = []
    if (Array.isArray(user.permissions)) {
      permissions = user.permissions
    } else if (typeof user.permissions === "string") {
      try {
        permissions = JSON.parse(user.permissions)
      } catch {
        permissions = []
      }
    }

    if (permissions.includes("*") || permissions.includes("all")) {
      return true
    }

    const normalizedRole = user.role?.replace(/-/g, "_")
    const isCompanyAdmin =
      normalizedRole === "admin" ||
      normalizedRole === "company_admin" ||
      normalizedRole === "company_manager"

    if (isCompanyAdmin) {
      const systemOnlyPermissions = new Set([
        "system.manage",
        "system.configure",
        "system.monitor",
        "system.backup",
        "system.restore",
        "companies.create",
        "companies.delete",
        "companies.manage",
        "users.impersonate",
      ])
      if (!systemOnlyPermissions.has(permission)) {
        return true
      }
    }

    return permissions.includes(permission)
  }, [user])

  const canAssignLeads = useCallback((): boolean => {
    if (!user) return false
    return hasPermission("lead_assign") || hasPermission("lead_edit")
  }, [user, hasPermission])

  const canInviteUsers = useCallback((): boolean => {
    if (!user) return false
    return hasPermission("user_invite") || hasPermission("user_create")
  }, [user, hasPermission])

  const isCompanyManager = useCallback((): boolean => {
    if (!user) return false
    const normalizedRole = user.role?.replace(/-/g, "_")
    return (
      normalizedRole === "company_manager" ||
      normalizedRole === "company_admin" ||
      normalizedRole === "admin" ||
      normalizedRole === "system_admin"
    )
  }, [user])

  const isSystemAdmin = useCallback((): boolean => {
    if (!user) return false
    const normalizedRole = user.role?.replace(/-/g, "_")
    return normalizedRole === "system_admin" || normalizedRole === "super_admin"
  }, [user])

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        isLoading,
        hasPermission,
        canAssignLeads,
        canInviteUsers,
        isCompanyManager,
        isSystemAdmin,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
