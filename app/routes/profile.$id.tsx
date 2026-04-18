import { Ban, ChevronLeft, MessageCircleMore, ShieldCheck, Star, UserRound } from "lucide-react"
import { Link, useParams } from "react-router"

import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import { usePublicProfile } from "~/hooks/useProfile"
import { useToast } from "~/hooks/use-toast"
import { useUser } from "~/store/user_state"
import type { PublicProfile, PublicProfileReview } from "~/types/custom/api.types"

function formatMemberSince(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Unknown"

  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  })
}

function formatReviewDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Unknown date"

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function getFullName(profile: Pick<PublicProfile, "first_name" | "last_name">) {
  return `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || "User"
}

function getInitials(profile: Pick<PublicProfile, "first_name" | "last_name">) {
  const fullName = getFullName(profile)
  const parts = fullName.split(/\s+/).filter(Boolean)

  if (parts.length === 0) return "U"
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase()

  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase()
}

function formatAverageRating(value: number) {
  return Number.isInteger(value) ? `${value} / 5` : `${value.toFixed(1)} / 5`
}

function getReviewSourceLabel(review: PublicProfileReview) {
  return review.reviewer_role === "BOOKER_TO_HOST" ? "From guest" : "From host"
}

function getReviewRoleDescription(review: PublicProfileReview) {
  return review.reviewer_role === "BOOKER_TO_HOST"
    ? "Guest experience review"
    : "Host experience review"
}

function formatYearsHosting(value: number | null) {
  if (value === null) return null
  if (value < 1) return "Less than 1 year"
  return `${value} year${value === 1 ? "" : "s"}`
}

function getRoleTone(role: string) {
  if (role === "Host & Booker") {
    return "border-[#d9d9d9] bg-[#111111] text-[#ffffff]"
  }

  if (role === "Host") {
    return "border-[#d9d9d9] bg-[#f3f3f3] text-[#111111]"
  }

  return "border-[#dadada] bg-[#fafafa] text-[#6a6a6a]"
}

export default function PublicProfilePage() {
  const { id } = useParams()
  const currentUser = useUser()
  const { toast } = useToast()
  const profileQuery = usePublicProfile(
    { p_user_id: id, p_limit: 12, p_offset: 0 },
    { enabled: Boolean(id) }
  )

  const profile = (profileQuery.data as PublicProfile | null) ?? null
  const isOwnProfile = Boolean(currentUser?.id && profile?.id && currentUser.id === profile.id)
  const yearsHostingLabel = formatYearsHosting(profile?.years_hosting ?? null)

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
              <Card className="overflow-hidden border-[#e7e7e7] bg-[#ffffff] p-0 shadow-[0_18px_50px_rgba(17,17,17,0.06)]">
                <div className="bg-[radial-gradient(circle_at_top_left,#343434_0%,#171717_48%,#090909_100%)] px-6 pb-8 pt-8 text-[#ffffff]">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex h-24 w-24 items-center justify-center rounded-[2rem] border border-[#ffffff]/12 bg-[#ffffff]/10 text-[1.75rem] font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-sm">
                      {getInitials(profile)}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge variant="outline" className={getRoleTone(profile.profile_role)}>
                        {profile.profile_role}
                      </Badge>
                      {profile.id_verified ? (
                        <Badge variant="outline" className="border-[#ffffff]/20 bg-[#ffffff]/10 text-[#ffffff]">
                          <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                          ID verified
                        </Badge>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-7">
                    <CardTitle className="text-[2rem] leading-tight text-[#ffffff]">{getFullName(profile)}</CardTitle>
                    <CardDescription className="mt-2 max-w-sm text-sm leading-6 text-[#ffffff]/72">
                      {yearsHostingLabel && profile.profile_role.includes("Host")
                        ? `${yearsHostingLabel} hosting on AirDrums`
                        : `Booker community member on AirDrums`}
                    </CardDescription>
                  </div>

                  <div className="mt-6 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-[#ffffff]/10 bg-[#ffffff]/6 px-4 py-3 backdrop-blur-sm">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-[#ffffff]/55">Overall rating</p>
                      <div className="mt-2 flex items-center gap-2">
                        <Star className="h-4 w-4 fill-current text-[#ffffff]" />
                        <span className="text-lg font-semibold text-[#ffffff]">{formatAverageRating(profile.average_rating)}</span>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-[#ffffff]/10 bg-[#ffffff]/6 px-4 py-3 backdrop-blur-sm">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-[#ffffff]/55">Reviews</p>
                      <p className="mt-2 text-lg font-semibold text-[#ffffff]">{profile.review_count}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 p-6">
                  <div className="rounded-[1.5rem] border border-[#ededed] bg-[linear-gradient(180deg,#ffffff_0%,#fafafa_100%)] p-5">
                    <div className="flex items-center gap-2">
                      <MessageCircleMore className="h-4 w-4 text-[#6a6a6a]" />
                      <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#7a7a7a]">Profile details</p>
                    </div>

                    <div className="mt-5 space-y-3">
                      <div className="flex items-center justify-between gap-4 rounded-2xl bg-[#ffffff] px-3 py-3 text-sm">
                        <span className="text-[#6a6a6a]">Booker/Host</span>
                        <span className="font-semibold text-[#111111]">{profile.profile_role}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4 rounded-2xl bg-[#ffffff] px-3 py-3 text-sm">
                        <span className="text-[#6a6a6a]">ID Verified</span>
                        <span className="font-semibold text-[#111111]">{profile.id_verified ? "Yes" : "No"}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4 rounded-2xl bg-[#ffffff] px-3 py-3 text-sm">
                        <span className="text-[#6a6a6a]">Reviews Amount</span>
                        <span className="font-semibold text-[#111111]">{profile.review_count}</span>
                      </div>
                      <div className="flex items-center justify-between gap-4 rounded-2xl bg-[#ffffff] px-3 py-3 text-sm">
                        <span className="text-[#6a6a6a]">Overall Rating</span>
                        <span className="font-semibold text-[#111111]">{formatAverageRating(profile.average_rating)}</span>
                      </div>
                      {yearsHostingLabel ? (
                        <div className="flex items-center justify-between gap-4 rounded-2xl bg-[#ffffff] px-3 py-3 text-sm">
                          <span className="text-[#6a6a6a]">Years Hosting</span>
                          <span className="font-semibold text-[#111111]">{yearsHostingLabel}</span>
                        </div>
                      ) : null}
                      <div className="flex items-center justify-between gap-4 rounded-2xl bg-[#ffffff] px-3 py-3 text-sm">
                        <span className="text-[#6a6a6a]">Joined AirDrums</span>
                        <span className="font-semibold text-[#111111]">{formatMemberSince(profile.member_since)}</span>
                      </div>
                    </div>
                  </div>

                  {!isOwnProfile ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 w-full rounded-2xl border-[#efc5c0] bg-[#ffffff] text-[#b42318] shadow-sm hover:bg-[#fff4f2] hover:text-[#b42318]"
                      onClick={() => {
                        toast({
                          title: "Block user",
                          description: "User blocking isn't available yet.",
                        })
                      }}
                    >
                      <Ban className="mr-2 h-4 w-4" />
                      Block user
                    </Button>
                  ) : null}
                </div>
              </Card>
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
                              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#111111] text-sm font-semibold text-[#ffffff]">
                                {review.reviewer_name.slice(0, 1).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-base font-semibold text-[#000000]">{review.reviewer_name}</p>
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

                            {review.reviewer_user_id && review.reviewer_user_id !== profile.id ? (
                              <Button asChild variant="ghost" size="sm" className="rounded-full text-[#111111] hover:bg-[#f3f3f3]">
                                <Link to={`/profile/${review.reviewer_user_id}`}>
                                  <UserRound className="mr-2 h-4 w-4" />
                                  Reviewer profile
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
            </div>
          </div>
        ) : null}
      </div>
    </main>
  )
}
