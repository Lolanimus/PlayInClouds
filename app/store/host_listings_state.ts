import { create } from "zustand"

import type { ListingItem } from "@/components/listings"

type HostListingsState = {
  listings: ListingItem[]
  actions: {
    addListing: (listing: ListingItem) => void
    removeListing: (listingId: number) => void
  }
}

const useHostListingsStore = create<HostListingsState>((set) => ({
  listings: [],
  actions: {
    addListing: (listing) =>
      set((state) => ({
        listings: [listing, ...state.listings],
      })),
    removeListing: (listingId) =>
      set((state) => ({
        listings: state.listings.filter((listing) => listing.id !== listingId),
      })),
  },
}))

export const useHostListings = () => useHostListingsStore((state) => state.listings)
export const useHostListingsActions = () => useHostListingsStore((state) => state.actions)
