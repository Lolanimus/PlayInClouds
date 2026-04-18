import { useEffect } from "react"
import { Link, useNavigate } from "react-router"
import {
  Edit2,
  Eye,
  Images,
  MapPin,
  Plus,
  Star,
  Trash2,
} from "lucide-react"

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
import { useDeleteListing, useListings } from "~/hooks/useListings"
import { formatListingCategory } from "~/lib/utils"
import { useUser } from "~/store/user_state"
import type { Listing as ApiListing } from "~/types/custom/api.types"

export default function HostDashboardPage() {
  const navigate = useNavigate()
  const user = useUser()
  const listingsQuery = useListings()
  const deleteListingMutation = useDeleteListing()

  useEffect(() => {
    if (!user) {
      navigate("/login?redirect=%2Fhost%2Fdashboard", { replace: true })
    }
  }, [user, navigate])

  if (!user) return null

  const allListings = ((listingsQuery.data as ApiListing[] | null) ?? [])
  const listings = allListings.filter((listing) => listing.owner_id === user.id)

  const handleDeleteListing = (listingId: string) => {
    if (confirm("Are you sure you want to delete this listing?")) {
      deleteListingMutation.mutate(listingId)
    }
  }

  const totalPhotos = listings.reduce((acc, listing) => acc + listing.images.length, 0)
  const averageRating =
    listings.length > 0
      ? (listings.reduce((acc, listing) => acc + listing.average_rating, 0) / listings.length).toFixed(1)
      : "0.0"

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

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-[#e9e9e9] bg-[#fafafa] px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-[#6a6a6a]">Active listings</p>
                  <p className="text-xl font-semibold text-[#000000]">{listings.length}</p>
                </div>
                <div className="rounded-xl border border-[#e9e9e9] bg-[#fafafa] px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-[#6a6a6a]">Uploaded photos</p>
                  <p className="flex items-center gap-2 text-xl font-semibold text-[#000000]">
                    <Images className="h-4 w-4 text-[#6a6a6a]" />
                    {totalPhotos}
                  </p>
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
                      className="rounded-2xl border border-[#e9e9e9] bg-[#ffffff] p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md md:p-6"
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
                            <Badge variant="outline" className="border-[#dadada] bg-[#f7f7f7] text-[#6a6a6a]">
                              {formatListingCategory(listing.category)}
                            </Badge>
                          </div>

                          <p className="mb-4 line-clamp-2 text-sm text-[#6a6a6a]">{listing.description}</p>

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
                            <Button
                              variant="outline"
                              onClick={() => handleDeleteListing(listing.id)}
                              disabled={deleteListingMutation.isPending}
                              className="border-[#e74c3c] text-[#e74c3c] hover:bg-[#fff3f1]"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </Button>
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
