import supabase from "../utils/supabase";
import { processAuthRequest } from "./helpers";
import { userStore } from "../store/user_state";
import type { UserLogin, UserSignup } from "../types/custom/api.types";

const login = async (
  creds: UserLogin
): Promise<void> => {
  const user = await processAuthRequest(async () => {
    const { data, error } = await supabase.auth.signInWithPassword(creds);

    if (error) throw error;

    console.info("Successfully logged in!");

    return data.user;
  });

  userStore.getState().actions.setUser(user);
};

const signout = async (): Promise<void> => {
  processAuthRequest(async () => {
    const { error } = await supabase.auth.signOut();

    if (error) throw error;

    console.info("Successfully logged out");
  });

  userStore.getState().actions.setUser(null);
};

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL!;

const signup = async (
  creds: UserSignup
): Promise<void> => {
  const user = await processAuthRequest(async () => {
    const { data, error } = await supabase.auth.signUp({
      email: creds.email,
      password: creds.password,
      options: {
        data: {
          first_name: creds.first_name,
          last_name: creds.last_name
        },
      },
    });

    if (error) throw error;

    console.info("Successfully signed up");

    return data.user!;
  });

  userStore.getState().actions.setUser(user);
};

export { login, signout, signup };
