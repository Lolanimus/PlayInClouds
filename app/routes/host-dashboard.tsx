import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router"
import {
  Edit2,
  Eye,
  MapPin,
  Plus,
  Star,
  Trash2,
  X,
} from "lucide-react"

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
import { useDeleteListing, useOwnListings } from "@/hooks/useListings"
import { dismissListingModerationMessage, formatListingCategory, isListingModerationMessageDismissed } from "@/lib/utils"
import { useUser } from "@/store/user_state"
import type { Listing as ApiListing, ListingModerationStatus } from "@/types/custom/api.types"

function getModerationBadgeClass(status: ListingModerationStatus) {
  if (status === "APPROVED") return "border-[#cde8d1] bg-[#effaf2] text-[#166534]"
  if (status === "REJECTED") return "border-[#f4c7c3] bg-[#fff4f2] text-[#b42318]"
  return "border-[#ead9b7] bg-[#fff8e8] text-[#9a6700]"
}

function getModerationLabel(status: ListingModerationStatus) {
  if (status === "APPROVED") return "Approved"
  if (status === "REJECTED") return "Rejected"
  return "Pending review"
}

export default function HostDashboardPage() {
  const navigate = useNavigate()
  const user = useUser()
  const listingsQuery = useOwnListings({ enabled: Boolean(user) })
  const deleteListingMutation = useDeleteListing()
  const [dismissedMessages, setDismissedMessages] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!user) {
      navigate("/login?redirect=%2Fhost%2Fdashboard", { replace: true })
    }
  }, [user, navigate])

  useEffect(() => {
    const listings = (listingsQuery.data as ApiListing[] | null) ?? []

    setDismissedMessages(
      Object.fromEntries(
        listings.map((listing) => [listing.id, isListingModerationMessageDismissed(listing)])
      )
    )
  }, [listingsQuery.data])

  if (!user) return null

  const allListings = ((listingsQuery.data as ApiListing[] | null) ?? [])
  const listings = allListings

  const handleDeleteListing = (listingId: string) => {
    if (confirm("Are you sure you want to delete this listing?")) {
      deleteListingMutation.mutate(listingId)
    }
  }

  const handleDismissReviewMessage = (listing: ApiListing) => {
    dismissListingModerationMessage(listing)
    setDismissedMessages((prev) => ({ ...prev, [listing.id]: true }))
  }


  const approvedListings = listings.filter((listing) => listing.moderation_status === "APPROVED").length
  const pendingListings = listings.filter((listing) => listing.moderation_status === "PENDING_APPROVAL").length
  const rejectedListings = listings.filter((listing) => listing.moderation_status === "REJECTED").length
  const ratedListings = listings.filter(
    (listing) => listing.moderation_status === "APPROVED" && listing.review_count > 0
  )
  const averageRating =
    ratedListings.length > 0
      ? (
        ratedListings.reduce((acc, listing) => acc + listing.average_rating, 0) / ratedListings.length
      ).toFixed(1)
      : "N/A"

  return (
    <section className="h-full min-h-0 overflow-y-auto p-4 md:p-6 lg:p-8">
      <Card className="w-full overflow-hidden border-[#e9e9e9] bg-[#ffffff] shadow-lg">
            <CardHeader className="border-b border-[#e9e9e9] bg-gradient-to-b from-[#fcfcfc] to-[#ffffff]">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="pb-4">
                  <CardTitle className="text-3xl text-[#000000]">Host tools</CardTitle>
                  <CardDescription>View, edit, and manage all your listed spaces.</CardDescription>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="border-[#dadada] bg-[#ffffff] text-[#000000]">
                    {listings.length} listing{listings.length !== 1 ? "s" : ""}
                  </Badge>
                  <Button asChild className="bg-[#000000] text-[#ffffff] hover:bg-[#1a1a1a]">
                    <Link to="/host/create-listing">
                      <Plus className="mr-2 h-4 w-4" />
                      Create listing
                    </Link>
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-6 p-6" id="host-listings">
              {listingsQuery.isLoading && (
                <div className="rounded-xl border border-[#e9e9e9] bg-[#fafafa] px-4 py-3 text-sm text-[#6a6a6a]">
                  Loading your listings...
                </div>
              )}

              {listingsQuery.isError && (
                <div className="rounded-xl border border-[#f1c3bd] bg-[#fff3f2] px-4 py-3 text-sm text-[#b42318]">
                  Could not load listings. Please refresh.
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-[#e9e9e9] bg-[#fafafa] px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-[#6a6a6a]">Approved listings</p>
                  <p className="text-xl font-semibold text-[#000000]">{approvedListings}</p>
                </div>
                <div className="rounded-xl border border-[#e9e9e9] bg-[#fafafa] px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-[#6a6a6a]">Pending review</p>
                  <p className="text-xl font-semibold text-[#000000]">{pendingListings}</p>
                </div>
                <div className="rounded-xl border border-[#f4c7c3] bg-[#fff4f2] px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-[#b42318]">Rejected listings</p>
                  <p className="text-xl font-semibold text-[#b42318]">{rejectedListings}</p>
                </div>
                <div className="rounded-xl border border-[#e9e9e9] bg-[#fafafa] px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-[#6a6a6a]">Average rating</p>
                  <p className="flex items-center gap-2 text-xl font-semibold text-[#000000]">
                    <Star className="h-4 w-4 fill-[#000000] text-[#000000]" />
                    {averageRating}
                  </p>
                </div>
              </div>

              {listings.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#dadada] bg-gradient-to-b from-[#fafafa] to-[#f4f4f4] px-4 py-16 text-center">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#eaeaea]">
                    <MapPin className="h-5 w-5 text-[#6a6a6a]" />
                  </div>
                  <p className="mb-2 text-lg font-medium text-[#000000]">No listings yet</p>
                  <p className="mb-6 text-sm text-[#6a6a6a]">Start by creating your first listing to begin accepting reservations.</p>
                  <Button asChild className="bg-[#000000] text-[#ffffff] hover:bg-[#1a1a1a]">
                    <Link to="/host/create-listing">
                      <Plus className="mr-2 h-4 w-4" />
                      Create your first listing
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {listings.map((listing) => (
                    <div
                      key={listing.id}
                      className={`rounded-2xl border p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md md:p-6 ${
                        listing.moderation_status === "REJECTED"
                          ? "border-[#f4c7c3] bg-[#fff9f8] shadow-[0_0_0_1px_rgba(180,35,24,0.06)]"
                          : "border-[#e9e9e9] bg-[#ffffff]"
                      }`}
                    >
                      <div className="flex flex-col gap-6 md:flex-row">
                        <div className="relative h-40 w-full overflow-hidden rounded-xl md:w-56 md:flex-shrink-0">
                          {listing.images.length > 0 ? (
                            <>
                              <img
                                src={listing.images[0]}
                                alt={listing.title}
                                className="h-full w-full object-cover"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-[#000000]/20 via-transparent to-transparent" />
                            </>
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-[#f0f0f0]">
                              <MapPin className="h-8 w-8 text-[#b0b0b0]" />
                            </div>
                          )}
                          {listing.images.length > 1 && (
                            <Badge className="absolute bottom-2 right-2 bg-[#000000]/70 text-[#ffffff]">
                              +{listing.images.length - 1}
                            </Badge>
                          )}
                        </div>

                        <div className="flex-1">
                          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <h3 className="text-xl font-semibold text-[#000000]">{listing.title}</h3>
                              <p className="flex items-center gap-1 text-sm text-[#6a6a6a]">
                                <MapPin className="h-3.5 w-3.5" />
                                {listing.address}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className="border-[#dadada] bg-[#f7f7f7] text-[#6a6a6a]">
                                {formatListingCategory(listing.category)}
                              </Badge>
                              <Badge variant="outline" className={getModerationBadgeClass(listing.moderation_status)}>
                                {getModerationLabel(listing.moderation_status)}
                              </Badge>
                            </div>
                          </div>

                          <p className="mb-4 line-clamp-2 text-sm text-[#6a6a6a]">{listing.description}</p>

                          {listing.moderation_status === "REJECTED" ? (
                            <div className="mb-4 rounded-xl border border-[#f4c7c3] bg-[#fff4f2] px-3 py-3 text-sm text-[#b42318]">
                              <p className="font-semibold">Listing rejected</p>
                              <p className="mt-1">Update the listing details and resubmit it for review, or just delete the listing.</p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                <Button
                                  asChild
                                  variant="outline"
                                  className="border-[#e74c3c] bg-[#ffffff] text-[#b42318] hover:bg-[#fff3f1]"
                                >
                                  <Link to={`/host/edit-listing/${listing.id}`}>
                                    <Edit2 className="mr-2 h-4 w-4" />
                                    Edit & Resubmit
                                  </Link>
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={() => handleDeleteListing(listing.id)}
                                  disabled={deleteListingMutation.isPending}
                                  className="border-[#e74c3c] bg-[#ffffff] text-[#e74c3c] hover:bg-[#fff3f1]"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Delete listing
                                </Button>
                              </div>
                            </div>
                          ) : null}

                          {listing.moderation_message && !dismissedMessages[listing.id] ? (
                            <div className={`mb-4 rounded-xl px-3 py-3 text-sm ${
                              listing.moderation_status === "REJECTED"
                                ? "border border-[#f4c7c3] bg-[#fff4f2] text-[#7a271a]"
                                : "border border-[#ececec] bg-[#fafafa] text-[#4a4a4a]"
                            }`}>
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-medium text-[#000000]">Review message</p>
                                  <p className="mt-1 whitespace-pre-wrap">{listing.moderation_message}</p>
                                </div>
                                <button
                                  type="button"
                                  aria-label="Dismiss review message"
                                  onClick={() => handleDismissReviewMessage(listing)}
                                  className="rounded-md p-1 text-[#6a6a6a] transition-colors hover:bg-[#ececec] hover:text-[#000000]"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          ) : null}

                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-lg bg-[#f8f8f8] px-3 py-2">
                              <p className="text-xs text-[#6a6a6a]">Rate</p>
                              <p className="font-semibold text-[#000000]">${listing.price} CAD/hour</p>
                            </div>
                            <div className="rounded-lg bg-[#f8f8f8] px-3 py-2">
                              <p className="text-xs text-[#6a6a6a]">Rating</p>
                              <p className="font-semibold text-[#000000]">{listing.average_rating} ⭐</p>
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            <Button
                              variant="default"
                              onClick={() => navigate(`/listing/${listing.id}`)}
                              className="bg-[#000000] text-[#ffffff] shadow-sm hover:bg-[#1a1a1a]"
                            >
                              <Eye className="mr-2 h-4 w-4" />
                              View listing
                            </Button>
                            {listing.moderation_status !== "REJECTED" ? (
                              <Button
                                asChild
                                variant="outline"
                                className="border-[#dadada] text-[#000000] hover:bg-[#f2f2f2]"
                              >
                                <Link to={`/host/edit-listing/${listing.id}`}>
                                  <Edit2 className="mr-2 h-4 w-4" />
                                  Edit
                                </Link>
                              </Button>
                            ) : null}
                            {listing.moderation_status !== "REJECTED" ? (
                              <Button
                                variant="outline"
                                onClick={() => handleDeleteListing(listing.id)}
                                disabled={deleteListingMutation.isPending}
                                className="border-[#e74c3c] text-[#e74c3c] hover:bg-[#fff3f1]"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>

            <CardFooter className="border-t border-[#e9e9e9] p-6">
              <Button asChild variant="outline">
                <Link to="/dashboard">
                  Back to dashboard
                </Link>
              </Button>
            </CardFooter>
      </Card>
    </section>
  )
}
