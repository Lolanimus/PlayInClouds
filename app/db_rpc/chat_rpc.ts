import { processRpcRequest } from "@/api/helpers";

const getClientChats = async () => {
  return await processRpcRequest("get_client_chats");
};

const getDirectChatByUserId = async (target_user_id: string, p_listing_id: string) => {
  return await processRpcRequest("get_direct_chat_by_user_id", {
    target_user_id: target_user_id,
    p_listing_id: p_listing_id,
  });
};

const createDirectChat = async ({
  target_user_id,
  p_listing_id,
}: {
  target_user_id: string;
  p_listing_id: string;
}) => {
  return await processRpcRequest("create_direct_chat", {
    target_user_id: target_user_id,
    p_listing_id: p_listing_id,
  });
};

const deleteChat = async (p_chat_id: string) => {
  return await processRpcRequest("delete_chat", {
    p_chat_id,
  });
};

export { getClientChats, getDirectChatByUserId, createDirectChat, deleteChat };
