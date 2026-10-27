// Backend API for contact management
export interface Contact {
  id: number
  name: string
  email: string
  phone: string
  company: string
  status: "Active" | "Inactive"
  lastContact: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

export class ContactsAPI {
  private static contacts: Contact[] = [
    {
      id: 1,
      name: "John Smith",
      email: "john@example.com",
      phone: "+1234567890",
      company: "Tech Corp",
      status: "Active",
      lastContact: "2024-01-15",
      tags: ["VIP", "Tech"],
      createdAt: "2024-01-01",
      updatedAt: "2024-01-15",
    },
    // Add more sample contacts...
  ]

  static async getAllContacts(): Promise<Contact[]> {
    return this.contacts
  }

  static async getContactById(id: number): Promise<Contact | null> {
    return this.contacts.find((contact) => contact.id === id) || null
  }

  static async createContact(contactData: Omit<Contact, "id" | "createdAt" | "updatedAt">): Promise<Contact> {
    const newContact: Contact = {
      ...contactData,
      id: Math.max(...this.contacts.map((c) => c.id)) + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    this.contacts.push(newContact)
    return newContact
  }

  static async updateContact(id: number, updates: Partial<Contact>): Promise<Contact | null> {
    const contactIndex = this.contacts.findIndex((contact) => contact.id === id)
    if (contactIndex === -1) return null

    this.contacts[contactIndex] = {
      ...this.contacts[contactIndex],
      ...updates,
      updatedAt: new Date().toISOString(),
    }
    return this.contacts[contactIndex]
  }

  static async deleteContact(id: number): Promise<boolean> {
    const contactIndex = this.contacts.findIndex((contact) => contact.id === id)
    if (contactIndex === -1) return false

    this.contacts.splice(contactIndex, 1)
    return true
  }

  static async searchContacts(query: string): Promise<Contact[]> {
    const lowercaseQuery = query.toLowerCase()
    return this.contacts.filter(
      (contact) =>
        contact.name?.toLowerCase().includes(lowercaseQuery) ||
        contact.email?.toLowerCase().includes(lowercaseQuery) ||
        contact.company?.toLowerCase().includes(lowercaseQuery),
    )
  }

  static async filterContacts(filters: {
    status?: string
    tags?: string[]
    company?: string
  }): Promise<Contact[]> {
    return this.contacts.filter((contact) => {
      if (filters.status && contact.status.toLowerCase() !== filters.status.toLowerCase()) {
        return false
      }
      if (filters.tags && !filters.tags.some((tag) => contact.tags.includes(tag))) {
        return false
      }
      if (filters.company && !contact.company?.toLowerCase().includes(filters.company.toLowerCase())) {
        return false
      }
      return true
    })
  }
}

