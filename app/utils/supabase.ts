import { createClient } from "@supabase/supabase-js";

const isBrowser = typeof window !== "undefined" && typeof window.localStorage !== "undefined";

// Web-based storage adapter using localStorage
class WebStorageAdapter {
  async getItem(key: string): Promise<string | null> {
    if (!isBrowser) return null;

    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.error("Failed to get item from localStorage", { key, error });
      return null;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    if (!isBrowser) return;

    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.error("Failed to set item in localStorage", { key, error });
    }
  }

  async removeItem(key: string): Promise<void> {
    if (!isBrowser) return;

    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error("Failed to remove item from localStorage", { key, error });
    }
  }
}

// Get environment variables
const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL!;
const supabasePubKey = import.meta.env.VITE_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!;

// Initialize Supabase client for web
const supabase = createClient(supabaseUrl, supabasePubKey, {
  auth: {
    storage: new WebStorageAdapter(),
    autoRefreshToken: true,
    persistSession: isBrowser,
    detectSessionInUrl: isBrowser,
  },
});

export default supabase;
