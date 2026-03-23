"use client"

import { useEffect, useRef, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { useNavigate, useSearchParams } from "react-router"
import { ListingCard, listingAvailability, listings } from "@/components/listings"

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_PUBLIC_GOOGLE_MAPS_API_KEY as string | undefined

function PriceMarker({
  price,
  isActive,
  isAvailableInSelectedSlot,
  hasSelectedSlot,
  onClick,
}: {
  price: string
  isActive: boolean
  isAvailableInSelectedSlot: boolean
  hasSelectedSlot: boolean
  onClick: () => void
}) {
  const isOtherTime = hasSelectedSlot && !isAvailableInSelectedSlot

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className={[
        "inline-flex items-center justify-center rounded-full border px-3 py-1 text-sm font-semibold shadow-sm transition-colors",
        isActive
          ? hasSelectedSlot
            ? isAvailableInSelectedSlot
              ? "border-[#0f6130] bg-[#0f6130] text-[#ffffff]"
              : "border-[#000000] bg-[#000000] text-[#ffffff]"
            : "border-[#000000] bg-[#000000] text-[#ffffff]"
          : isOtherTime
            ? "border-[#000000] bg-[#efefef] text-[#4a4a4a] hover:bg-[#e5e5e5]"
            : hasSelectedSlot
              ? "border-[#1f8f4a] bg-[#eaf8ef] text-[#0f6130] hover:bg-[#ddf2e5]"
              : "border-[#ffffff] bg-[#f5f5f5] text-[#000000] hover:bg-[#f5f5f5]",
      ].join(" ")}
      aria-label={`Open listing ${price}`}
    >
      {price}
    </button>
  )
}

const parseDateFromQuery = (value: string | null) => {
  if (!value) return null
  const [yearRaw, monthRaw, dayRaw] = value.split("-")
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const day = Number(dayRaw)

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null

  const date = new Date(year, month - 1, day)
  if (Number.isNaN(date.getTime())) return null
  return date
}

export function MapView() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const markerEntriesRef = useRef<Array<{ id: number; price: string; root: Root }>>([])
  const isTearingDownRef = useRef(false)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [activeListingId, setActiveListingId] = useState<number | null>(null)
  const [searchCoords, setSearchCoords] = useState<{ lat: number; lng: number } | null>(null)
  const currentSearch = searchParams.toString()
  const whereQuery = searchParams.get("where")?.trim().toLowerCase() ?? ""
  const priceMaxParam = Number(searchParams.get("priceMax"))
  const distanceMaxParam = Number(searchParams.get("distanceMax"))
  const selectedDateParam = parseDateFromQuery(searchParams.get("date"))
  const selectedStartParam = Number(searchParams.get("start"))
  const selectedDurationParam = Number(searchParams.get("duration"))
  const hasSelectedSlot =
    selectedDateParam &&
    Number.isFinite(selectedStartParam) &&
    selectedStartParam >= 0 &&
    selectedStartParam <= 23 &&
    Number.isFinite(selectedDurationParam) &&
    selectedDurationParam >= 1 &&
    selectedDurationParam <= 12

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

  const filteredListings = listings
    .filter((listing) => {
      if (!whereQuery) return true
      return [listing.title, listing.subtitle, listing.category, listing.city]
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

      const distanceKm = searchCoords
        ? getDistanceKm(searchCoords, { lat: listing.lat, lng: listing.lng })
        : parseListingDistance(listing.distance)

      if (!Number.isFinite(distanceKm)) return false
      return distanceKm <= distanceMaxParam
    })

  const isAvailableInSelectedSlot = (listingId: number) => {
    if (!hasSelectedSlot || !selectedDateParam) return true

    const availability = listingAvailability[listingId]
    if (!availability) return true

    const selectedDay = selectedDateParam.getDay()
    const requestedStart = selectedStartParam
    const requestedEnd = selectedStartParam + selectedDurationParam

    return (
      availability.days.includes(selectedDay) &&
      requestedStart >= availability.startHour &&
      requestedEnd <= availability.endHour
    )
  }

  const availableNowListingIds = new Set(
    filteredListings
      .filter((listing) => isAvailableInSelectedSlot(listing.id))
      .map((listing) => listing.id)
  )
  const filteredListingIds = new Set(filteredListings.map((listing) => listing.id))

  const renderMarkerButtons = () => {
    if (isTearingDownRef.current) return

    markerEntriesRef.current.forEach(({ id, price, root }) => {
      if (!filteredListingIds.has(id)) {
        root.render(<></>)
        return
      }

      const isAvailableNow = availableNowListingIds.has(id)

      root.render(
        <PriceMarker
          price={price}
          isActive={activeListingId === id}
          isAvailableInSelectedSlot={isAvailableNow}
          hasSelectedSlot={Boolean(hasSelectedSlot)}
          onClick={() => setActiveListingId(id)}
        />
      )
    })
  }

  useEffect(() => {
    if (typeof window === "undefined") return

    isTearingDownRef.current = false

    const markerRoots: Root[] = []
    const markerOverlays: any[] = []
    markerEntriesRef.current = []

    const loadGoogleMaps = () => {
      if (window.google?.maps) {
        initMap()
        return
      }

      const existingScript = document.getElementById("google-maps-script")
      if (existingScript) {
        existingScript.addEventListener("load", initMap)
        return
      }

      const script = document.createElement("script")
      script.id = "google-maps-script"
      script.src = `https://maps.googleapis.com/maps/api/js?key=${import.meta.env.VITE_PUBLIC_GOOGLE_MAPS_API_KEY || ""}&libraries=places`
      script.async = true
      script.defer = true
      script.onload = initMap
      document.head.appendChild(script)
    }

    const initMap = () => {
      if (!mapRef.current || !window.google?.maps) return

      const map = new window.google.maps.Map(mapRef.current, {
        center: { lat: 40.7505, lng: -73.9934 },
        zoom: 15,
        styles: [
          {
            featureType: "all",
            elementType: "geometry",
            stylers: [{ color: "#f5f5f5" }],
          },
          {
            featureType: "road",
            elementType: "geometry",
            stylers: [{ color: "#ffffff" }],
          },
          {
            featureType: "road",
            elementType: "labels.text.fill",
            stylers: [{ color: "#9e9e9e" }],
          },
          {
            featureType: "water",
            elementType: "geometry",
            stylers: [{ color: "#c9c9c9" }],
          },
          {
            featureType: "poi",
            elementType: "labels",
            stylers: [{ visibility: "off" }],
          },
        ],
        disableDefaultUI: true,
        zoomControl: true,
        zoomControlOptions: {
          position: window.google.maps.ControlPosition.RIGHT_CENTER,
        },
      })
      mapInstanceRef.current = map

      listings.forEach((listing) => {
        const price = listing.price.split(" ")[0] ?? "$--"

        const container = document.createElement("div")
        const root = createRoot(container)
        markerRoots.push(root)
        markerEntriesRef.current.push({ id: listing.id, price, root })

        class PriceOverlay extends window.google.maps.OverlayView {
          private div: HTMLDivElement | null = null

          onAdd() {
            this.div = document.createElement("div")
            this.div.style.position = "absolute"
            this.div.style.transform = "translate(-50%, -50%)"

            this.div.addEventListener("click", (event) => {
              event.stopPropagation()
            })

            root.render(
              <PriceMarker
                price={price}
                isActive={activeListingId === listing.id}
                isAvailableInSelectedSlot={availableNowListingIds.has(listing.id)}
                hasSelectedSlot={Boolean(hasSelectedSlot)}
                onClick={() => setActiveListingId(listing.id)}
              />
            )

            this.div.appendChild(container)
            this.getPanes()?.overlayMouseTarget?.appendChild(this.div)
          }

          draw() {
            if (!this.div) return

            const projection = this.getProjection()
            if (!projection) return

            const position = projection.fromLatLngToDivPixel(
              new window.google.maps.LatLng(listing.lat, listing.lng)
            )

            if (!position) return

            this.div.style.left = `${position.x}px`
            this.div.style.top = `${position.y}px`
          }

          onRemove() {
            this.div?.remove()
            this.div = null
          }
        }

        const overlay = new PriceOverlay()
        overlay.setMap(map)
        markerOverlays.push(overlay)
      })

      map.addListener("click", () => {
        setActiveListingId(null)
      })

      setMapLoaded(true)
    }

    loadGoogleMaps()

    return () => {
      isTearingDownRef.current = true
      markerOverlays.forEach((overlay) => overlay.setMap(null))
      markerEntriesRef.current = []
      mapInstanceRef.current = null

      // Defer unmount to avoid unmounting a root during an in-progress React render.
      setTimeout(() => {
        markerRoots.forEach((root) => root.unmount())
      }, 0)
    }
  }, [])

  useEffect(() => {
    const where = searchParams.get("where")?.trim()
    if (!where) {
      setSearchCoords(null)
      return
    }
    if (!mapLoaded) return
    if (!mapInstanceRef.current) return
    if (!window.google?.maps || !GOOGLE_MAPS_API_KEY) return

    const controller = new AbortController()

    const centerMapToSearch = async () => {
      try {
        const response = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(where)}&key=${GOOGLE_MAPS_API_KEY}`,
          { signal: controller.signal }
        )

        if (!response.ok) return

        const data = (await response.json()) as {
          results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>
        }

        const lat = data.results?.[0]?.geometry?.location?.lat
        const lng = data.results?.[0]?.geometry?.location?.lng

        if (typeof lat !== "number" || typeof lng !== "number") return

        setSearchCoords({ lat, lng })

        const target = new window.google.maps.LatLng(lat, lng)
        mapInstanceRef.current.panTo(target)
        mapInstanceRef.current.setZoom(12)
      } catch {
        setSearchCoords(null)
        // ignore geocode failures for map centering
      }
    }

    centerMapToSearch()

    return () => {
      controller.abort()
    }
  }, [searchParams, mapLoaded])

  useEffect(() => {
    if (activeListingId && !filteredListingIds.has(activeListingId)) {
      setActiveListingId(null)
      return
    }

    renderMarkerButtons()
  }, [searchParams, searchCoords, activeListingId])

  const activeListing = activeListingId
    ? filteredListings.find((listing) => listing.id === activeListingId) ?? null
    : null

  return (
    <div className="relative w-full h-full bg-[#e9e9e9] rounded-lg overflow-hidden">
      <div ref={mapRef} className="w-full h-full" />
      {hasSelectedSlot && (
        <div className="absolute right-4 top-4 z-20 rounded-xl border border-[#e9e9e9] bg-[#ffffff] p-3 shadow-sm">
          <div className="flex items-center gap-2 text-xs text-[#2a2a2a]">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#1f8f4a]" />
            <span>Available at selected time</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-xs text-[#2a2a2a]">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#9e9e9e]" />
            <span>Available at other times</span>
          </div>
        </div>
      )}
      {activeListing && (
        <div className="absolute left-4 top-4 z-20 w-[min(20rem,calc(100%-2rem))]">
          <ListingCard
            listing={activeListing}
            onClose={() => setActiveListingId(null)}
            onClick={() =>
              navigate(
                `/listing/${activeListing.id}${currentSearch ? `?${currentSearch}` : ""}`
              )
            }
          />
        </div>
      )}
      {!mapLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#f5f5f5]">
          <div className="text-center">
            <div className="w-12 h-12 border-2 border-[#dadada] border-t-[#000000] rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm text-[#6a6a6a]">Loading map...</p>
          </div>
        </div>
      )}
    </div>
  )
}

declare global {
  interface Window {
    google: any
  }
}
