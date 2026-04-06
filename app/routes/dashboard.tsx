import { useEffect } from "react"
import { Link, useNavigate } from "react-router"
import { ArrowRight, CalendarClock, Clock3, PlusCircle, Settings, Users } from "lucide-react"

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
import { useListings } from "~/hooks/useListings"
import { useListUserActiveReservations } from "~/hooks/useReservations"
import { useUser } from "~/store/user_state"
import { useHostListings } from "~/store/host_listings_state"

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

function getReservationStatus(startAtIso: string, endAtIso: string) {
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

export default function DashboardPage() {
  const navigate = useNavigate()
  const user = useUser()
  const activeReservationsQuery = useListUserActiveReservations(
    { p_renter_id: user?.id ?? null },
    { enabled: Boolean(user?.id) }
  )
  const listingsQuery = useListings()
  const hostListings = useHostListings()

  const listingsById = new Map((listingsQuery.data ?? []).map((listing) => [listing.id, listing]))
  const userReservations = (activeReservationsQuery.data ?? []).map((reservation) => {
    const listing = listingsById.get(reservation.listing_id)

    return {
      ...reservation,
      listingTitle: listing?.title ?? "Listing",
      listingSubtitle: listing?.subtitle ?? "",
      listingImage: listing?.images?.[0] ?? "",
    }
  })

  useEffect(() => {
    if (!user) {
      navigate("/login?redirect=%2Fdashboard", { replace: true })
    }
  }, [user, navigate])

  if (!user) return null

  return (
    <main className="min-h-[calc(100vh-5.5rem)] bg-muted/40 px-4 py-10">
      <Card className="mx-auto w-full max-w-6xl overflow-hidden border-[#e9e9e9] bg-[#ffffff] shadow-lg">
        <CardHeader className="border-b border-[#e9e9e9] bg-gradient-to-b from-[#fcfcfc] to-[#ffffff]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-3xl text-[#000000]">Dashboard</CardTitle>
              <CardDescription>Welcome back. Manage your account, reservations, and hosting tools.</CardDescription>
            </div>
            <Badge variant="outline" className="w-fit border-[#dadada] bg-[#ffffff] text-[#000000]">
              {userReservations.length} reservation{userReservations.length !== 1 ? "s" : ""}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 p-6 text-sm text-foreground">
          <div className="grid gap-3 rounded-2xl border border-[#e9e9e9] bg-[#f8f8f8] p-4 md:grid-cols-3">
            <div className="rounded-xl bg-[#ffffff] px-3 py-2 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-[#6a6a6a]">Email</p>
              <p className="truncate text-sm text-[#000000]">{user.email ?? "—"}</p>
            </div>
            <div className="rounded-xl bg-[#ffffff] px-3 py-2 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-[#6a6a6a]">Reservations</p>
              <p className="text-sm text-[#000000]">{userReservations.length} total</p>
            </div>
            <div className="rounded-xl bg-[#ffffff] px-3 py-2 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-[#6a6a6a]">Your listings</p>
              <p className="text-sm text-[#000000]">{hostListings.length} total</p>
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-lg font-semibold text-[#000000]">Your reservations</p>
              <Badge variant="outline" className="border-[#dadada] bg-[#ffffff] text-[#000000]">
                {userReservations.length} total
              </Badge>
            </div>

            {activeReservationsQuery.isLoading ? (
              <div className="rounded-2xl border border-[#e9e9e9] bg-[#fafafa] px-4 py-8 text-center">
                <p className="text-sm text-muted-foreground">Loading reservations...</p>
              </div>
            ) : null}

            {activeReservationsQuery.isError ? (
              <div className="rounded-2xl border border-[#e9e9e9] bg-[#fafafa] px-4 py-8 text-center">
                <p className="text-sm text-muted-foreground">Failed to load reservations.</p>
              </div>
            ) : null}

            {!activeReservationsQuery.isLoading && !activeReservationsQuery.isError && userReservations.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#dadada] bg-[#fafafa] px-4 py-8 text-center">
                <p className="text-sm text-muted-foreground">No upcoming reservations yet.</p>
                <Button asChild className="mt-4 bg-[#000000] text-[#ffffff] hover:bg-[#1a1a1a]">
                  <Link to="/">Start exploring spaces</Link>
                </Button>
              </div>
            ) : !activeReservationsQuery.isLoading && !activeReservationsQuery.isError ? (
              <div className="space-y-4">
                {userReservations.map((reservation) => (
                  <div
                    key={reservation.id}
                    className="rounded-2xl border border-[#e9e9e9] bg-[#ffffff] p-4 shadow-sm transition-shadow hover:shadow-md"
                  >
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
                          {(() => {
                            const status = getReservationStatus(reservation.start_at, reservation.end_at)

                            if (status === "upcoming") {
                              return <Badge variant="success">Upcoming</Badge>
                            }

                            if (status === "ongoing") {
                              return <Badge variant="success">Ongoing</Badge>
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
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div>
            <div className="rounded-2xl border border-[#e9e9e9] bg-gradient-to-b from-[#fafafa] to-[#f5f5f5] p-6">
              <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="rounded-full bg-[#000000] p-2 text-[#ffffff]">
                      <Settings className="h-4 w-4" />
                    </div>
                    <p className="text-base font-semibold text-[#000000]">Host tools</p>
                  </div>
                  <p className="max-w-xl text-sm text-[#6a6a6a]">
                    Open your host dashboard to manage listings, preview details, and keep your spaces up to date.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={() => navigate("/host/dashboard")}
                    className="bg-[#000000] text-[#ffffff] shadow-sm hover:bg-[#1a1a1a]"
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    Open host dashboard
                  </Button>
                  <Button asChild variant="outline" className="border-[#dadada] bg-[#ffffff] text-[#000000] hover:bg-[#f2f2f2]">
                    <Link to="/host/create-listing">
                      <PlusCircle className="mr-2 h-4 w-4" />
                      Add listing
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>

        <CardFooter className="border-t border-[#e9e9e9] px-6 py-6">
          <Button asChild variant="outline">
            <Link to="/">Back to home</Link>
          </Button>
        </CardFooter>
      </Card>
    </main>
  )
}
