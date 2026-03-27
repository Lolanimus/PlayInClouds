import { useEffect } from "react";
import supabase from "../utils/supabase";
import { userStore } from "../store/user_state";
import { queryClient } from "../queries/queries";
import { loadingStore } from "../store/loading_state";

export const useAuth = () => {
  useEffect(() => {
    // Get initial session
    const getSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        userStore.getState().actions.setUser(session?.user ?? null);
        loadingStore.getState().actions.setLoading(false);
      } catch (err) {
        console.error("", err);
      }
    };

    getSession();

    // Listen for auth state changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, session) => {
      const newUser = session?.user ?? null;
      const currentUser = userStore.getState().user;

      // If user changed, clear all queries
      if (currentUser?.id !== newUser?.id) {
        queryClient.clear();
      }

      userStore.getState().actions.setUser(newUser);
    });

    return () => {
      subscription?.unsubscribe();
      userStore.getState().actions.setUser(null);
    };
  }, []);
};