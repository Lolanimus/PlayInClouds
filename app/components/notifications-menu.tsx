import { useEffect, useMemo, useRef, useState } from "react"
import { Bell } from "lucide-react"
import { useNavigate } from "react-router"

import { Button } from "@/components/ui/button"
import { useNotifications, useUnreadNotificationsCount, useMarkAllNotificationsRead, useMarkNotificationRead } from "@/hooks/useNotifications"
import { useBroadcastNotificationsSubscription } from "@/hooks/realtime_broadcast/useRealtimeSuscriptionsFactory"
import { useToast } from "@/hooks/use-toast"
import type { Notification } from "@/types/custom/api.types"

function formatNotificationTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Just now"

  const diffMs = Date.now() - date.getTime()
  const diffMinutes = Math.max(0, Math.floor(diffMs / (1000 * 60)))

  if (diffMinutes < 1) return "Just now"
  if (diffMinutes < 60) return `${diffMinutes}m ago`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

function happenedWhileUserWasHere(notification: Notification, mountedAt: number) {
  const createdAt = new Date(notification.created_at).getTime()

  if (Number.isNaN(createdAt)) {
    return false
  }

  return createdAt >= mountedAt
}

export function NotificationsMenu() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const containerRef = useRef<HTMLDivElement>(null)
  const mountedAtRef = useRef(Date.now())
  const hasInitializedRef = useRef(false)
  const seenIdsRef = useRef<Set<string>>(new Set())
  const [isOpen, setIsOpen] = useState(false)

  useBroadcastNotificationsSubscription()

  const notificationsQuery = useNotifications({ p_limit: 12, p_offset: 0 }, { enabled: true })
  const unreadCountQuery = useUnreadNotificationsCount({ enabled: true })
  const markNotificationReadMutation = useMarkNotificationRead()
  const markAllNotificationsReadMutation = useMarkAllNotificationsRead()

  const notifications = useMemo(
    () => ((notificationsQuery.data as Notification[] | null) ?? []),
    [notificationsQuery.data]
  )
  const unreadCount = typeof unreadCountQuery.data === "number" ? unreadCountQuery.data : 0

  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [isOpen])

  useEffect(() => {
    if (!hasInitializedRef.current) {
      notifications.forEach((notification) => seenIdsRef.current.add(notification.id))
      hasInitializedRef.current = true
      return
    }

    const newUnreadNotifications = notifications.filter(
      (notification) =>
        !notification.is_read &&
        !seenIdsRef.current.has(notification.id) &&
        happenedWhileUserWasHere(notification, mountedAtRef.current)
    )

    if (newUnreadNotifications.length > 0) {
      const latestNotification = newUnreadNotifications[0]
      const toastRef = toast({
        title: latestNotification.title,
        description: latestNotification.body ?? undefined,
        onClick: () => {
          toastRef.dismiss()
          void handleOpenNotification(latestNotification)
        },
        className: latestNotification.action_url
          ? "cursor-pointer hover:border-[#d8d8d8] hover:bg-[#fafafa]"
          : undefined,
      })
    }

    notifications.forEach((notification) => seenIdsRef.current.add(notification.id))
  }, [notifications, toast])

  const handleOpenNotification = async (notification: Notification) => {
    if (!notification.is_read) {
      try {
        await markNotificationReadMutation.mutateAsync({ p_notification_id: notification.id })
      } catch {
        // handled by global error state
      }
    }

    setIsOpen(false)

    if (notification.action_url) {
      navigate(notification.action_url)
    }
  }

  const handleMarkAllAsRead = async () => {
    try {
      await markAllNotificationsReadMutation.mutateAsync()
    } catch {
      // handled by global error state
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <Button
        size="icon"
        variant="ghost"
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative h-10 w-10 text-[#ffffff] hover:bg-[#ffffff]/10 flex-shrink-0"
        aria-label="Open notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 ? (
          <span className="absolute right-1 top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-[#ef4444] px-1 text-[9px] font-semibold leading-4 text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </Button>

      {isOpen ? (
        <div className="absolute right-0 top-full z-[95] mt-2 w-[22rem] overflow-hidden rounded-2xl border border-[#e9e9e9] bg-[#ffffff] shadow-xl">
          <div className="flex items-center justify-between border-b border-[#efefef] px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-[#111111]">Notifications</p>
              <p className="text-xs text-[#6a6a6a]">Recent updates from your account</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void handleMarkAllAsRead()}
              disabled={markAllNotificationsReadMutation.isPending || unreadCount === 0}
              className="h-8 px-2 text-xs text-[#111111] hover:bg-[#f5f5f5]"
            >
              Mark all read
            </Button>
          </div>

          <div className="max-h-[28rem] overflow-y-auto">
            {notificationsQuery.isLoading ? (
              <div className="px-4 py-6 text-sm text-[#6a6a6a]">Loading notifications...</div>
            ) : notificationsQuery.isError ? (
              <div className="px-4 py-6 text-sm text-[#b42318]">Could not load notifications.</div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-[#6a6a6a]">No notifications yet.</div>
            ) : (
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => void handleOpenNotification(notification)}
                  className={`flex w-full flex-col gap-1 border-b border-[#f4f4f4] px-4 py-3 text-left transition-colors hover:bg-[#fafafa] ${
                    notification.is_read ? "bg-[#ffffff]" : "bg-[#f8fbff]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-[#111111]">{notification.title}</p>
                    <span className="shrink-0 text-[11px] text-[#7a7a7a]">
                      {formatNotificationTime(notification.created_at)}
                    </span>
                  </div>
                  {notification.body ? (
                    <p className="text-sm leading-6 text-[#5a5a5a]">{notification.body}</p>
                  ) : null}
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
