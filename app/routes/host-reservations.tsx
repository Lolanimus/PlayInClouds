import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router"
import { CalendarClock, ChevronLeft, ChevronRight, Users } from "lucide-react"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { useListings } from "~/hooks/useListings"
import {
  useCancelReservation,
  useConfirmReservation,
  useListHostMonthlyReservations,
} from "~/hooks/useReservations"
import { useUser } from "~/store/user_state"
import type { Listing, Reservation } from "~/types/custom/api.types"

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Unknown"

  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 2,
  }).format(value)
}

export default function HostReservationsPage() {
  const navigate = useNavigate()
  const user = useUser()
  const [monthCursor, setMonthCursor] = useState(() => new Date())

  const month = monthCursor.getMonth() + 1
  const monthLabel = monthCursor.toLocaleDateString("en-US", { month: "long", year: "numeric" })

  const reservationsQuery = useListHostMonthlyReservations(
    { p_host_id: user?.id ?? null, p_month: month },
    { enabled: Boolean(user?.id) }
  )
  const listingsQuery = useListings()
  const confirmMutation = useConfirmReservation()
  const cancelMutation = useCancelReservation()

  useEffect(() => {
    if (!user) {
      navigate("/login?redirect=%2Fhost%2Freservations", { replace: true })
    }
  }, [user, navigate])

  if (!user) return null

  const listings = (listingsQuery.data as Listing[] | null) ?? []
  const listingsById = useMemo(() => new Map(listings.map((item) => [item.id, item])), [listings])

  const reservations = ((reservationsQuery.data as Reservation[] | null) ?? []).map((reservation) => ({
    ...reservation,
    listing: listingsById.get(reservation.listing_id) ?? null,
  }))

  const handleConfirm = async (reservationId: string) => {
    try {
      await confirmMutation.mutateAsync({ p_reservation_id: reservationId })
    } catch {
      // handled by error store
    }
  }

  const handleCancel = async (reservationId: string) => {
    if (!confirm("Cancel this reservation?")) return

    try {
      await cancelMutation.mutateAsync({ p_reservation_id: reservationId })
    } catch {
      // handled by error store
    }
  }

  return (
    <section className="h-full min-h-0 overflow-y-auto p-4 md:p-6 lg:p-8">
      <Card className="w-full border-[#e9e9e9] bg-[#ffffff] shadow-lg">
        <CardHeader className="border-b border-[#e9e9e9] bg-gradient-to-b from-[#fcfcfc] to-[#ffffff]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-3xl text-[#000000]">Reservations</CardTitle>
              <CardDescription>Confirm or cancel reservations for your listings.</CardDescription>
            </div>
            <Badge variant="outline" className="w-fit border-[#dadada] bg-[#ffffff] text-[#000000]">
              {reservations.length} reservation{reservations.length !== 1 ? "s" : ""}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 p-6">
          <div className="flex items-center justify-between rounded-xl border border-[#e9e9e9] bg-[#fafafa] px-3 py-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <p className="text-sm font-semibold text-[#000000]">{monthLabel}</p>

            <Button
              variant="outline"
              size="icon"
              onClick={() => setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {reservationsQuery.isLoading ? (
            <div className="rounded-xl border border-[#e9e9e9] bg-[#fafafa] px-4 py-6 text-sm text-[#6a6a6a]">
              Loading reservations...
            </div>
          ) : null}

          {reservationsQuery.isError ? (
            <div className="rounded-xl border border-[#f1c3bd] bg-[#fff3f2] px-4 py-6 text-sm text-[#b42318]">
              Could not load reservations.
            </div>
          ) : null}

          {!reservationsQuery.isLoading && !reservationsQuery.isError && reservations.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#dadada] bg-[#fafafa] px-4 py-8 text-center text-sm text-[#6a6a6a]">
              No reservations for this month.
            </div>
          ) : null}

          <div className="space-y-3">
            {reservations.map((reservation) => (
              <div key={reservation.id} className="rounded-xl border border-[#e9e9e9] bg-[#ffffff] p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold text-[#000000]">{reservation.listing?.title ?? "Listing"}</p>
                    <p className="text-xs text-[#6a6a6a]">#{reservation.id.slice(0, 8)}</p>
                  </div>
                  <Badge variant="outline" className="border-[#dadada] bg-[#ffffff] text-[#000000]">
                    {reservation.status}
                  </Badge>
                </div>

                <div className="grid gap-2 text-sm md:grid-cols-3">
                  <div className="rounded-lg bg-[#f8f8f8] px-3 py-2">
                    <p className="flex items-center gap-2 text-xs text-[#6a6a6a]"><CalendarClock className="h-3.5 w-3.5" /> Start</p>
                    <p className="text-[#000000]">{formatDateTime(reservation.start_at)}</p>
                  </div>
                  <div className="rounded-lg bg-[#f8f8f8] px-3 py-2">
                    <p className="flex items-center gap-2 text-xs text-[#6a6a6a]"><Users className="h-3.5 w-3.5" /> Guests</p>
                    <p className="text-[#000000]">{reservation.guests}</p>
                  </div>
                  <div className="rounded-lg bg-[#f8f8f8] px-3 py-2">
                    <p className="text-xs text-[#6a6a6a]">Total</p>
                    <p className="text-[#000000]">{formatCurrency(reservation.total_price)}</p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <Button asChild variant="outline">
                    <Link to={`/reservation/${reservation.id}`}>Open details</Link>
                  </Button>

                  <div className="flex gap-2">
                    {reservation.status === "PENDING" ? (
                      <Button
                        onClick={() => handleConfirm(reservation.id)}
                        disabled={confirmMutation.isPending || cancelMutation.isPending}
                      >
                        Confirm
                      </Button>
                    ) : null}

                    {reservation.status !== "CANCELLED" ? (
                      <Button
                        variant="destructive"
                        onClick={() => handleCancel(reservation.id)}
                        disabled={confirmMutation.isPending || cancelMutation.isPending}
                      >
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
