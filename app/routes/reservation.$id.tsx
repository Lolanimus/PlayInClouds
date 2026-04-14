import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { CalendarClock, ChevronLeft, Clock3, ExternalLink, Hash, MapPin, MessageCircle, ReceiptText, Users } from "lucide-react"

import { MapView } from "~/components/map-view"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { ListingCard, type ListingItem } from "~/components/listings"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { useCancelReservation, useConfirmReservation, useGetReservation } from "~/hooks/useReservations"
import { useUser } from "~/store/user_state"
import type { Listing, Reservation } from "~/types/custom/api.types"

type ReservationProfile = {
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
  owner?: ReservationProfile | null
  booker?: ReservationProfile | null
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

function canRenterCancel(startAtIso: string, endAtIso: string, cancellationPolicyHours: number | null | undefined) {
  const now = Date.now()
  const start = new Date(startAtIso)
  const end = new Date(endAtIso)

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false
  if (end.getTime() <= now) return false
  if (start.getTime() <= now) return false

  if (typeof cancellationPolicyHours !== "number") return true

  const deadline = start.getTime() - cancellationPolicyHours * 60 * 60 * 1000
  return now <= deadline
}

function getProfileDisplayName(profile: ReservationProfile | null, fallback: string) {
  if (!profile) return fallback

  const fullName = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim()
  return fullName || profile.email || fallback
}

function formatCancellationPolicy(hours: number | null | undefined) {
  if (typeof hours !== "number") return "No cancellation policy set"
  if (hours <= 0) return "Cancellation allowed until the reservation starts"
  return `Cancel up to ${hours} hour${hours === 1 ? "" : "s"} before the reservation start`
}

function getStatusBadgeClass(status: string) {
  switch (status) {
    case "CONFIRMED":
      return "border-[#cfe7d6] bg-[#effaf2] text-[#166534]"
    case "PENDING":
      return "border-[#f4dfb0] bg-[#fff8e8] text-[#9a6700]"
    case "CANCELLED":
      return "border-[#ebd0d5] bg-[#fff1f3] text-[#b42318]"
    default:
      return "border-[#dadada] bg-[#ffffff] text-[#000000]"
  }
}

function getStatusTextClass(status: string) {
  switch (status) {
    case "CONFIRMED":
      return "text-[#166534]"
    case "PENDING":
      return "text-[#9a6700]"
    case "CANCELLED":
      return "text-[#b42318]"
    default:
      return "text-[#111111]"
  }
}

export default function ReservationDetailsPage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const user = useUser()
  const [showMoreInfo, setShowMoreInfo] = useState(false)
  const cancelReservationMutation = useCancelReservation()
  const confirmReservationMutation = useConfirmReservation()

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
  const booker = reservationPayload?.booker ?? null
  const listingCardItem = useMemo<ListingItem | null>(() => {
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
      equipmentDesc: listing.equipment_desc,
      conveniencesDesc: listing.conveniences_desc,
      areaM2: listing.area_m2,
    }
  }, [listing])

  const isLoading =
    reservationQuery.isLoading

  const hasError =
    reservationQuery.isError

  const isPast = reservation ? isPastReservation(reservation.end_at) : false
  const isRenter = Boolean(user?.id && reservation?.renter_id === user.id)
  const isHost = Boolean(user?.id && owner?.id === user.id)
  const renterCanCancel = reservation && listing
    ? canRenterCancel(reservation.start_at, reservation.end_at, listing.cancellation_policy_hours)
    : false
  const canCancel = reservation
    ? (isRenter ? renterCanCancel : !isPast)
    : false
  const canConfirm = Boolean(reservation && isHost && reservation.status === "PENDING" && !isPast)
  const mapListings = useMemo<ListingItem[]>(() => {
    return listingCardItem ? [listingCardItem] : []
  }, [listingCardItem])
  const profileCardTitle = isHost ? "Booker profile" : "Host profile"
  const profileCardDescription = isHost
    ? "The guest who made this reservation."
    : "Your contact for booking-related questions."
  const profile = isHost ? booker : owner
  const profileDisplayName = getProfileDisplayName(profile, isHost ? "Booker" : "Host")
  const profileRoleLabel = isHost ? "Booker" : "Host"

  const handleCancelReservation = async () => {
    if (!reservation) return
    if (!canCancel) return

    if (!confirm("Cancel this reservation?")) return

    try {
      await cancelReservationMutation.mutateAsync({ p_reservation_id: reservation.id })
      await reservationQuery.refetch()
    } catch {
      // handled by global error state
    }
  }

  const handleConfirmReservation = async () => {
    if (!reservation || !canConfirm) return

    if (!confirm("Confirm this reservation?")) return

    try {
      await confirmReservationMutation.mutateAsync({ p_reservation_id: reservation.id })
      await reservationQuery.refetch()
    } catch {
      // handled by global error state
    }
  }

  return (
    <div className="h-[calc(100vh-5.5rem)] flex flex-col bg-[#f5f5f5]">
      <main className="flex-1 flex overflow-hidden">
        <section className="w-1/2 overflow-y-auto border-r border-[#e9e9e9] pb-4">
          <div className="mx-auto my-4 max-w-3xl space-y-4 px-4">
            <Card className="overflow-hidden border-[#e9e9e9] bg-[#ffffff] shadow-sm">
              <CardHeader className="rounded-2xl border border-[#efefef] bg-[#fbfbfb] p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <Button asChild variant="outline" className="gap-2">
                    <Link to="/dashboard">
                      <ChevronLeft className="h-4 w-4" />
                      Back
                    </Link>
                  </Button>
                  {reservation ? (
                    <Badge variant="outline" className={getStatusBadgeClass(reservation.status)}>
                      Reservation #{reservation.id.slice(0, 8)}
                    </Badge>
                  ) : null}
                </div>
                <CardTitle className="text-3xl tracking-tight text-[#000000]">Reservation details</CardTitle>
                <CardDescription className="max-w-2xl text-[#6a6a6a]">
                  Everything you need for this booking, including the space, timing, host info, payment summary, and support options.
                </CardDescription>
                {reservation ? (
                  <div className="mt-5 space-y-3">
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-2xl border border-[#ececec] bg-[#ffffff] px-4 py-3 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
                        <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#7a7a7a]">Status</p>
                        <p className={`mt-1 text-sm font-semibold ${getStatusTextClass(reservation.status)}`}>{reservation.status}</p>
                      </div>
                      <div className="rounded-2xl border border-[#ececec] bg-[#ffffff] px-4 py-3 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
                        <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#7a7a7a]">Total paid</p>
                        <p className="mt-1 text-sm font-semibold text-[#111111]">{formatCurrency(reservation.total_price)}</p>
                      </div>
                      <div className="rounded-2xl border border-[#ececec] bg-[#ffffff] px-4 py-3 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
                        <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#7a7a7a]">Duration</p>
                        <p className="mt-1 text-sm font-semibold text-[#111111]">{getDurationHours(reservation.start_at, reservation.end_at)} hours</p>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border border-[#ececec] bg-[#ffffff] px-4 py-4 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
                        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-[#7a7a7a]">
                          <CalendarClock className="h-3.5 w-3.5" />
                          Start
                        </p>
                        <p className="mt-2 text-sm font-medium leading-6 text-[#111111]">{formatDateTime(reservation.start_at)}</p>
                      </div>
                      <div className="rounded-2xl border border-[#ececec] bg-[#ffffff] px-4 py-4 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
                        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-[#7a7a7a]">
                          <CalendarClock className="h-3.5 w-3.5" />
                          End
                        </p>
                        <p className="mt-2 text-sm font-medium leading-6 text-[#111111]">{formatDateTime(reservation.end_at)}</p>
                      </div>
                      <div className="rounded-2xl border border-[#ececec] bg-[#ffffff] px-4 py-4 shadow-[0_1px_0_rgba(0,0,0,0.02)] md:col-span-2">
                        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-[#7a7a7a]">
                          <MapPin className="h-3.5 w-3.5" />
                          Address
                        </p>
                        <p className="mt-2 text-sm font-medium leading-6 text-[#111111]">{listing?.address || "No address available"}</p>
                      </div>
                    </div>

                    {canConfirm ? (
                      <Button
                        className="h-11 w-full rounded-full border border-[#1f8f4a] bg-[#eaf8ef] px-3 py-1 text-sm font-semibold text-[#0f6130] shadow-sm transition-colors hover:bg-[#ddf2e5]"
                        onClick={handleConfirmReservation}
                        disabled={confirmReservationMutation.isPending}
                      >
                        {confirmReservationMutation.isPending ? "Confirming..." : "Confirm reservation"}
                      </Button>
                    ) : isRenter && !isPast ? (
                      <Badge variant="outline" className="border-[#dadada] bg-[#f7f7f7] text-[#6a6a6a]">
                        Cancellation window ended
                      </Badge>
                    ) : isPast ? (
                      <div className="rounded-2xl border border-[#ececec] bg-[#ffffff] px-4 py-4 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
                        <Badge variant="outline" className="border-[#dadada] bg-[#f7f7f7] text-[#6a6a6a]">
                          Past reservation
                        </Badge>
                      </div>
                    ) : reservation.status === "CANCELLED" ? (
                      <div className="rounded-2xl border border-[#ececec] bg-[#ffffff] px-4 py-4 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
                        <Badge variant="outline" className="border-[#dadada] bg-[#f7f7f7] text-[#6a6a6a]">
                          Already cancelled
                        </Badge>
                      </div>
                    ) : null}

                    <div className="flex justify-start">
                      <button
                        type="button"
                        className="text-sm font-medium text-[#111111] underline underline-offset-4 transition-colors hover:text-[#6a6a6a]"
                        onClick={() => setShowMoreInfo((current) => !current)}
                      >
                        {showMoreInfo ? "Less info" : "More info"}
                      </button>
                    </div>

                    {showMoreInfo ? (
                      <div className="space-y-3">
                        <div className="rounded-2xl border border-[#ececec] bg-[#ffffff] px-4 py-4 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
                          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-[#7a7a7a]"><Users className="h-3.5 w-3.5" /> Guests</p>
                          <p className="mt-2 text-sm font-medium leading-6 text-[#111111]">{reservation.guests}</p>
                        </div>
                        <div className="rounded-2xl border border-[#ececec] bg-[#ffffff] px-4 py-4 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
                          <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#7a7a7a]">Cancellation policy</p>
                          <p className="mt-2 text-sm font-medium leading-6 text-[#111111]">{formatCancellationPolicy(listing?.cancellation_policy_hours)}</p>
                        </div>
                        <div className="rounded-2xl border border-[#ececec] bg-[#ffffff] px-4 py-4 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
                          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-[#7a7a7a]"><Hash className="h-3.5 w-3.5" /> Reservation ID</p>
                          <p className="mt-2 break-all text-sm font-medium leading-6 text-[#111111]">{reservation.id}</p>
                        </div>
                        {reservation.status !== "CANCELLED" && canCancel ? (
                          <Button
                            variant="destructive"
                            className="h-11 w-full rounded-full"
                            onClick={handleCancelReservation}
                            disabled={cancelReservationMutation.isPending}
                          >
                            {cancelReservationMutation.isPending ? "Cancelling..." : "Cancel reservation"}
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </CardHeader>
            </Card>

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
              <>
                <Card className="border-[#e9e9e9] bg-[#ffffff] shadow-sm">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-xl text-[#000000]">Your space</CardTitle>
                    <CardDescription>Review the listing and jump to the most useful actions.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {listingCardItem ? (
                      <div className="max-w-md">
                        <ListingCard
                          listing={listingCardItem}
                          onClick={() => navigate(`/listing/${reservation.listing_id}`)}
                        />
                      </div>
                    ) : null}

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Button
                        asChild
                        className="h-11 w-full rounded-2xl bg-[#111111] px-4 text-[#ffffff] shadow-[0_8px_24px_rgba(17,17,17,0.14)] transition-all hover:-translate-y-0.5 hover:bg-[#222222] hover:shadow-[0_12px_28px_rgba(17,17,17,0.18)]"
                      >
                        <Link to={`/chat`} className="flex w-full items-center justify-center gap-2.5">
                          <MessageCircle className="h-4 w-4" />
                          <span className="font-medium">Chat</span>
                        </Link>
                      </Button>
                      <Button
                        asChild
                        variant="outline"
                        className="h-11 w-full rounded-2xl border-[#dcdcdc] bg-[#ffffff] px-4 text-[#111111] shadow-[0_4px_16px_rgba(15,15,15,0.04)] transition-all hover:-translate-y-0.5 hover:border-[#cfcfcf] hover:bg-[#fafafa] hover:shadow-[0_10px_24px_rgba(15,15,15,0.08)]"
                      >
                        <Link to={`/listing/${reservation.listing_id}`} className="flex w-full items-center justify-center gap-2.5">
                          <ExternalLink className="h-4 w-4" />
                          <span className="font-medium">Open listing</span>
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-[#e9e9e9] bg-[#ffffff] shadow-sm">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-xl text-[#000000]">Rules and instructions</CardTitle>
                    <CardDescription>Important info to know before you arrive.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="rounded-2xl border border-[#efefef] bg-[#fbfbfb] px-4 py-4">
                      <p className="text-xs text-[#6a6a6a]">Instructions</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-[#000000]">{listing?.instructions?.trim() || "No instructions provided yet."}</p>
                    </div>
                    <div className="rounded-2xl border border-[#efefef] bg-[#fbfbfb] px-4 py-4">
                      <p className="text-xs text-[#6a6a6a]">Rules</p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-[#000000]">{listing?.rules?.trim() || "No rules provided yet."}</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-[#e9e9e9] bg-[#ffffff] shadow-sm">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-xl text-[#000000]">{profileCardTitle}</CardTitle>
                    <CardDescription>{profileCardDescription}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Link
                      to={`/chat?reservationId=${reservation.id}`}
                      className="flex items-start gap-4 rounded-2xl border border-[#efefef] bg-[#fbfbfb] px-4 py-4 transition-colors hover:border-[#d8d8d8] hover:bg-[#f7f7f7]"
                    >
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#111111] text-sm font-semibold text-[#ffffff]">
                        {profileDisplayName.slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#6a6a6a]">{profileRoleLabel}</p>
                        <p className="mt-1 text-sm font-semibold text-[#000000]">{profileDisplayName}</p>
                        {profile?.phone_number ? <p className="mt-1 text-sm text-[#6a6a6a]">{profile.phone_number}</p> : null}
                        <p className="mt-2 text-sm font-medium text-[#111111]">Open chat</p>
                      </div>
                    </Link>
                  </CardContent>
                </Card>

                <Card className="border-[#e9e9e9] bg-[#ffffff] shadow-sm">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-xl text-[#000000]">Payment info</CardTitle>
                    <CardDescription>Quick payment summary and receipt timing.</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-[#efefef] bg-[#fbfbfb] px-4 py-4">
                      <p className="text-xs text-[#6a6a6a]">Cost</p>
                      <p className="mt-1 text-base font-semibold text-[#000000]">{formatCurrency(reservation.total_price)}</p>
                    </div>
                    <div className="rounded-2xl border border-[#efefef] bg-[#fbfbfb] px-4 py-4">
                      <p className="flex items-center gap-2 text-xs text-[#6a6a6a]"><ReceiptText className="h-3.5 w-3.5" /> Receipt</p>
                      <p className="mt-1 text-sm text-[#000000]">Booked on {formatDateTime(reservation.created_at)}</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-[#e9e9e9] bg-[#ffffff] shadow-sm">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-xl text-[#000000]">Support</CardTitle>
                    <CardDescription>Get help quickly if something about your reservation changes.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="rounded-2xl border border-[#efefef] bg-[#fbfbfb] p-4">
                      <p className="mb-3 text-sm text-[#6a6a6a]">
                        Need help before your session starts? Reach out in chat or review support resources.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" disabled className="rounded-full border-[#d7d7d7] bg-[#ffffff]">
                        Help Center
                        </Button>
                        <Button asChild variant="outline" className="rounded-full border-[#d7d7d7] bg-[#ffffff]">
                          <Link to="/chat">Contact support</Link>
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

              </>
            ) : null}
          </div>
        </section>

        <aside className="w-1/2 p-4">
          {listing ? (
            <MapView listingsOverride={mapListings} disableFilters markerVariant="pin" />
          ) : (
            <div className="flex h-full min-h-[350px] items-center justify-center rounded-[1.75rem] border border-[#e5e5e5] bg-[#ffffff] px-6 text-center text-sm text-[#6a6a6a] shadow-sm">
              Listing location will appear here once the reservation is loaded.
            </div>
          )}
        </aside>
      </main>
    </div>
  )
}
