import { ArrowRight, CalendarClock, Clock3, Users } from "lucide-react"
import type { ReactNode } from "react"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import type { Reservation } from "~/types/custom/api.types"

type ReservationCardReservation = Reservation & {
  listingTitle: string
  listingSubtitle?: string
  listingImage?: string
}

function formatDateRange(startAtIso: string, endAtIso: string) {
  const start = new Date(startAtIso)
  const end = new Date(endAtIso)

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Unknown date"
  }

  const dayLabel = start.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  })
  const timeLabel = `${start.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })}–${end.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })}`

  return `${dayLabel}, ${timeLabel}`
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 2,
  }).format(value)
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

export function ReservationCard({
  reservation,
  onOpenListing,
  onOpenReservation,
  actions,
}: {
  reservation: ReservationCardReservation
  onOpenListing?: () => void
  onOpenReservation?: () => void
  actions?: ReactNode
}) {
  const timeStatus = getReservationTimeStatus(reservation.start_at, reservation.end_at)

  return (
    <div className="rounded-2xl border border-[#e9e9e9] bg-[#ffffff] p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-col gap-4 sm:flex-row">
        <button
          type="button"
          onClick={onOpenListing}
          disabled={!onOpenListing}
          className="group relative h-32 w-full overflow-hidden rounded-xl disabled:cursor-default sm:w-48"
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
            {timeStatus === "upcoming" ? (
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

            {reservation.status === "CONFIRMED" ? (
              <Badge variant="outline" className="border-[#b7eb8f] bg-[#f6ffed] text-[#237804]">
                Confirmed
              </Badge>
            ) : reservation.status === "PENDING" ? (
              <Badge variant="outline" className="border-[#ffe58f] bg-[#fffbe6] text-[#ad6800]">
                Pending
              </Badge>
            ) : null}
          </div>

          <p className="mb-3 truncate text-sm text-[#6a6a6a]">{reservation.listingSubtitle ?? ""}</p>

          <div className="grid gap-2 text-sm text-[#000000] md:grid-cols-2">
            <div className="flex items-center gap-2 rounded-lg bg-[#f8f8f8] px-3 py-2">
              <CalendarClock className="h-4 w-4 text-[#6a6a6a]" />
              <span>{formatDateRange(reservation.start_at, reservation.end_at)}</span>
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
              <span>{formatCurrency(reservation.total_price)}</span>
            </div>
          </div>

          <div className="mt-3 flex justify-end">
            <div className="flex gap-2">
              {onOpenReservation ? (
                <Button
                  variant="outline"
                  onClick={onOpenReservation}
                  className="h-8 px-2"
                >
                  Reservation details
                </Button>
              ) : null}

              {onOpenListing ? (
                <Button
                  variant="ghost"
                  onClick={onOpenListing}
                  className="h-8 gap-1 px-2 text-[#000000] hover:bg-[#f2f2f2]"
                >
                  View listing
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : null}

              {actions}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
