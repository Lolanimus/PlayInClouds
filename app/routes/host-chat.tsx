import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router"
import { MessageCircle, Search, Send, UserCircle2 } from "lucide-react"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { Input } from "~/components/ui/input"
import { useHostListings } from "~/store/host_listings_state"
import { useReservations } from "~/store/reservations_state"
import { useUser } from "~/store/user_state"

type Conversation = {
  id: string
  guestLabel: string
  listingTitle: string
  subtitle: string
  updatedAt: string
}

type ChatMessage = {
  id: string
  sender: "host" | "guest"
  text: string
  timestamp: string
}

function shortGuestLabel(userId: string) {
  return `Guest ${userId.slice(0, 6)}`
}

function formatTime(timestamp: string) {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ""

  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
}

export default function HostChatPage() {
  const navigate = useNavigate()
  const user = useUser()
  const listings = useHostListings()
  const reservations = useReservations()

  const [searchQuery, setSearchQuery] = useState("")
  const [draft, setDraft] = useState("")
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [messagesByConversation, setMessagesByConversation] = useState<Record<string, ChatMessage[]>>({})

  useEffect(() => {
    if (!user) {
      navigate("/login?redirect=%2Fhost%2Fchat", { replace: true })
    }
  }, [user, navigate])

  const hostListingIds = useMemo(() => new Set(listings.map((listing) => String(listing.id))), [listings])

  const conversations = useMemo<Conversation[]>(() => {
    const hostReservations = reservations
      .filter((reservation) => hostListingIds.has(String(reservation.listingId)))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))

    const map = new Map<string, Conversation>()

    for (const reservation of hostReservations) {
      const key = `${reservation.userId}-${reservation.listingId}`

      if (!map.has(key)) {
        map.set(key, {
          id: key,
          guestLabel: shortGuestLabel(reservation.userId),
          listingTitle: reservation.listingTitle,
          subtitle: `${reservation.guests} guest${reservation.guests !== 1 ? "s" : ""} • ${reservation.dateKey}`,
          updatedAt: reservation.createdAt,
        })
      }
    }

    if (map.size === 0) {
      map.set("support", {
        id: "support",
        guestLabel: "AirDrums Support",
        listingTitle: "General",
        subtitle: "No guest messages yet",
        updatedAt: new Date().toISOString(),
      })
    }

    return Array.from(map.values())
  }, [reservations, hostListingIds])

  useEffect(() => {
    if (conversations.length === 0) {
      setActiveConversationId(null)
      return
    }

    setActiveConversationId((prev) => {
      if (prev && conversations.some((conversation) => conversation.id === prev)) {
        return prev
      }

      return conversations[0].id
    })
  }, [conversations])

  useEffect(() => {
    const initialMessages: Record<string, ChatMessage[]> = {}

    for (const conversation of conversations) {
      initialMessages[conversation.id] = [
        {
          id: `${conversation.id}-1`,
          sender: "guest",
          text:
            conversation.id === "support"
              ? "Need help? Start a message here and we'll get back to you."
              : `Hi! Is ${conversation.listingTitle} available for extra setup time?`,
          timestamp: conversation.updatedAt,
        },
      ]
    }

    setMessagesByConversation((prev) => {
      const merged: Record<string, ChatMessage[]> = {}

      for (const conversation of conversations) {
        merged[conversation.id] = prev[conversation.id] ?? initialMessages[conversation.id]
      }

      return merged
    })
  }, [conversations])

  const filteredConversations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()

    if (!q) return conversations

    return conversations.filter((conversation) => {
      return (
        conversation.guestLabel.toLowerCase().includes(q) ||
        conversation.listingTitle.toLowerCase().includes(q) ||
        conversation.subtitle.toLowerCase().includes(q)
      )
    })
  }, [conversations, searchQuery])

  const activeConversation = filteredConversations.find((conversation) => conversation.id === activeConversationId)
    ?? conversations.find((conversation) => conversation.id === activeConversationId)
    ?? null

  const activeMessages = activeConversation ? messagesByConversation[activeConversation.id] ?? [] : []

  const sendMessage = () => {
    const text = draft.trim()

    if (!activeConversation || !text) return

    const now = new Date().toISOString()

    setMessagesByConversation((prev) => ({
      ...prev,
      [activeConversation.id]: [
        ...(prev[activeConversation.id] ?? []),
        {
          id: `${activeConversation.id}-${Date.now()}`,
          sender: "host",
          text,
          timestamp: now,
        },
      ],
    }))

    setDraft("")
  }

  if (!user) return null

  return (
    <section className="h-full min-h-0 flex-1 overflow-hidden p-4 md:p-6 lg:p-8">
      <Card className="flex h-full w-full min-h-0 flex-col overflow-hidden border-[#e9e9e9] bg-[#ffffff] shadow-lg">
        <CardHeader className="border-b border-[#e9e9e9] bg-gradient-to-b from-[#fcfcfc] to-[#ffffff]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-3xl text-[#000000]">Host messages</CardTitle>
              <CardDescription>Talk with guests about bookings and requests.</CardDescription>
            </div>
            <Badge variant="outline" className="w-fit border-[#dadada] bg-[#ffffff] text-[#000000]">
              {conversations.length} thread{conversations.length !== 1 ? "s" : ""}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="min-h-0 flex-1 p-0">
          <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[320px_minmax(0,1fr)]">
            <aside className="border-b border-[#e9e9e9] bg-[#fafafa] p-4 md:border-b-0 md:border-r">
              <div className="relative mb-4">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9a9a9a]" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search conversations"
                  className="pl-9"
                />
              </div>

              <div className="space-y-2 overflow-y-auto md:max-h-[calc(100vh-19rem)]">
                {filteredConversations.map((conversation) => {
                  const isActive = conversation.id === activeConversationId

                  return (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => setActiveConversationId(conversation.id)}
                      className={`w-full rounded-xl border p-3 text-left transition-colors ${
                        isActive
                          ? "border-[#000000] bg-[#000000] text-[#ffffff]"
                          : "border-[#e9e9e9] bg-[#ffffff] text-[#1f1f1f] hover:bg-[#f6f6f6]"
                      }`}
                    >
                      <p className="truncate text-sm font-semibold">{conversation.guestLabel}</p>
                      <p className={`truncate text-xs ${isActive ? "text-[#ffffff]/85" : "text-[#6a6a6a]"}`}>
                        {conversation.listingTitle}
                      </p>
                      <p className={`mt-1 truncate text-xs ${isActive ? "text-[#ffffff]/85" : "text-[#8a8a8a]"}`}>
                        {conversation.subtitle}
                      </p>
                    </button>
                  )
                })}
              </div>
            </aside>

            <section className="flex min-h-0 flex-col bg-[#ffffff]">
              {activeConversation ? (
                <>
                  <div className="border-b border-[#e9e9e9] px-4 py-3 md:px-5">
                    <p className="text-sm font-semibold text-[#000000]">{activeConversation.guestLabel}</p>
                    <p className="text-xs text-[#6a6a6a]">{activeConversation.listingTitle}</p>
                  </div>

                  <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#fcfcfc] px-4 py-4 md:px-5">
                    {activeMessages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.sender === "host" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                            message.sender === "host"
                              ? "bg-[#000000] text-[#ffffff]"
                              : "border border-[#e9e9e9] bg-[#ffffff] text-[#1f1f1f]"
                          }`}
                        >
                          <p>{message.text}</p>
                          <p className={`mt-1 text-[11px] ${message.sender === "host" ? "text-[#ffffff]/75" : "text-[#8a8a8a]"}`}>
                            {formatTime(message.timestamp)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-[#e9e9e9] bg-[#ffffff] p-3 md:p-4">
                    <div className="flex items-end gap-2">
                      <Input
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault()
                            sendMessage()
                          }
                        }}
                        placeholder="Write a message"
                      />
                      <Button type="button" onClick={sendMessage} className="bg-[#000000] text-[#ffffff] hover:bg-[#1a1a1a]">
                        <Send className="mr-2 h-4 w-4" />
                        Send
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                  <div className="rounded-full bg-[#f2f2f2] p-3">
                    <UserCircle2 className="h-6 w-6 text-[#7a7a7a]" />
                  </div>
                  <p className="text-sm font-medium text-[#000000]">No conversation selected</p>
                  <p className="text-sm text-[#6a6a6a]">Choose a thread from the left column.</p>
                </div>
              )}
            </section>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
