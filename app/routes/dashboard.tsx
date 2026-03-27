import { useEffect } from "react"
import { Link, useNavigate } from "react-router"
import { ArrowRight, CalendarClock, Clock3, Users } from "lucide-react"

import { Button } from "~/components/ui/button"
import { Badge } from "~/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { useReservations } from "~/store/reservations_state"
import { useUser } from "~/store/user_state"

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

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 2,
  }).format(value)
}

function getReservationStatus(dateKey: string, endHour: number) {
  const reservationEnd = new Date(`${dateKey}T00:00:00`)

  if (Number.isNaN(reservationEnd.getTime())) {
    return "unknown" as const
  }

  reservationEnd.setHours(endHour, 0, 0, 0)

  return reservationEnd.getTime() >= Date.now() ? "upcoming" as const : "past" as const
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const user = useUser()
  const reservations = useReservations()

  const userReservations = user
    ? reservations.filter((reservation) => reservation.userId === user.id)
    : []

  useEffect(() => {
    if (!user) {
      navigate("/login?redirect=%2Fdashboard", { replace: true })
    }
  }, [user, navigate])

  if (!user) return null

  return (
    <main className="min-h-[calc(100vh-5.5rem)] bg-muted/40 px-4 py-10">
      <Card className="mx-auto w-full max-w-5xl border-[#e9e9e9] bg-[#ffffff] shadow-lg">
        <CardHeader>
          <CardTitle className="text-3xl text-[#000000]">Dashboard</CardTitle>
          <CardDescription>Welcome back. Manage your profile and reservations.</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 pb-6 text-sm text-foreground">
          <div className="grid gap-4 rounded-2xl border border-[#e9e9e9] bg-[#f8f8f8] p-4 md:grid-cols-2">
            <p>
              <span className="font-medium text-[#6a6a6a]">Email:</span>{" "}
              <span className="text-[#000000]">{user.email ?? "—"}</span>
            </p>
            <p className="md:text-right">
              <span className="font-medium text-[#6a6a6a]">User ID:</span>{" "}
              <span className="text-[#000000]">{user.id}</span>
            </p>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-lg font-semibold text-[#000000]">Your reservations</p>
              <Badge variant="outline" className="border-[#dadada] bg-[#ffffff] text-[#000000]">
                {userReservations.length} total
              </Badge>
            </div>

            {userReservations.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#dadada] bg-[#fafafa] px-4 py-8 text-center">
                <p className="text-sm text-muted-foreground">No reservations yet.</p>
                <Button asChild className="mt-4 bg-[#000000] text-[#ffffff] hover:bg-[#1a1a1a]">
                  <Link to="/">Start exploring spaces</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {userReservations.map((reservation) => (
                  <div
                    key={reservation.id}
                    className="rounded-2xl border border-[#e9e9e9] bg-[#ffffff] p-4 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => navigate(`/listing/${reservation.listingId}`)}
                        className="group relative h-32 w-full overflow-hidden rounded-xl sm:w-48"
                      >
                        <img
                          src={reservation.listingImage}
                          alt={reservation.listingTitle}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#000000]/35 via-transparent to-transparent" />
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-base font-semibold text-[#000000]">
                            {reservation.listingTitle}
                          </h3>
                          {(() => {
                            const status = getReservationStatus(reservation.dateKey, reservation.endHour)

                            if (status === "upcoming") {
                              return <Badge variant="success">Upcoming</Badge>
                            }

                            if (status === "past") {
                              return (
                                <Badge variant="outline" className="border-[#dadada] bg-[#f7f7f7] text-[#6a6a6a]">
                                  Past
                                </Badge>
                              )
                            }

                            return (
                              <Badge variant="outline" className="border-[#dadada] bg-[#f7f7f7] text-[#6a6a6a]">
                                Unknown date
                              </Badge>
                            )
                          })()}
                        </div>

                        <p className="mb-3 truncate text-sm text-[#6a6a6a]">{reservation.listingSubtitle}</p>

                        <div className="grid gap-2 text-sm text-[#000000] md:grid-cols-2">
                          <div className="flex items-center gap-2 rounded-lg bg-[#f8f8f8] px-3 py-2">
                            <CalendarClock className="h-4 w-4 text-[#6a6a6a]" />
                            <span>{formatDateRange(reservation.dateKey, reservation.startHour, reservation.endHour)}</span>
                          </div>

                          <div className="flex items-center gap-2 rounded-lg bg-[#f8f8f8] px-3 py-2">
                            <Users className="h-4 w-4 text-[#6a6a6a]" />
                            <span>{reservation.guests} {reservation.guests === 1 ? "guest" : "guests"}</span>
                          </div>

                          <div className="flex items-center gap-2 rounded-lg bg-[#f8f8f8] px-3 py-2">
                            <Clock3 className="h-4 w-4 text-[#6a6a6a]" />
                            <span>{reservation.endHour - reservation.startHour}h booked</span>
                          </div>

                          <div className="flex items-center justify-between rounded-lg bg-[#f8f8f8] px-3 py-2 font-medium">
                            <span className="text-[#6a6a6a]">Total</span>
                            <span>{formatCurrency(reservation.total)}</span>
                          </div>
                        </div>

                        <div className="mt-3 flex justify-end">
                          <Button
                            variant="ghost"
                            onClick={() => navigate(`/listing/${reservation.listingId}`)}
                            className="h-8 gap-1 px-2 text-[#000000] hover:bg-[#f2f2f2]"
                          >
                            View listing
                            <ArrowRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>

        <CardFooter>
          <Button asChild variant="outline">
            <Link to="/">Back to home</Link>
          </Button>
        </CardFooter>
      </Card>
    </main>
  )
}
