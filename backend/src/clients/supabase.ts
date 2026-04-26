import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.VITE_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase env vars. Set SUPABASE_URL and SUPABASE_ANON_KEY."
  );
}

export function createPublicSupabaseClient() {
  return createClient(supabaseUrl, supabaseAnonKey);
}

export function createAuthedSupabaseClient(accessToken: string) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}
