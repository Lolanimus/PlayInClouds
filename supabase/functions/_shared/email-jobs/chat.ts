import { renderChatEmail } from "../emails/chat-email.tsx";

export type ChatQueuePayload = {
  conversation_count?: number | string;
  conversations?: Array<{
    chat_id: string;
    listing_id?: string | null;
    listing_title?: string | null;
    counterparty_user_id: string;
    counterparty_name: string;
    first_message_at?: string | null;
    first_message_preview?: string | null;
  }>;
};

export type ChatQueueMessage = {
  dedupe_key: string;
  job_type: "chat_message";
  recipient_role: "recipient";
  recipient_user_id?: string | null;
  recipient_email: string;
  payload: ChatQueuePayload;
};

export function isChatEmailJobType(jobType: string) {
  return jobType === "chat_message";
}

export async function buildChatEmailJob(message: ChatQueueMessage, siteUrl: string) {
  const email = await renderChatEmail({
    messagesUrl: `${siteUrl}/chat`,
    conversationCount: Number(message.payload.conversation_count ?? 0),
    conversations: Array.isArray(message.payload.conversations) ? message.payload.conversations.map((conversation) => ({
      chatId: conversation.chat_id,
      listingId: conversation.listing_id ?? null,
      listingTitle: conversation.listing_title ?? null,
      otherUserId: conversation.counterparty_user_id,
      otherUserName: conversation.counterparty_name,
      firstMessageAt: conversation.first_message_at ?? null,
      firstMessagePreview: conversation.first_message_preview ?? null,
    })) : [],
  });

  return {
    to: message.recipient_email,
    subject: email.subject,
    text: email.text,
    html: email.html,
    tags: [
      { name: "job_type", value: message.job_type },
      { name: "recipient_role", value: message.recipient_role },
    ],
  };
}
