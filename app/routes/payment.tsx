import { Link, useNavigate, useSearchParams } from "react-router"
import { ChevronLeft, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { listings } from "@/components/listings"
import { useUser } from "@/store/user_state"
import { useReservationsActions } from "@/store/reservations_state"

function parseHourlyPrice(price: string) {
  const match = price.match(/\$\s*(\d+(?:\.\d+)?)/)
  if (!match) return 30
  return Number(match[1])
}

function formatHourLabel(hour: number) {
  return `${hour.toString().padStart(2, "0")}:00`
}

function formatDateRange(dateKey: string, start: number, end: number) {
  const date = new Date(`${dateKey}T00:00:00`)
  const dayLabel = Number.isNaN(date.getTime())
    ? dateKey
    : date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })

  return `${dayLabel}, ${formatHourLabel(start)}–${formatHourLabel(end)}`
}

export default function PaymentPage() {
  const navigate = useNavigate()
  const user = useUser()
  const { addReservation } = useReservationsActions()
  const [params] = useSearchParams()
  const listingId = Number(params.get("listingId"))
  const dateKey = params.get("date") ?? ""
  const startHour = Number(params.get("start"))
  const endHour = Number(params.get("end"))
  const guests = Number(params.get("guests") ?? "1")

  const listing = listings.find((item) => item.id === listingId)

  if (!listing || !dateKey || !Number.isFinite(startHour) || !Number.isFinite(endHour) || endHour <= startHour) {
    return (
      <div className="min-h-[calc(100vh-5.5rem)] bg-[#f5f5f5] px-4 py-8 md:px-8">
        <Card className="mx-auto max-w-4xl border-[#e9e9e9] bg-[#ffffff]">
          <CardHeader>
            <CardTitle className="text-2xl text-[#000000]">Payment details missing</CardTitle>
            <CardDescription className="text-sm text-[#6a6a6a]">
              Please go back to the listing and select your booking details again.
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-6">
            <Button asChild variant="outline" className="rounded-full border-[#dadada] bg-[#ffffff]">
              <Link to="/">
                <ChevronLeft className="h-4 w-4" />
                Back to home
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const hours = endHour - startHour
  const hourlyRate = parseHourlyPrice(listing.price)
  const subtotal = Number((hourlyRate * hours).toFixed(2))
  const processingFee = Number((subtotal * 0.075).toFixed(2))
  const total = Number((subtotal + processingFee).toFixed(2))

  const handleBuy = () => {
    if (!user) return

    addReservation({
      id: `${user.id}-${listing.id}-${Date.now()}`,
      userId: user.id,
      listingId: listing.id,
      listingTitle: listing.title,
      listingSubtitle: listing.subtitle,
      listingImage: listing.images[0] ?? "",
      dateKey,
      startHour,
      endHour,
      guests,
      subtotal,
      processingFee,
      total,
      createdAt: new Date().toISOString(),
    })

    navigate("/dashboard")
  }

  return (
    <div className="min-h-[calc(100vh-5.5rem)] bg-[#f5f5f5] px-4 py-8 md:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center gap-3">
          <Button asChild variant="outline" size="icon-lg" className="rounded-full border-[#dadada] bg-[#ffffff] text-[#000000] hover:bg-[#f5f5f5]">
            <Link to={`/listing/${listing.id}`} aria-label="Back to listing">
              <ChevronLeft className="h-5 w-5" />
            </Link>
          </Button>
          <h1 className="text-4xl font-semibold tracking-tight text-[#000000]">Confirm and pay</h1>
        </div>

        <main>
          <Card className="mx-auto max-w-3xl border-[#e2e2e2] bg-[#ffffff] p-5">
            <CardHeader className="px-0 pt-0">
              <CardTitle className="text-3xl text-[#000000]">Review your reservation</CardTitle>
              <CardDescription className="text-sm text-[#6a6a6a]">
                Check details below and complete your booking.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-0 px-0">
              <div className="flex gap-3">
                <img src={listing.images[0]} alt={listing.title} className="h-20 w-20 rounded-xl object-cover" />
                <div className="min-w-0">
                  <p className="truncate text-2xl font-semibold text-[#000000]">{listing.title}</p>
                  <p className="truncate text-sm text-[#6a6a6a]">{listing.subtitle}</p>
                  <div className="mt-1 flex items-center gap-1 text-sm text-[#000000]">
                    <Star className="h-4 w-4 fill-[#000000] text-[#000000]" />
                    <span>{listing.rating}</span>
                    <span className="text-[#6a6a6a]">({listing.reviews})</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 border-t border-[#e9e9e9] pt-4">
                <p className="text-lg font-semibold text-[#000000]">Date & time</p>
                <p className="mt-1 text-sm text-[#4a4a4a]">{formatDateRange(dateKey, startHour, endHour)}</p>
              </div>

              <div className="mt-5 border-t border-[#e9e9e9] pt-4">
                <p className="text-lg font-semibold text-[#000000]">Guests</p>
                <p className="mt-1 text-sm text-[#4a4a4a]">{guests} {guests === 1 ? "guest" : "guests"}</p>
              </div>

              <div className="mt-5 border-t border-[#e9e9e9] pt-4">
                <p className="text-lg font-semibold text-[#000000]">Price details</p>
                <div className="mt-3 space-y-2 text-sm text-[#2a2a2a]">
                  <div className="flex items-center justify-between">
                    <p>{hours} {hours === 1 ? "hour" : "hours"} × ${hourlyRate.toFixed(2)} CAD</p>
                    <p>${subtotal.toFixed(2)} CAD</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <p>Processing fee (7.5%)</p>
                    <p>${processingFee.toFixed(2)} CAD</p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-[#e9e9e9] pt-3 text-base font-semibold text-[#000000]">
                  <p>Total CAD</p>
                  <p>${total.toFixed(2)} CAD</p>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <Button asChild variant="outline" className="rounded-xl border-[#dadada] bg-[#ffffff]">
                  <Link to={`/listing/${listing.id}`}>Change reservation</Link>
                </Button>
                <Button
                  onClick={handleBuy}
                  disabled={!user}
                  className="h-11 rounded-xl bg-[#000000] px-8 text-[#ffffff] hover:bg-[#2a2a2a] disabled:cursor-not-allowed disabled:bg-[#bdbdbd]"
                >
                  Buy now · ${total.toFixed(2)} CAD
                </Button>
              </div>
              {!user && (
                <p className="mt-3 text-sm text-[#6a6a6a]">Please log in to complete your reservation.</p>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  )
}
