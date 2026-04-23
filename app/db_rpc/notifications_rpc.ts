import { processRpcRequest } from "@/api/helpers"

const listNotifications = async (p_limit = 20, p_offset = 0) => {
  return await processRpcRequest("list_notifications", { p_limit, p_offset })
}

const countUnreadNotifications = async () => {
  return await processRpcRequest("count_unread_notifications")
}

const markNotificationRead = async (p_notification_id: string) => {
  return await processRpcRequest("mark_notification_read", { p_notification_id })
}

const markAllNotificationsRead = async () => {
  return await processRpcRequest("mark_all_notifications_read")
}

export {
  listNotifications,
  countUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
}
