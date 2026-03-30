"use client"

import { useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, Image, Star, X } from "lucide-react"
import { useNavigate } from "react-router"
import { useListings } from "@/hooks/useListings"
import { useSearchStore } from "@/store/search-store"
import { useHostListings } from "@/store/host_listings_state"
import { listingAvailability, listingBookedHours } from "@/lib/listing-availability"
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
  amenities?: string[]
}

export const listings: ListingItem[] = [
  {
    id: 1,
    lat: 40.7484,
    lng: -73.9967,
    address: "New York, NY, USA",
    title: "Rehearsal Space in Fashion District",
    subtitle: "Full Service • Fashion District • Manhattan",
    category: "Rehearsals, Film/Photo, Meetups",
    price: "$30 CAD/hour",
    distance: "1 km away",
    rating: 5.0,
    reviews: 9,
    images: [
      "https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&h=300&fit=crop",
      "https://images.unsplash.com/photo-1497366412874-3415097a27e7?w=400&h=300&fit=crop",
    ],
  },
  {
    id: 2,
    lat: 40.7508,
    lng: -73.9935,
    address: "New York, NY, USA",
    title: "Rehearsal Space in Fashion District",
    subtitle: "Full Service • Fashion District • Manhattan",
    category: "Rehearsals, Film/Photo, Meetups",
    price: "$25 CAD/hour",
    distance: "1 km away",
    rating: 5.0,
    reviews: 9,
    images: [
      "https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=400&h=300&fit=crop",
      "https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=400&h=300&fit=crop",
    ],
  },
  {
    id: 3,
    lat: 40.752,
    lng: -73.989,
    address: "New York, NY, USA",
    title: "Creative Studio Space",
    subtitle: "Modern • Downtown • Manhattan",
    category: "Workshops, Events, Meetings",
    price: "$45 CAD/hour",
    distance: "2 km away",
    rating: 4.8,
    reviews: 12,
    images: [
      "https://images.unsplash.com/photo-1524758631624-e2822e304c36?w=400&h=300&fit=crop",
    ],
  },
  {
    id: 4,
    lat: 40.7545,
    lng: -73.9845,
    address: "New York, NY, USA",
    title: "Cozy Meeting Room",
    subtitle: "Private • Midtown • Manhattan",
    category: "Meetings, Interviews",
    price: "$20 CAD/hour",
    distance: "0.5 km away",
    rating: 4.9,
    reviews: 24,
    images: [
      "https://images.unsplash.com/photo-1497215842964-222b430dc094?w=400&h=300&fit=crop",
    ],
  },
  {
    id: 5,
    lat: 40.7468,
    lng: -74.0014,
    address: "New York, NY, USA",
    title: "Industrial Loft Rehearsal Room",
    subtitle: "Open Layout • SoHo • Manhattan",
    category: "Rehearsals, Workshops, Recording",
    price: "$38 CAD/hour",
    distance: "1.8 km away",
    rating: 4.7,
    reviews: 18,
    images: [
      "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=400&h=300&fit=crop",
      "https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=400&h=300&fit=crop",
    ],
  },
  {
    id: 6,
    lat: 40.7489,
    lng: -73.9993,
    address: "New York, NY, USA",
    title: "Minimalist Creative Hub",
    subtitle: "Bright Space • Chelsea • Manhattan",
    category: "Content, Meetings, Events",
    price: "$42 CAD/hour",
    distance: "2.4 km away",
    rating: 4.9,
    reviews: 31,
    images: [
      "https://images.unsplash.com/photo-1497215728101-856f4ea42174?w=400&h=300&fit=crop",
      "https://images.unsplash.com/photo-1497215728101-856f4ea42174?w=400&h=300&fit=crop&sat=-20",
    ],
  },
  {
    id: 7,
    lat: 40.7567,
    lng: -73.9778,
    address: "New York, NY, USA",
    title: "Sunlit Practice Studio",
    subtitle: "Quiet • Upper West Side • Manhattan",
    category: "Practice, Classes, Coaching",
    price: "$28 CAD/hour",
    distance: "3.1 km away",
    rating: 4.6,
    reviews: 14,
    images: [
      "https://images.unsplash.com/photo-1484154218962-a197022b5858?w=400&h=300&fit=crop",
      "https://images.unsplash.com/photo-1493666438817-866a91353ca9?w=400&h=300&fit=crop",
    ],
  },
  {
    id: 8,
    lat: 40.7196,
    lng: -74.0089,
    address: "New York, NY, USA",
    title: "Premium Meeting & Jam Space",
    subtitle: "Full Equipment • Tribeca • Manhattan",
    category: "Jam Sessions, Meetings, Productions",
    price: "$55 CAD/hour",
    distance: "1.2 km away",
    rating: 5.0,
    reviews: 27,
    images: [
      "https://images.unsplash.com/photo-1517502884422-41eaead166d4?w=400&h=300&fit=crop",
      "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=400&h=300&fit=crop",
    ],
  },
  {
    id: 9,
    lat: 42.9755,
    lng: -81.3009,
    address: "London, ON, Canada",
    title: "Rehearsal Space in Fashion District",
    subtitle: "Full Service • Fashion District • Manhattan",
    category: "Rehearsals, Film/Photo, Meetups",
    price: "$30 CAD/hour",
    distance: "1 km away",
    rating: 5.0,
    reviews: 9,
    images: [
      "https://images.unsplash.com/photo-1497366216548-37526070297c?w=400&h=300&fit=crop",
      "https://images.unsplash.com/photo-1497366412874-3415097a27e7?w=400&h=300&fit=crop",
    ],
  },
]

export function ListingCard({
  listing,
  onClose,
  onClick,
  distanceLabel,
}: {
  listing: ListingItem
  onClose?: () => void
  onClick?: () => void
  distanceLabel?: string | null
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
      className="relative bg-[#ffffff] rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer"
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
          <div className="flex items-center gap-1 flex-shrink-0">
            <Star className="h-3 w-3 fill-[#000000] text-[#000000]" />
            <span className="text-xs text-[#000000]">
              {listing.rating} ({listing.reviews})
            </span>
          </div>
        </div>
        <p className="text-xs text-[#6a6a6a] mb-1 truncate">{listing.subtitle}</p>
        <p className="text-xs text-[#6a6a6a] mb-2 truncate">{listing.category}</p>
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
      amenities: item.amenities,
    }))
  }, [listingsQuery.data])
  const allListings = dbListings.length > 0 ? dbListings : hostListings

  const priceMaxParam = useSearchStore((state) => state.priceMax)
  const distanceMaxParam = useSearchStore((state) => state.distanceMax)
  const selectedDateParam = useSearchStore((state) => state.date)
  const selectedStartParam = useSearchStore((state) => state.startHour)
  const selectedDurationParam = useSearchStore((state) => state.duration)
  const [hasUserGeolocation, setHasUserGeolocation] = useState(false)
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [userGeoCity, setUserGeoCity] = useState<string | null>(null)
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
    if (typeof navigator === "undefined" || !navigator.geolocation) return

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setHasUserGeolocation(true)
        setUserCoords({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        })
      },
      () => {
        setHasUserGeolocation(false)
        setUserCoords(null)
        setUserGeoCity(null)
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 5 * 60 * 1000,
      }
    )

    return () => {
      navigator.geolocation.clearWatch(watchId)
    }
  }, [])

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

  useEffect(() => {
    if (!hasUserGeolocation || !userCoords) return
    if (!GOOGLE_MAPS_API_KEY) {
      setUserGeoCity(null)
      return
    }

    const controller = new AbortController()

    const resolveUserCity = async () => {
      try {
        const response = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?latlng=${userCoords.lat},${userCoords.lng}&result_type=locality|postal_town|administrative_area_level_3&key=${GOOGLE_MAPS_API_KEY}`,
          { signal: controller.signal }
        )

        if (!response.ok) {
          setUserGeoCity(null)
          return
        }

        const data = (await response.json()) as {
          results?: Array<{
            address_components?: Array<{
              long_name?: string
              types?: string[]
            }>
          }>
        }

        const components = data.results?.[0]?.address_components ?? []
        const city = components.find((component) =>
          (component.types ?? []).some((type) =>
            type === "locality" || type === "postal_town" || type === "administrative_area_level_3"
          )
        )?.long_name

        setUserGeoCity(city ? city.trim().toLowerCase() : null)
      } catch {
        setUserGeoCity(null)
      }
    }

    resolveUserCity()

    return () => {
      controller.abort()
    }
  }, [hasUserGeolocation, userCoords])

  const getCityName = (value: string) => value.split(",")[0]?.trim().toLowerCase() ?? ""
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

  const searchedCity = getCityName(whereValue.trim())

  const getDistanceLabel = (listing: ListingItem) => {
    if (!hasUserGeolocation || !userCoords) return null
    if (!searchedCity || !userGeoCity) return null
    if (userGeoCity !== searchedCity) return null

    const distanceKm = getDistanceKm(userCoords, { lat: listing.lat, lng: listing.lng })
    if (!Number.isFinite(distanceKm)) return null

    if (distanceKm < 1) return "<1 km away"
    return `${distanceKm.toFixed(1)} km away`
  }

  const getFilterDistanceKm = (listing: ListingItem) => {
    if (searchCoords) {
      return getDistanceKm(searchCoords, { lat: listing.lat, lng: listing.lng })
    }

    if (hasUserGeolocation && userCoords) {
      return getDistanceKm(userCoords, { lat: listing.lat, lng: listing.lng })
    }

    return parseListingDistance(listing.distance)
  }

  const filteredListings = allListings
    .filter((listing) => {
      if (!whereQuery) return true
      return [listing.title, listing.subtitle, listing.category, listing.address]
        .join(" ")
        .toLowerCase()
        .includes(whereQuery)
    })
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

    const listingNumericId = Number(listing.id)
    if (!Number.isFinite(listingNumericId)) return true

    const availability = listingAvailability[listingNumericId]
    if (!availability) return true

    const selectedDay = selectedDateParam.getDay()
    const requestedStart = selectedStartParam
    const requestedEnd = selectedStartParam + selectedDurationParam
    const bookedHoursForDay = listingBookedHours[listingNumericId]?.[selectedDay] ?? []
    const hasBookedHourInRange = Array.from(
      { length: selectedDurationParam },
      (_, idx) => requestedStart + idx
    ).some((hour) => bookedHoursForDay.includes(hour))

    return (
      availability.days.includes(selectedDay) &&
      requestedStart >= availability.startHour &&
      requestedEnd <= availability.endHour &&
      !hasBookedHourInRange
    )
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

      {hasSelectedSlot && (
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
            distanceLabel={getDistanceLabel(listing)}
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
                distanceLabel={getDistanceLabel(listing)}
                onClick={() => navigate(`/listing/${listing.id}`)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
