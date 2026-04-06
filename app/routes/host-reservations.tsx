import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { Badge } from "~/components/ui/badge"
import { ReservationCard } from "~/components/reservation-card"
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

function toDateKeyFromIso(isoValue: string) {
  const date = new Date(isoValue)
  if (Number.isNaN(date.getTime())) return ""

  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function toOrdinal(value: number) {
  const mod100 = value % 100
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`

  const mod10 = value % 10
  if (mod10 === 1) return `${value}st`
  if (mod10 === 2) return `${value}nd`
  if (mod10 === 3) return `${value}rd`
  return `${value}th`
}

function formatDayHeading(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`)
  if (Number.isNaN(date.getTime())) return dateKey

  const monthLabel = date.toLocaleDateString("en-US", { month: "long" })
  return `${monthLabel} ${toOrdinal(date.getDate())}`
}

function isPastReservation(endAtIso: string) {
  const end = new Date(endAtIso)
  if (Number.isNaN(end.getTime())) return false
  return end.getTime() <= Date.now()
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

  const reservations = ((reservationsQuery.data as Reservation[] | null) ?? []).map((reservation) => {
    const listing = listingsById.get(reservation.listing_id)

    return {
      ...reservation,
      dateKey: toDateKeyFromIso(reservation.start_at),
      listingTitle: listing?.title ?? "Listing",
      listingSubtitle: listing?.subtitle ?? "",
      listingImage: listing?.images?.[0] ?? "",
    }
  })

  const reservationsByDay = useMemo(() => {
    const grouped = new Map<string, typeof reservations>()

    for (const reservation of reservations) {
      const items = grouped.get(reservation.dateKey) ?? []
      items.push(reservation)
      grouped.set(reservation.dateKey, items)
    }

    return Array.from(grouped.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dateKey, items]) => ({
        dateKey,
        heading: formatDayHeading(dateKey),
        items,
      }))
  }, [reservations])

  const handleConfirm = async (reservationId: string, endAtIso: string) => {
    if (isPastReservation(endAtIso)) return

    try {
      await confirmMutation.mutateAsync({ p_reservation_id: reservationId })
    } catch {
      // handled by error store
    }
  }

  const handleCancel = async (reservationId: string, endAtIso: string) => {
    if (isPastReservation(endAtIso)) return
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

          <div className="space-y-5">
            {reservationsByDay.map((group) => (
              <section key={group.dateKey} className="rounded-2xl border border-[#e9e9e9] bg-[#fafafa] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold uppercase tracking-wide text-[#6a6a6a]">{group.heading}</p>
                  <Badge variant="outline" className="border-[#dadada] bg-[#ffffff] text-[#000000]">
                    {group.items.length} booking{group.items.length !== 1 ? "s" : ""}
                  </Badge>
                </div>

                <div className="space-y-3">
                  {group.items.map((reservation) => (
                    (() => {
                      const isPast = isPastReservation(reservation.end_at)

                      return (
                    <ReservationCard
                      key={reservation.id}
                      reservation={reservation}
                      onOpenReservation={() => navigate(`/reservation/${reservation.id}`)}
                      onOpenListing={() => navigate(`/listing/${reservation.listing_id}`)}
                      actions={(
                        <>
                          {reservation.status === "PENDING" && !isPast ? (
                            <Button
                              className="bg-[#237804] text-[#ffffff] hover:bg-[#1f6a03]"
                              onClick={() => handleConfirm(reservation.id, reservation.end_at)}
                              disabled={confirmMutation.isPending || cancelMutation.isPending}
                            >
                              Confirm
                            </Button>
                          ) : null}

                          {reservation.status !== "CANCELLED" && !isPast ? (
                            <Button
                              variant="destructive"
                              onClick={() => handleCancel(reservation.id, reservation.end_at)}
                              disabled={confirmMutation.isPending || cancelMutation.isPending}
                            >
                              Cancel
                            </Button>
                          ) : null}
                        </>
                      )}
                    />
                      )
                    })()
                  ))}
                </div>
              </section>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
