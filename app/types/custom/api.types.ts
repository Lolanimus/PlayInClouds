import type { Database } from "../database-generated.types";
import type { Writable } from "type-fest";

export type User = Omit<Database["public"]["Tables"]["user"]["Insert"], "id"> & { id?: string };
export type UserLogin = { email: string; password: string };
export type UserSignup = Writable<User & { password: string, confirmPassword: string }>;

// API return interfaces for RPC functions
export interface Listing {
	id: string;
	owner_id: string | null;
	lat: number;
	lng: number;
	address: string;
	title: string;
	subtitle: string;
	category: Database["public"]["Enums"]["listing_category"];
	price: number;
	images: string[];
	description: string;
	amenities: string[];
	rating_sum: number;
	average_rating: number;
	review_count: number;
	created_at: string;
	updated_at: string;
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