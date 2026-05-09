import { useEffect } from "react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import supabase from "../utils/supabase";
import { userStore } from "../store/user_state";
import { queryClient } from "../queries/queries";
import { loadingStore } from "../store/loading_state";

export const useAuth = () => {
  useEffect(() => {
    let isActive = true;

    const applySessionUser = (sessionUser: SupabaseUser | null) => {
      if (!isActive) {
        return;
      }

      const currentUser = userStore.getState().user;

      if (currentUser?.id !== sessionUser?.id) {
        queryClient.clear();
      }

      userStore.getState().actions.setUser(sessionUser ?? null);
      loadingStore.getState().actions.setLoading(false);
    };

    const syncSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        applySessionUser(session?.user ?? null);
      } catch (err) {
        console.error("", err);
      } finally {
        if (isActive) {
          loadingStore.getState().actions.setLoading(false);
        }
      }
    };

    syncSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, session) => {
      applySessionUser(session?.user ?? null);
    });

    const handlePageShow = () => {
      void syncSession();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void syncSession();
      }
    };

    const handleWindowFocus = () => {
      void syncSession();
    };

    window.addEventListener("pageshow", handlePageShow);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      isActive = false;
      subscription?.unsubscribe();
      window.removeEventListener("pageshow", handlePageShow);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, []);
};
