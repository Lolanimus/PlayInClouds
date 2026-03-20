"use client"

import { useState } from "react"
import { Header } from "@/components/header"
import { FiltersModal } from "@/components/filter-bar"
import { Listings } from "@/components/listings"
import { MapView } from "@/components/map-view"

export default function Page() {
  const [isFiltersOpen, setIsFiltersOpen] = useState(false)

  return (
    <div className="h-screen flex flex-col bg-[#f5f5f5]">
      <Header onOpenFilters={() => setIsFiltersOpen(true)} />
      <main className="flex-1 flex overflow-hidden">
        <div className="w-1/2 overflow-y-auto border-r border-[#e9e9e9]">
          <Listings />
        </div>
        <div className="w-1/2 p-4">
          <MapView />
        </div>
      </main>
      <FiltersModal isOpen={isFiltersOpen} onClose={() => setIsFiltersOpen(false)} />
    </div>
  )
}
