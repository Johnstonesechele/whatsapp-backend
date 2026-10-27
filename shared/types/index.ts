// Shared types across frontend and backend
export interface User {
  id: string
  name: string
  email: string
  role: "Admin" | "Manager" | "Agent"
  permissions: string[]
  createdAt: string
  lastLogin: string
}

export interface Company {
  id: string
  name: string
  industry: string
  size: string
  website?: string
  address?: string
  phone?: string
  email?: string
}

export interface Tag {
  id: string
  name: string
  color: string
  category: "Contact" | "Lead" | "Campaign"
}

export interface Filter {
  field: string
  operator: "equals" | "contains" | "starts_with" | "ends_with" | "greater_than" | "less_than"
  value: string | number | boolean
}

export interface PaginationParams {
  page: number
  limit: number
  sortBy?: string
  sortOrder?: "asc" | "desc"
}

export interface ApiResponse<T> {
  data: T
  success: boolean
  message?: string
  pagination?: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}
