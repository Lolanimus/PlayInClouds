import { queryClient } from "@/queries/queries";
import { userStore } from "@/store/user_state";
import supabase from "@/utils/supabase";
import type { InvalidateQueryFilters } from "@tanstack/react-query";
import { useEffect } from "react";

export enum RealtimeEvents {
  contacts_update = "contacts_update",
  chats_update = "chats_update",
  notifications_update = "notifications_update",
}

export const useBroadcastSubscription = (
  filter: string,
  queryKey: InvalidateQueryFilters,
  event_name: RealtimeEvents,
  userId?: string
) => {
  useEffect(() => {
    const activeUserId = userId ?? userStore.getState().user?.id;

    if (!activeUserId) {
      return;
    }

    supabase!.auth.getSession().then((resp) => {
      supabase!.realtime.setAuth(resp?.data?.session?.access_token || null);

      const channel = supabase!.channel(`${filter}:${activeUserId}`, {
        config: { private: true },
      });

      channel
        .on("broadcast", { event: event_name }, () => {
          queryClient.invalidateQueries(queryKey);
          console.info(
            `${userStore.getState().user?.user_metadata.username} has received a message on ${channel.topic}`
          );
        })
        .subscribe((status) => {
          console.info(
            `topic ${channel.topic} for event ${event_name} is ${status} by ${userStore.getState().user?.user_metadata.username}`
          );
        });

      return () => {
        console.info("Cleaning up contact broadcast subsrciption");
        supabase!.removeChannel(channel);
      };
    });
  }, [queryClient, supabase, userId, queryKey, event_name, filter]);
};
