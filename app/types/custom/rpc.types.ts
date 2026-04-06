import type { Database as DatabaseGenerated } from "../database-generated.types";
import type { MergeDeep } from "type-fest";
import type { Listing, ListingHourSlot, Reservation, Review } from "./api.types";

export type Database = MergeDeep<
  DatabaseGenerated,
  {
    public: {
      Functions: {
        create_listing: {
          Returns: Listing
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
        delete_review: {
          Returns: boolean 
        }
        get_listing: {
          Returns: Listing 
        }
        get_reservation: {
          Returns: Reservation
        }
        get_review: {
          Returns: Review 
        }
        get_user_id_by_username: {
          Returns: string
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
          Returns: Listing
        }
        update_review: {
          Returns: Review
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
