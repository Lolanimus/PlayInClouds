import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queries } from "../queries/queries";
import { createDirectChat, deleteChat } from "~/backend/src/middleware/db_rpc/chat_rpc";

export const useChats = () => {
  return useQuery({
    ...queries.chats.list,
  });
};

export const useChatByUserId = (userId: string, listingId: string) => {
  return useQuery({
    ...queries.chats.detailByUserId(userId, listingId),
    enabled: Boolean(userId && listingId),
  });
};

export const useAddChat = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ target_user_id, p_listing_id }: { target_user_id: string; p_listing_id: string }) => {
      if (!target_user_id) {
        throw new Error("Missing chat participant")
      }

      return await createDirectChat({ target_user_id, p_listing_id })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queries.chats._def,
      });
    },
  });
};

export const useDeleteChat = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (chatId: string) => await deleteChat(chatId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queries.chats._def,
      });
    },
  });
};
