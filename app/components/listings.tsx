"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight, Image, Star, X } from "lucide-react"

export const listings = [
  {
    id: 1,
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
]

export function ListingCard({
  listing,
  onClose,
}: {
  listing: (typeof listings)[0]
  onClose?: () => void
}) {
  const [activeImageIndex, setActiveImageIndex] = useState(0)

  const hasMultipleImages = listing.images.length > 1

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
    <div className="relative bg-[#ffffff] rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer">
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
        <img
          src={listing.images[activeImageIndex]}
          alt={listing.title}
          className="h-full w-full object-cover"
        />
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
          <span className="text-xs text-[#6a6a6a]">{listing.distance}</span>
        </div>
      </div>
    </div>
  )
}

export function Listings() {
  return (
    <div className="grid grid-cols-2 gap-4 p-4 overflow-y-auto">
      {listings.map((listing) => (
        <ListingCard key={listing.id} listing={listing} />
      ))}
    </div>
  )
}
