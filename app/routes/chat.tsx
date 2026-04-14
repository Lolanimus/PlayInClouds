import { Fragment, useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router"
import { ArrowLeft, Loader2, Search, Send, Trash2, UserCircle2 } from "lucide-react"

import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { Input } from "~/components/ui/input"
import { useChatByUserId, useChats, useDeleteChat } from "~/hooks/useChats"
import { useListings } from "~/hooks/useListings"
import { useSendMessage, useMessages } from "~/hooks/useMessages"
import {
  useListHostMonthlyReservations,
  useListUserActiveReservations,
} from "~/hooks/useReservations"
import { useBroadcastChatsSubscription } from "~/hooks/realtime_broadcast/useRealtimeSuscriptionsFactory"
import { useToast } from "~/hooks/use-toast"
import { useUser } from "~/store/user_state"
import type { Chat, ChatParticipantProfile, Listing, Message, Reservation } from "~/types/custom/api.types"

type Conversation = {
  id: string
  peerLabel: string
  listingTitle: string
  subtitle: string
  updatedAt: string
  listingImageUrl?: string
  chatId?: string
  listingId?: string
  reservationId?: string
  targetUserId?: string
}

type ChatMessage = {
  id: string
  sender: "me" | "peer"
  text: string
  timestamp: string
}

function shortLabel(userId: string) {
  return `User ${userId.slice(0, 6)}`
}

function formatParticipantName(participant?: ChatParticipantProfile) {
  if (!participant) return null

  const parts = [participant.first_name?.trim(), participant.last_name?.trim()].filter(Boolean)
  if (parts.length > 0) return parts.join(" ")

  return shortLabel(participant.id)
}

function formatTime(timestamp: string) {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ""

  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
}

function getMessageDateKey(timestamp: string) {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ""

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")

  return `${year}-${month}-${day}`
}

function formatMessageDate(timestamp: string) {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ""

  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function toDateKeyFromIso(isoValue: string) {
  const date = new Date(isoValue)
  if (Number.isNaN(date.getTime())) return ""

  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")

  return `${y}-${m}-${d}`
}

function isChat(value: unknown): value is Chat {
  if (!value || typeof value !== "object") return false
  return "id" in value && typeof (value as { id?: unknown }).id === "string"
}

function normalizeMessages(messages: Message[] | undefined, userId?: string): ChatMessage[] {
  if (!messages || !userId) return []

  return [...messages]
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((message) => ({
      id: message.id,
      sender: message.sender_id === userId ? "me" : "peer",
      text: message.contents,
      timestamp: String(message.created_at),
    }))
}

export default function ChatPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { toast } = useToast()
  const user = useUser()
  const chatsQuery = useChats()
  const listingsQuery = useListings()
  const guestReservationsQuery = useListUserActiveReservations(
    { p_renter_id: user?.id ?? null },
    { enabled: Boolean(user?.id) }
  )
  const hostReservationsQuery = useListHostMonthlyReservations(
    { p_host_id: user?.id ?? null, p_month: new Date().getMonth() + 1 },
    { enabled: Boolean(user?.id) }
  )
  const sendMessageMutation = useSendMessage()
  const deleteChatMutation = useDeleteChat()

  useBroadcastChatsSubscription()

  const [searchQuery, setSearchQuery] = useState("")
  const [draft, setDraft] = useState("")
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const requestedReservationId = searchParams.get("reservationId")

  useEffect(() => {
    if (!user) {
      navigate("/login?redirect=%2Fchat", { replace: true })
    }
  }, [user, navigate])

  const listings = (listingsQuery.data as Listing[] | null) ?? []
  const chatRows = ((chatsQuery.data as Chat[] | null) ?? []).filter(isChat)
  const guestReservations = (guestReservationsQuery.data as Reservation[] | null) ?? []
  const hostReservations = (hostReservationsQuery.data as Reservation[] | null) ?? []

  const listingsById = useMemo(() => new Map(listings.map((listing) => [listing.id, listing])), [listings])

  const conversations = useMemo<Conversation[]>(() => {
    if (!user) return []

    const map = new Map<string, Conversation>()

    const mergeConversation = (key: string, incoming: Conversation) => {
      const existing = map.get(key)

      if (!existing) {
        map.set(key, incoming)
        return
      }

      const keepExistingText = existing.updatedAt >= incoming.updatedAt

      map.set(key, {
        ...existing,
        ...incoming,
        peerLabel: keepExistingText ? existing.peerLabel : incoming.peerLabel,
        listingTitle: keepExistingText ? existing.listingTitle : incoming.listingTitle,
        subtitle: keepExistingText ? existing.subtitle : incoming.subtitle,
        updatedAt: existing.updatedAt >= incoming.updatedAt ? existing.updatedAt : incoming.updatedAt,
        chatId: incoming.chatId ?? existing.chatId,
        listingId: incoming.listingId ?? existing.listingId,
        reservationId: keepExistingText ? existing.reservationId ?? incoming.reservationId : incoming.reservationId ?? existing.reservationId,
        targetUserId: incoming.targetUserId ?? existing.targetUserId,
      })
    }

    for (const reservation of guestReservations) {
      const listing = listingsById.get(reservation.listing_id)
      const targetUserId = listing?.owner_id ?? undefined
      const updatedAt = reservation.updated_at ?? reservation.created_at
      const key = targetUserId ? `direct:${reservation.listing_id}:${targetUserId}` : `guest:${reservation.id}`

      mergeConversation(key, {
        id: key,
        peerLabel: targetUserId ? `Host • ${listing?.title ?? "Listing"}` : "Host",
        listingTitle: listing?.title ?? "Listing",
        subtitle: `${reservation.guests} guest${reservation.guests !== 1 ? "s" : ""} • ${toDateKeyFromIso(reservation.start_at)}`,
        updatedAt,
        listingImageUrl: listing?.images?.[0],
        listingId: reservation.listing_id,
        reservationId: reservation.id,
        targetUserId,
      })
    }

    for (const reservation of hostReservations) {
      const listing = listingsById.get(reservation.listing_id)
      const targetUserId = reservation.renter_id
      const updatedAt = reservation.updated_at ?? reservation.created_at
      const key = `direct:${reservation.listing_id}:${targetUserId}`

      mergeConversation(key, {
        id: key,
        peerLabel: shortLabel(targetUserId),
        listingTitle: listing?.title ?? "Listing",
        subtitle: `${reservation.guests} guest${reservation.guests !== 1 ? "s" : ""} • ${toDateKeyFromIso(reservation.start_at)}`,
        updatedAt,
        listingImageUrl: listing?.images?.[0],
        listingId: reservation.listing_id,
        reservationId: reservation.id,
        targetUserId,
      })
    }

    for (const chat of chatRows) {
      const listingId = chat.listing_id ?? undefined
      const listing = listingId ? listingsById.get(listingId) : undefined
      const participantIds = chat.participant_ids ?? []
      const participants = chat.participants ?? []
      const otherUserId = chat.chat_type === "DIRECT"
        ? participantIds.find((participantId) => participantId !== user.id)
        : undefined
      const otherParticipant = chat.chat_type === "DIRECT"
        ? participants.find((participant) => participant.id !== user.id)
        : undefined
      const updatedAt = chat.updated_at ?? new Date().toISOString()

      if (chat.chat_type === "DIRECT" && listingId && otherUserId) {
        mergeConversation(`direct:${listingId}:${otherUserId}`, {
          id: `direct:${listingId}:${otherUserId}`,
          peerLabel: formatParticipantName(otherParticipant) ?? shortLabel(otherUserId),
          listingTitle: listing?.title ?? "Listing",
          subtitle: "Direct chat",
          updatedAt,
          listingImageUrl: listing?.images?.[0],
          chatId: chat.id,
          listingId,
          targetUserId: otherUserId,
        })
        continue
      }

      mergeConversation(`chat-${chat.id}`, {
        id: `chat-${chat.id}`,
        peerLabel: chat.chat_type === "GROUP" ? "Group chat" : "Conversation",
        listingTitle: listing?.title ?? "Listing",
        subtitle: chat.chat_type === "GROUP"
          ? participants.length > 0
            ? participants
              .map((participant) => formatParticipantName(participant) ?? shortLabel(participant.id))
              .join(", ")
            : `${participantIds.length} participant${participantIds.length === 1 ? "" : "s"}`
          : chat.chat_type ?? "DIRECT",
        updatedAt,
        listingImageUrl: listing?.images?.[0],
        chatId: chat.id,
        listingId,
      })
    }

    return Array.from(map.values()).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  }, [chatRows, guestReservations, hostReservations, listingsById, user])

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
    if (!requestedReservationId || conversations.length === 0) return

    const matchingConversation = conversations.find(
      (conversation) => conversation.reservationId === requestedReservationId
    )

    if (matchingConversation) {
      setActiveConversationId(matchingConversation.id)
    }
  }, [conversations, requestedReservationId])

  const filteredConversations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()

    if (!q) return conversations

    return conversations.filter((conversation) => {
      return (
        conversation.peerLabel.toLowerCase().includes(q) ||
        conversation.listingTitle.toLowerCase().includes(q) ||
        conversation.subtitle.toLowerCase().includes(q)
      )
    })
  }, [conversations, searchQuery])

  const activeConversation = filteredConversations.find((conversation) => conversation.id === activeConversationId)
    ?? conversations.find((conversation) => conversation.id === activeConversationId)
    ?? null

  const activeDirectChatQuery = useChatByUserId(
    activeConversation?.targetUserId ?? "",
    activeConversation?.listingId ?? ""
  )
  const resolvedActiveChatId = activeConversation?.chatId ?? activeDirectChatQuery.data?.id

  const messagesQuery = useMessages(resolvedActiveChatId)
  const activeMessages = useMemo(() => {
    const rows = messagesQuery.data?.messages ?? []
    return normalizeMessages(rows, user?.id)
  }, [messagesQuery.data?.messages, user?.id])

  const isInitialLoading = chatsQuery.isLoading || guestReservationsQuery.isLoading || hostReservationsQuery.isLoading || listingsQuery.isLoading

  const handleSendMessage = async () => {
    const text = draft.trim()

    if (!activeConversation || !text || sendMessageMutation.isPending) return

    if (!activeConversation.chatId && (!activeConversation.targetUserId || !activeConversation.listingId)) {
      toast({
        title: "Cannot start chat",
        description: "This conversation is missing chat participants or listing.",
        variant: "destructive",
      })
      return
    }

    try {
      await sendMessageMutation.mutateAsync({
        contents: text,
        opts: {
          chatId: resolvedActiveChatId,
          targetId: activeConversation.targetUserId,
          listingId: activeConversation.listingId,
        },
      })

      setDraft("")
    } catch {
      toast({
        title: "Message failed",
        description: "Please try sending again.",
        variant: "destructive",
      })
    }
  }

  const handleDeleteChat = async () => {
    if (!resolvedActiveChatId || deleteChatMutation.isPending) return

    const confirmed = confirm(`Delete chat for ${activeConversation?.listingTitle ?? "this listing"}? This will remove all messages.`)
    if (!confirmed) return

    try {
      await deleteChatMutation.mutateAsync(resolvedActiveChatId)
      setDraft("")
      toast({
        title: "Chat deleted",
        description: "The conversation and its messages were removed.",
      })
    } catch {
      toast({
        title: "Delete failed",
        description: "Please try deleting the chat again.",
        variant: "destructive",
      })
    }
  }

  if (!user) return null

  return (
    <main className="min-h-[calc(100vh-5.5rem)] bg-muted/40 px-4 py-6">
      <Card className="mx-auto flex h-[calc(100vh-8.5rem)] w-full max-w-6xl min-h-0 flex-col overflow-hidden border-[#e9e9e9] bg-[#ffffff] shadow-lg">
        <CardHeader className="border-b border-[#e9e9e9] bg-gradient-to-b from-[#fcfcfc] to-[#ffffff]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-3xl text-[#000000]">Messages</CardTitle>
              <CardDescription>Chat about your bookings and listing requests.</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button asChild variant="outline">
                <Link to="/dashboard">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to dashboard
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="min-h-0 flex-1 p-0">
          <div className="grid h-full min-h-0 grid-cols-1 md:grid-cols-[320px_minmax(0,1fr)] md:grid-rows-1">
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
                {isInitialLoading ? (
                  <div className="rounded-xl border border-[#e9e9e9] bg-[#ffffff] p-4 text-sm text-[#6a6a6a]">
                    Loading conversations...
                  </div>
                ) : null}

                {!isInitialLoading && filteredConversations.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[#dadada] bg-[#ffffff] p-4 text-sm text-[#6a6a6a]">
                    No conversations found.
                  </div>
                ) : null}

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
                      <div className="flex items-start gap-3">
                        <div className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border ${isActive ? "border-[#ffffff]/20 bg-[#1f1f1f]" : "border-[#e9e9e9] bg-[#f4f4f4]"}`}>
                          {conversation.listingImageUrl ? (
                            <img
                              src={conversation.listingImageUrl}
                              alt={conversation.listingTitle}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <UserCircle2 className={`h-5 w-5 ${isActive ? "text-[#ffffff]/70" : "text-[#9a9a9a]"}`} />
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{conversation.listingTitle}</p>
                          <p className={`truncate text-xs ${isActive ? "text-[#ffffff]/85" : "text-[#6a6a6a]"}`}>
                            {conversation.peerLabel}
                          </p>
                          <p className={`mt-1 truncate text-xs ${isActive ? "text-[#ffffff]/85" : "text-[#8a8a8a]"}`}>
                            {conversation.subtitle}
                          </p>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </aside>

            <section className="flex min-h-0 min-w-0 w-full flex-col overflow-hidden bg-[#ffffff]">
              {activeConversation ? (
                <>
                  <div className="flex items-start justify-between gap-3 border-b border-[#e9e9e9] px-4 py-3 md:px-5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#000000]">{activeConversation.listingTitle}</p>
                      <p className="truncate text-xs text-[#6a6a6a]">{activeConversation.peerLabel}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {activeConversation.listingId ? (
                        <Button asChild type="button" variant="outline" size="sm">
                          <Link to={`/listing/${activeConversation.listingId}`}>
                            Go to listing
                          </Link>
                        </Button>
                      ) : (
                        <Button type="button" variant="outline" size="sm" disabled>
                          Go to listing
                        </Button>
                      )}

                      {activeConversation.reservationId ? (
                        <Button asChild type="button" variant="outline" size="sm">
                          <Link to={`/reservation/${activeConversation.reservationId}`}>
                            Go to reservation
                          </Link>
                        </Button>
                      ) : (
                        <Button type="button" variant="outline" size="sm" disabled>
                          Go to reservation
                        </Button>
                      )}

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => void handleDeleteChat()}
                        disabled={!resolvedActiveChatId || deleteChatMutation.isPending}
                        className="border-[#f2c9c5] text-[#b42318] hover:bg-[#fff3f2] hover:text-[#b42318]"
                      >
                        {deleteChatMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                        <span className="ml-2">Delete chat</span>
                      </Button>
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto bg-[#fcfcfc] px-4 py-4 md:px-5">
                    {(messagesQuery.isLoading || activeDirectChatQuery.isLoading) && resolvedActiveChatId ? (
                      <div className="flex h-full items-center justify-center text-sm text-[#6a6a6a]">
                        Loading messages...
                      </div>
                    ) : null}

                    {!messagesQuery.isLoading && activeMessages.length === 0 ? (
                      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                        <div className="rounded-full bg-[#f2f2f2] p-3">
                          <UserCircle2 className="h-6 w-6 text-[#7a7a7a]" />
                        </div>
                        <p className="text-sm font-medium text-[#000000]">No messages yet</p>
                        <p className="text-sm text-[#6a6a6a]">Send the first message to start this conversation.</p>
                      </div>
                    ) : null}

                    {activeMessages.map((message, index) => {
                      const previousMessage = index > 0 ? activeMessages[index - 1] : null
                      const shouldShowDate = !previousMessage
                        || getMessageDateKey(previousMessage.timestamp) !== getMessageDateKey(message.timestamp)

                      return (
                        <Fragment key={message.id}>
                          {shouldShowDate ? (
                            <div className="flex justify-center py-1">
                              <div className="rounded-full border border-[#e9e9e9] bg-[#ffffff] px-3 py-1 text-[11px] font-medium text-[#6a6a6a] shadow-sm">
                                {formatMessageDate(message.timestamp)}
                              </div>
                            </div>
                          ) : null}

                          <div
                            className={`flex ${message.sender === "me" ? "justify-end" : "justify-start"}`}
                          >
                            <div
                              className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                                message.sender === "me"
                                  ? "bg-[#000000] text-[#ffffff]"
                                  : "border border-[#e9e9e9] bg-[#ffffff] text-[#1f1f1f]"
                              }`}
                            >
                              <p>{message.text}</p>
                              <p className={`mt-1 text-[11px] ${message.sender === "me" ? "text-[#ffffff]/75" : "text-[#8a8a8a]"}`}>
                                {formatTime(message.timestamp)}
                              </p>
                            </div>
                          </div>
                        </Fragment>
                      )
                    })}
                  </div>

                  <div className="shrink-0 border-t border-[#e9e9e9] bg-[#ffffff] p-3 md:p-4">
                    <div className="w-full max-w-full overflow-hidden rounded-2xl border border-[#e9e9e9] bg-[#fafafa] p-2 shadow-sm">
                      <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 overflow-hidden">
                        <div className="min-w-0 overflow-hidden">
                          <Input
                            value={draft}
                            onChange={(event) => setDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" && !event.shiftKey) {
                                event.preventDefault()
                                void handleSendMessage()
                              }
                            }}
                            placeholder="Write a message"
                            disabled={sendMessageMutation.isPending}
                            className="h-11 min-w-0 w-full max-w-full border-0 bg-transparent px-3 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleSendMessage()}
                          disabled={!draft.trim() || sendMessageMutation.isPending}
                          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#000000] px-3 text-sm font-medium whitespace-nowrap text-[#ffffff] transition-colors hover:bg-[#1a1a1a] disabled:pointer-events-none disabled:opacity-50 md:px-4"
                        >
                          {sendMessageMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                          <span className="hidden md:inline">Send</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                  <div className="rounded-full bg-[#f2f2f2] p-3">
                    <UserCircle2 className="h-6 w-6 text-[#7a7a7a]" />
                  </div>
                  <p className="text-sm font-medium text-[#000000]">No conversation selected</p>
                  <p className="text-sm text-[#6a6a6a]">Choose a conversation from the left column.</p>
                </div>
              )}
            </section>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}
