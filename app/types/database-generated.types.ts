export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      chat_messages: {
        Row: {
          chat_id: string
          contents: string
          created_at: string
          id: string
          metadata: Json | null
          sender_id: string
          status: Database["public"]["Enums"]["record_status"]
        }
        Insert: {
          chat_id: string
          contents: string
          created_at?: string
          id?: string
          metadata?: Json | null
          sender_id: string
          status?: Database["public"]["Enums"]["record_status"]
        }
        Update: {
          chat_id?: string
          contents?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          sender_id?: string
          status?: Database["public"]["Enums"]["record_status"]
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_participants: {
        Row: {
          chat_id: string
          metadata: Json
          participant_id: string
        }
        Insert: {
          chat_id: string
          metadata: Json
          participant_id: string
        }
        Update: {
          chat_id?: string
          metadata?: Json
          participant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_participants_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_participants_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      chats: {
        Row: {
          chat_type: Database["public"]["Enums"]["chat_type"]
          id: string
          metadata: Json | null
          status: Database["public"]["Enums"]["record_status"]
        }
        Insert: {
          chat_type: Database["public"]["Enums"]["chat_type"]
          id?: string
          metadata?: Json | null
          status?: Database["public"]["Enums"]["record_status"]
        }
        Update: {
          chat_type?: Database["public"]["Enums"]["chat_type"]
          id?: string
          metadata?: Json | null
          status?: Database["public"]["Enums"]["record_status"]
        }
        Relationships: []
      }
      listing_booking_policies: {
        Row: {
          created_at: string
          extra_rules: Json
          instant_booking: boolean
          listing_id: string
          min_past_bookings: number | null
          min_reviews: number | null
          require_id_verified: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          extra_rules?: Json
          instant_booking?: boolean
          listing_id: string
          min_past_bookings?: number | null
          min_reviews?: number | null
          require_id_verified?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          extra_rules?: Json
          instant_booking?: boolean
          listing_id?: string
          min_past_bookings?: number | null
          min_reviews?: number | null
          require_id_verified?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_booking_policies_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: true
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_weekly_slots: {
        Row: {
          created_at: string
          hour: number
          id: string
          listing_id: string
          price: number
          updated_at: string
          weekday: number
        }
        Insert: {
          created_at?: string
          hour: number
          id?: string
          listing_id: string
          price: number
          updated_at?: string
          weekday: number
        }
        Update: {
          created_at?: string
          hour?: number
          id?: string
          listing_id?: string
          price?: number
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "listing_weekly_slots_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          address: string
          advance_notice_hours: number | null
          area_m2: number
          average_rating: number
          cancellation_policy_hours: number | null
          category: Database["public"]["Enums"]["listing_category"]
          conveniences_desc: string
          created_at: string
          description: string
          equipment_desc: string
          instructions: string
          id: string
          images: string[]
          lat: number
          lng: number
          owner_id: string
          price: number
          rating_sum: number
          review_count: number
          rules: string
          status: Database["public"]["Enums"]["record_status"]
          subtitle: string
          timezone: string
          title: string
          updated_at: string
        }
        Insert: {
          address: string
          advance_notice_hours?: number | null
          area_m2?: number
          average_rating?: number
          cancellation_policy_hours?: number | null
          category: Database["public"]["Enums"]["listing_category"]
          conveniences_desc?: string
          created_at?: string
          description: string
          equipment_desc?: string
          instructions?: string
          id?: string
          images: string[]
          lat: number
          lng: number
          owner_id: string
          price: number
          rating_sum?: number
          review_count?: number
          rules?: string
          status?: Database["public"]["Enums"]["record_status"]
          subtitle: string
          timezone?: string
          title: string
          updated_at?: string
        }
        Update: {
          address?: string
          advance_notice_hours?: number | null
          area_m2?: number
          average_rating?: number
          cancellation_policy_hours?: number | null
          category?: Database["public"]["Enums"]["listing_category"]
          conveniences_desc?: string
          created_at?: string
          description?: string
          equipment_desc?: string
          instructions?: string
          id?: string
          images?: string[]
          lat?: number
          lng?: number
          owner_id?: string
          price?: number
          rating_sum?: number
          review_count?: number
          rules?: string
          status?: Database["public"]["Enums"]["record_status"]
          subtitle?: string
          timezone?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_listing_owner"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      reservations: {
        Row: {
          created_at: string
          end_at: string
          guests: number
          id: string
          listing_id: string
          renter_id: string
          start_at: string
          status: Database["public"]["Enums"]["reservation_status"]
          total_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_at: string
          guests?: number
          id?: string
          listing_id: string
          renter_id: string
          start_at: string
          status?: Database["public"]["Enums"]["reservation_status"]
          total_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_at?: string
          guests?: number
          id?: string
          listing_id?: string
          renter_id?: string
          start_at?: string
          status?: Database["public"]["Enums"]["reservation_status"]
          total_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_renter_id_fkey"
            columns: ["renter_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          rating: number
          status: Database["public"]["Enums"]["record_status"]
          text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          rating: number
          status?: Database["public"]["Enums"]["record_status"]
          text: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          rating?: number
          status?: Database["public"]["Enums"]["record_status"]
          text?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_listing"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_user"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      user: {
        Row: {
          account_status: Database["public"]["Enums"]["account_status"]
          email: string | null
          first_name: string
          id: string
          id_verified_at: string | null
          inserted_at: string
          last_name: string
          phone_number: string | null
          updated_at: string
        }
        Insert: {
          account_status?: Database["public"]["Enums"]["account_status"]
          email?: string | null
          first_name: string
          id: string
          id_verified_at?: string | null
          inserted_at?: string
          last_name: string
          phone_number?: string | null
          updated_at?: string
        }
        Update: {
          account_status?: Database["public"]["Enums"]["account_status"]
          email?: string | null
          first_name?: string
          id?: string
          id_verified_at?: string | null
          inserted_at?: string
          last_name?: string
          phone_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assert_valid_timezone: { Args: { p_timezone: string }; Returns: string }
      calculate_advance_notice_start_at: {
        Args: {
          p_advance_notice_hours: number
          p_reference_at?: string
          p_timezone: string
        }
        Returns: string
      }
      calculate_minimum_advance_booking_start_at: {
        Args: {
          p_minimum_advance_booking_hours: number
          p_reference_at?: string
          p_timezone: string
        }
        Returns: string
      }
      cancel_reservation: { Args: { p_reservation_id: string }; Returns: Json }
      confirm_reservation: { Args: { p_reservation_id: string }; Returns: Json }
      create_direct_chat: { Args: { target_user_id: string }; Returns: Json }
      create_listing:
        | {
            Args: {
              p_address: string
              p_area_m2: number
              p_category: Database["public"]["Enums"]["listing_category"]
              p_conveniences_desc: string
              p_description: string
              p_equipment_desc: string
              p_images: string[]
              p_instructions?: string
              p_lat: number
              p_lng: number
              p_price: number
              p_rules?: string
              p_subtitle: string
              p_title: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_address: string
              p_advance_notice_hours?: number | null
              p_area_m2: number
              p_cancellation_policy_hours?: number | null
              p_category: Database["public"]["Enums"]["listing_category"]
              p_conveniences_desc: string
              p_description: string
              p_equipment_desc: string
              p_images: string[]
              p_instructions?: string
              p_lat: number
              p_lng: number
              p_price: number
              p_rules?: string
              p_subtitle: string
              p_timezone?: string
              p_title: string
            }
            Returns: Json
          }
      create_message: {
        Args: { p_chat_id: string; p_contents: string }
        Returns: Json
      }
      create_reservation: {
        Args: {
          p_end_at: string
          p_guests?: number
          p_listing_id: string
          p_start_at: string
        }
        Returns: Json
      }
      create_review: {
        Args: {
          p_listing_id: string
          p_rating: number
          p_text: string
          p_user_id: string
        }
        Returns: Json
      }
      delete_listing: { Args: { p_id: string }; Returns: boolean }
      delete_messages: { Args: { msg_ids: string[] }; Returns: boolean }
      delete_review: { Args: { p_id: string }; Returns: boolean }
      get_client_chats: { Args: never; Returns: Json }
      get_direct_chat_by_user_id: {
        Args: { target_user_id: string }
        Returns: Json
      }
      get_listing: { Args: { p_id: string }; Returns: Json }
      get_listing_booking_policy: {
        Args: { p_listing_id: string }
        Returns: Json
      }
      get_messages: {
        Args: { p_chat_id: string; p_cursor?: number; p_limit?: number }
        Returns: Json
      }
      get_reservation: { Args: { p_reservation_id: string }; Returns: Json }
      get_review: { Args: { p_id: string }; Returns: Json }
      list_host_monthly_reservations: {
        Args: { p_host_id?: string; p_month?: number }
        Returns: Json[]
      }
      list_listing_month_slots: {
        Args: { p_listing_id: string; p_month: string }
        Returns: Json[]
      }
      list_listing_week_slots: {
        Args: { p_listing_id: string; p_week: string }
        Returns: Json[]
      }
      list_listings: {
        Args: {
          p_address: string
          p_category: Database["public"]["Enums"]["listing_category"]
          p_limit?: number
          p_max_price: number
          p_min_price: number
          p_offset?: number
        }
        Returns: Json[]
      }
      list_reviews: {
        Args: { p_limit?: number; p_listing_id: string; p_offset?: number }
        Returns: Json[]
      }
      list_user_active_reservations: {
        Args: { p_renter_id?: string }
        Returns: Json[]
      }
      list_user_future_reservations: {
        Args: { p_renter_id?: string }
        Returns: Json[]
      }
      set_listing_weekly_slots:
        | {
            Args: { p_listing_id: string; p_slot_prices: number[] }
            Returns: Json
          }
        | { Args: { p_listing_id: string; p_slots: Json }; Returns: Json }
      update_listing:
        | {
            Args: {
              p_address?: string
              p_area_m2?: number
              p_category?: Database["public"]["Enums"]["listing_category"]
              p_conveniences_desc?: string
              p_description?: string
              p_equipment_desc?: string
              p_id: string
              p_images?: string[]
              p_instructions?: string
              p_lat?: number
              p_lng?: number
              p_price?: number
              p_rules?: string
              p_subtitle?: string
              p_title?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_address?: string
              p_advance_notice_hours?: number
              p_area_m2?: number
              p_cancellation_policy_hours?: number
              p_category?: Database["public"]["Enums"]["listing_category"]
              p_conveniences_desc?: string
              p_description?: string
              p_equipment_desc?: string
              p_id: string
              p_images?: string[]
              p_instructions?: string
              p_lat?: number
              p_lng?: number
              p_price?: number
              p_rules?: string
              p_subtitle?: string
              p_timezone?: string
              p_title?: string
            }
            Returns: Json
          }
      update_review: {
        Args: { p_id: string; p_rating?: number; p_text?: string }
        Returns: Json
      }
      upsert_listing_booking_policy: {
        Args: { p_listing_id: string; p_policy?: Json }
        Returns: Json
      }
      upsert_listing_weekly_slot: {
        Args: {
          p_hour: number
          p_listing_id: string
          p_price: number
          p_weekday: number
        }
        Returns: Json
      }
    }
    Enums: {
      account_status: "ACTIVE" | "SUSPENDED" | "DELETED"
      chat_type: "DIRECT" | "GROUP" | "SELF"
      listing_category: "REHEARSAL_SPACE" | "RECORDING_STUDIO" | "OTHER"
      record_status: "ACTIVE" | "DELETED"
      realtime_events: "chats_update"
      reservation_status: "PENDING" | "CONFIRMED" | "CANCELLED"
      user_role: "USER" | "ADMIN" | "MODERATOR" | "SUPPORT"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_status: ["ACTIVE", "SUSPENDED", "DELETED"],
      chat_type: ["DIRECT", "GROUP", "SELF"],
      listing_category: ["REHEARSAL_SPACE", "RECORDING_STUDIO", "OTHER"],
      record_status: ["ACTIVE", "DELETED"],
      realtime_events: ["chats_update"],
      reservation_status: ["PENDING", "CONFIRMED", "CANCELLED"],
      user_role: ["USER", "ADMIN", "MODERATOR", "SUPPORT"],
    },
  },
} as const
