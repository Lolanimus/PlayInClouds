import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router"
import { CheckCircle2, ChevronLeft, Clock3, MapPin, ShieldAlert, XCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import {
  useApproveListing,
  useCurrentUserIsAdmin,
  usePendingListings,
} from "@/hooks/useListings"
import { useRejectListing } from "@/hooks/useListings"
import { formatListingCategory } from "@/lib/utils"
import { useUser } from "@/store/user_state"
import type { ListingModerationQueueItem } from "@/types/custom/api.types"

function formatSubmittedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Unknown date"

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export default function AdminListingsPage() {
  const navigate = useNavigate()
  const user = useUser()
  const adminStatusQuery = useCurrentUserIsAdmin({ enabled: Boolean(user) })
  const isAdmin = Boolean(adminStatusQuery.data)
  const pendingListingsQuery = usePendingListings({ enabled: isAdmin })
  const approveListingMutation = useApproveListing()
  const rejectListingMutation = useRejectListing()
  const [messagesByListingId, setMessagesByListingId] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!user) {
      navigate("/login?redirect=%2Fadmin%2Flistings", { replace: true })
    }
  }, [user, navigate])

  const pendingListings = useMemo(
    () => ((pendingListingsQuery.data as ListingModerationQueueItem[] | null) ?? []),
    [pendingListingsQuery.data]
  )

  const handleDecision = async (listingId: string, decision: "approve" | "reject") => {
    const message = messagesByListingId[listingId] ?? ""

    if (decision === "approve") {
      await approveListingMutation.mutateAsync({
        p_listing_id: listingId,
        p_message: message,
      })
      return
    }

    await rejectListingMutation.mutateAsync({
      p_listing_id: listingId,
      p_message: message,
    })
  }

  if (!user) return null

  if (adminStatusQuery.isLoading) {
    return (
      <main className="min-h-[calc(100vh-5.5rem)] bg-[#f5f5f5] px-4 py-8 md:px-8">
        <div className="mx-auto max-w-6xl rounded-2xl border border-[#e9e9e9] bg-[#ffffff] px-6 py-10 text-sm text-[#6a6a6a] shadow-sm">
          Checking access...
        </div>
      </main>
    )
  }

  if (!isAdmin) {
    return (
      <main className="min-h-[calc(100vh-5.5rem)] bg-[#f5f5f5] px-4 py-8 md:px-8">
        <div className="mx-auto max-w-6xl rounded-2xl border border-[#f1c3bd] bg-[#fff3f2] px-6 py-10 text-sm text-[#b42318] shadow-sm">
          You do not have access to listing moderation.
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-[calc(100vh-5.5rem)] bg-[#f5f5f5] px-4 py-8 md:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <Button asChild variant="outline" className="rounded-full border-[#dadada] bg-[#ffffff] shadow-sm">
          <Link to="/dashboard">
            <ChevronLeft className="h-4 w-4" />
            Back
          </Link>
        </Button>

        <Card className="overflow-hidden border-[#e9e9e9] bg-[#ffffff] shadow-lg">
          <CardHeader className="border-b border-[#e9e9e9] bg-gradient-to-b from-[#fcfcfc] to-[#ffffff]">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <CardTitle className="text-3xl text-[#000000]">Listing review queue</CardTitle>
                <CardDescription>
                  Manually approve or reject submitted listings before they go live on the platform.
                </CardDescription>
              </div>

              <div className="inline-flex items-center gap-2 rounded-full border border-[#ead9b7] bg-[#fff8e8] px-3 py-1.5 text-sm text-[#9a6700]">
                <Clock3 className="h-4 w-4" />
                {pendingListings.length} pending
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-5 p-6">
            {pendingListingsQuery.isLoading ? (
              <div className="rounded-2xl border border-[#e9e9e9] bg-[#fafafa] px-4 py-8 text-center text-sm text-[#6a6a6a]">
                Loading pending listings...
              </div>
            ) : null}

            {pendingListingsQuery.isError ? (
              <div className="rounded-2xl border border-[#f1c3bd] bg-[#fff3f2] px-4 py-8 text-center text-sm text-[#b42318]">
                Could not load the moderation queue.
              </div>
            ) : null}

            {!pendingListingsQuery.isLoading && !pendingListingsQuery.isError && pendingListings.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#dadada] bg-[#fafafa] px-4 py-12 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#111111] text-[#ffffff]">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <p className="mt-4 text-lg font-medium text-[#000000]">No listings waiting for review</p>
                <p className="mt-2 text-sm text-[#6a6a6a]">New host submissions will show up here.</p>
              </div>
            ) : null}

            {!pendingListingsQuery.isLoading && !pendingListingsQuery.isError && pendingListings.length > 0 ? (
              <div className="space-y-5">
                {pendingListings.map((listing) => {
                  const message = messagesByListingId[listing.id] ?? ""
                  const isMutating = approveListingMutation.isPending || rejectListingMutation.isPending

                  return (
                    <div key={listing.id} className="rounded-3xl border border-[#e9e9e9] bg-[#ffffff] p-5 shadow-sm">
                      <div className="flex flex-col gap-5 lg:flex-row">
                        <div className="h-48 w-full overflow-hidden rounded-2xl bg-[#f3f3f3] lg:w-72 lg:flex-shrink-0">
                          {listing.images[0] ? (
                            <img src={listing.images[0]} alt={listing.title} className="h-full w-full object-cover" />
                          ) : null}
                        </div>

                        <div className="flex-1 space-y-4">
                          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                            <div>
                              <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#7a7a7a]">
                                Submitted {formatSubmittedAt(listing.submitted_at)}
                              </p>
                              <h2 className="mt-1 text-2xl font-semibold text-[#000000]">{listing.title}</h2>
                              <p className="mt-2 flex items-center gap-1 text-sm text-[#6a6a6a]">
                                <MapPin className="h-4 w-4" />
                                {listing.address}
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full border border-[#dadada] bg-[#f7f7f7] px-3 py-1 text-xs font-medium text-[#6a6a6a]">
                                {formatListingCategory(listing.category)}
                              </span>
                              <span className="rounded-full border border-[#dadada] bg-[#ffffff] px-3 py-1 text-xs font-medium text-[#111111]">
                                ${listing.price} CAD/hour
                              </span>
                            </div>
                          </div>

                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="rounded-2xl border border-[#efefef] bg-[#fafafa] px-4 py-3 text-sm">
                              <p className="text-[#6a6a6a]">Host</p>
                              <p className="mt-1 font-medium text-[#111111]">{listing.owner_name}</p>
                              {listing.owner_email ? (
                                <p className="mt-1 text-[#6a6a6a]">{listing.owner_email}</p>
                              ) : null}
                            </div>
                            <div className="rounded-2xl border border-[#efefef] bg-[#fafafa] px-4 py-3 text-sm">
                              <p className="text-[#6a6a6a]">Space info</p>
                              <p className="mt-1 font-medium text-[#111111]">{listing.area_m2} m²</p>
                              <p className="mt-1 text-[#6a6a6a]">Advance notice: {listing.advance_notice_hours ?? 0} hour(s)</p>
                            </div>
                          </div>

                          <div className="rounded-2xl border border-[#efefef] bg-[#fafafa] px-4 py-4 text-sm text-[#4a4a4a]">
                            <p className="font-medium text-[#111111]">Description</p>
                            <p className="mt-2 whitespace-pre-wrap leading-6">{listing.description}</p>
                          </div>

                          <div className="space-y-2">
                            <p className="text-sm font-medium text-[#111111]">Optional message to host</p>
                            <Textarea
                              value={message}
                              onChange={(event) =>
                                setMessagesByListingId((prev) => ({
                                  ...prev,
                                  [listing.id]: event.target.value,
                                }))
                              }
                              placeholder="Add feedback or an approval note..."
                              className="min-h-28"
                            />
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <Button asChild variant="outline" className="rounded-full">
                                <Link to={`/listing/${listing.id}`}>Open listing preview</Link>
                              </Button>
                              <Button asChild variant="outline" className="rounded-full">
                                <Link to={`/host/edit-listing/${listing.id}`}>Open edit form</Link>
                              </Button>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => void handleDecision(listing.id, "reject")}
                                disabled={isMutating}
                                className="rounded-full border-[#efc5c0] bg-[#ffffff] text-[#b42318] hover:bg-[#fff4f2] hover:text-[#b42318]"
                              >
                                <XCircle className="mr-2 h-4 w-4" />
                                Reject
                              </Button>
                              <Button
                                type="button"
                                onClick={() => void handleDecision(listing.id, "approve")}
                                disabled={isMutating}
                                className="rounded-full bg-[#000000] text-[#ffffff] hover:bg-[#1a1a1a]"
                              >
                                <CheckCircle2 className="mr-2 h-4 w-4" />
                                Approve
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
