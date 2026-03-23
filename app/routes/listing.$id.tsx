import { Link, useParams, useSearchParams } from "react-router"
import { ChevronLeft, Heart, Share, Star } from "lucide-react"
import { listings } from "@/components/listings"
import { Button } from "@/components/ui/button"

export default function ListingDetailsPage() {
  const [searchParams] = useSearchParams()
  const { id } = useParams()
  const listing = listings.find((item) => item.id === Number(id))
  const currentSearch = searchParams.toString()
  const homeTo = currentSearch ? `/?${currentSearch}` : "/"

  if (!listing) {
    return (
      <div className="min-h-[calc(100vh-5.5rem)] bg-[#f5f5f5]">
        <main className="p-8">
          <div className="mx-auto max-w-5xl rounded-2xl bg-[#ffffff] p-8 shadow-sm">
            <h1 className="text-2xl font-semibold text-[#000000]">Listing not found</h1>
            <p className="mt-2 text-sm text-[#6a6a6a]">The listing you are looking for does not exist.</p>
            <Link
              to={homeTo}
              className="mt-6 inline-flex items-center gap-2 rounded-full border border-[#dadada] px-4 py-2 text-sm text-[#000000] hover:bg-[#f5f5f5]"
            >
              <ChevronLeft className="h-4 w-4" />
              Back to listings
            </Link>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-5.5rem)] bg-[#f5f5f5]">
      <main className="p-6 md:p-8">
        <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex items-center justify-between gap-4">
          <Link
            to={homeTo}
            className="inline-flex items-center gap-2 rounded-full border border-[#dadada] bg-[#ffffff] px-4 py-2 text-sm text-[#000000] hover:bg-[#e9e9e9]"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="rounded-full border-[#dadada] bg-[#ffffff]">
              <Share className="h-4 w-4" />
              Share
            </Button>
            <Button variant="outline" className="rounded-full border-[#dadada] bg-[#ffffff]">
              <Heart className="h-4 w-4" />
              Save
            </Button>
          </div>
        </div>

        <h1 className="text-2xl font-semibold text-[#000000] md:text-3xl">{listing.title}</h1>

        <div className="mt-2 flex items-center gap-2 text-sm text-[#6a6a6a]">
          <Star className="h-4 w-4 fill-[#000000] text-[#000000]" />
          <span className="text-[#000000]">{listing.rating}</span>
          <span>({listing.reviews} reviews)</span>
          <span>•</span>
          <span>{listing.subtitle}</span>
        </div>

        <section className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-4 md:grid-rows-2">
          <img
            src={listing.images[0]}
            alt={listing.title}
            className="h-72 w-full rounded-2xl object-cover md:col-span-2 md:row-span-2 md:h-full"
          />
          {(listing.images[1] ?? listing.images[0]) && (
            <img
              src={listing.images[1] ?? listing.images[0]}
              alt={`${listing.title} photo 2`}
              className="h-36 w-full rounded-2xl object-cover md:h-full"
            />
          )}
          <img
            src={listing.images[0]}
            alt={`${listing.title} photo 3`}
            className="h-36 w-full rounded-2xl object-cover md:h-full"
          />
          <img
            src={listing.images[0]}
            alt={`${listing.title} photo 4`}
            className="h-36 w-full rounded-2xl object-cover md:h-full"
          />
          <img
            src={listing.images[0]}
            alt={`${listing.title} photo 5`}
            className="h-36 w-full rounded-2xl object-cover md:h-full"
          />
        </section>

        <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22rem]">
          <div className="space-y-6">
            <div className="rounded-2xl bg-[#ffffff] p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-[#000000]">Hosted by AirDrums</h2>
              <p className="mt-2 text-sm text-[#6a6a6a]">
                {listing.category} · Perfect for creators, teams, and rehearsals.
              </p>
            </div>

            <div className="rounded-2xl bg-[#ffffff] p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-[#000000]">About this space</h3>
              <p className="mt-3 text-sm leading-6 text-[#4a4a4a]">
                This Airbnb-style listing page is set up for {listing.title}. The space is located in {listing.subtitle} and is ideal for sessions that need a clean,
                flexible layout.
              </p>
            </div>

            <div className="rounded-2xl bg-[#ffffff] p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-[#000000]">What this place offers</h3>
              <ul className="mt-3 grid grid-cols-1 gap-2 text-sm text-[#4a4a4a] sm:grid-cols-2">
                <li>• High-speed Wi-Fi</li>
                <li>• Sound-treated environment</li>
                <li>• Flexible seating</li>
                <li>• Whiteboard + monitor</li>
                <li>• Coffee & water</li>
                <li>• Easy self check-in</li>
              </ul>
            </div>
          </div>

          <aside className="h-fit rounded-2xl bg-[#ffffff] p-6 shadow-md lg:sticky lg:top-6">
            <p className="text-xl font-semibold text-[#000000]">{listing.price}</p>
            <p className="mt-1 text-sm text-[#6a6a6a]">{listing.distance}</p>

            <div className="mt-4 rounded-xl border border-[#e9e9e9] p-4">
              <div className="grid grid-cols-2 gap-2 text-xs text-[#6a6a6a]">
                <div>
                  <p className="font-medium text-[#000000]">CHECK-IN</p>
                  <p>Anytime</p>
                </div>
                <div>
                  <p className="font-medium text-[#000000]">CHECK-OUT</p>
                  <p>Flexible</p>
                </div>
              </div>
              <div className="mt-3 border-t border-[#e9e9e9] pt-3 text-xs text-[#6a6a6a]">
                <p>Guests: 1-10</p>
              </div>
            </div>

            <Button className="mt-4 h-11 w-full rounded-xl bg-[#000000] text-[#ffffff] hover:bg-[#333333]">
              Reserve
            </Button>
            <p className="mt-3 text-center text-xs text-[#6a6a6a]">You won’t be charged yet</p>
          </aside>
        </section>
        </div>
      </main>
    </div>
  )
}
