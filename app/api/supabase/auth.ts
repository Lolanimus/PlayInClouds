import supabase from "@/utils/supabase";
import { processAuthRequest } from "./helpers";
import { userStore } from "@/store/user_state";
import type { UserLogin, UserSignup } from "@/types/custom/api.types";

type UpdateAccountPayload = {
  email?: string;
  current_password?: string;
  password?: string;
  first_name?: string;
  last_name?: string;
};

type SignupResult = {
  success: boolean;
  message: string;
  needsVerification: boolean;
};

type AuthCodeRequestResult = {
  success: boolean;
  message: string;
  needsSignupConfirmation?: boolean;
};

function isEmailConfirmed(user: {
  email_confirmed_at?: string | null;
} | null | undefined) {
  return Boolean(user?.email_confirmed_at);
}

function getAuthErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? "");
  }
  return "";
}

function isEmailNotConfirmedError(error: { message?: string; code?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? "";
  const code = error?.code?.toLowerCase() ?? "";
  
  return code === "email_not_confirmed" || message.includes("email not confirmed");
}

async function requestSignupConfirmationCode(
  email: string,
  captchaToken?: string | null,
  emailRedirectTo?: string | null
): Promise<AuthCodeRequestResult> {
  await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      ...(captchaToken ? { captchaToken } : {}),
      ...(emailRedirectTo ? { emailRedirectTo } : {}),
    },
  });

  userStore.getState().actions.setUser(null);

  return {
    success: true,
    message: "Your email is not confirmed yet. Enter the new confirmation code from your email.",
    needsSignupConfirmation: true,
  };
}

const login = async (
  creds: UserLogin,
  captchaToken?: string | null,
  emailRedirectTo?: string | null
): Promise<AuthCodeRequestResult> => {
  const email = creds.email.trim();

  if (!email) {
    return {
      success: false,
      message: "Email is required",
    };
  }

  let signInResult;

  try {
    signInResult = await supabase.auth.signInWithPassword({
      email,
      password: creds.password,
      ...(captchaToken ? { options: { captchaToken } } : {}),
    });
  } catch (err: any) {
    if (isEmailNotConfirmedError(err)) {
      return requestSignupConfirmationCode(email, captchaToken, emailRedirectTo);
    }

    userStore.getState().actions.setUser(null);
    return {
      success: false,
      message: getAuthErrorMessage(err) || "Login failed.",
    };
  }

  const { data, error: passwordError } = signInResult;

  if (passwordError) {
    if (isEmailNotConfirmedError(passwordError)) {
      try {
        return await requestSignupConfirmationCode(email, captchaToken, emailRedirectTo);
      } catch (resendError) {
        userStore.getState().actions.setUser(null);
        return {
          success: true,
          message: "Your email is not confirmed yet. Enter the confirmation code from your email.",
          needsSignupConfirmation: true,
        };
      }
    }

    userStore.getState().actions.setUser(null);
    return {
      success: false,
      message: passwordError.message,
    };
  }

  if (!data.user) {
    userStore.getState().actions.setUser(null);
    return {
      success: false,
      message: "Login did not return a user.",
    };
  }

  userStore.getState().actions.setUser(data.user);

  return {
    success: true,
    message: "Logged in.",
    needsSignupConfirmation: false,
  };
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

const signup = async (
  creds: UserSignup,
  captchaToken?: string | null,
  emailRedirectTo?: string | null
): Promise<SignupResult> => {
  const email = creds.email?.trim();

  if (!email) {
    return {
      success: false,
      message: "Email is required",
      needsVerification: false,
    };
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password: creds.password,
    options: {
      ...(captchaToken ? { captchaToken } : {}),
      ...(emailRedirectTo ? { emailRedirectTo } : {}),
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
      needsVerification: false,
    };
  }

  const identities = Array.isArray(data.user?.identities) ? data.user.identities : null;
  const hasCreatedAccount = Boolean(data.user) && (!identities || identities.length > 0);

  if (!hasCreatedAccount) {
    userStore.getState().actions.setUser(null);
    return {
      success: false,
      message: "An account with this email already exists. Try logging in instead.",
      needsVerification: false,
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
    needsVerification: !isEmailConfirmed(data.user),
  };
};

const verifySignupCode = async (
  email: string,
  code: string
): Promise<void> => {
  const { data, error } = await supabase.auth.verifyOtp({
    email: email.trim(),
    token: code.trim(),
    type: "signup",
  });

  if (error) throw error;

  if (data.session?.user) {
    userStore.getState().actions.setUser(data.session.user);
    return;
  }

  userStore.getState().actions.setUser(null);
};

const updateAccountSettings = async (
  payload: UpdateAccountPayload
): Promise<void> => {
  const trimmedEmail = payload.email?.trim();
  const trimmedFirstName = payload.first_name?.trim();
  const trimmedLastName = payload.last_name?.trim();
  const currentPassword = payload.current_password?.trim();
  const trimmedPassword = payload.password?.trim();

  const user = await processAuthRequest(async () => {
    if (trimmedPassword) {
      if (!currentPassword) {
        throw new Error("Current password is required when setting a new password.");
      }
    }

    const updatePayload = {
      ...(trimmedEmail ? { email: trimmedEmail } : {}),
      ...(trimmedPassword ? { current_password: currentPassword, password: trimmedPassword } : {}),
      data: {
        ...(trimmedFirstName ? { first_name: trimmedFirstName } : {}),
        ...(trimmedLastName ? { last_name: trimmedLastName } : {}),
      },
    };

    const { data, error } = await supabase.auth.updateUser(updatePayload as Parameters<typeof supabase.auth.updateUser>[0]);

    if (error) throw error;

    return data.user;
  });

  if (user) {
    userStore.getState().actions.setUser(user);
  }
};

export { login, signout, signup, updateAccountSettings, verifySignupCode };
export type { AuthCodeRequestResult, SignupResult };
