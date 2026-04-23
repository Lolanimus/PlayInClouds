import { useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router"
import { ChevronLeft, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AuthRequiredModal } from "@/components/auth-required-modal"
import { useGetListing } from "@/hooks/useListings"
import { useCreateReservation } from "@/hooks/useReservations"
import { useErrorActions } from "@/store/error_state"
import { useHostListings } from "@/store/host_listings_state"
import { useUser } from "@/store/user_state"
import { useReservationsActions } from "@/store/reservations_state"
import type { Listing as ApiListing } from "@/types/custom/api.types"

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

function getFormatterForTimeZone(timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = getFormatterForTimeZone(timeZone).formatToParts(date)
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  ) as Record<string, number>

  const asUtc = Date.UTC(
    values.year,
    (values.month ?? 1) - 1,
    values.day ?? 1,
    values.hour ?? 0,
    values.minute ?? 0,
    values.second ?? 0,
    0
  )

  return asUtc - date.getTime()
}

function listingLocalDateHourToUtc(dateKey: string, hour: number, timeZone: string) {
  const [yearRaw, monthRaw, dayRaw] = dateKey.split("-")
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const day = Number(dayRaw)

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day) || !Number.isFinite(hour)) {
    return new Date(NaN)
  }

  const baseUtc = Date.UTC(year, month - 1, day, hour, 0, 0, 0)
  let result = new Date(baseUtc)

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const offset = getTimeZoneOffsetMs(result, timeZone)
    const next = new Date(baseUtc - offset)
    if (next.getTime() === result.getTime()) break
    result = next
  }

  return result
}

export default function PaymentPage() {
  const navigate = useNavigate()
  const user = useUser()
  const hostListings = useHostListings()
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const { addReservation } = useReservationsActions()
  const createReservationMutation = useCreateReservation()
  const { setError, setSuccess } = useErrorActions()
  const [params] = useSearchParams()
  const listingIdParam = params.get("listingId") ?? ""
  const isUuidId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(listingIdParam)
  const listingQuery = useGetListing(isUuidId ? listingIdParam : undefined)
  const dateKey = params.get("date") ?? ""
  const startHour = Number(params.get("start"))
  const endHour = Number(params.get("end"))
  const guests = Number(params.get("guests") ?? "1")

  const localListing = [...hostListings].find((item) => String(item.id) === listingIdParam)
  const remoteListing = listingQuery.data as ApiListing | null

  const listing = remoteListing
    ? {
        id: remoteListing.id,
        title: remoteListing.title,
        subtitle: remoteListing.subtitle,
        images: remoteListing.images ?? [],
        timezone: remoteListing.timezone,
        rating: remoteListing.average_rating,
        reviews: remoteListing.review_count,
        priceNumber: remoteListing.price,
        cancellationPolicyHours: remoteListing.cancellation_policy_hours,
        advanceNoticeHours: remoteListing.advance_notice_hours,
      }
    : localListing
      ? {
          id: localListing.id,
          title: localListing.title,
          subtitle: localListing.subtitle,
          images: localListing.images,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          rating: localListing.rating,
          reviews: localListing.reviews,
          priceNumber: parseHourlyPrice(localListing.price),
          cancellationPolicyHours: null,
          advanceNoticeHours: localListing.advanceNoticeHours ?? null,
        }
      : null

  if (isUuidId && listingQuery.isLoading) {
    return (
      <div className="min-h-[calc(100vh-5.5rem)] bg-[#f5f5f5] px-4 py-8 md:px-8">
        <Card className="mx-auto max-w-4xl border-[#e9e9e9] bg-[#ffffff]">
          <CardHeader>
            <CardTitle className="text-2xl text-[#000000]">Loading payment details...</CardTitle>
          </CardHeader>
        </Card>
      </div>
    )
  }

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
  const hourlyRate = listing.priceNumber
  const subtotal = Number((hourlyRate * hours).toFixed(2))
  const processingFee = Number((subtotal * 0.075).toFixed(2))
  const total = Number((subtotal + processingFee).toFixed(2))
  const reservationStartAt = listingLocalDateHourToUtc(dateKey, startHour, listing.timezone)
  const hoursUntilStart = (reservationStartAt.getTime() - Date.now()) / (1000 * 60 * 60)
  const advanceNoticeWarning =
    typeof listing.advanceNoticeHours === "number" && hoursUntilStart < listing.advanceNoticeHours
      ? `This listing requires ${listing.advanceNoticeHours} hour(s) of advance notice.`
      : null
  const cancellationWarning =
    listing.cancellationPolicyHours === null
      ? "Cancellation for this listing is disabled."
      : typeof listing.cancellationPolicyHours === "number" && hoursUntilStart < listing.cancellationPolicyHours
        ? `Cancellation will not be possible for this booking. This listing requires cancellations at least ${listing.cancellationPolicyHours} hour(s) before the start time.`
        : null

  const handleBuy = async () => {
    if (!user) {
      setIsAuthModalOpen(true)
      return
    }

    setError(null)
    setSuccess(null)

    const reservationStart = listingLocalDateHourToUtc(dateKey, startHour, listing.timezone)
    const reservationEnd = listingLocalDateHourToUtc(dateKey, endHour, listing.timezone)

    try {
      await createReservationMutation.mutateAsync({
        p_listing_id: String(listing.id),
        p_start_at: reservationStart.toISOString(),
        p_end_at: reservationEnd.toISOString(),
        p_guests: guests,
      })
    } catch (error) {
      console.error("Failed to create reservation", error)
      setError(error instanceof Error ? error.message : "This time slot is no longer available. Please choose another time.")
      return
    }

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
            <CardHeader className="px-0 pt-0 pb-4">
              <CardTitle className="text-3xl text-[#000000]">Review your reservation</CardTitle>
              <CardDescription className="text-sm text-[#6a6a6a]">
                Check details below and complete your booking.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-0 px-0">
              <div className="flex gap-3">
                <img src={listing.images[0] ?? ""} alt={listing.title} className="h-20 w-20 rounded-xl object-cover" />
                <div className="min-w-0">
                  <p className="truncate text-2xl font-semibold text-[#000000]">{listing.title}</p>
                  <p className="truncate text-sm text-[#6a6a6a]">{listing.subtitle}</p>
                  {listing.reviews > 0 ? (
                    <div className="mt-1 flex items-center gap-1 text-sm text-[#000000]">
                      <Star className="h-4 w-4 fill-[#000000] text-[#000000]" />
                      <span>{listing.rating}</span>
                      <span className="text-[#6a6a6a]">({listing.reviews})</span>
                    </div>
                  ) : null}
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

              {cancellationWarning ? (
                <div className="mt-4 rounded-lg border border-[#f1c3bd] bg-[#fff3f2] px-3 py-2">
                  <p className="text-xs font-semibold text-[#b42318]">Cancellation notice</p>
                  <p className="mt-1 text-sm text-[#b42318]">{cancellationWarning}</p>
                </div>
              ) : null}

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <Button asChild variant="outline" className="rounded-xl border-[#dadada] bg-[#ffffff]">
                  <Link to={`/listing/${listing.id}`}>Change reservation</Link>
                </Button>
                <Button
                  onClick={handleBuy}
                  disabled={createReservationMutation.isPending || Boolean(advanceNoticeWarning)}
                  className="h-11 rounded-xl bg-[#000000] px-8 text-[#ffffff] hover:bg-[#2a2a2a]"
                >
                  {createReservationMutation.isPending ? "Processing..." : `Buy now · $${total.toFixed(2)} CAD`}
                </Button>
              </div>
              {!user && <p className="mt-3 text-sm text-[#6a6a6a]">You’ll need to log in before purchase.</p>}
              {advanceNoticeWarning ? (
                <div className="mt-4 rounded-lg border border-[#f3d49b] bg-[#fff8eb] px-3 py-2">
                  <p className="text-xs font-semibold text-[#9a6700]">Advance notice</p>
                  <p className="mt-1 text-sm text-[#9a6700]">{advanceNoticeWarning}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </main>
      </div>

      <AuthRequiredModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onLogin={() => {
          navigate(`/login?redirect=${encodeURIComponent(`/payment?${params.toString()}`)}`)
        }}
        onSignup={() => {
          navigate(`/signup?redirect=${encodeURIComponent(`/payment?${params.toString()}`)}`)
        }}
        title="Log in to complete purchase"
        description="This action requires an account. Log in or sign up to complete your reservation."
      />
    </div>
  )
}
