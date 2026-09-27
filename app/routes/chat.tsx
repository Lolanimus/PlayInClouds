import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router"
import { ArrowLeft, ExternalLink, Loader2, Search, Send, Trash2, UserCircle2 } from "lucide-react"

import { getPublicProfile } from "@/db_rpc/profile_rpc"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useChatByUserId, useChats, useDeleteChat } from "@/hooks/useChats"
import { useListings } from "@/hooks/useListings"
import { useSendMessage, useMessages } from "@/hooks/useMessages"
import {
  useListHostMonthlyReservations,
  useListUserActiveReservations,
} from "@/hooks/useReservations"
import { useBroadcastChatsSubscription } from "@/hooks/realtime_broadcast/useRealtimeSuscriptionsFactory"
import { useToast } from "@/hooks/use-toast"
import { useUser } from "@/store/user_state"
import type { Chat, Listing, Message, Reservation } from "@/types/custom/api.types"

type Conversation = {
  id: string
  peerLabel: string
  listingTitle: string
  subtitle: string
  updatedAt: string
  listingImageUrl?: string
  chatId?: string
  targetUserId?: string
  listingId?: string
}

type ChatMessage = {
  id: string
  sender: "me" | "peer"
  text: string
  timestamp: string
}

const headerActionButtonClass = "h-8 rounded-full border bg-[#ffffff] px-3 hover:bg-[#f3f3f3]"

function shortLabel(userId: string) {
  return `User ${userId.slice(0, 6)}`
}

function getResolvedProfileName(
  profileNamesByUserId: Record<string, string>,
  userId: string,
  fallback?: string | null,
) {
  return profileNamesByUserId[userId] ?? fallback ?? shortLabel(userId)
}

function getParticipantDisplayName(chat: Chat, currentUserId: string) {
  const otherParticipant =
    chat.participants?.find((participant) => participant.id !== currentUserId)
    ?? null

  if (!otherParticipant) return null

  const fullName = `${otherParticipant.first_name ?? ""} ${otherParticipant.last_name ?? ""}`.trim()
  return fullName || shortLabel(otherParticipant.id)
}

function getOtherParticipantId(chat: Chat, currentUserId: string) {
  return chat.participant_ids?.find((participantId) => participantId !== currentUserId) ?? null
}

function getDirectChatKey(targetUserId?: string, listingId?: string | null) {
  if (!targetUserId || !listingId) return null
  return `${targetUserId}:${listingId}`
}

function getReservationConversationKey(targetUserId?: string, listingId?: string | null) {
  return getDirectChatKey(targetUserId, listingId)
}

function formatTime(timestamp: string) {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ""

  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
}

function formatDateLabel(timestamp: string) {
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

function ChatHeaderLinkAction({
  to,
  label,
}: {
  to: string
  label: string
}) {
  return (
    <Button
      asChild
      variant="ghost"
      size="sm"
      className={`${headerActionButtonClass} border-[#dfdfdf] text-[#111111]`}
    >
      <Link to={to}>
        {label}
        <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
      </Link>
    </Button>
  )
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
  const [profileNamesByUserId, setProfileNamesByUserId] = useState<Record<string, string>>({})

  const preferredListingId = searchParams.get("listingId") ?? undefined
  const preferredTargetUserId = searchParams.get("targetUserId") ?? undefined
  const preferredConversationKey = getDirectChatKey(preferredTargetUserId, preferredListingId)

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
  const participantUserIds = useMemo(() => {
    if (!user) return []

    const ids = new Set<string>()

    for (const reservation of guestReservations) {
      const listing = listingsById.get(reservation.listing_id)
      if (listing?.owner_id) ids.add(listing.owner_id)
    }

    for (const reservation of hostReservations) {
      ids.add(reservation.renter_id)
    }

    for (const chat of chatRows) {
      const otherParticipantId = getOtherParticipantId(chat, user.id)
      if (otherParticipantId) ids.add(otherParticipantId)
    }

    return Array.from(ids).sort()
  }, [chatRows, guestReservations, hostReservations, listingsById, user])

  const participantUserIdsKey = participantUserIds.join("|")

  useEffect(() => {
    let cancelled = false

    if (!participantUserIdsKey) {
      setProfileNamesByUserId({})
      return
    }

    const loadProfiles = async () => {
      const missingUserIds = participantUserIds.filter((userId) => !profileNamesByUserId[userId])

      if (missingUserIds.length === 0) return

      const entries = await Promise.all(
        missingUserIds.map(async (userId) => {
          try {
            const profile = await getPublicProfile(userId)
            const fullName = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim()

            return [userId, getResolvedProfileName({}, userId, fullName)] as const
          } catch {
            return [userId, shortLabel(userId)] as const
          }
        }),
      )

      if (cancelled) return

      setProfileNamesByUserId((current) => {
        const nextEntries = Object.fromEntries(entries)
        let changed = false

        for (const [userId, name] of Object.entries(nextEntries)) {
          if (current[userId] !== name) {
            changed = true
            break
          }
        }

        if (!changed) return current

        return {
          ...current,
          ...nextEntries,
        }
      })
    }

    void loadProfiles()

    return () => {
      cancelled = true
    }
  }, [participantUserIds, participantUserIdsKey, profileNamesByUserId])

  const conversations = useMemo<Conversation[]>(() => {
    if (!user) return []

    const directChatsByTargetAndListing = new Map<string, Chat>()

    for (const chat of chatRows) {
      const metadata = chat.metadata as unknown as Record<string, unknown> | null
      const otherUserId =
        typeof metadata?.target_user_id === "string"
          ? metadata.target_user_id
          : typeof metadata?.other_user_id === "string"
            ? metadata.other_user_id
            : getOtherParticipantId(chat, user.id) ?? undefined

      const directChatKey = getDirectChatKey(otherUserId, chat.listing_id)

      if (directChatKey) {
        directChatsByTargetAndListing.set(directChatKey, chat)
      }
    }

    const map = new Map<string, Conversation>()

    for (const reservation of guestReservations) {
      const listing = listingsById.get(reservation.listing_id)
      const targetUserId = listing?.owner_id ?? undefined
      const directChatKey = getDirectChatKey(targetUserId, reservation.listing_id)
      const directChat = directChatKey ? directChatsByTargetAndListing.get(directChatKey) : undefined
      const updatedAt = reservation.updated_at ?? reservation.created_at
      const conversationKey = getReservationConversationKey(targetUserId, reservation.listing_id) ?? `guest-${reservation.id}`
      const nextConversation: Conversation = {
        id: conversationKey,
        peerLabel: targetUserId ? getResolvedProfileName(profileNamesByUserId, targetUserId) : "Host",
        listingTitle: listing?.title ?? "Listing",
        subtitle: `Booking chat • ${toDateKeyFromIso(reservation.start_at)}`,
        updatedAt,
        listingImageUrl: listing?.images?.[0],
        chatId: directChat?.id,
        targetUserId,
        listingId: reservation.listing_id,
      }

      const existingConversation = map.get(conversationKey)
      if (!existingConversation || existingConversation.updatedAt < nextConversation.updatedAt) {
        map.set(conversationKey, nextConversation)
      }
    }

    for (const reservation of hostReservations) {
      const listing = listingsById.get(reservation.listing_id)
      const targetUserId = reservation.renter_id
      const directChatKey = getDirectChatKey(targetUserId, reservation.listing_id)
      const directChat = directChatKey ? directChatsByTargetAndListing.get(directChatKey) : undefined
      const updatedAt = reservation.updated_at ?? reservation.created_at
      const conversationKey = getReservationConversationKey(targetUserId, reservation.listing_id) ?? `host-${reservation.id}`
      const nextConversation: Conversation = {
        id: conversationKey,
        peerLabel: getResolvedProfileName(profileNamesByUserId, targetUserId),
        listingTitle: listing?.title ?? "Listing",
        subtitle: `Booking chat • ${toDateKeyFromIso(reservation.start_at)}`,
        updatedAt,
        listingImageUrl: listing?.images?.[0],
        chatId: directChat?.id,
        targetUserId,
        listingId: reservation.listing_id,
      }

      const existingConversation = map.get(conversationKey)
      if (!existingConversation || existingConversation.updatedAt < nextConversation.updatedAt) {
        map.set(conversationKey, nextConversation)
      }
    }

    for (const chat of chatRows) {
      if ([...map.values()].some((conversation) => conversation.chatId === chat.id)) continue

      const targetUserId = getOtherParticipantId(chat, user.id) ?? undefined
      const peerLabel = targetUserId
        ? getResolvedProfileName(profileNamesByUserId, targetUserId, getParticipantDisplayName(chat, user.id))
        : null
      const listing = chat.listing_id ? listingsById.get(chat.listing_id) : undefined

      if (!targetUserId || !peerLabel) continue

      const conversationKey = getDirectChatKey(targetUserId, chat.listing_id) ?? `chat-${chat.id}`
      const nextConversation: Conversation = {
        id: conversationKey,
        peerLabel,
        listingTitle: listing?.title ?? "Direct chat",
        subtitle: listing?.subtitle ?? (chat.chat_type ?? "DIRECT"),
        updatedAt: chat.updated_at ?? new Date().toISOString(),
        listingImageUrl: listing?.images?.[0],
        chatId: chat.id,
        targetUserId,
        listingId: chat.listing_id ?? undefined,
      }

      const existingConversation = map.get(conversationKey)
      if (!existingConversation || existingConversation.updatedAt < nextConversation.updatedAt) {
        map.set(conversationKey, nextConversation)
      }
    }

    return Array.from(map.values()).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  }, [chatRows, guestReservations, hostReservations, listingsById, profileNamesByUserId, user])

  const conversationsWithPreferred = useMemo(() => {
    if (!preferredConversationKey || !preferredListingId || !preferredTargetUserId) {
      return conversations
    }

    if (conversations.some((conversation) => conversation.id === preferredConversationKey)) {
      return conversations
    }

    const listing = listingsById.get(preferredListingId)
    const preferredConversation: Conversation = {
      id: preferredConversationKey,
      peerLabel: getResolvedProfileName(
        profileNamesByUserId,
        preferredTargetUserId,
        listing?.owner_id === preferredTargetUserId ? "Host" : null,
      ),
      listingTitle: listing?.title ?? "Listing",
      subtitle: "Booking chat",
      updatedAt: listing?.updated_at ?? new Date().toISOString(),
      listingImageUrl: listing?.images?.[0],
      targetUserId: preferredTargetUserId,
      listingId: preferredListingId,
    }

    return [preferredConversation, ...conversations]
  }, [
    conversations,
    listingsById,
    preferredConversationKey,
    preferredListingId,
    preferredTargetUserId,
    profileNamesByUserId,
  ])

  useEffect(() => {
    if (conversationsWithPreferred.length === 0) {
      setActiveConversationId(null)
      return
    }

    setActiveConversationId((prev) => {
      if (preferredConversationKey && conversationsWithPreferred.some((conversation) => conversation.id === preferredConversationKey)) {
        return preferredConversationKey
      }

      if (prev && conversationsWithPreferred.some((conversation) => conversation.id === prev)) {
        return prev
      }

      return conversationsWithPreferred[0].id
    })
  }, [conversationsWithPreferred, preferredConversationKey])

  const filteredConversations = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()

    if (!q) return conversationsWithPreferred

    return conversationsWithPreferred.filter((conversation) => {
      return (
        conversation.peerLabel.toLowerCase().includes(q) ||
        conversation.listingTitle.toLowerCase().includes(q) ||
        conversation.subtitle.toLowerCase().includes(q)
      )
    })
  }, [conversationsWithPreferred, searchQuery])

  const activeConversation = filteredConversations.find((conversation) => conversation.id === activeConversationId)
    ?? conversationsWithPreferred.find((conversation) => conversation.id === activeConversationId)
    ?? null

  const activeDirectChatQuery = useChatByUserId(
    activeConversation?.targetUserId ?? "",
    activeConversation?.listingId ?? "",
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

    if (!activeConversation.chatId && !activeConversation.targetUserId) {
      toast({
        title: "Cannot start chat",
        description: "This conversation is missing a target user.",
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
    if (!activeConversation?.chatId || deleteChatMutation.isPending) return
    if (!confirm("Delete this chat?")) return

    try {
      await deleteChatMutation.mutateAsync(activeConversation.chatId)
      setActiveConversationId(null)
      setDraft("")
    } catch {
      toast({
        title: "Could not delete chat",
        description: "Please try again.",
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
              <Badge variant="outline" className="w-fit border-[#dadada] bg-[#ffffff] text-[#000000]">
                {conversationsWithPreferred.length} thread{conversationsWithPreferred.length !== 1 ? "s" : ""}
              </Badge>
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
                      <div className="flex items-center gap-3">
                        <div className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border ${
                          isActive ? "border-[#ffffff]/15" : "border-[#ececec]"
                        }`}>
                          {conversation.listingImageUrl ? (
                            <img
                              src={conversation.listingImageUrl}
                              alt={conversation.listingTitle}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className={`flex h-full w-full items-center justify-center text-[10px] font-medium uppercase tracking-[0.12em] ${
                              isActive ? "bg-[#1a1a1a] text-[#ffffff]/70" : "bg-[#f4f4f4] text-[#8a8a8a]"
                            }`}>
                              No image
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold">{conversation.peerLabel}</p>
                          <p className={`truncate text-xs ${isActive ? "text-[#ffffff]/85" : "text-[#6a6a6a]"}`}>
                            {conversation.listingTitle}
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
                  <div className="border-b border-[#e9e9e9] bg-[#ffffff] px-4 py-4 md:px-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0 space-y-1">
                        <p className="text-base font-semibold leading-none text-[#000000]">{activeConversation.peerLabel}</p>
                        <p className="truncate text-sm text-[#6a6a6a]">{activeConversation.listingTitle}</p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                        {activeConversation.chatId ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className={`${headerActionButtonClass} border-[#efc5c0] text-[#b42318] hover:bg-[#fff4f2]`}
                            onClick={handleDeleteChat}
                            disabled={deleteChatMutation.isPending}
                          >
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                            {deleteChatMutation.isPending ? "Deleting..." : "Delete chat"}
                          </Button>
                        ) : null}

                        {activeConversation.listingId ? (
                          <ChatHeaderLinkAction
                            to={`/listing/${activeConversation.listingId}`}
                            label="View listing"
                          />
                        ) : null}

                        {activeConversation.targetUserId ? (
                          <ChatHeaderLinkAction
                            to={`/profile/${activeConversation.targetUserId}`}
                            label="View profile"
                          />
                        ) : null}
                      </div>
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
                      const messageDateKey = toDateKeyFromIso(message.timestamp)
                      const previousDateKey = previousMessage ? toDateKeyFromIso(previousMessage.timestamp) : null
                      const showDateSeparator = messageDateKey !== previousDateKey

                      return (
                        <div key={message.id} className="space-y-3">
                          {showDateSeparator ? (
                            <div className="flex items-center gap-3 py-1">
                              <div className="h-px flex-1 bg-[#e5e5e5]" />
                              <p className="shrink-0 text-xs font-medium uppercase tracking-[0.12em] text-[#7a7a7a]">
                                {formatDateLabel(message.timestamp)}
                              </p>
                              <div className="h-px flex-1 bg-[#e5e5e5]" />
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
                        </div>
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
                  <p className="text-sm text-[#6a6a6a]">Choose a thread from the left column.</p>
                </div>
              )}
            </section>
          </div>
        </CardContent>

      </Card>
    </main>
  )
}
