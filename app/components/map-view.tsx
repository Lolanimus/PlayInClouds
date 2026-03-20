"use client"

import { useEffect, useRef, useState } from "react"

const markers = [
  { id: 1, lat: 40.7484, lng: -73.9967, title: "Rehearsal Space in Fashion District" },
  { id: 2, lat: 40.7508, lng: -73.9935, title: "Rehearsal Space in Fashion District" },
  { id: 3, lat: 40.7520, lng: -73.9890, title: "Creative Studio Space" },
  { id: 4, lat: 40.7545, lng: -73.9845, title: "Cozy Meeting Room" },
]

export function MapView() {
  const mapRef = useRef<HTMLDivElement>(null)
  const [mapLoaded, setMapLoaded] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return

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
        const mapMarker = new window.google.maps.Marker({
          position: { lat: marker.lat, lng: marker.lng },
          map,
          title: marker.title,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 8,
            fillColor: "#ff5a5f",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          },
        })

        const infoWindow = new window.google.maps.InfoWindow({
          content: `<div style="padding: 4px 8px; font-size: 12px; font-weight: 500;">${marker.title}</div>`,
        })

        mapMarker.addListener("click", () => {
          infoWindow.open(map, mapMarker)
        })
      })

      setMapLoaded(true)
    }

    loadGoogleMaps()
  }, [])

  return (
    <div className="relative w-full h-full bg-[#e9e9e9] rounded-lg overflow-hidden">
      <div ref={mapRef} className="w-full h-full" />
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
    google: typeof google
  }
}
