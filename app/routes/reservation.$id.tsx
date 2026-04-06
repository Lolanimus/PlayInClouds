import { useEffect, useMemo } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { CalendarClock, ChevronLeft, Clock3, Hash, MapPin, ReceiptText, Users } from "lucide-react"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { ListingCard } from "~/components/listings"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { useCancelReservation, useGetReservation } from "~/hooks/useReservations"
import { useUser } from "~/store/user_state"
import type { Listing, Reservation } from "~/types/custom/api.types"

type ReservationOwner = {
  id: string
  email: string | null
  first_name: string
  last_name: string
  phone_number: string | null
  inserted_at: string
  updated_at: string
}

type ReservationDetailsPayload = Reservation & {
  listing?: Listing | null
  owner?: ReservationOwner | null
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 2,
  }).format(value)
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Unknown"

  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

function getDurationHours(startAt: string, endAt: string) {
  const start = new Date(startAt)
  const end = new Date(endAt)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0

  return Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60))
}

function isPastReservation(endAtIso: string) {
  const end = new Date(endAtIso)
  if (Number.isNaN(end.getTime())) return false
  return end.getTime() <= Date.now()
}

export default function ReservationDetailsPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const user = useUser()
  const cancelReservationMutation = useCancelReservation()

  const reservationQuery = useGetReservation(
    { p_reservation_id: id },
    { enabled: Boolean(user?.id && id) }
  )

  useEffect(() => {
    if (!user) {
      navigate(`/login?redirect=${encodeURIComponent(`/reservation/${id ?? ""}`)}`, { replace: true })
    }
  }, [user, navigate, id])

  if (!user) return null

  const reservationPayload = (reservationQuery.data as ReservationDetailsPayload | null) ?? null
  const reservation = reservationPayload as Reservation | null
  const listing = reservationPayload?.listing ?? null
  const owner = reservationPayload?.owner ?? null
  const listingCardItem = useMemo(() => {
    if (!listing) return null

    return {
      id: listing.id,
      lat: listing.lat,
      lng: listing.lng,
      address: listing.address,
      title: listing.title,
      subtitle: listing.subtitle,
      category: listing.category,
      price: `$${listing.price} CAD/hour`,
      distance: "",
      rating: listing.average_rating,
      reviews: listing.review_count,
      images: listing.images ?? [],
      description: listing.description,
      amenities: listing.amenities,
    }
  }, [listing])

  const isLoading =
    reservationQuery.isLoading

  const hasError =
    reservationQuery.isError

  const isPast = reservation ? isPastReservation(reservation.end_at) : false

  const handleCancelReservation = async () => {
    if (!reservation) return
    if (isPastReservation(reservation.end_at)) return

    if (!confirm("Cancel this reservation?")) return

    try {
      await cancelReservationMutation.mutateAsync({ p_reservation_id: reservation.id })
      await reservationQuery.refetch()
    } catch {
      // handled by global error state
    }
  }

  return (
    <main className="min-h-[calc(100vh-5.5rem)] bg-[#f5f5f5] px-4 py-8 md:px-8">
      <Card className="mx-auto w-full max-w-5xl border-[#e9e9e9] bg-[#ffffff] shadow-lg">
        <CardHeader className="border-b border-[#e9e9e9] bg-gradient-to-b from-[#fcfcfc] to-[#ffffff]">
          <div className="mb-3 flex items-center justify-between">
            <Button asChild variant="outline" className="gap-2">
              <Link to="/dashboard">
                <ChevronLeft className="h-4 w-4" />
                Back
              </Link>
            </Button>
            {reservation ? (
              <Badge variant="outline" className="border-[#dadada] bg-[#ffffff] text-[#000000]">
                Reservation #{reservation.id.slice(0, 8)}
              </Badge>
            ) : null}
          </div>
          <CardTitle className="text-3xl text-[#000000]">Reservation details</CardTitle>
          <CardDescription>Everything about this booking in one place.</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 p-6">
          {isLoading ? (
            <div className="rounded-xl border border-[#e9e9e9] bg-[#fafafa] px-4 py-6 text-sm text-[#6a6a6a]">
              Loading reservation...
            </div>
          ) : null}

          {hasError ? (
            <div className="rounded-xl border border-[#f1c3bd] bg-[#fff3f2] px-4 py-6 text-sm text-[#b42318]">
              Could not load reservation details.
            </div>
          ) : null}

          {!isLoading && !hasError && !reservation ? (
            <div className="rounded-xl border border-dashed border-[#d9d9d9] bg-[#fafafa] px-4 py-8 text-center text-sm text-[#6a6a6a]">
              Reservation not found.
            </div>
          ) : null}

          {!isLoading && !hasError && reservation ? (
            <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
              <div className="space-y-3">
                {listingCardItem ? (
                  <div>
                    <div className="max-w-sm">
                      <ListingCard
                        listing={listingCardItem}
                        onClick={() => navigate(`/listing/${reservation.listing_id}`)}
                      />
                    </div>
                  </div>
                ) : null}

                <div className="rounded-2xl border border-[#e9e9e9] bg-[#fafafa] p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#6a6a6a]">Status</p>
                  <Badge variant="outline" className="border-[#dadada] bg-[#ffffff] text-[#000000]">
                    {reservation.status}
                  </Badge>
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid gap-3 rounded-2xl border border-[#e9e9e9] bg-[#f8f8f8] p-4 md:grid-cols-2">
                  <div className="rounded-xl bg-[#ffffff] px-3 py-2">
                    <p className="text-xs text-[#6a6a6a]">Listing</p>
                    <p className="font-medium text-[#000000]">{listing?.title ?? "Listing"}</p>
                    <p className="text-sm text-[#6a6a6a]">{listing?.subtitle ?? ""}</p>
                  </div>

                  <div className="rounded-xl bg-[#ffffff] px-3 py-2">
                    <p className="text-xs text-[#6a6a6a]">Total</p>
                    <p className="font-medium text-[#000000]">{formatCurrency(reservation.total_price)}</p>
                  </div>

                  <div className="rounded-xl bg-[#ffffff] px-3 py-2">
                    <p className="flex items-center gap-2 text-xs text-[#6a6a6a]"><CalendarClock className="h-3.5 w-3.5" /> Start</p>
                    <p className="font-medium text-[#000000]">{formatDateTime(reservation.start_at)}</p>
                  </div>

                  <div className="rounded-xl bg-[#ffffff] px-3 py-2">
                    <p className="flex items-center gap-2 text-xs text-[#6a6a6a]"><CalendarClock className="h-3.5 w-3.5" /> End</p>
                    <p className="font-medium text-[#000000]">{formatDateTime(reservation.end_at)}</p>
                  </div>

                  <div className="rounded-xl bg-[#ffffff] px-3 py-2">
                    <p className="flex items-center gap-2 text-xs text-[#6a6a6a]"><Clock3 className="h-3.5 w-3.5" /> Duration</p>
                    <p className="font-medium text-[#000000]">{getDurationHours(reservation.start_at, reservation.end_at)}h</p>
                  </div>

                  <div className="rounded-xl bg-[#ffffff] px-3 py-2">
                    <p className="flex items-center gap-2 text-xs text-[#6a6a6a]"><Users className="h-3.5 w-3.5" /> Guests</p>
                    <p className="font-medium text-[#000000]">{reservation.guests}</p>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-[#e9e9e9] bg-[#ffffff] px-3 py-2">
                    <p className="flex items-center gap-2 text-xs text-[#6a6a6a]"><Hash className="h-3.5 w-3.5" /> Reservation ID</p>
                    <p className="break-all text-sm text-[#000000]">{reservation.id}</p>
                  </div>
                  <div className="rounded-xl border border-[#e9e9e9] bg-[#ffffff] px-3 py-2">
                    <p className="flex items-center gap-2 text-xs text-[#6a6a6a]"><ReceiptText className="h-3.5 w-3.5" /> Renter ID</p>
                    <p className="break-all text-sm text-[#000000]">{reservation.renter_id}</p>
                  </div>
                  <div className="rounded-xl border border-[#e9e9e9] bg-[#ffffff] px-3 py-2 md:col-span-2">
                    <p className="flex items-center gap-2 text-xs text-[#6a6a6a]"><MapPin className="h-3.5 w-3.5" /> Listing ID</p>
                    <p className="break-all text-sm text-[#000000]">{reservation.listing_id}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-[#e9e9e9] bg-[#ffffff] p-4">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#6a6a6a]">All reservation fields</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg bg-[#f8f8f8] px-3 py-2">
                      <p className="text-xs text-[#6a6a6a]">id</p>
                      <p className="break-all text-sm text-[#000000]">{reservation.id}</p>
                    </div>
                    <div className="rounded-lg bg-[#f8f8f8] px-3 py-2">
                      <p className="text-xs text-[#6a6a6a]">listing_id</p>
                      <p className="break-all text-sm text-[#000000]">{reservation.listing_id}</p>
                    </div>
                    <div className="rounded-lg bg-[#f8f8f8] px-3 py-2">
                      <p className="text-xs text-[#6a6a6a]">renter_id</p>
                      <p className="break-all text-sm text-[#000000]">{reservation.renter_id}</p>
                    </div>
                    <div className="rounded-lg bg-[#f8f8f8] px-3 py-2">
                      <p className="text-xs text-[#6a6a6a]">status</p>
                      <p className="text-sm text-[#000000]">{reservation.status}</p>
                    </div>
                    <div className="rounded-lg bg-[#f8f8f8] px-3 py-2">
                      <p className="text-xs text-[#6a6a6a]">start_at</p>
                      <p className="text-sm text-[#000000]">{reservation.start_at}</p>
                    </div>
                    <div className="rounded-lg bg-[#f8f8f8] px-3 py-2">
                      <p className="text-xs text-[#6a6a6a]">end_at</p>
                      <p className="text-sm text-[#000000]">{reservation.end_at}</p>
                    </div>
                    <div className="rounded-lg bg-[#f8f8f8] px-3 py-2">
                      <p className="text-xs text-[#6a6a6a]">guests</p>
                      <p className="text-sm text-[#000000]">{reservation.guests}</p>
                    </div>
                    <div className="rounded-lg bg-[#f8f8f8] px-3 py-2">
                      <p className="text-xs text-[#6a6a6a]">total_price</p>
                      <p className="text-sm text-[#000000]">{reservation.total_price}</p>
                    </div>
                    <div className="rounded-lg bg-[#f8f8f8] px-3 py-2">
                      <p className="text-xs text-[#6a6a6a]">created_at</p>
                      <p className="text-sm text-[#000000]">{reservation.created_at}</p>
                    </div>
                    <div className="rounded-lg bg-[#f8f8f8] px-3 py-2">
                      <p className="text-xs text-[#6a6a6a]">updated_at</p>
                      <p className="text-sm text-[#000000]">{reservation.updated_at}</p>
                    </div>
                  </div>
                </div>

                {listing ? (
                  <div className="rounded-2xl border border-[#e9e9e9] bg-[#ffffff] p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#6a6a6a]">All listing fields</p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-lg bg-[#f8f8f8] px-3 py-2"><p className="text-xs text-[#6a6a6a]">id</p><p className="break-all text-sm text-[#000000]">{listing.id}</p></div>
                      <div className="rounded-lg bg-[#f8f8f8] px-3 py-2"><p className="text-xs text-[#6a6a6a]">owner_id</p><p className="break-all text-sm text-[#000000]">{listing.owner_id ?? ""}</p></div>
                      <div className="rounded-lg bg-[#f8f8f8] px-3 py-2 md:col-span-2"><p className="text-xs text-[#6a6a6a]">address</p><p className="text-sm text-[#000000]">{listing.address}</p></div>
                      <div className="rounded-lg bg-[#f8f8f8] px-3 py-2"><p className="text-xs text-[#6a6a6a]">lat</p><p className="text-sm text-[#000000]">{listing.lat}</p></div>
                      <div className="rounded-lg bg-[#f8f8f8] px-3 py-2"><p className="text-xs text-[#6a6a6a]">lng</p><p className="text-sm text-[#000000]">{listing.lng}</p></div>
                      <div className="rounded-lg bg-[#f8f8f8] px-3 py-2"><p className="text-xs text-[#6a6a6a]">title</p><p className="text-sm text-[#000000]">{listing.title}</p></div>
                      <div className="rounded-lg bg-[#f8f8f8] px-3 py-2"><p className="text-xs text-[#6a6a6a]">subtitle</p><p className="text-sm text-[#000000]">{listing.subtitle}</p></div>
                      <div className="rounded-lg bg-[#f8f8f8] px-3 py-2"><p className="text-xs text-[#6a6a6a]">category</p><p className="text-sm text-[#000000]">{listing.category}</p></div>
                      <div className="rounded-lg bg-[#f8f8f8] px-3 py-2"><p className="text-xs text-[#6a6a6a]">price</p><p className="text-sm text-[#000000]">{listing.price}</p></div>
                      <div className="rounded-lg bg-[#f8f8f8] px-3 py-2"><p className="text-xs text-[#6a6a6a]">average_rating</p><p className="text-sm text-[#000000]">{listing.average_rating}</p></div>
                      <div className="rounded-lg bg-[#f8f8f8] px-3 py-2"><p className="text-xs text-[#6a6a6a]">review_count</p><p className="text-sm text-[#000000]">{listing.review_count}</p></div>
                      <div className="rounded-lg bg-[#f8f8f8] px-3 py-2"><p className="text-xs text-[#6a6a6a]">rating_sum</p><p className="text-sm text-[#000000]">{listing.rating_sum}</p></div>
                      <div className="rounded-lg bg-[#f8f8f8] px-3 py-2"><p className="text-xs text-[#6a6a6a]">images count</p><p className="text-sm text-[#000000]">{listing.images?.length ?? 0}</p></div>
                      <div className="rounded-lg bg-[#f8f8f8] px-3 py-2 md:col-span-2"><p className="text-xs text-[#6a6a6a]">description</p><p className="text-sm text-[#000000]">{listing.description}</p></div>
                      <div className="rounded-lg bg-[#f8f8f8] px-3 py-2 md:col-span-2"><p className="text-xs text-[#6a6a6a]">amenities</p><p className="text-sm text-[#000000]">{(listing.amenities ?? []).join(", ")}</p></div>
                      <div className="rounded-lg bg-[#f8f8f8] px-3 py-2"><p className="text-xs text-[#6a6a6a]">created_at</p><p className="text-sm text-[#000000]">{listing.created_at}</p></div>
                      <div className="rounded-lg bg-[#f8f8f8] px-3 py-2"><p className="text-xs text-[#6a6a6a]">updated_at</p><p className="text-sm text-[#000000]">{listing.updated_at}</p></div>
                    </div>
                  </div>
                ) : null}

                {owner ? (
                  <div className="rounded-2xl border border-[#e9e9e9] bg-[#ffffff] p-4">
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#6a6a6a]">All owner fields</p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-lg bg-[#f8f8f8] px-3 py-2"><p className="text-xs text-[#6a6a6a]">id</p><p className="break-all text-sm text-[#000000]">{owner.id}</p></div>
                      <div className="rounded-lg bg-[#f8f8f8] px-3 py-2"><p className="text-xs text-[#6a6a6a]">email</p><p className="text-sm text-[#000000]">{owner.email ?? ""}</p></div>
                      <div className="rounded-lg bg-[#f8f8f8] px-3 py-2"><p className="text-xs text-[#6a6a6a]">first_name</p><p className="text-sm text-[#000000]">{owner.first_name}</p></div>
                      <div className="rounded-lg bg-[#f8f8f8] px-3 py-2"><p className="text-xs text-[#6a6a6a]">last_name</p><p className="text-sm text-[#000000]">{owner.last_name}</p></div>
                      <div className="rounded-lg bg-[#f8f8f8] px-3 py-2"><p className="text-xs text-[#6a6a6a]">phone_number</p><p className="text-sm text-[#000000]">{owner.phone_number ?? ""}</p></div>
                      <div className="rounded-lg bg-[#f8f8f8] px-3 py-2"><p className="text-xs text-[#6a6a6a]">inserted_at</p><p className="text-sm text-[#000000]">{owner.inserted_at}</p></div>
                      <div className="rounded-lg bg-[#f8f8f8] px-3 py-2 md:col-span-2"><p className="text-xs text-[#6a6a6a]">updated_at</p><p className="text-sm text-[#000000]">{owner.updated_at}</p></div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </CardContent>

        <CardFooter className="border-t border-[#e9e9e9] px-6 py-6">
          {reservation ? (
            <div className="flex w-full flex-wrap items-center justify-between gap-3">
              <Button asChild variant="outline">
                <Link to={`/listing/${reservation.listing_id}`}>Open listing</Link>
              </Button>

              {reservation.status !== "CANCELLED" && !isPast ? (
                <Button
                  variant="destructive"
                  onClick={handleCancelReservation}
                  disabled={cancelReservationMutation.isPending}
                >
                  {cancelReservationMutation.isPending ? "Cancelling..." : "Cancel reservation"}
                </Button>
              ) : isPast ? (
                <Badge variant="outline" className="border-[#dadada] bg-[#f7f7f7] text-[#6a6a6a]">
                  Past reservation
                </Badge>
              ) : (
                <Badge variant="outline" className="border-[#dadada] bg-[#f7f7f7] text-[#6a6a6a]">
                  Already cancelled
                </Badge>
              )}
            </div>
          ) : (
            <Button asChild variant="outline">
              <Link to="/dashboard">Back to dashboard</Link>
            </Button>
          )}
        </CardFooter>
      </Card>
    </main>
  )
}
