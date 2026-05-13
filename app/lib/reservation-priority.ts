type ReservationLike = {
  status: string
  start_at: string
  end_at?: string
  payment_deadline: string
  host_preconfirmed_at?: string | null
  renter_id: string
  listingOwnerId?: string | null
}

function hasReservationStarted(startAtIso: string) {
  const start = new Date(startAtIso)
  if (Number.isNaN(start.getTime())) return false
  return start.getTime() <= Date.now()
}

function hasDeadlinePassed(paymentDeadlineIso: string) {
  const deadline = new Date(paymentDeadlineIso)
  if (Number.isNaN(deadline.getTime())) return false
  return deadline.getTime() <= Date.now()
}

export function reservationRequiresActionForViewer(
  reservation: ReservationLike,
  viewerUserId?: string | null,
) {
  if (!viewerUserId) return false
  if (hasReservationStarted(reservation.start_at)) return false
  if (hasDeadlinePassed(reservation.payment_deadline)) return false

  const isHost = Boolean(reservation.listingOwnerId && reservation.listingOwnerId === viewerUserId)
  const isRenter = reservation.renter_id === viewerUserId

  if (isHost) {
    if (reservation.status === "PENDING") return true

    if (reservation.status === "PENDING_AWAITING_LATE_CONSENT" && !reservation.host_preconfirmed_at) {
      return true
    }
  }

  if (isRenter) {
    if (reservation.status === "PENDING_AWAITING_LATE_CONSENT") return true
  }

  return false
}

export function sortReservationsForViewer<T extends ReservationLike>(
  reservations: T[],
  viewerUserId?: string | null,
) {
  return [...reservations].sort((a, b) => {
    const aNeedsAction = reservationRequiresActionForViewer(a, viewerUserId) ? 1 : 0
    const bNeedsAction = reservationRequiresActionForViewer(b, viewerUserId) ? 1 : 0

    if (aNeedsAction !== bNeedsAction) {
      return bNeedsAction - aNeedsAction
    }

    return new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
  })
}

export function sortPastReservationsByMostRecent<T extends ReservationLike>(reservations: T[]) {
  return [...reservations].sort((a, b) => {
    const aTime = new Date(a.end_at ?? a.start_at).getTime()
    const bTime = new Date(b.end_at ?? b.start_at).getTime()

    return bTime - aTime
  })
}
