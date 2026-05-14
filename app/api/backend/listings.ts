import type { Database } from "@/types/database-generated.types";
import type { Listing, ListingModerationQueueItem } from "@/types/custom/api.types";
import type { Function } from "@/types/custom/rpc.types";
import {
  buildQueryString,
  getAccessToken,
  getOptionalAccessToken,
  requestBackend,
} from "./shared";

type ListingCategory = Database["public"]["Enums"]["listing_category"];
type CreateListingArgs = {
  p_lat: number;
  p_lng: number;
  p_address: string;
  p_title: string;
  p_subtitle: string;
  p_category: ListingCategory;
  p_price: number;
  p_images: string[];
  p_description: string;
  p_equipment_desc: string;
  p_conveniences_desc: string;
  p_area_m2: number;
  p_cancellation_policy_hours?: number | null;
  p_advance_notice_hours?: number | null;
  p_timezone?: string;
  p_host_confirmation_message?: string;
  p_rules?: string;
  p_instructions?: string;
};

export async function createListing(
  p_lat: number,
  p_lng: number,
  p_address: string,
  p_title: string,
  p_subtitle: string,
  p_category: ListingCategory,
  p_price: number,
  p_images: string[],
  p_description: string,
  p_equipment_desc: string,
  p_conveniences_desc: string,
  p_area_m2: number,
  p_cancellation_policy_hours?: number | null,
  p_advance_notice_hours?: number | null,
  p_timezone?: string,
  p_host_confirmation_message?: string,
  p_rules?: string,
  p_instructions?: string
): Promise<Listing> {
  const accessToken = await getAccessToken("You must be logged in to create a listing.");

  const payload = await requestBackend<{ listing: Listing }>({
    path: "/api/listings",
    method: "POST",
    accessToken,
    body: {
      p_lat,
      p_lng,
      p_address,
      p_title,
      p_subtitle,
      p_category,
      p_price,
      p_images,
      p_description,
      p_equipment_desc,
      p_conveniences_desc,
      p_area_m2,
      p_cancellation_policy_hours,
      p_advance_notice_hours,
      p_timezone,
      p_host_confirmation_message,
      p_rules,
      p_instructions,
    } satisfies CreateListingArgs,
    fallbackMessage: "Failed to create listing",
  });

  return payload.listing;
}

export async function getListing(p_id: string): Promise<Listing> {
  const accessToken = await getOptionalAccessToken();
  const payload = await requestBackend<{ listing: Listing }>({
    path: `/api/listings/${p_id}`,
    accessToken,
    fallbackMessage: "Failed to get listing",
  });

  return payload.listing;
}

export async function listListings(
  p_address: string | null = null,
  p_category: ListingCategory | null = null,
  p_min_price: number | null = null,
  p_max_price: number | null = null,
  p_limit = 50,
  p_offset = 0
): Promise<Listing[] | null> {
  const accessToken = await getOptionalAccessToken();
  const payload = await requestBackend<{ listings: Listing[] | null }>({
    path: `/api/listings${buildQueryString({
      p_address,
      p_category,
      p_min_price,
      p_max_price,
      p_limit,
      p_offset,
    })}`,
    accessToken,
    fallbackMessage: "Failed to list listings",
  });

  return payload.listings;
}

export async function listOwnListings(): Promise<Listing[] | null> {
  const accessToken = await getAccessToken("You must be logged in to view your listings.");
  const payload = await requestBackend<{ listings: Listing[] | null }>({
    path: "/api/listings/me",
    accessToken,
    fallbackMessage: "Failed to list your listings",
  });

  return payload.listings;
}

export async function listPendingListings(): Promise<ListingModerationQueueItem[] | null> {
  const accessToken = await getAccessToken("You must be logged in to view pending listings.");
  const payload = await requestBackend<{ listings: ListingModerationQueueItem[] | null }>({
    path: "/api/listings/moderation/pending",
    accessToken,
    fallbackMessage: "Failed to list pending listings",
  });

  return payload.listings;
}

export async function currentUserIsAdmin(): Promise<boolean | null> {
  const accessToken = await getAccessToken("You must be logged in to view admin status.");
  const payload = await requestBackend<{ isAdmin: boolean | null }>({
    path: "/api/listings/me/admin-status",
    accessToken,
    fallbackMessage: "Failed to get admin status",
  });

  return payload.isAdmin;
}

export async function deleteListing(p_id: string): Promise<boolean> {
  const accessToken = await getAccessToken("You must be logged in to delete a listing.");
  const payload = await requestBackend<{ deleted: boolean }>({
    path: `/api/listings/${p_id}`,
    method: "DELETE",
    accessToken,
    fallbackMessage: "Failed to delete listing",
  });

  return payload.deleted;
}

export async function approveListing(
  p_listing_id: string,
  p_message?: string | null
): Promise<Listing> {
  const accessToken = await getAccessToken("You must be logged in to approve a listing.");
  const payload = await requestBackend<{ listing: Listing }>({
    path: `/api/listings/${p_listing_id}/approve`,
    method: "POST",
    accessToken,
    body: { p_message },
    fallbackMessage: "Failed to approve listing",
  });

  return payload.listing;
}

export async function rejectListing(
  p_listing_id: string,
  p_message?: string | null
): Promise<Listing> {
  const accessToken = await getAccessToken("You must be logged in to reject a listing.");
  const payload = await requestBackend<{ listing: Listing }>({
    path: `/api/listings/${p_listing_id}/reject`,
    method: "POST",
    accessToken,
    body: { p_message },
    fallbackMessage: "Failed to reject listing",
  });

  return payload.listing;
}

export async function updateListing(
  args: Function<"update_listing">["Args"]
): Promise<Listing> {
  const accessToken = await getAccessToken("You must be logged in to update a listing.");

  const { p_id, ...body } = args;

  const payload = await requestBackend<{ listing: Listing }>({
    path: `/api/listings/${p_id}`,
    method: "PATCH",
    accessToken,
    body,
    fallbackMessage: "Failed to update listing",
  });

  return payload.listing;
}