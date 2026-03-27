// An example of a Chat feature having a query object
// Again this will save the queried results in the cookies
// And will play a role of a server-side state.

// import { createQueryKeys } from "@lukemorales/query-key-factory";
// import * as messageEvents from "../dp_rpc/messages_rpc";
// import * as chatEvents from "../dp_rpc/chat_rpc";

// export const chats = createQueryKeys("chats", {
//   list: {
//     queryKey: null,
//     queryFn: () => chatEvents.getClientChats(),
//   },
//   detailByUserId: (userId: string) => ({
//     queryKey: ["user", userId],
//     queryFn: () => chatEvents.getDirectChatByUserId(userId),
//   }),

//   // Messages
//   messages: (chatId?: string) => ({
//     queryKey: [chatId],
//     queryFn: () => messageEvents.getMessages(chatId),
//   }),
//   infiniteMessages: (chatId?: string, limit?: number) => ({
//     queryKey: [chatId, "infinite"],
//     queryFn: ({ pageParam }: { pageParam: number }) =>
//       messageEvents.getMessages(chatId, pageParam, limit),
//   }),
// });
