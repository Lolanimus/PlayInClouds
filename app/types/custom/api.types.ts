import type { Database } from "../database-generated.types";
import type { Writable } from "type-fest";

export type User = Omit<Database["public"]["Tables"]["user"]["Insert"], "id"> & { id?: string };
export type UserLogin = { email: string; password: string };
export type UserSignup = Writable<User & { password: string, confirmPassword: string }>;
export type AccountStatus = Database["public"]["Enums"]["account_status"];
export type RecordStatus = Database["public"]["Enums"]["record_status"];
export type UserRole = Database["public"]["Enums"]["user_role"];
export type ActorPermission = "listings.moderate" | "admin.access" | "support.access";

export interface ActorContextPayload {
	userId: string;
	email: string | null;
	accountStatus: AccountStatus;
	roles: UserRole[];
}

export interface EmailNotificationSettings {
	email_account_activity_enabled: boolean;
	email_listing_activity_enabled: boolean;
	email_reminders_enabled: boolean;
	email_messages_enabled: boolean;
}

export interface CurrentActor {
	userId: string;
	email: string | null;
	accountStatus: AccountStatus;
	roles: UserRole[];
	permissions: ActorPermission[];
	isAdmin: boolean;
}

export type ListingModerationStatus = "PENDING_APPROVAL" | "APPROVED" | "REJECTED";

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
	status: RecordStatus;
	cancellation_policy_hours: number | null;
	advance_notice_hours: number | null;
	rating_sum: number;
	average_rating: number;
	review_count: number;
	moderation_status: ListingModerationStatus;
	moderation_message: string | null;
	submitted_at: string;
	reviewed_at: string | null;
	reviewed_by: string | null;
	created_at: string;
	updated_at: string;
	/** Map of weekday (0=Sun..6=Sat) → sorted array of available hours */
	weekly_slots_by_day: Record<string, number[]>;
}

export interface ListingModerationQueueItem extends Listing {
	owner_name: string;
	owner_email: string | null;
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
	status: RecordStatus;
	text: string;
	created_at: string;
	updated_at: string;
}

export type ReservationReviewRole = "BOOKER_TO_HOST" | "HOST_TO_BOOKER";

export interface ReservationReview {
	id: string;
	reservation_id: string;
	listing_id: string;
	reviewer_user_id: string;
	reviewee_user_id: string;
	reviewer_role: ReservationReviewRole;
	rating: number;
	status: RecordStatus;
	text: string;
	created_at: string;
	updated_at: string;
}

export interface PendingReservationReview {
	reservation_id: string;
	listing_id: string;
	reviewer_role: ReservationReviewRole;
	reviewee_user_id: string;
	reviewee_display_name: string;
	start_at: string;
	end_at: string;
	expires_at: string;
}

export interface PublicProfileReview {
	id: string;
	reviewer_user_id: string;
	reviewer_name: string;
	reviewer_role: ReservationReviewRole;
	rating: number;
	text: string;
	created_at: string;
	listing_id: string | null;
	listing_title: string | null;
}

export interface PublicProfile {
	id: string;
	first_name: string;
	last_name: string;
	member_since: string;
	profile_role: string;
	years_hosting: number | null;
	id_verified: boolean;
	review_count: number;
	average_rating: number;
	guest_reviews_count: number;
	host_reviews_count: number;
	reviews: PublicProfileReview[];
}

export interface Notification {
	id: string;
	user_id: string;
	type: string;
	title: string;
	body: string | null;
	action_url: string | null;
	entity_type: string | null;
	entity_id: string | null;
	payload: JSON | null;
	is_read: boolean;
	read_at: string | null;
	status: RecordStatus;
	created_at: string;
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
	payment_deadline: string;
	host_preconfirmed_at: string | null;
	late_consent_given_at: string | null;
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
	status: RecordStatus;
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
	status: RecordStatus;
}

export interface Messages {
  messages: Message[];
  nextCursor: number | null;
}
