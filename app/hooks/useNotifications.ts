import * as notificationEvents from "~/backend/src/middleware/db_rpc/notifications_rpc"
import { queries } from "@/queries/queries"
import { errorStore } from "@/store/error_state"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

function getMutationErrorMessage(fallback: string) {
  return errorStore.getState().error ?? fallback
}

export const useNotifications = (
  opts?: { p_limit?: number; p_offset?: number },
  config?: { enabled?: boolean }
) => {
  const query = useQuery({
    ...queries.notifications.list(opts),
    enabled: config?.enabled ?? true,
  })

  return query
}

export const useUnreadNotificationsCount = (config?: { enabled?: boolean }) => {
  const query = useQuery({
    ...queries.notifications.unreadCount,
    enabled: config?.enabled ?? true,
  })

  return query
}

export const useMarkNotificationRead = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: { p_notification_id: string }) => {
      const result = await notificationEvents.markNotificationRead(payload.p_notification_id)

      if (!result) {
        throw new Error(getMutationErrorMessage("Failed to mark notification as read."))
      }

      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queries.notifications._def })
    },
  })
}

export const useMarkAllNotificationsRead = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const result = await notificationEvents.markAllNotificationsRead()

      if (result === null) {
        throw new Error(getMutationErrorMessage("Failed to mark all notifications as read."))
      }

      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queries.notifications._def })
    },
  })
}
