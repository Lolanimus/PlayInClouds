import type { Database as DatabaseGenerated, Json } from "../database-generated.types";
import type { MergeDeep } from "type-fest";
import type { Chat, Listing, ListingBookingPolicy, ListingHourSlot, Message, Messages, Reservation, Review } from "./api.types";

export type Database = MergeDeep<
  DatabaseGenerated,
  {
    public: {
      Functions: {
        assert_valid_timezone: {
          Returns: string
        }
        calculate_advance_notice_start_at: {
          Returns: string
        }
        calculate_minimum_advance_booking_start_at: {
          Returns: string
        }
        cancel_reservation: {
          Returns: Reservation
        }
        confirm_reservation: {
          Returns: Reservation
        }
        create_direct_chat: {
          Returns: Chat
        }
        create_listing: {
          Args: {
            p_address: string
            p_advance_notice_hours?: number | null
            p_area_m2: number
            p_cancellation_policy_hours?: number | null
            p_category: Listing["category"]
            p_conveniences_desc: string
            p_description: string
            p_equipment_desc: string
            p_host_confirmation_message?: string
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
          Returns: Listing
        }
        create_message: {
          Returns: Message
        }
        create_reservation: {
          Returns: Reservation
        }
        create_review: {
          Returns: Review
        }
        delete_listing: {
          Returns: boolean 
        }
        delete_chat: {
          Returns: boolean
        }
        delete_messages: {
          Returns: boolean
        }
        delete_review: {
          Returns: boolean 
        }
        get_client_chats: {
          Returns: Chat[]
        }
        get_direct_chat_by_user_id: {
          Returns: Chat
        }
        get_listing: {
          Returns: Listing 
        }
        get_listing_booking_policy: {
          Returns: ListingBookingPolicy
        }
        get_messages: {
          Returns: Messages
        }
        get_reservation: {
          Returns: Reservation
        }
        get_review: {
          Returns: Review 
        }
        list_listing_month_slots: {
          Returns: ListingHourSlot[]
        }
        list_listing_week_slots: {
          Returns: ListingHourSlot[]
        }
        list_host_monthly_reservations: {
          Returns: Reservation[]
        }
        list_user_active_reservations: {
          Returns: Reservation[]
        }
        list_user_future_reservations: {
          Returns: Reservation[]
        }
        list_listings: {
          Returns: Listing[]
        }
        list_reviews: {
          Returns: Review[]
        }
        set_listing_weekly_slots: {
          Returns: ListingHourSlot[]
        }
        update_listing: {
          Args: {
            p_address?: string
            p_advance_notice_hours?: number | null
            p_area_m2?: number
            p_cancellation_policy_hours?: number | null
            p_category?: Listing["category"]
            p_conveniences_desc?: string
            p_description?: string
            p_equipment_desc?: string
            p_host_confirmation_message?: string | null
            p_id: string
            p_images?: string[]
            p_instructions?: string | null
            p_lat?: number
            p_lng?: number
            p_price?: number
            p_rules?: string | null
            p_subtitle?: string
            p_timezone?: string
            p_title?: string
          }
          Returns: Listing
        }
        update_review: {
          Returns: Review
        }
        upsert_listing_booking_policy: {
          Returns: ListingBookingPolicy
        }
        upsert_listing_weekly_slot: {
          Returns: ListingHourSlot
        }
      }
    };
  }
>;

export type Functions = Database["public"]["Functions"];
export type Function<T extends keyof Functions> = Functions[T];
