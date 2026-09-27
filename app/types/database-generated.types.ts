export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json | undefined }

export type Database = {
  public: {
    Tables: {
      user: {
        Row: Record<string, unknown>
        Insert: Record<string, unknown>
        Update: Record<string, unknown>
      }
    }
    Enums: {
      account_status: string
      record_status: string
      user_role: string
      listing_category: string
      reservation_status: string
      chat_type: string
      listing_moderation_status: string
    }
    Functions: Record<string, { Returns: unknown }>
  }
}
