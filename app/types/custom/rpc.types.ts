import type { Database as DatabaseGenerated, Json } from "../database-generated.types";
import type { MergeDeep } from "type-fest";
import type { ActorContextPayload, Chat, Listing, ListingBookingPolicy, ListingHourSlot, ListingModerationQueueItem, Message, Messages, Notification, PendingReservationReview, PublicProfile, Reservation, ReservationReview, Review } from "./api.types";

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
          Returns: Listing
        }
        create_message: {
          Returns: Message
        }
        create_reservation: {
          Returns: Reservation
        }
        create_reservation_review: {
          Returns: ReservationReview
        }
        update_reservation_review: {
          Returns: ReservationReview
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
        get_client_chats: {
          Returns: Chat[]
        }
        get_direct_chat_by_user_id: {
          Returns: Chat
        }
        current_user_is_admin: {
          Returns: boolean
        }
        get_actor_context_by_user_id: {
          Returns: ActorContextPayload | null
        }
        get_listing: {
          Returns: Listing 
        }
        get_public_profile: {
          Returns: PublicProfile
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
        list_listing_month_slots: {
          Returns: ListingHourSlot[]
        }
        list_listing_week_slots: {
          Returns: ListingHourSlot[]
        }
        list_own_listings: {
          Returns: Listing[]
        }
        list_pending_listings: {
          Returns: ListingModerationQueueItem[]
        }
        list_pending_reservation_reviews: {
          Returns: PendingReservationReview[]
        }
        list_host_monthly_reservations: {
          Returns: Reservation[]
        }
        list_user_active_reservations: {
          Returns: Reservation[]
        }
        count_user_past_reservations: {
          Returns: number
        }
        count_unread_notifications: {
          Returns: number
        }
        list_user_past_reservations: {
          Returns: Reservation[]
        }
        list_user_future_reservations: {
          Returns: Reservation[]
        }
        list_listings: {
          Returns: Listing[]
        }
        list_notifications: {
          Returns: Notification[]
        }
        list_reviews: {
          Returns: Review[]
        }
        mark_all_notifications_read: {
          Returns: number
        }
        mark_notification_read: {
          Returns: Notification
        }
        approve_listing: {
          Returns: Listing
        }
        reject_listing: {
          Returns: Listing
        }
        set_listing_weekly_slots: {
          Returns: ListingHourSlot[]
        }
        update_listing: {
          Returns: Listing
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
