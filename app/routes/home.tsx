"use client"

import { Listings } from "@/components/listings"
import { MapView } from "@/components/map-view"

export default function Page() {
  return (
    <div className="h-[calc(100vh-5.5rem)] flex flex-col bg-[#f5f5f5]">
      <main className="flex-1 flex overflow-hidden">
        <div className="w-1/2 overflow-y-auto border-r border-[#e9e9e9]">
          <Listings />
        </div>
        <div className="w-1/2 p-4">
          <MapView />
        </div>
      </main>
    </div>
  )
}
