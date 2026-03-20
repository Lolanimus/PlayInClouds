"use client"

import { Image, Star } from "lucide-react"

const listings = [
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

function ListingCard({ listing }: { listing: (typeof listings)[0] }) {
  return (
    <div className="bg-[#ffffff] rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow cursor-pointer">
      <div className="relative aspect-[4/3]">
        <img
          src={listing.images[0]}
          alt={listing.title}
          className="object-cover"
        />
        {listing.images.length > 1 && (
          <div className="absolute bottom-2 left-2 flex gap-1">
            {listing.images.map((_, idx) => (
              <div
                key={idx}
                className={`w-1.5 h-1.5 rounded-full ${
                  idx === 0 ? "bg-[#ffffff]" : "bg-[#ffffff]/50"
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
