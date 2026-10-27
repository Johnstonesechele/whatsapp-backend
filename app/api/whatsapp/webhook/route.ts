import { type NextRequest, NextResponse } from "next/server"
import { WhatsAppMenuAPI } from "@/backend/api/whatsapp-menu"
import { WhatsAppAPI } from "@/backend/api/whatsapp"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Verify webhook (WhatsApp webhook verification)
    const mode = body.hub?.mode
    const token = body.hub?.verify_token
    const challenge = body.hub?.challenge

    if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return new Response(challenge, { status: 200 })
    }

    // Process incoming messages
    if (body.entry && body.entry[0]?.changes && body.entry[0].changes[0]?.value?.messages) {
      const messages = body.entry[0].changes[0].value.messages

      for (const message of messages) {
        const phoneNumber = message.from
        const messageText = message.text?.body || ""

        // Process through menu system
        const response = await WhatsAppMenuAPI.processIncomingMessage(phoneNumber, messageText)

        // Send response back via WhatsApp API
        await WhatsAppAPI.sendMessage(phoneNumber, response)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Webhook error:", error)
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  // Webhook verification for WhatsApp
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get("hub.mode")
  const token = searchParams.get("hub.verify_token")
  const challenge = searchParams.get("hub.challenge")

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 })
  }

  return new Response("Forbidden", { status: 403 })
}

