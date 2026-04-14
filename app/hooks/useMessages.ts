import { createDirectChat } from "@/db_rpc/chat_rpc";
import { createMessage, deleteMessages } from "@/db_rpc/messages_rpc";
import { queries } from "@/queries/queries";
import type { Messages } from "@/types/custom/api.types";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

export const useMessages = (chatId?: string) => {
  const query = useQuery({
    ...queries.chats.messages(chatId),
    enabled: !!chatId,
  });

  return query;
};

export const useInfiniteMessages = (chatId?: string, limit?: number) => {
  const query = useInfiniteQuery({
    ...queries.chats.infiniteMessages(chatId, limit),
    initialPageParam: 0,
    getNextPageParam: (lastPage: Messages) => lastPage?.nextCursor,
    enabled: !!chatId,
  });

  return query;
};

export const useSendMessage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      contents,
      opts,
    }: {
      contents: string;
      opts: {
        chatId?: string;
        targetId?: string;
        listingId?: string;
      };
    }) => {
      let chatId = opts.chatId;

      if (!chatId && opts.targetId && opts.listingId) {
        const newChat = await createDirectChat({
          target_user_id: opts.targetId,
          p_listing_id: opts.listingId,
        });
        chatId = newChat?.id;
      }

      if (!chatId) {
        throw new Error("Cannot send message: no chat ID available");
      }

      return await createMessage(chatId, contents);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queries.chats._def,
      });
    },
  });
};

export const useDeleteMessages = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (msgIds: string[]) => await deleteMessages(msgIds),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queries.chats._def,
      });
    },
  });
};

export const useDeleteMessage = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (msgId: string) => await deleteMessages([msgId]),
    onSuccess: () => {
      console.info("Deletion of a message returned success");
      queryClient.invalidateQueries({
        queryKey: queries.chats._def,
      });
    },
  });
};
