import { useRef, useState } from "react"
import { ChevronLeft, ChevronRight, Star, X } from "lucide-react"
import { Link, useNavigate, useParams } from "react-router"

import { ListingCard, type ListingItem } from "@/components/listings"
import { UserProfileCard } from "@/components/user-profile-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useListings } from "@/hooks/useListings"
import { usePublicProfile } from "@/hooks/useProfile"
import { useCurrency } from "@/hooks/useCurrency"
import { useUser } from "@/store/user_state"
import type { Listing, PublicProfile, PublicProfileReview } from "@/types/custom/api.types"

function formatReviewDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Unknown date"

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function formatAverageRating(value: number) {
  return Number.isInteger(value) ? `${value} / 5` : `${value.toFixed(1)} / 5`
}

function getReviewerInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)

  if (parts.length === 0) return "U"
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase()

  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase()
}

function getReviewSourceLabel(review: PublicProfileReview) {
  return review.reviewer_role === "BOOKER_TO_HOST" ? "From guest" : "From host"
}

function getReviewRoleDescription(review: PublicProfileReview) {
  return review.reviewer_role === "BOOKER_TO_HOST"
    ? "Guest experience review"
    : "Host experience review"
}

export default function PublicProfilePage() {
  const navigate = useNavigate()
  const { id } = useParams()
  const currentUser = useUser()
  const currency = useCurrency()
  const listingsRailRef = useRef<HTMLDivElement | null>(null)
  const [isListingsModalOpen, setIsListingsModalOpen] = useState(false)
  const profileQuery = usePublicProfile(
    { p_user_id: id, p_limit: 12, p_offset: 0 },
    { enabled: Boolean(id) }
  )
  const listingsQuery = useListings({ p_limit: 100 })

  const profile = (profileQuery.data as PublicProfile | null) ?? null
  const isOwnProfile = Boolean(currentUser?.id && profile?.id && currentUser.id === profile.id)
  const hostListings = (((listingsQuery.data as Listing[] | null) ?? [])
    .filter((listing) => listing.owner_id === profile?.id)
    .map<ListingItem>((listing) => ({
      id: listing.id,
      lat: listing.lat,
      lng: listing.lng,
      address: listing.address,
      title: listing.title,
      subtitle: listing.subtitle,
      category: listing.category,
      price: currency.formatFromCad(listing.price),
      pricePerHourCad: listing.price,
      distance: "",
      rating: listing.average_rating,
      reviews: listing.review_count,
      images: listing.images ?? [],
      description: listing.description,
      equipmentDesc: listing.equipment_desc,
      conveniencesDesc: listing.conveniences_desc,
      areaM2: listing.area_m2,
      advanceNoticeHours: listing.advance_notice_hours,
    })))

  const scrollListingsBy = (direction: "left" | "right") => {
    const rail = listingsRailRef.current
    if (!rail) return

    rail.scrollBy({
      left: direction === "left" ? -720 : 720,
      behavior: "smooth",
    })
  }

  return (
    <main className="min-h-[calc(100vh-5.5rem)] bg-[linear-gradient(180deg,#fbfbfb_0%,#f5f5f5_22%,#f5f5f5_100%)] px-4 py-8 md:py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex items-center justify-between gap-3">
          <Button asChild variant="outline" className="gap-2">
            <Link to="/dashboard">
              <ChevronLeft className="h-4 w-4" />
              Back
            </Link>
          </Button>

          {isOwnProfile ? (
            <Button asChild>
              <Link to="/account-settings">Edit profile</Link>
            </Button>
          ) : null}
        </div>

        {profileQuery.isLoading ? (
          <div className="rounded-2xl border border-[#e9e9e9] bg-[#ffffff] px-6 py-10 text-sm text-[#6a6a6a] shadow-sm">
            Loading profile...
          </div>
        ) : null}

        {profileQuery.isError ? (
          <div className="rounded-2xl border border-[#f1c3bd] bg-[#fff3f2] px-6 py-10 text-sm text-[#b42318] shadow-sm">
            Could not load this profile.
          </div>
        ) : null}

        {!profileQuery.isLoading && !profileQuery.isError && !profile ? (
          <div className="rounded-2xl border border-dashed border-[#d9d9d9] bg-[#ffffff] px-6 py-10 text-sm text-[#6a6a6a] shadow-sm">
            Profile not found.
          </div>
        ) : null}

        {profile ? (
          <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:items-start">
            <div className="space-y-6 lg:sticky lg:top-24">
              <UserProfileCard profile={profile} showBlockAction={!isOwnProfile} />
            </div>

            <div className="space-y-6">
              <Card className="border-[#e9e9e9] bg-[#ffffff] shadow-[0_18px_50px_rgba(17,17,17,0.05)]">
                <CardHeader className="pb-0">
                  <CardTitle className="text-2xl text-[#000000]">Reviews</CardTitle>
                  <CardDescription>What people say after booking, hosting, and sharing sessions with this user.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6">
                  {profile.reviews.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-[#d7d7d7] bg-[linear-gradient(180deg,#fcfcfc_0%,#f7f7f7_100%)] px-6 py-12 text-center">
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#111111] text-[#ffffff]">
                        <Star className="h-5 w-5 fill-current" />
                      </div>
                      <p className="mt-4 text-base font-medium text-[#111111]">No reviews yet</p>
                      <p className="mt-2 text-sm text-[#6a6a6a]">Once this user completes more sessions, their reviews will show up here.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {profile.reviews.map((review) => (
                        <div key={review.id} className="rounded-3xl border border-[#ececec] bg-[linear-gradient(180deg,#ffffff_0%,#fcfcfc_100%)] p-6 shadow-[0_8px_24px_rgba(17,17,17,0.04)]">
                          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div className="flex min-w-0 items-start gap-4">
                              {review.reviewer_user_id ? (
                                <Link
                                  to={`/profile/${review.reviewer_user_id}`}
                                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#111111] text-sm font-semibold text-[#ffffff] transition-transform hover:scale-[1.02]"
                                  aria-label={`Open ${review.reviewer_name} profile`}
                                >
                                  {getReviewerInitials(review.reviewer_name)}
                                </Link>
                              ) : (
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#111111] text-sm font-semibold text-[#ffffff]">
                                  {getReviewerInitials(review.reviewer_name)}
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  {review.reviewer_user_id ? (
                                    <Link
                                      to={`/profile/${review.reviewer_user_id}`}
                                      className="text-base font-semibold text-[#000000] underline-offset-4 hover:underline"
                                    >
                                      {review.reviewer_name}
                                    </Link>
                                  ) : (
                                    <p className="text-base font-semibold text-[#000000]">{review.reviewer_name}</p>
                                  )}
                                  <Badge variant="outline" className="border-[#dadada] bg-[#f7f7f7] text-[#6a6a6a]">
                                    {getReviewSourceLabel(review)}
                                  </Badge>
                                </div>
                                <p className="mt-1 text-sm text-[#6a6a6a]">{getReviewRoleDescription(review)} · {formatReviewDate(review.created_at)}</p>
                              </div>
                            </div>

                            <div className="inline-flex items-center gap-1 rounded-full border border-[#ececec] bg-[#ffffff] px-3 py-1.5 text-[#000000] shadow-sm">
                              <Star className="h-4 w-4 fill-current" />
                              <span className="text-sm font-medium">{formatAverageRating(review.rating)}</span>
                            </div>
                          </div>

                          <p className="mt-5 whitespace-pre-wrap text-[15px] leading-7 text-[#111111]">{review.text}</p>

                          <div className="mt-5 flex flex-wrap items-center gap-2">
                            {review.listing_id ? (
                              <Button asChild variant="outline" size="sm" className="rounded-full">
                                <Link to={`/listing/${review.listing_id}`}>
                                  {review.listing_title ? `View ${review.listing_title}` : "View listing"}
                                </Link>
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {profile.profile_role?.includes("Host") ? (
                <Card className="border-[#e9e9e9] bg-[#ffffff] shadow-[0_18px_50px_rgba(17,17,17,0.05)]">
                  <CardHeader className="pb-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <CardTitle className="text-2xl text-[#000000]">Current listings</CardTitle>
                        <CardDescription>Spaces this host currently has live on PlayInClouds.</CardDescription>
                      </div>

                      {hostListings.length > 1 ? (
                        <div className="hidden items-center gap-2 md:flex">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-10 w-10 rounded-full border-[#e5e5e5]"
                            onClick={() => scrollListingsBy("left")}
                            aria-label="Scroll listings left"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-10 w-10 rounded-full border-[#e5e5e5]"
                            onClick={() => scrollListingsBy("right")}
                            aria-label="Scroll listings right"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-6">
                    {listingsQuery.isLoading ? (
                      <div className="rounded-3xl border border-[#e9e9e9] bg-[#ffffff] px-6 py-10 text-sm text-[#6a6a6a]">
                        Loading listings...
                      </div>
                    ) : null}

                    {listingsQuery.isError ? (
                      <div className="rounded-3xl border border-[#f1c3bd] bg-[#fff3f2] px-6 py-10 text-sm text-[#b42318]">
                        Could not load this host's listings.
                      </div>
                    ) : null}

                    {!listingsQuery.isLoading && !listingsQuery.isError && hostListings.length === 0 ? (
                      <div className="rounded-3xl border border-dashed border-[#d7d7d7] bg-[linear-gradient(180deg,#fcfcfc_0%,#f7f7f7_100%)] px-6 py-12 text-center">
                        <p className="text-base font-medium text-[#111111]">No active listings yet</p>
                        <p className="mt-2 text-sm text-[#6a6a6a]">When this host publishes spaces, they will show up here.</p>
                      </div>
                    ) : null}

                    {!listingsQuery.isLoading && !listingsQuery.isError && hostListings.length > 0 ? (
                      <div className="space-y-4">
                        <div
                          ref={listingsRailRef}
                          className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                        >
                          {hostListings.map((listing) => (
                            <div
                              key={String(listing.id)}
                              className="min-w-full snap-start md:min-w-[calc((100%-1rem)/2)] xl:min-w-[calc((100%-2rem)/3)]"
                            >
                              <ListingCard
                                listing={listing}
                                onClick={() => navigate(`/listing/${listing.id}`)}
                              />
                            </div>
                          ))}
                        </div>

                        {hostListings.length > 1 ? (
                          <div className="flex items-center justify-between gap-3 md:hidden">
                            <Button
                              type="button"
                              variant="outline"
                              className="rounded-full"
                              onClick={() => scrollListingsBy("left")}
                            >
                              <ChevronLeft className="mr-2 h-4 w-4" />
                              Previous
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="rounded-full"
                              onClick={() => scrollListingsBy("right")}
                            >
                              Next
                              <ChevronRight className="ml-2 h-4 w-4" />
                            </Button>
                          </div>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => setIsListingsModalOpen(true)}
                          className="text-sm font-medium text-[#111111] underline underline-offset-4 transition-opacity hover:opacity-70"
                        >
                          See more listings
                        </button>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {isListingsModalOpen ? (
        <div
          className="fixed inset-0 z-[160] flex items-center justify-center bg-[#000000]/45 p-4"
          onClick={() => setIsListingsModalOpen(false)}
        >
          <div
            className="relative h-[min(90vh,54rem)] w-[min(96vw,78rem)] overflow-hidden rounded-[2rem] border border-[#e5e5e5] bg-[#ffffff] shadow-[0_24px_80px_rgba(0,0,0,0.18)]"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              aria-label="Close listings"
              onClick={() => setIsListingsModalOpen(false)}
              className="absolute right-4 top-4 z-20 rounded-full border border-[#dcdcdc] bg-[#ffffff]/95 p-2 text-[#4a4a4a] backdrop-blur hover:bg-[#f5f5f5]"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex h-full flex-col">
              <div className="border-b border-[#ececec] bg-gradient-to-b from-[#fcfcfc] to-[#ffffff] px-6 py-5">
                <div className="flex flex-col gap-4 pr-12 md:flex-row md:items-end md:justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#7a7a7a]">Host listings</p>
                    <h2 className="mt-2 text-2xl font-semibold text-[#000000]">
                      {(profile?.first_name ?? "Host")}&rsquo;s listings
                    </h2>
                    <p className="mt-1 text-sm text-[#6a6a6a]">
                      Browse all {hostListings.length} current listing{hostListings.length === 1 ? "" : "s"} from this host.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto bg-[#fcfcfc] px-6 py-5">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {hostListings.map((listing) => (
                    <ListingCard
                      key={`modal-${String(listing.id)}`}
                      listing={listing}
                      onClick={() => {
                        setIsListingsModalOpen(false)
                        navigate(`/listing/${listing.id}`)
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
