import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router"
import {
  ChevronLeft,
  ChevronRight,
} from "lucide-react"

import { Button } from "~/components/ui/button"
import { Badge } from "~/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { useListings } from "~/hooks/useListings"
import { useListHostMonthlyReservations } from "~/hooks/useReservations"
import { useUser } from "~/store/user_state"
import type { Listing, Reservation } from "~/types/custom/api.types"

type CalendarDay = {
  date: Date
  dateKey: string
}

function toDateKey(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function getMonthLabel(date: Date) {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" })
}

function getCalendarGrid(monthCursor: Date): Array<CalendarDay | null> {
  const firstDayOfMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1)
  const startWeekday = firstDayOfMonth.getDay()
  const daysInMonth = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0).getDate()

  const days: Array<CalendarDay | null> = []

  for (let i = 0; i < startWeekday; i += 1) {
    days.push(null)
  }

  for (let dayNum = 1; dayNum <= daysInMonth; dayNum += 1) {
    const date = new Date(monthCursor.getFullYear(), monthCursor.getMonth(), dayNum)

    days.push({
      date,
      dateKey: toDateKey(date),
    })
  }

  return days
}

function formatHourLabel(hour: number) {
  return `${hour.toString().padStart(2, "0")}:00`
}

function toDateKeyFromIso(isoValue: string) {
  const date = new Date(isoValue)
  if (Number.isNaN(date.getTime())) return ""

  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function getHour(dateIso: string) {
  const date = new Date(dateIso)
  if (Number.isNaN(date.getTime())) return 0
  return date.getHours()
}

export default function HostCalendarPage() {
  const navigate = useNavigate()
  const user = useUser()
  const listingsQuery = useListings()

  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [selectedDateKey, setSelectedDateKey] = useState(() => toDateKey(new Date()))

  const monthlyReservationsQuery = useListHostMonthlyReservations(
    {
      p_host_id: user?.id ?? null,
      p_month: monthCursor.getMonth() + 1,
    },
    { enabled: Boolean(user?.id) }
  )

  useEffect(() => {
    if (!user) {
      navigate("/login?redirect=%2Fhost%2Fcalendar", { replace: true })
    }
  }, [user, navigate])

  if (!user) return null

  const allListings = (listingsQuery.data as Listing[] | null) ?? []
  const hostListings = allListings.filter((listing) => listing.owner_id === user.id)
  const hostListingsById = useMemo(
    () => new Map(hostListings.map((listing) => [listing.id, listing])),
    [hostListings]
  )

  const hostReservations = useMemo(() => {
    const rows = (monthlyReservationsQuery.data ?? []) as Reservation[]

    return rows
      .filter((reservation) => hostListingsById.has(reservation.listing_id))
      .map((reservation) => {
        const listing = hostListingsById.get(reservation.listing_id)

        return {
          ...reservation,
          dateKey: toDateKeyFromIso(reservation.start_at),
          startHour: getHour(reservation.start_at),
          endHour: getHour(reservation.end_at),
          listingTitle: listing?.title ?? "Listing",
        }
      })
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
  }, [monthlyReservationsQuery.data, hostListingsById])

  const reservationsByDate = useMemo(() => {
    const grouped = new Map<string, typeof hostReservations>()

    for (const reservation of hostReservations) {
      const items = grouped.get(reservation.dateKey) ?? []
      items.push(reservation)
      grouped.set(reservation.dateKey, items)
    }

    return grouped
  }, [hostReservations])

  const calendarGrid = useMemo(() => getCalendarGrid(monthCursor), [monthCursor])
  const selectedDayReservations = reservationsByDate.get(selectedDateKey) ?? []

  return (
    <section className="h-full flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
      <Card className="w-full border-[#e9e9e9] bg-[#ffffff] shadow-lg">
            <CardHeader className="border-b border-[#e9e9e9] bg-gradient-to-b from-[#fcfcfc] to-[#ffffff]">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="text-3xl text-[#000000]">Host calendar</CardTitle>
                  <CardDescription>Track upcoming reservations for your listings.</CardDescription>
                </div>
                <Badge variant="outline" className="w-fit border-[#dadada] bg-[#ffffff] text-[#000000]">
                  {hostReservations.length} booking{hostReservations.length !== 1 ? "s" : ""}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="p-4 md:p-6">
              {monthlyReservationsQuery.isLoading && (
                <div className="mb-4 rounded-xl border border-[#e9e9e9] bg-[#fafafa] px-4 py-3 text-sm text-[#6a6a6a]">
                  Loading reservations...
                </div>
              )}

              {monthlyReservationsQuery.isError && (
                <div className="mb-4 rounded-xl border border-[#f1c3bd] bg-[#fff3f2] px-4 py-3 text-sm text-[#b42318]">
                  Could not load host reservations. Please refresh.
                </div>
              )}

              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
                <div className="rounded-2xl border border-[#e9e9e9] bg-[#ffffff] p-4 md:p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        setMonthCursor(
                          (prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1),
                        )
                      }
                    >
                      <ChevronLeft className="h-4 w-4" />
                      <span className="sr-only">Previous month</span>
                    </Button>

                    <p className="text-base font-semibold text-[#000000]">{getMonthLabel(monthCursor)}</p>

                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        setMonthCursor(
                          (prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1),
                        )
                      }
                    >
                      <ChevronRight className="h-4 w-4" />
                      <span className="sr-only">Next month</span>
                    </Button>
                  </div>

                  <div className="grid grid-cols-7 gap-2 text-center text-xs font-medium uppercase tracking-wide text-[#7a7a7a]">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                      <div key={day} className="py-1">
                        {day}
                      </div>
                    ))}
                  </div>

                  <div className="mt-2 grid grid-cols-7 gap-2">
                    {calendarGrid.map((day, index) => {
                      if (!day) {
                        return <div key={`empty-${index}`} className="min-h-[74px]" />
                      }

                      const dayReservations = reservationsByDate.get(day.dateKey) ?? []
                      const isSelected = selectedDateKey === day.dateKey

                      return (
                        <button
                          key={day.dateKey}
                          type="button"
                          onClick={() => setSelectedDateKey(day.dateKey)}
                          className={`min-h-[74px] rounded-xl border p-2 text-left transition-colors ${
                            isSelected
                              ? "border-[#000000] bg-[#000000] text-[#ffffff]"
                              : "border-[#e9e9e9] bg-[#ffffff] text-[#1f1f1f] hover:bg-[#f7f7f7]"
                          }`}
                        >
                          <p className="text-sm font-medium">{day.date.getDate()}</p>
                          {dayReservations.length > 0 && (
                            <p className={`mt-2 text-xs ${isSelected ? "text-[#ffffff]/90" : "text-[#5a5a5a]"}`}>
                              {dayReservations.length} booking{dayReservations.length !== 1 ? "s" : ""}
                            </p>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="rounded-2xl border border-[#e9e9e9] bg-[#fafafa] p-4 md:p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <p className="text-sm font-semibold uppercase tracking-wide text-[#6a6a6a]">Selected day</p>
                    <Badge variant="outline" className="border-[#dadada] bg-[#ffffff] text-[#000000]">
                      {selectedDayReservations.length} booking{selectedDayReservations.length !== 1 ? "s" : ""}
                    </Badge>
                  </div>

                  <p className="mb-4 text-base font-semibold text-[#000000]">{selectedDateKey}</p>

                  {selectedDayReservations.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[#d9d9d9] bg-[#ffffff] px-4 py-8 text-center text-sm text-[#6a6a6a]">
                      No bookings on this date.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedDayReservations.map((reservation) => (
                        <div key={reservation.id} className="rounded-xl border border-[#e9e9e9] bg-[#ffffff] p-3">
                          <p className="truncate text-sm font-semibold text-[#000000]">{reservation.listingTitle}</p>
                          <p className="mt-1 text-xs text-[#6a6a6a]">
                            {formatHourLabel(reservation.startHour)} - {formatHourLabel(reservation.endHour)}
                          </p>
                          <p className="mt-1 text-xs text-[#6a6a6a]">
                            {reservation.guests} guest{reservation.guests !== 1 ? "s" : ""}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
      </Card>
    </section>
  )
}
