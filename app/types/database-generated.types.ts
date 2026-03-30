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
      listings: {
        Row: {
          address: string
          amenities: string[]
          average_rating: number
          category: Database["public"]["Enums"]["listing_category"]
          created_at: string
          description: string
          id: string
          images: string[]
          lat: number
          lng: number
          owner_id: string
          price: number
          rating_sum: number
          review_count: number
          subtitle: string
          title: string
          updated_at: string
        }
        Insert: {
          address: string
          amenities: string[]
          average_rating?: number
          category: Database["public"]["Enums"]["listing_category"]
          created_at?: string
          description: string
          id?: string
          images: string[]
          lat: number
          lng: number
          owner_id: string
          price: number
          rating_sum?: number
          review_count?: number
          subtitle: string
          title: string
          updated_at?: string
        }
        Update: {
          address?: string
          amenities?: string[]
          average_rating?: number
          category?: Database["public"]["Enums"]["listing_category"]
          created_at?: string
          description?: string
          id?: string
          images?: string[]
          lat?: number
          lng?: number
          owner_id?: string
          price?: number
          rating_sum?: number
          review_count?: number
          subtitle?: string
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
      reviews: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          rating: number
          text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          rating: number
          text: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          rating?: number
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
          email: string | null
          first_name: string
          id: string
          inserted_at: string
          last_name: string
          phone_number: string | null
          updated_at: string
        }
        Insert: {
          email?: string | null
          first_name: string
          id: string
          inserted_at?: string
          last_name: string
          phone_number?: string | null
          updated_at?: string
        }
        Update: {
          email?: string | null
          first_name?: string
          id?: string
          inserted_at?: string
          last_name?: string
          phone_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_listing: {
        Args: {
          p_amenities: string[]
          p_address: string
          p_category: Database["public"]["Enums"]["listing_category"]
          p_description: string
          p_images: string[]
          p_lat: number
          p_lng: number
          p_price: number
          p_subtitle: string
          p_title: string
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
      delete_review: { Args: { p_id: string }; Returns: boolean }
      get_listing: { Args: { p_id: string }; Returns: Json }
      get_review: { Args: { p_id: string }; Returns: Json }
      get_user_id_by_username: {
        Args: { target_username: string }
        Returns: string
      }
      list_listings: {
        Args: {
          p_address: string | null
          p_category: Database["public"]["Enums"]["listing_category"] | null
          p_limit?: number
          p_max_price: number | null
          p_min_price: number | null
          p_offset?: number
        }
        Returns: Json[]
      }
      list_reviews: {
        Args: { p_limit?: number; p_listing_id: string | null; p_offset?: number }
        Returns: Json[]
      }
      update_listing: {
        Args: {
          p_amenities?: string[]
          p_address?: string
          p_category?: Database["public"]["Enums"]["listing_category"]
          p_description?: string
          p_id: string
          p_images?: string[]
          p_lat?: number
          p_lng?: number
          p_price?: number
          p_subtitle?: string
          p_title?: string
        }
        Returns: Json
      }
      update_review: {
        Args: { p_id: string; p_rating?: number; p_text?: string }
        Returns: Json
      }
    }
    Enums: {
      listing_category: "REHEARSAL_SPACE" | "RECORDING_STUDIO" | "OTHER"
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
      listing_category: ["REHEARSAL_SPACE", "RECORDING_STUDIO", "OTHER"],
    },
  },
} as const
