type ConnectionEvent = {
  userId: string
  companyId: string
  sessionId: string
  phoneNumber: string | null
}

type Listener = (event: ConnectionEvent) => void

const listeners = new Set<Listener>()

export function subscribeToWhatsAppConnections(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function publishWhatsAppConnection(event: ConnectionEvent) {
  for (const listener of listeners) {
    try {
      listener(event)
    } catch (error) {
      console.error('WhatsApp connection event listener failed:', error)
    }
  }
}
