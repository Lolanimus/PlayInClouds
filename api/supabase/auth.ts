import supabase from "@/utils/supabase";
import { processAuthRequest } from "./helpers";
import { userStore } from "@/store/user_state";
import type { UserLogin, UserSignup } from "@/types/custom/api.types";

type UpdateAccountPayload = {
  email?: string;
  password?: string;
  first_name?: string;
  last_name?: string;
};

type SignupResult = {
  success: boolean;
  message: string;
};

const login = async (
  creds: UserLogin,
  captchaToken?: string | null
): Promise<void> => {
  await processAuthRequest(async () => {
    const { data, error } = await supabase.auth.signInWithPassword({
      ...creds,
      ...(captchaToken ? { options: { captchaToken } } : {}),
    });

    if (error) throw error;

    console.info("Successfully logged in!");

    return data.user;
  });
};

const signout = async (): Promise<void> => {
  await processAuthRequest(async () => {
    const { error } = await supabase.auth.signOut();

    if (error) throw error;

    console.info("Successfully logged out");
  });

  // Clear user only after signOut completes so the auth state listener
  // doesn't race and restore a stale session.
  userStore.getState().actions.setUser(null);
};

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL!;

const signup = async (
  creds: UserSignup,
  captchaToken?: string | null
): Promise<SignupResult> => {
  const email = creds.email?.trim();

  if (!email) {
    return {
      success: false,
      message: "Email is required",
    };
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password: creds.password,
    options: {
      ...(captchaToken ? { captchaToken } : {}),
      data: {
        first_name: creds.first_name,
        last_name: creds.last_name,
      },
    },
  });

  if (error) {
    return {
      success: false,
      message: error.message,
    };
  }

  const identities = Array.isArray(data.user?.identities) ? data.user.identities : null;
  const hasCreatedAccount = Boolean(data.user) && (!identities || identities.length > 0);

  if (!hasCreatedAccount) {
    userStore.getState().actions.setUser(null);
    return {
      success: false,
      message: "An account with this email already exists. Try logging in instead.",
    };
  }

  if (data.session?.user) {
    userStore.getState().actions.setUser(data.session.user);
  } else {
    userStore.getState().actions.setUser(null);
  }

  console.info("Successfully signed up");

  return {
    success: true,
    message: data.session?.user
      ? "Account created successfully."
      : "Account created. Check your email to confirm your address before logging in.",
  };
};

const updateAccountSettings = async (
  payload: UpdateAccountPayload
): Promise<void> => {
  const trimmedEmail = payload.email?.trim();
  const trimmedFirstName = payload.first_name?.trim();
  const trimmedLastName = payload.last_name?.trim();
  const trimmedPassword = payload.password?.trim();

  const user = await processAuthRequest(async () => {
    const { data, error } = await supabase.auth.updateUser({
      ...(trimmedEmail ? { email: trimmedEmail } : {}),
      ...(trimmedPassword ? { password: trimmedPassword } : {}),
      data: {
        ...(trimmedFirstName ? { first_name: trimmedFirstName } : {}),
        ...(trimmedLastName ? { last_name: trimmedLastName } : {}),
      },
    });

    if (error) throw error;

    return data.user;
  });

  if (user) {
    userStore.getState().actions.setUser(user);
  }
};

export { login, signout, signup, updateAccountSettings };
export type { SignupResult };
