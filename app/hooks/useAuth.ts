import { useEffect } from "react";
import supabase from "../utils/supabase";
import { userStore } from "../store/user_state";
import { queryClient } from "../queries/queries";
import { loadingStore } from "../store/loading_state";

export const useAuth = () => {
  useEffect(() => {
    let isActive = true;

    // Get initial session
    const getSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!isActive) {
          return;
        }

        userStore.getState().actions.setUser(session?.user ?? null);
      } catch (err) {
        console.error("", err);
      } finally {
        if (isActive) {
          loadingStore.getState().actions.setLoading(false);
        }
      }
    };

    getSession();

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, session) => {
      if (!isActive) {
        return;
      }

      const newUser = session?.user ?? null;
      const currentUser = userStore.getState().user;

      // If user changed, clear all queries
      if (currentUser?.id !== newUser?.id) {
        queryClient.clear();
      }

      userStore.getState().actions.setUser(newUser);
      loadingStore.getState().actions.setLoading(false);
    });

    return () => {
      isActive = false;
      subscription?.unsubscribe();
    };
  }, []);
};