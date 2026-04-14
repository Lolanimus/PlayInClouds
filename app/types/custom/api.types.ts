import type { Database } from "../database-generated.types";
import type { Writable } from "type-fest";

export type User = Omit<Database["public"]["Tables"]["user"]["Insert"], "id"> & { id?: string };
export type UserLogin = { email: string; password: string };
export type UserSignup = Writable<User & { password: string, confirmPassword: string }>;

export interface Listing {
	id: string;
	owner_id: string | null;
	lat: number;
	lng: number;
	timezone: string;
	address: string;
	title: string;
	subtitle: string;
	rules: string;
	instructions: string;
	host_confirmation_message: string;
	category: Database["public"]["Enums"]["listing_category"];
	price: number;
	images: string[];
	description: string;
	equipment_desc: string;
	conveniences_desc: string;
	area_m2: number;
	cancellation_policy_hours: number | null;
	advance_notice_hours: number | null;
	rating_sum: number;
	average_rating: number;
	review_count: number;
	created_at: string;
	updated_at: string;
}

export interface ListingBookingPolicy {
	listing_id: string;
	instant_booking: boolean;
	min_past_bookings: number | null;
	min_reviews: number | null;
	require_id_verified: boolean;
	extra_rules: Record<string, unknown>;
	created_at?: string;
	updated_at?: string;
}

export interface Review {
	id: string;
	listing_id: string;
	user_id: string;
	rating: number;
	text: string;
	created_at: string;
	updated_at: string;
}

export interface ListingHourSlot {
	date: string;
	hour: number;
	price: number | null;
	is_booked: boolean;
	is_booking_restricted?: boolean;
}

export interface Reservation {
	id: string;
	listing_id: string;
	renter_id: string;
	start_at: string;
	end_at: string;
	status: Database["public"]["Enums"]["reservation_status"];
	total_price: number;
	guests: number;
	created_at: string;
	updated_at: string;
}

export interface ChatParticipantProfile {
	id: string;
	first_name: string | null;
	last_name: string | null;
}

export interface Chat {
  id: string;
  chat_type: Database["public"]["Enums"]["chat_type"];
	listing_id: string | null;
	metadata: JSON | null;
	participants?: ChatParticipantProfile[] | null;
	participant_ids?: string[] | null;
	updated_at?: string | null;
}

export interface Message {
  id: string;
  sender_id: string;
  chat_id: string;
  contents: string;
  created_at: Date;
  metadata: JSON;
}

export interface Messages {
  messages: Message[];
  nextCursor: number | null;
}