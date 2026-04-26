import { createQueryKeys } from "@lukemorales/query-key-factory";
import * as messageEvents from "../../backend/src/middleware/db_rpc/messages_rpc";
import * as chatEvents from "../../backend/src/middleware/db_rpc/chat_rpc";

export const chats = createQueryKeys("chats", {
  list: {
    queryKey: null,
    queryFn: () => chatEvents.getClientChats(),
  },
  detailByUserId: (userId: string, listingId: string) => ({
    queryKey: ["user", userId, "listing", listingId],
    queryFn: () => chatEvents.getDirectChatByUserId(userId, listingId),
  }),

  // Messages
  messages: (chatId?: string) => ({
    queryKey: [chatId],
    queryFn: () => messageEvents.getMessages(chatId),
  }),
  infiniteMessages: (chatId?: string, limit?: number) => ({
    queryKey: [chatId, "infinite"],
    queryFn: ({ pageParam }: { pageParam: number }) =>
      messageEvents.getMessages(chatId, pageParam, limit),
  }),
});
