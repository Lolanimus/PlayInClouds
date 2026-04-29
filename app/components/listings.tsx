"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, Image, Star, X } from "lucide-react"
import { useNavigate } from "react-router"
import { useListings } from "@/hooks/useListings"
import { cn, formatListingCategory } from "@/lib/utils"
import { useSearchStore } from "@/store/search-store"
import { useHostListings } from "@/store/host_listings_state"
import type { Listing as ApiListing } from "@/types/custom/api.types"

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_PUBLIC_GOOGLE_MAPS_API_KEY as string | undefined

export type ListingItem = {
  id: number | string
  lat: number
  lng: number
  address: string
  title: string
  subtitle: string
  category: string
  price: string
  distance: string
  rating: number
  reviews: number
  images: string[]
  description?: string
  equipmentDesc?: string
  conveniencesDesc?: string
  areaM2?: number
  advanceNoticeHours?: number | null
  weeklySlotsByDay?: Record<string, number[]>
}

export function ListingCard({
  listing,
  onClose,
  onClick,
  distanceLabel,
  className
}: {
  listing: ListingItem
  onClose?: () => void
  onClick?: () => void
  distanceLabel?: string | null
  className?: string | null
}) {
  const [activeImageIndex, setActiveImageIndex] = useState(0)

  const hasMultipleImages = listing.images.length > 1
  const activeImage = listing.images[activeImageIndex]

  const showPrevImage = () => {
    setActiveImageIndex((prev) =>
      prev === 0 ? listing.images.length - 1 : prev - 1
    )
  }

  const showNextImage = () => {
    setActiveImageIndex((prev) =>
      prev === listing.images.length - 1 ? 0 : prev + 1
    )
  }

  return (
    <div
      onClick={onClick}
      className={cn(
        "relative overflow-hidden rounded-xl bg-[#ffffff] shadow-sm transition-shadow cursor-pointer hover:shadow-md",
        className
      )}
    >
      {onClose && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          aria-label="Close listing card"
          className="absolute right-2 top-2 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-[#ffffff] text-[#000000] shadow-sm hover:bg-[#f5f5f5]"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      <div className="relative aspect-[4/3]">
        {activeImage ? (
          <img
            src={activeImage}
            alt={listing.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[#efefef] text-[#9a9a9a]">
            <Image className="h-6 w-6" />
          </div>
        )}
        {hasMultipleImages && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation()
                showPrevImage()
              }}
              aria-label="Previous photo"
              className="absolute left-2 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-[#ffffff] text-[#000000] shadow-sm hover:bg-[#f5f5f5]"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation()
                showNextImage()
              }}
              aria-label="Next photo"
              className="absolute right-2 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-[#ffffff] text-[#000000] shadow-sm hover:bg-[#f5f5f5]"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}
        {hasMultipleImages && (
          <div className="absolute bottom-2 left-2 flex gap-1">
            {listing.images.map((_, idx) => (
              <div
                key={idx}
                className={`w-1.5 h-1.5 rounded-full ${
                  idx === activeImageIndex ? "bg-[#ffffff]" : "bg-[#ffffff]/50"
                }`}
              />
            ))}
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-medium text-[#000000] truncate pr-2">
            {listing.title}
          </h3>
          {listing.reviews > 0 ? (
            <div className="flex items-center gap-1 flex-shrink-0">
              <Star className="h-3 w-3 fill-[#000000] text-[#000000]" />
              <span className="text-xs text-[#000000]">
                {listing.rating} ({listing.reviews})
              </span>
            </div>
          ) : null}
        </div>
        <p className="text-xs text-[#6a6a6a] mb-1 truncate">{listing.subtitle}</p>
        <p className="text-xs text-[#6a6a6a] mb-2 truncate">{formatListingCategory(listing.category)}</p>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-[#000000]">{listing.price}</span>
          {distanceLabel ? (
            <span className="text-xs text-[#6a6a6a]">{distanceLabel}</span>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export function Listings() {
  const navigate = useNavigate()
  const hostListings = useHostListings()
  const listingsQuery = useListings()
  const whereValue = useSearchStore((state) => state.where)
  const dbListings = useMemo(() => {
    const rows = (listingsQuery.data as ApiListing[] | null) ?? []

    return rows.map<ListingItem>((item) => ({
      id: item.id,
      lat: item.lat,
      lng: item.lng,
      address: item.address,
      title: item.title,
      subtitle: item.subtitle,
      category: item.category,
      price: `$${item.price} CAD/hour`,
      distance: "",
      rating: item.average_rating,
      reviews: item.review_count,
      images: item.images ?? [],
      description: item.description,
      equipmentDesc: item.equipment_desc,
      conveniencesDesc: item.conveniences_desc,
      areaM2: item.area_m2,
      advanceNoticeHours: item.advance_notice_hours,
      weeklySlotsByDay: item.weekly_slots_by_day ?? {},
    }))
  }, [listingsQuery.data])
  const allListings = dbListings.length > 0 ? dbListings : hostListings

  const priceMaxParam = useSearchStore((state) => state.priceMax)
  const distanceMaxParam = useSearchStore((state) => state.distanceMax)
  const selectedDateParam = useSearchStore((state) => state.date)
  const selectedStartParam = useSearchStore((state) => state.startHour)
  const selectedDurationParam = useSearchStore((state) => state.duration)
  const [searchCoords, setSearchCoords] = useState<{ lat: number; lng: number } | null>(null)
  const whereQuery = whereValue.trim().toLowerCase()
  const hasSelectedSlot =
    selectedDateParam &&
    selectedStartParam !== null &&
    selectedStartParam >= 0 &&
    selectedStartParam <= 23 &&
    selectedDurationParam >= 1 &&
    selectedDurationParam <= 12

  useEffect(() => {
    const where = whereValue.trim()
    if (!where || !GOOGLE_MAPS_API_KEY) {
      setSearchCoords(null)
      return
    }

    const controller = new AbortController()

    const resolveSearchCoords = async () => {
      try {
        const response = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(where)}&key=${GOOGLE_MAPS_API_KEY}`,
          { signal: controller.signal }
        )

        if (!response.ok) {
          setSearchCoords(null)
          return
        }

        const data = (await response.json()) as {
          results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>
        }

        const lat = data.results?.[0]?.geometry?.location?.lat
        const lng = data.results?.[0]?.geometry?.location?.lng

        if (typeof lat !== "number" || typeof lng !== "number") {
          setSearchCoords(null)
          return
        }

        setSearchCoords({ lat, lng })
      } catch {
        setSearchCoords(null)
      }
    }

    resolveSearchCoords()

    return () => {
      controller.abort()
    }
  }, [whereValue])

  const parseListingPrice = (value: string) => {
    const match = value.match(/\$\s*(\d+(?:\.\d+)?)/)
    if (!match) return Number.POSITIVE_INFINITY
    return Number(match[1])
  }
  const parseListingDistance = (value: string) => {
    const match = value.match(/(\d+(?:\.\d+)?)\s*km/i)
    if (!match) return Number.POSITIVE_INFINITY
    return Number(match[1])
  }

  const toRadians = (value: number) => (value * Math.PI) / 180
  const getDistanceKm = (from: { lat: number; lng: number }, to: { lat: number; lng: number }) => {
    const earthRadiusKm = 6371
    const deltaLat = toRadians(to.lat - from.lat)
    const deltaLng = toRadians(to.lng - from.lng)

    const a =
      Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
      Math.cos(toRadians(from.lat)) *
        Math.cos(toRadians(to.lat)) *
        Math.sin(deltaLng / 2) *
        Math.sin(deltaLng / 2)

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return earthRadiusKm * c
  }

  const getFilterDistanceKm = (listing: ListingItem) => {
    if (searchCoords) {
      return getDistanceKm(searchCoords, { lat: listing.lat, lng: listing.lng })
    }

    return parseListingDistance(listing.distance)
  }

  const matchesWhereFilter = (listing: ListingItem) => {
    if (!whereQuery) return true

    const matchesText = [listing.title, listing.subtitle, listing.category, listing.address]
      .join(" ")
      .toLowerCase()
      .includes(whereQuery)

    if (matchesText) return true
    if (!searchCoords) return false

    const distanceKm = getDistanceKm(searchCoords, { lat: listing.lat, lng: listing.lng })
    if (!Number.isFinite(distanceKm)) return false

    return distanceKm <= distanceMaxParam
  }

  const filteredListings = allListings
    .filter(matchesWhereFilter)
    .filter((listing) => {
      if (!Number.isFinite(priceMaxParam) || priceMaxParam <= 0) return true
      return parseListingPrice(listing.price) <= priceMaxParam
    })
    .filter((listing) => {
      if (!Number.isFinite(distanceMaxParam) || distanceMaxParam < 0) return true

      const distanceKm = getFilterDistanceKm(listing)
      if (!Number.isFinite(distanceKm)) return false
      return distanceKm <= distanceMaxParam
    })

  const isAvailableInSelectedSlot = (listing: ListingItem) => {
    if (!hasSelectedSlot || !selectedDateParam || selectedStartParam === null) return false

    const slots = listing.weeklySlotsByDay
    if (!slots || Object.keys(slots).length === 0) return false

    const selectedDay = selectedDateParam.getDay()
    const hoursForDay = slots[String(selectedDay)]
    if (!hoursForDay || hoursForDay.length === 0) return false

    // Every hour in [requestedStart, requestedStart + duration) must be a configured slot
    for (let h = selectedStartParam; h < selectedStartParam + selectedDurationParam; h++) {
      if (!hoursForDay.includes(h)) return false
    }
    return true
  }

  const availableNowListings = hasSelectedSlot
    ? filteredListings.filter(isAvailableInSelectedSlot)
    : filteredListings
  const availableOtherTimeListings = hasSelectedSlot
    ? filteredListings.filter((listing) => !isAvailableInSelectedSlot(listing))
    : []

  return (
    <div className="p-4 overflow-y-auto space-y-4">
      {listingsQuery.isLoading && (
        <div className="rounded-xl border border-[#e9e9e9] bg-[#ffffff] p-3 text-sm text-[#6a6a6a]">
          Loading listings...
        </div>
      )}

      {listingsQuery.isError && (
        <div className="rounded-xl border border-[#f1c3bd] bg-[#fff3f2] p-3 text-sm text-[#b42318]">
          Could not load listings from database.
        </div>
      )}

      {hasSelectedSlot && availableNowListings.length > 0 && (
        <div className="rounded-xl border border-[#0f6130] bg-[#eaf8ef] p-3">
          <p className="text-sm font-medium text-[#000000]">Available at your selected day & time</p>
          <p className="text-xs text-[#6a6a6a] mt-1">Listings below are available first. Then we show options available at other times.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {availableNowListings.map((listing) => (
          <ListingCard
            key={String(listing.id)}
            listing={listing}
            onClick={() => navigate(`/listing/${listing.id}`)}
          />
        ))}
      </div>

      {hasSelectedSlot && availableOtherTimeListings.length > 0 && (
        <>
          <div className="rounded-xl border border-[#000000] bg-[#efefef] p-3">
            <p className="text-sm font-medium text-[#000000]">Available at other times</p>
            <p className="text-xs text-[#4a4a4a] mt-1">These listings are not available for your selected slot, but are available at a different time.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {availableOtherTimeListings.map((listing) => (
              <ListingCard
                key={String(listing.id)}
                listing={listing}
                onClick={() => navigate(`/listing/${listing.id}`)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
