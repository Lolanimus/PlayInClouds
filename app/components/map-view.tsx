"use client"

import { useEffect, useRef, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { ListingCard, listings } from "@/components/listings"

const markers = [
  { id: 1, lat: 40.7484, lng: -73.9967, title: "Rehearsal Space in Fashion District" },
  { id: 2, lat: 40.7508, lng: -73.9935, title: "Rehearsal Space in Fashion District" },
  { id: 3, lat: 40.7520, lng: -73.9890, title: "Creative Studio Space" },
  { id: 4, lat: 40.7545, lng: -73.9845, title: "Cozy Meeting Room" },
  { id: 5, lat: 40.7468, lng: -74.0014, title: "Industrial Loft Rehearsal Room" },
  { id: 6, lat: 40.7489, lng: -73.9993, title: "Minimalist Creative Hub" },
  { id: 7, lat: 40.7567, lng: -73.9778, title: "Sunlit Practice Studio" },
  { id: 8, lat: 40.7196, lng: -74.0089, title: "Premium Meeting & Jam Space" },
]

function PriceMarker({
  price,
  onClick,
}: {
  price: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className={[
        "inline-flex items-center justify-center rounded-full border px-3 py-1 text-sm font-semibold shadow-sm transition-colors",
        "border-[#d9d9d9] bg-[#f5f5f5] text-[#000000] hover:bg-[#f5f5f5]",
      ].join(" ")}
      aria-label={`Open listing ${price}`}
    >
      {price}
    </button>
  )
}

export function MapView() {
  const mapRef = useRef<HTMLDivElement>(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [activeListingId, setActiveListingId] = useState<number | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return

    const markerRoots: Root[] = []
    const markerOverlays: any[] = []

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

      markers.forEach((marker) => {
        const listing = listings.find((item) => item.id === marker.id)
        const price = listing?.price.split(" ")[0] ?? "$--"

        const container = document.createElement("div")
        const root = createRoot(container)
        markerRoots.push(root)

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
                onClick={() => setActiveListingId(marker.id)}
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
              new window.google.maps.LatLng(marker.lat, marker.lng)
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
      markerOverlays.forEach((overlay) => overlay.setMap(null))
      markerRoots.forEach((root) => root.unmount())
    }
  }, [])

  const activeListing = activeListingId
    ? listings.find((listing) => listing.id === activeListingId) ?? null
    : null

  return (
    <div className="relative w-full h-full bg-[#e9e9e9] rounded-lg overflow-hidden">
      <div ref={mapRef} className="w-full h-full" />
      {activeListing && (
        <div className="absolute left-4 top-4 z-20 w-[min(20rem,calc(100%-2rem))]">
          <ListingCard
            listing={activeListing}
            onClose={() => setActiveListingId(null)}
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
