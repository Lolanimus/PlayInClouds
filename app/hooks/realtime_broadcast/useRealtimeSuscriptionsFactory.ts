import { queries } from "@/queries/queries";
import {
  RealtimeEvents,
  useBroadcastSubscription,
} from "./useRealtimeSubscription";


export const useBroadcastChatsSubscription = () => {
  return useBroadcastSubscription(
    "chats",
    queries.chats._def,
    RealtimeEvents.chats_update
  );
};

export const useBroadcastNotificationsSubscription = () => {
  return useBroadcastSubscription(
    "notifications",
    queries.notifications._def,
    RealtimeEvents.notifications_update
  );
};
