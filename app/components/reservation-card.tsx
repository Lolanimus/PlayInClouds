import { ArrowRight, CalendarClock, Clock3, Star, Users } from "lucide-react"
import { useNavigate } from "react-router"

import { TimeDisplay, TimeRangeDisplay } from "@/components/time-display"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useCurrency } from "@/hooks/useCurrency"
import { usePendingReservationReviews } from "@/hooks/useReviews"
import {
  useAcceptLateReservationTerms,
  useCancelReservation,
  useConfirmReservation,
} from "@/hooks/useReservations"
import { useUser } from "@/store/user_state"
import type { PendingReservationReview, Reservation } from "@/types/custom/api.types"

type ReservationCardReservation = Reservation & {
  listingTitle: string
  listingSubtitle?: string
  listingImage?: string
  listingOwnerId?: string | null
  listingTimezone?: string | null
  listingCancellationPolicyHours?: number | null
}

function getReservationTimeStatus(startAtIso: string, endAtIso: string) {
  const reservationStart = new Date(startAtIso)
  const reservationEnd = new Date(endAtIso)

  if (Number.isNaN(reservationStart.getTime()) || Number.isNaN(reservationEnd.getTime())) {
    return "unknown" as const
  }

  const now = Date.now()

  if (now < reservationStart.getTime()) {
    return "upcoming" as const
  }

  if (now >= reservationStart.getTime() && now < reservationEnd.getTime()) {
    return "ongoing" as const
  }

  return "past" as const
}

function getBookedHours(startAtIso: string, endAtIso: string) {
  const start = new Date(startAtIso)
  const end = new Date(endAtIso)

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0
  }

  return Math.max(0, (end.getTime() - start.getTime()) / (1000 * 60 * 60))
}

function canCancelBeforePaymentDeadline(startAtIso: string, endAtIso: string, paymentDeadlineIso: string) {
  const now = Date.now()
  const start = new Date(startAtIso)
  const end = new Date(endAtIso)
  const paymentDeadline = new Date(paymentDeadlineIso)

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || Number.isNaN(paymentDeadline.getTime())) return false
  if (end.getTime() <= now) return false
  if (start.getTime() <= now) return false
  return now < paymentDeadline.getTime()
}

function isExpiredUnresolvedReservation(status: string, paymentDeadlineIso: string) {
  if (status !== "PENDING" && status !== "PENDING_AWAITING_LATE_CONSENT") return false

  const paymentDeadline = new Date(paymentDeadlineIso)
  if (Number.isNaN(paymentDeadline.getTime())) return false

  return paymentDeadline.getTime() <= Date.now()
}

export function ReservationCard({
  reservation,
}: {
  reservation: ReservationCardReservation
}) {
  const navigate = useNavigate()
  const user = useUser()
  const currency = useCurrency()
  const pendingReviewsQuery = usePendingReservationReviews({ enabled: Boolean(user?.id) })
  const confirmMutation = useConfirmReservation()
  const cancelMutation = useCancelReservation()
  const acceptLateMutation = useAcceptLateReservationTerms()
  const timeStatus = getReservationTimeStatus(reservation.start_at, reservation.end_at)
  const isPast = timeStatus === "past"
  const hasStarted = timeStatus === "ongoing" || timeStatus === "past"
  const isHost = Boolean(user?.id && reservation.listingOwnerId && reservation.listingOwnerId === user.id)
  const isRenter = Boolean(user?.id && reservation.renter_id === user.id)
  const isAwaitingLateConsent = reservation.status === "PENDING_AWAITING_LATE_CONSENT"
  const isExpiredPending = isExpiredUnresolvedReservation(reservation.status, reservation.payment_deadline)
  const hostHasPreconfirmedLateRequest = Boolean(reservation.host_preconfirmed_at)
  const renterCancellationEnabled = typeof reservation.listingCancellationPolicyHours === "number"
  const cancelAllowedByDeadline = canCancelBeforePaymentDeadline(
    reservation.start_at,
    reservation.end_at,
    reservation.payment_deadline
  )
  const listingTimeZone = reservation.listingTimezone ?? "UTC"
  const pendingReviewPrompt =
    (((pendingReviewsQuery.data as PendingReservationReview[] | null) ?? []).find(
      (review) => review.reservation_id === reservation.id
    )) ?? null
  const reviewLabel = pendingReviewPrompt?.reviewer_role === "HOST_TO_BOOKER"
    ? "Review guest"
    : "Leave a review"
  const actionsDisabled = confirmMutation.isPending || cancelMutation.isPending || acceptLateMutation.isPending

  const handleConfirm = async () => {
    if (!isHost || (reservation.status !== "PENDING" && reservation.status !== "PENDING_AWAITING_LATE_CONSENT") || hasStarted) return

    try {
      await confirmMutation.mutateAsync({ p_reservation_id: reservation.id })
    } catch {
      // handled by error store
    }
  }

  const handleCancel = async () => {
    if (!isHost || reservation.status === "CANCELLED" || hasStarted) return
    if (!confirm("Cancel this reservation?")) return

    try {
      await cancelMutation.mutateAsync({ p_reservation_id: reservation.id })
    } catch {
      // handled by error store
    }
  }

  const handleAcceptLate = async () => {
    if (!isRenter || !isAwaitingLateConsent || hasStarted) return
    if (!confirm("Continue this late request? After you accept, you won't be able to cancel it.")) return

    try {
      await acceptLateMutation.mutateAsync({ p_reservation_id: reservation.id })
    } catch {
      // handled by error store
    }
  }

  return (
    <div className="rounded-2xl border border-[#e9e9e9] bg-[#ffffff] p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-col gap-4 sm:flex-row">
        <button
          type="button"
          onClick={() => navigate(`/listing/${reservation.listing_id}`)}
          className="group relative h-32 w-full overflow-hidden rounded-xl sm:w-48"
        >
          {reservation.listingImage ? (
            <img
              src={reservation.listingImage}
              alt={reservation.listingTitle}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="h-full w-full bg-[#f0f0f0]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#000000]/35 via-transparent to-transparent" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold text-[#000000]">
              {reservation.listingTitle}
            </h3>
            {isExpiredPending ? (
              <Badge variant="outline" className="border-[#ebd0d5] bg-[#fff1f3] text-[#b42318]">
                Expired
              </Badge>
            ) : timeStatus === "upcoming" ? (
              <Badge variant="success">Upcoming</Badge>
            ) : timeStatus === "ongoing" ? (
              <Badge variant="success">Ongoing</Badge>
            ) : timeStatus === "past" ? (
              <Badge variant="outline" className="border-[#dadada] bg-[#f7f7f7] text-[#6a6a6a]">
                Past
              </Badge>
            ) : (
              <Badge variant="outline" className="border-[#dadada] bg-[#f7f7f7] text-[#6a6a6a]">
                Unknown date
              </Badge>
            )}

            {isExpiredPending ? null : reservation.status === "CONFIRMED" ? (
              <Badge variant="outline" className="border-[#b7eb8f] bg-[#f6ffed] text-[#237804]">
                Confirmed
              </Badge>
            ) : reservation.status === "PENDING" ? (
              <Badge variant="outline" className="border-[#ffe58f] bg-[#fffbe6] text-[#ad6800]">
                Pending
              </Badge>
            ) : reservation.status === "PENDING_AWAITING_LATE_CONSENT" ? (
              <Badge variant="outline" className="border-[#ffd591] bg-[#fff7e6] text-[#ad4e00]">
                Pending
              </Badge>
            ) : null}
          </div>

          <p className="mb-3 truncate text-sm text-[#6a6a6a]">{reservation.listingSubtitle ?? ""}</p>

          <div className="grid gap-2 text-sm text-[#000000] md:grid-cols-2">
            <div className="flex items-center gap-2 rounded-lg bg-[#f8f8f8] px-3 py-2">
              <CalendarClock className="h-4 w-4 text-[#6a6a6a]" />
              <TimeRangeDisplay
                startUtcIso={reservation.start_at}
                endUtcIso={reservation.end_at}
                eventTimeZone={listingTimeZone}
                mode="event-primary"
              />
            </div>

            <div className="flex items-center gap-2 rounded-lg bg-[#f8f8f8] px-3 py-2">
              <Users className="h-4 w-4 text-[#6a6a6a]" />
              <span>{reservation.guests} {reservation.guests === 1 ? "guest" : "guests"}</span>
            </div>

            <div className="flex items-center gap-2 rounded-lg bg-[#f8f8f8] px-3 py-2">
              <Clock3 className="h-4 w-4 text-[#6a6a6a]" />
              <span>{getBookedHours(reservation.start_at, reservation.end_at)}h booked</span>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-[#f8f8f8] px-3 py-2 font-medium">
              <span className="text-[#6a6a6a]">Total</span>
              <span>{currency.formatFromCad(reservation.total_price)}</span>
            </div>
          </div>

          {isRenter && isAwaitingLateConsent && !isExpiredPending ? (
            <p className="mt-3 rounded-lg border border-[#ffd591] bg-[#fff7e6] px-3 py-2 text-sm text-[#ad4e00]">
              This request has passed the standard cancellation window and now requires your approval to continue as a late request. The host still has to confirm it. If you continue, you won&apos;t be able to cancel it.
            </p>
          ) : null}

          {isExpiredPending ? (
            <p className="mt-3 rounded-lg border border-[#ebd0d5] bg-[#fff1f3] px-3 py-2 text-sm text-[#b42318]">
              This reservation is no longer active. It expired at{" "}
              <TimeDisplay
                utcIso={reservation.payment_deadline}
                eventTimeZone={listingTimeZone}
                mode="event-primary"
              />
              .
            </p>
          ) : null}

          <div className="mt-3 flex justify-end">
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => navigate(`/reservation/${reservation.id}`)}
                className="h-8 px-2"
              >
                Reservation details
              </Button>

              <Button
                variant="ghost"
                onClick={() => navigate(`/listing/${reservation.listing_id}`)}
                className="h-8 gap-1 px-2 text-[#000000] hover:bg-[#f2f2f2]"
              >
                View listing
                <ArrowRight className="h-4 w-4" />
              </Button>

              {pendingReviewPrompt ? (
                <Button
                  className="gap-2 bg-[#000000] text-[#ffffff] shadow-[0_10px_24px_rgba(0,0,0,0.18)] hover:-translate-y-0.5 hover:bg-[#1f1f1f] hover:shadow-[0_14px_32px_rgba(0,0,0,0.22)]"
                  onClick={() => navigate(`/reservation/${reservation.id}?leaveReview=1`)}
                >
                  <Star className="h-4 w-4 fill-current" />
                  {reviewLabel}
                </Button>
              ) : null}

              {isRenter && isAwaitingLateConsent && !isPast && !isExpiredPending ? (
                <Button
                  className="bg-[#ad6800] text-[#ffffff] hover:bg-[#8f5800]"
                  onClick={handleAcceptLate}
                  disabled={actionsDisabled}
                >
                  {acceptLateMutation.isPending ? "Continuing..." : "Continue late request"}
                </Button>
              ) : null}

              {isHost && (reservation.status === "PENDING" || reservation.status === "PENDING_AWAITING_LATE_CONSENT") && !isPast && !isExpiredPending && !(isAwaitingLateConsent && hostHasPreconfirmedLateRequest) ? (
                <Button
                  className="bg-[#237804] text-[#ffffff] hover:bg-[#1f6a03]"
                  onClick={handleConfirm}
                  disabled={actionsDisabled}
                >
                  {isAwaitingLateConsent ? "Confirm late request" : "Confirm"}
                </Button>
              ) : null}

              {isHost && reservation.status !== "CANCELLED" && !isPast && cancelAllowedByDeadline ? (
                <Button
                  variant="destructive"
                  onClick={handleCancel}
                  disabled={actionsDisabled}
                >
                  Cancel
                </Button>
              ) : null}

              {isRenter && renterCancellationEnabled && reservation.status !== "CANCELLED" && !isPast && !reservation.late_consent_given_at && cancelAllowedByDeadline ? (
                <Button
                  variant="destructive"
                  onClick={async () => {
                    if (!confirm("Cancel this reservation?")) return
                    try {
                      await cancelMutation.mutateAsync({ p_reservation_id: reservation.id })
                    } catch {
                      // handled by error store
                    }
                  }}
                  disabled={actionsDisabled}
                >
                  Cancel
                </Button>
              ) : null}
            </div>
          </div>

          {isHost && isAwaitingLateConsent && hostHasPreconfirmedLateRequest && !isPast && !isExpiredPending ? (
            <p className="mt-3 rounded-lg border border-[#d8e3f0] bg-[#f6f9fc] px-3 py-2 text-sm text-[#35516d]">
              You already confirmed this late request. It is now waiting for the guest to accept the late-request terms.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
