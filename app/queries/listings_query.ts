import { createQueryKeys } from "@lukemorales/query-key-factory";
import * as listingEvents from "../db_rpc/listings_rpc";

export const listings = createQueryKeys("listings", {
	// simple list with optional filters
	list: (
		p?: {
			p_address?: string;
			p_category?: any;
			p_min_price?: number;
			p_max_price?: number;
			p_limit?: number;
			p_offset?: number;
		}
	) => ({
		queryKey: ["list", p],
		queryFn: () =>
			listingEvents.listListings(
				p?.p_address,
				p?.p_category,
				p?.p_min_price,
				p?.p_max_price,
				p?.p_limit,
				p?.p_offset
			),
	}),

	own: () => ({
		queryKey: ["own"],
		queryFn: () => listingEvents.listOwnListings(),
	}),

	pending: () => ({
		queryKey: ["pending"],
		queryFn: () => listingEvents.listPendingListings(),
	}),

	adminStatus: () => ({
		queryKey: ["admin-status"],
		queryFn: () => listingEvents.currentUserIsAdmin(),
	}),

	// detail by id
	detailById: (id?: string) => ({
		queryKey: ["detail", id],
		queryFn: () => listingEvents.getListing(id ?? ""),
	}),

	// infinite pagination (pageParam used as offset)
	infiniteListings: (
		p?: { p_address?: string; p_category?: any; p_min_price?: number; p_max_price?: number; p_limit?: number }
	) => ({
		queryKey: ["infinite", p],
		queryFn: ({ pageParam }: { pageParam: number }) =>
			listingEvents.listListings(p?.p_address, p?.p_category, p?.p_min_price, p?.p_max_price, p?.p_limit, pageParam),
	}),
});