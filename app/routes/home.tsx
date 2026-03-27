"use client"

import { useState } from "react"
import { Listings } from "@/components/listings"
import { MapView } from "@/components/map-view"
import { Button } from "@/components/ui/button"
import { useSearchStore } from "@/store/search-store"

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_PUBLIC_GOOGLE_MAPS_API_KEY as string | undefined

type GoogleGeolocationResponse = {
  location?: {
    lat?: number
    lng?: number
  }
}

type GoogleGeocodeResponse = {
  results?: Array<{
    formatted_address?: string
  }>
}

export default function Page() {
  const where = useSearchStore((state) => state.where)
  const setWhere = useSearchStore((state) => state.setWhere)
  const [isDetectingCity, setIsDetectingCity] = useState(false)
  const [detectCityError, setDetectCityError] = useState<string | null>(null)

  const hasSearchState = Boolean(where.trim())

  const findCityAndSearch = async () => {
    if (isDetectingCity) return

    setIsDetectingCity(true)
    setDetectCityError(null)

    try {
      if (!GOOGLE_MAPS_API_KEY) {
        throw new Error("Missing Google Maps API key")
      }

      const geolocateResponse = await fetch(`https://www.googleapis.com/geolocation/v1/geolocate?key=${GOOGLE_MAPS_API_KEY}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          considerIp: true,
        }),
      })

      if (!geolocateResponse.ok) {
        throw new Error("Could not detect your city")
      }

      const geolocateData = (await geolocateResponse.json()) as GoogleGeolocationResponse
      const lat = geolocateData.location?.lat
      const lng = geolocateData.location?.lng

      if (typeof lat !== "number" || typeof lng !== "number") {
        throw new Error("Could not detect your city")
      }

      const geocodeResponse = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&result_type=locality|postal_town|administrative_area_level_3&key=${GOOGLE_MAPS_API_KEY}`
      )

      if (!geocodeResponse.ok) {
        throw new Error("Could not detect your city")
      }

      const geocodeData = (await geocodeResponse.json()) as GoogleGeocodeResponse
      const resolvedCity = geocodeData.results?.[0]?.formatted_address?.trim()

      if (!resolvedCity) {
        throw new Error("Could not detect your city")
      }

      setWhere(resolvedCity)
    } catch {
      setDetectCityError("Could not detect your city. Please type it in the search bar.")
    } finally {
      setIsDetectingCity(false)
    }
  }

  return (
    <div className="h-[calc(100vh-5.5rem)] flex flex-col bg-[#f5f5f5]">
      <main className="flex-1 flex overflow-hidden">
        <div className="w-1/2 overflow-y-auto border-r border-[#e9e9e9]">
          {!hasSearchState ? (
            <section className="mx-4 mt-4 rounded-2xl border border-[#e9e9e9] bg-[#ffffff] p-5">
              <h2 className="text-lg font-semibold text-[#000000]">Find rehearsal spaces near you</h2>
              <p className="mt-2 text-sm text-[#6a6a6a]">
                AirDrums helps you discover rehearsal spaces in your area. Start by searching your city to get relevant spaces.
              </p>
              <div className="mt-4">
                <Button
                  onClick={findCityAndSearch}
                  disabled={isDetectingCity}
                  className="rounded-full bg-[#000000] px-4 text-[#ffffff] hover:bg-[#2a2a2a]"
                >
                  {isDetectingCity ? "Detecting city..." : "Use my city"}
                </Button>
              </div>
              {detectCityError && (
                <p className="mt-3 text-sm text-[#b42318]">{detectCityError}</p>
              )}
            </section>
          ) : (
            <Listings />
          )}
        </div>
        <div className="w-1/2 p-4">
          <MapView />
        </div>
      </main>
    </div>
  )
}
