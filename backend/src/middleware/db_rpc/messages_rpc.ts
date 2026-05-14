import { processRpcRequest } from "~/app/api/supabase/helpers";

const getMessages = async (
  chat_id?: string,
  cursor: number = 0,
  limit: number = 20
) => {
  if (!chat_id) return null;
  const result = await processRpcRequest("get_messages", {
    p_chat_id: chat_id,
    p_cursor: cursor,
    p_limit: limit,
  });
  return result;
};

const createMessage = async (chat_id: string, contents: string) => {
  return await processRpcRequest("create_message", {
    p_chat_id: chat_id,
    p_contents: contents,
  });
};

const deleteMessages = async (msg_ids: string[]) => {
  return await processRpcRequest("delete_messages", {
    msg_ids: msg_ids,
  });
};

export { getMessages, createMessage, deleteMessages };
