import { createQueryKeys } from "@lukemorales/query-key-factory"
import * as notificationEvents from "../../backend/src/middleware/db_rpc/notifications_rpc"

export const notifications = createQueryKeys("notifications", {
  list: (p?: { p_limit?: number; p_offset?: number }) => ({
    queryKey: ["list", p],
    queryFn: () => notificationEvents.listNotifications(p?.p_limit ?? 20, p?.p_offset ?? 0),
  }),
  unreadCount: {
    queryKey: ["unread-count"],
    queryFn: () => notificationEvents.countUnreadNotifications(),
  },
})
