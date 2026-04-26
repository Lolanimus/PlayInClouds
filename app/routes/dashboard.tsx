import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router"
import { ChevronLeft, ChevronRight, PlusCircle, Settings } from "lucide-react"

import { ReservationCard } from "@/components/reservation-card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useListings } from "@/hooks/useListings"
import {
  useCountUserPastReservations,
  useListUserActiveReservations,
  useListUserPastReservations,
} from "@/hooks/useReservations"
import { useLoading } from "@/store/loading_state"
import { useUser } from "@/store/user_state"
import { useHostListings } from "@/store/host_listings_state"

const PAST_RESERVATIONS_PAGE_SIZE = 6

export default function DashboardPage() {
  const navigate = useNavigate()
  const user = useUser()
  const isAuthLoading = useLoading()
  const [pastReservationsPage, setPastReservationsPage] = useState(1)
  const activeReservationsQuery = useListUserActiveReservations(
    { p_renter_id: user?.id ?? null },
    { enabled: Boolean(user?.id) && !isAuthLoading }
  )
  const pastReservationsCountQuery = useCountUserPastReservations(
    { p_renter_id: user?.id ?? null },
    { enabled: Boolean(user?.id) && !isAuthLoading }
  )
  const pastReservationsQuery = useListUserPastReservations(
    {
      p_renter_id: user?.id ?? null,
      p_page: pastReservationsPage,
      p_page_size: PAST_RESERVATIONS_PAGE_SIZE,
    },
    { enabled: Boolean(user?.id) && !isAuthLoading }
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
      listingOwnerId: listing?.owner_id ?? null,
    }
  })
  const pastReservations = (pastReservationsQuery.data ?? []).map((reservation) => {
    const listing = listingsById.get(reservation.listing_id)

    return {
      ...reservation,
      listingTitle: listing?.title ?? "Listing",
      listingSubtitle: listing?.subtitle ?? "",
      listingImage: listing?.images?.[0] ?? "",
      listingOwnerId: listing?.owner_id ?? null,
    }
  })
  const totalPastReservations = pastReservationsCountQuery.data ?? 0
  const totalPastReservationPages = Math.max(1, Math.ceil(totalPastReservations / PAST_RESERVATIONS_PAGE_SIZE))

  useEffect(() => {
    setPastReservationsPage(1)
  }, [user?.id])

  useEffect(() => {
    setPastReservationsPage((currentPage) => Math.min(currentPage, totalPastReservationPages))
  }, [totalPastReservationPages])

  useEffect(() => {
    if (!isAuthLoading && !user) {
      navigate("/login?redirect=%2Fdashboard", { replace: true })
    }
  }, [isAuthLoading, user, navigate])

  if (isAuthLoading) {
    return (
      <main className="min-h-[calc(100vh-5.5rem)] bg-muted/40 px-4 py-10">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-center rounded-2xl border border-[#e9e9e9] bg-[#ffffff] px-6 py-12 text-sm text-muted-foreground shadow-sm">
          Loading your dashboard...
        </div>
      </main>
    )
  }

  if (!user) return null

  return (
    <main className="min-h-[calc(100vh-5.5rem)] bg-muted/40 px-4 py-10">
      <Card className="mx-auto w-full max-w-6xl overflow-hidden border-[#e9e9e9] bg-[#ffffff] shadow-lg">
        <CardHeader className="border-b border-[#e9e9e9] bg-gradient-to-b from-[#fcfcfc] to-[#ffffff]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="pb-4">
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
                  <ReservationCard
                    key={reservation.id}
                    reservation={reservation}
                  />
                ))}
              </div>
            ) : null}
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-lg font-semibold text-[#000000]">Past reservations</p>
              <Badge variant="outline" className="border-[#dadada] bg-[#ffffff] text-[#000000]">
                {totalPastReservations} total
              </Badge>
            </div>

            {pastReservationsQuery.isLoading ? (
              <div className="rounded-2xl border border-[#e9e9e9] bg-[#fafafa] px-4 py-8 text-center">
                <p className="text-sm text-muted-foreground">Loading past reservations...</p>
              </div>
            ) : null}

            {pastReservationsQuery.isError ? (
              <div className="rounded-2xl border border-[#e9e9e9] bg-[#fafafa] px-4 py-8 text-center">
                <p className="text-sm text-muted-foreground">Failed to load past reservations.</p>
              </div>
            ) : null}

            {!pastReservationsQuery.isLoading && !pastReservationsQuery.isError && totalPastReservations === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#dadada] bg-[#fafafa] px-4 py-8 text-center">
                <p className="text-sm text-muted-foreground">No past reservations yet.</p>
              </div>
            ) : null}

            {!pastReservationsQuery.isLoading && !pastReservationsQuery.isError && totalPastReservations > 0 ? (
              <div className="space-y-4">
                {pastReservations.map((reservation) => (
                  <ReservationCard
                    key={reservation.id}
                    reservation={reservation}
                  />
                ))}

                {totalPastReservationPages > 1 ? (
                  <div className="flex items-center justify-end gap-3 rounded-2xl border border-[#e9e9e9] bg-[#fafafa] px-4 py-3">
                    <span className="rounded-full border border-[#e1e1e1] bg-[#ffffff] px-3 py-1 text-xs font-medium text-[#6a6a6a]">
                      {pastReservationsPage} / {totalPastReservationPages}
                    </span>

                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setPastReservationsPage((page) => Math.max(1, page - 1))}
                        disabled={pastReservationsPage === 1}
                        className="h-9 w-9 rounded-full p-0"
                      >
                        <ChevronLeft className="h-4 w-4" />
                        <span className="sr-only">Previous page</span>
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setPastReservationsPage((page) => Math.min(totalPastReservationPages, page + 1))}
                        disabled={pastReservationsPage === totalPastReservationPages}
                        className="h-9 w-9 rounded-full p-0"
                      >
                        <ChevronRight className="h-4 w-4" />
                        <span className="sr-only">Next page</span>
                      </Button>
                    </div>
                  </div>
                ) : null}
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
