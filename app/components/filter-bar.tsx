"use client"

import { useEffect, useRef, useState } from "react"
import { SlidersHorizontal, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useSearchStore } from "@/store/search-store"

const filters = [
  { id: "nearby", label: "Nearby", active: true },
  { id: "anytime", label: "Anytime", active: false },
  { id: "anyone", label: "Anyone", active: false },
]

export function FilterBar({ onOpenFilters }: { onOpenFilters?: () => void }) {
  const [activeFilters, setActiveFilters] = useState(
    filters.reduce((acc, f) => ({ ...acc, [f.id]: f.active }), {} as Record<string, boolean>)
  )

  const toggleFilter = (id: string) => {
    setActiveFilters((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-[#ffffff] border-b border-[#e9e9e9]">
      <div className="flex items-center gap-2">
        {filters.map((filter) => (
          <button
            key={filter.id}
            onClick={() => toggleFilter(filter.id)}
            className={cn(
              "px-4 py-2 rounded-full text-sm font-medium transition-colors",
              activeFilters[filter.id]
                ? "bg-[#000000] text-[#ffffff]"
                : "bg-[#f5f5f5] text-[#000000] hover:bg-[#e9e9e9]"
            )}
          >
            {filter.label}
          </button>
        ))}
        <div className="w-8 h-8 rounded-full bg-[#e9e9e9] flex items-center justify-center ml-2">
          <span className="text-xs font-medium text-[#6a6a6a]">JD</span>
        </div>
      </div>

      <Button
        variant="outline"
        onClick={onOpenFilters}
        className="flex items-center gap-2 rounded-full border-[#dadada] text-[#000000] hover:bg-[#f5f5f5]"
      >
        <SlidersHorizontal className="h-4 w-4" />
        <span>Filters</span>
      </Button>
    </div>
  )
}

export function FiltersModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean
  onClose: () => void
}) {
  const priceMax = useSearchStore((state) => state.priceMax)
  const distanceMax = useSearchStore((state) => state.distanceMax)
  const setPriceMax = useSearchStore((state) => state.setPriceMax)
  const setDistanceMax = useSearchStore((state) => state.setDistanceMax)
  const MODAL_ANIMATION_MS = 200
  const [priceRange, setPriceRange] = useState([10, 200])
  const [distanceRange, setDistanceRange] = useState([0, 50])
  const [isVisible, setIsVisible] = useState(isOpen)
  const [isClosing, setIsClosing] = useState(false)
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const defaultPriceMin = 10
  const defaultPriceMax = 200
  const defaultDistanceMax = 50

  useEffect(() => {
    if (!isOpen) return

    setPriceRange([
      defaultPriceMin,
      Number.isFinite(priceMax) && priceMax >= defaultPriceMin
        ? priceMax
        : defaultPriceMax,
    ])
    setDistanceRange([
      0,
      Number.isFinite(distanceMax) && distanceMax >= 0
        ? distanceMax
        : defaultDistanceMax,
    ])
  }, [isOpen, priceMax, distanceMax])

  useEffect(() => {
    if (isOpen) {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current)
      setIsVisible(true)
      setIsClosing(false)
      return
    }

    if (isVisible) {
      setIsClosing(true)
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = setTimeout(() => {
        setIsVisible(false)
        setIsClosing(false)
      }, MODAL_ANIMATION_MS)
    }
  }, [isOpen, isVisible])

  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current)
    }
  }, [])

  if (!isVisible) return null

  const applyFilters = () => {
    setPriceMax(priceRange[1])
    setDistanceMax(distanceRange[1])
    onClose()
  }

  const clearFilters = () => {
    setPriceMax(defaultPriceMax)
    setDistanceMax(defaultDistanceMax)
    setPriceRange([defaultPriceMin, defaultPriceMax])
    setDistanceRange([0, defaultDistanceMax])
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className={cn(
          "absolute inset-0 bg-[#000000]/20",
          isClosing
            ? "animate-out fade-out-0 duration-200 ease-out"
            : "animate-in fade-in-0 duration-200"
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          "relative bg-[#ffffff] rounded-2xl shadow-xl w-full max-w-md mx-4 p-6",
          isClosing
            ? "animate-out fade-out-0 slide-out-to-bottom-2 duration-200 ease-out"
            : "animate-in fade-in-0 slide-in-from-bottom-2 duration-200"
        )}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-[#000000]">Filters</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#f5f5f5] rounded-full transition-colors"
          >
            <X className="h-5 w-5 text-[#6a6a6a]" />
          </button>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-[#000000] mb-4">Price (per hour)</label>
          <div className="flex items-center gap-4">
            <span className="text-sm text-[#6a6a6a]">{priceRange[0]}</span>
            <input
              type="range"
              min="10"
              max="200"
              value={priceRange[1]}
              onChange={(e) => setPriceRange([priceRange[0], parseInt(e.target.value)])}
              className="flex-1 h-1 bg-[#e9e9e9] rounded-full appearance-none cursor-pointer accent-[#000000]"
            />
            <span className="text-sm text-[#6a6a6a]">{priceRange[1]}</span>
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-[#000000] mb-4">Distance (km)</label>
          <div className="flex items-center gap-4">
            <span className="text-sm text-[#6a6a6a]">{distanceRange[0]}</span>
            <input
              type="range"
              min="0"
              max="50"
              value={distanceRange[1]}
              onChange={(e) => setDistanceRange([distanceRange[0], parseInt(e.target.value)])}
              className="flex-1 h-1 bg-[#e9e9e9] rounded-full appearance-none cursor-pointer accent-[#000000]"
            />
            <span className="text-sm text-[#6a6a6a]">{distanceRange[1]}</span>
          </div>
        </div>

        <div className="h-[0.0625rem] bg-[#e9e9e9] my-6" />

        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={clearFilters}
            className="flex-1 rounded-full border-[#dadada]"
          >
            Clear all
          </Button>
          <Button
            onClick={applyFilters}
            className="flex-1 rounded-full bg-[#000000] text-[#ffffff] hover:bg-[#333333]"
          >
            Show results
          </Button>
        </div>
      </div>
    </div>
  )
}
