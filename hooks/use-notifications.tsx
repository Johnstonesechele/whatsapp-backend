"use client"

import type React from "react"
import { createContext, useContext, useState, useEffect } from "react"
import { useAuth } from "./use-auth"

interface Notification {
  id: string
  title: string
  message: string
  type: "info" | "success" | "warning" | "error"
  read: boolean
  createdAt: string
  actionUrl?: string
}

interface NotificationContextType {
  notifications: Notification[]
  unreadCount: number
  createNotification: (notification: Omit<Notification, "id" | "read" | "createdAt">) => Promise<void>
  markAsRead: (id: string) => Promise<void>
  markAllAsRead: () => Promise<void>
  clearAll: () => void
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined)

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const { user } = useAuth()

  useEffect(() => {
    if (user) {
      fetchNotifications()
      // Set up polling for new notifications
      const interval = setInterval(fetchNotifications, 30000) // Poll every 30 seconds
      return () => clearInterval(interval)
    }
  }, [user])

  const fetchNotifications = async () => {
    if (!user) return

    try {
      const token = localStorage.getItem("auth_token")
      const response = await fetch("/api/notifications", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        const data = await response.json()
        setNotifications(data.notifications)
      }
    } catch (error) {
      console.error("Failed to fetch notifications:", error)
    }
  }

  const createNotification = async (notificationData: Omit<Notification, "id" | "read" | "createdAt">) => {
    try {
      const token = localStorage.getItem("auth_token")
      const response = await fetch("/api/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(notificationData),
      })

      if (response.ok) {
        const data = await response.json()
        setNotifications((prev) => [data.notification, ...prev])
      }
    } catch (error) {
      console.error("Failed to create notification:", error)
    }
  }

  const markAsRead = async (id: string) => {
    try {
      const token = localStorage.getItem("auth_token")
      const response = await fetch(`/api/notifications/${id}/read`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        setNotifications((prev) =>
          prev.map((notification) => (notification.id === id ? { ...notification, read: true } : notification)),
        )
      }
    } catch (error) {
      console.error("Failed to mark notification as read:", error)
    }
  }

  const markAllAsRead = async () => {
    try {
      const token = localStorage.getItem("auth_token")
      const response = await fetch("/api/notifications/mark-all-read", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (response.ok) {
        setNotifications((prev) => prev.map((notification) => ({ ...notification, read: true })))
      }
    } catch (error) {
      console.error("Failed to mark all notifications as read:", error)
    }
  }

  const clearAll = () => {
    setNotifications([])
  }

  const unreadCount = notifications.filter((n) => !n.read).length

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        createNotification,
        markAsRead,
        markAllAsRead,
        clearAll,
      }}
    >
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotifications() {
  const context = useContext(NotificationContext)
  if (context === undefined) {
    throw new Error("useNotifications must be used within a NotificationProvider")
  }
  return context
}
