import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { ChevronLeft, Heart, Plus, Share, Star, X, Minus } from "lucide-react"
import { AuthRequiredModal } from "@/components/auth-required-modal"
import { useGetListing } from "@/hooks/useListings"
import { useReviews } from "@/hooks/useReviews"
import { queries } from "@/queries/queries"
import { formatListingCategory } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useHostListings } from "@/store/host_listings_state"
import { useSearchStore } from "@/store/search-store"
import { useUser } from "@/store/user_state"
import type { Listing as ApiListing } from "@/types/custom/api.types"
import { useQueries } from "@tanstack/react-query"

type DaySlot = {
  date: Date
  dayLabel: string
  monthDayLabel: string
}

const HOURS = Array.from({ length: 24 }, (_, i) => i)

function getBookingWindowDays(maxMonthsAhead: number) {
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const end = new Date(start)
  end.setMonth(end.getMonth() + maxMonthsAhead)

  const days: DaySlot[] = []
  const cursor = new Date(start)

  while (cursor.getTime() <= end.getTime()) {
    days.push({
      date: new Date(cursor),
      dayLabel: cursor.toLocaleDateString("en-US", { weekday: "short" }),
      monthDayLabel: cursor.toLocaleDateString("en-US", { day: "numeric", month: "short" }),
    })
    cursor.setDate(cursor.getDate() + 1)
  }

  return days
}

function parseHourlyPrice(price: string) {
  const match = price.match(/\$\s*(\d+(?:\.\d+)?)/)
  if (!match) return 30
  return Number(match[1])
}

function getHourRate(basePrice: number, hour: number) {
  if (hour >= 18 && hour <= 22) return Math.round(basePrice * 1.3)
  if (hour >= 10 && hour <= 16) return Math.round(basePrice * 1.1)
  if (hour <= 6) return Math.round(basePrice * 0.8)
  return Math.round(basePrice)
}

function formatHourLabel(hour: number) {
  return `${hour.toString().padStart(2, "0")}:00`
}

function getSlotKey(dayIndex: number, hour: number) {
  return `${dayIndex}-${hour}`
}

function getDateKey(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")
  return `${year}-${month}-${day}`
}

function getMonthStartKey(date: Date) {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-01`
}

function formatReviewMonth(value?: string | null) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" })
}

function getReviewPreview(text: string, max = 220) {
  if (text.length <= max) return text
  return `${text.slice(0, max).trimEnd()}...`
}

export default function ListingDetailsPage() {
  const navigate = useNavigate()
  const user = useUser()
  const hostListings = useHostListings()
  const selectedDateParam = useSearchStore((state) => state.date)
  const selectedStartParam = useSearchStore((state) => state.startHour)
  const selectedDurationParam = useSearchStore((state) => state.duration)
  const participantsParam = useSearchStore((state) => state.participants)
  const [isBookingOpen, setIsBookingOpen] = useState(false)
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [guestCount, setGuestCount] = useState(() =>
    Number.isFinite(participantsParam) && participantsParam >= 1 && participantsParam <= 20
      ? participantsParam
      : 1
  )
  const [selectedDayIndex, setSelectedDayIndex] = useState<number | null>(null)
  const [selectedStartHour, setSelectedStartHour] = useState<number | null>(null)
  const [selectedEndHour, setSelectedEndHour] = useState<number | null>(null)
  const [isReviewsModalOpen, setIsReviewsModalOpen] = useState(false)
  const hasInitializedSelectionRef = useRef(false)
  const now = new Date()
  const upcomingDays = useMemo(() => getBookingWindowDays(1), [])
  const monthStartsForWindow = useMemo(
    () => Array.from(new Set(upcomingDays.map((day) => getMonthStartKey(day.date)))),
    [upcomingDays]
  )
  const { id } = useParams()
  const isUuidId = useMemo(
    () => Boolean(id && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)),
    [id]
  )
  const listingQuery = useGetListing(isUuidId ? id : undefined)
  const monthSlotsQueries = useQueries({
    queries: (id ? monthStartsForWindow : []).map((monthStart) => ({
      ...queries.hours.listMonthSlots({
        p_listing_id: id,
        p_month: monthStart,
      }),
      enabled: Boolean(id),
    })),
  })
  const reviewsQuery = useReviews(
    isUuidId && id
      ? {
          p_listing_id: id,
          p_limit: 100,
          p_offset: 0,
        }
      : undefined,
    { enabled: Boolean(isUuidId && id) }
  )
  const localListing = useMemo(() => {
    if (!id) return null
    return hostListings.find((item) => String(item.id) === id) ?? null
  }, [hostListings, id])

  const listing = useMemo(() => {
    const remote = listingQuery.data as ApiListing | null

    if (remote) {
      return {
        id: remote.id,
        lat: remote.lat,
        lng: remote.lng,
        title: remote.title,
        subtitle: remote.subtitle,
        category: remote.category,
        description: remote.description,
        amenities: remote.amenities,
        images: remote.images,
        priceLabel: `$${remote.price} CAD/hour`,
        priceNumber: remote.price,
        rating: remote.average_rating,
        reviews: remote.review_count,
        distance: "",
      }
    }

    if (localListing) {
      return {
        id: localListing.id,
        lat: localListing.lat,
        lng: localListing.lng,
        title: localListing.title,
        subtitle: localListing.subtitle,
        category: localListing.category,
        description: localListing.description,
        amenities: localListing.amenities,
        images: localListing.images,
        priceLabel: localListing.price,
        priceNumber: parseHourlyPrice(localListing.price),
        rating: localListing.rating,
        reviews: localListing.reviews,
        distance: localListing.distance,
      }
    }

    return null
  }, [listingQuery.data, localListing])

  const galleryImages = listing?.images?.filter(Boolean) ?? []
  const primaryImage = galleryImages[0] ?? null
  const reviews = useMemo(() => {
    const rows = (reviewsQuery.data as Array<Record<string, unknown>> | null) ?? []

    return rows
      .map((row) => {
        const ratingValue = Number(row.rating)

        return {
          id: String(row.id ?? ""),
          rating: Number.isFinite(ratingValue) ? Math.max(0, Math.min(5, ratingValue)) : 0,
          text: typeof row.text === "string" ? row.text : "",
          createdAt: typeof row.created_at === "string" ? row.created_at : null,
          author:
            typeof row.user_name === "string"
              ? row.user_name
              : typeof row.username === "string"
                ? row.username
                : typeof row.author_name === "string"
                  ? row.author_name
                  : "Guest",
        }
      })
      .filter((review) => review.id && review.text)
  }, [reviewsQuery.data])
  const previewReviews = reviews.slice(0, 6)
  const reviewCountForLabel = reviews.length > 0 ? reviews.length : listing?.reviews ?? 0
  const homeTo = "/"

  const bookingWindowEndLabel = useMemo(() => {
    const lastDay = upcomingDays[upcomingDays.length - 1]
    if (!lastDay) return ""
    return lastDay.date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  }, [upcomingDays])

  useEffect(() => {
    if (!Number.isFinite(participantsParam)) return
    if (participantsParam < 1 || participantsParam > 20) return

    setGuestCount(participantsParam)
  }, [participantsParam])

  const slotMap = useMemo(() => {
    const rows = monthSlotsQueries.flatMap((query) =>
      ((query.data as Array<Record<string, unknown>> | null) ?? [])
    )

    const map = new Map<string, { price: number | null; isBooked: boolean }>()

    rows.forEach((row) => {
      const rawDate = typeof row.date === "string" ? row.date : ""
      const hour = typeof row.hour === "number" ? row.hour : -1
      const dateKey = rawDate ? rawDate.slice(0, 10) : ""

      if (!dateKey || hour < 0 || hour > 23) return

      const key = `${dateKey}-${hour}`
      map.set(key, {
        price: typeof row.price === "number" ? row.price : null,
        isBooked: Boolean(row.is_booked),
      })
    })

    return map
  }, [monthSlotsQueries])

  const bookedSlotKeys = useMemo(() => {
    const booked = new Set<string>()

    upcomingDays.forEach((day, dayIndex) => {
      const dayKey = getDateKey(day.date)
      HOURS.forEach((hour) => {
        const slot = slotMap.get(`${dayKey}-${hour}`)
        if (slot?.isBooked) {
          booked.add(getSlotKey(dayIndex, hour))
        }
      })
    })

    return booked
  }, [upcomingDays, slotMap])

  const isBookedCell = (dayIndex: number, hour: number) => {
    return bookedSlotKeys.has(getSlotKey(dayIndex, hour))
  }

  const isPastCell = (day: DaySlot, hour: number) => {
    const slotStart = new Date(
      day.date.getFullYear(),
      day.date.getMonth(),
      day.date.getDate(),
      hour,
      0,
      0,
      0
    )

    return slotStart.getTime() < now.getTime()
  }

  const isBaseAvailabilityWindow = (day: DaySlot, hour: number) => {
    const slot = slotMap.get(`${getDateKey(day.date)}-${hour}`)
    return typeof slot?.price === "number" && Number.isFinite(slot.price) && slot.price > 0
  }

  const getSlotPrice = (day: DaySlot, hour: number) => {
    const slot = slotMap.get(`${getDateKey(day.date)}-${hour}`)
    return typeof slot?.price === "number" && Number.isFinite(slot.price) ? slot.price : null
  }

  const canBookCell = (day: DaySlot, dayIndex: number, hour: number) => {
    return (
      isBaseAvailabilityWindow(day, hour) &&
      !isPastCell(day, hour) &&
      !isBookedCell(dayIndex, hour)
    )
  }

  const handleTimeCellClick = (day: DaySlot, dayIndex: number, hour: number) => {
    if (!canBookCell(day, dayIndex, hour)) return

    if (selectedStartHour === null || selectedDayIndex === null) {
      setSelectedDayIndex(dayIndex)
      setSelectedStartHour(hour)
      setSelectedEndHour(hour + 1)
      return
    }

    if (dayIndex !== selectedDayIndex) {
      setSelectedDayIndex(dayIndex)
      setSelectedStartHour(hour)
      setSelectedEndHour(hour + 1)
      return
    }

    if (hour <= selectedStartHour) {
      setSelectedStartHour(hour)
      setSelectedEndHour(hour + 1)
      return
    }

    const nextEnd = hour + 1
    const isContinuousAvailability = Array.from(
      { length: nextEnd - selectedStartHour },
      (_, idx) => selectedStartHour + idx
    ).every((h) => canBookCell(day, dayIndex, h))

    if (!isContinuousAvailability) {
      setSelectedStartHour(hour)
      setSelectedEndHour(hour + 1)
      return
    }

    setSelectedEndHour(nextEnd)
  }

  const selectedDay = selectedDayIndex !== null ? upcomingDays[selectedDayIndex] : null
  const selectedSlotLabel =
    selectedDay && selectedStartHour !== null && selectedEndHour !== null
      ? `${selectedDay.dayLabel}, ${selectedDay.monthDayLabel} · ${formatHourLabel(selectedStartHour)}–${formatHourLabel(selectedEndHour)}`
      : null

  const handleContinueToPayment = () => {
    if (!listing || !selectedDay) return
    if (selectedStartHour === null || selectedEndHour === null) return

    const params = new URLSearchParams({
      listingId: String(listing.id),
      date: getDateKey(selectedDay.date),
      start: String(selectedStartHour),
      end: String(selectedEndHour),
      guests: String(guestCount),
    })

    const target = `/payment?${params.toString()}`

    if (!user) {
      setIsAuthModalOpen(true)
      return
    }

    navigate(target)
  }

  useEffect(() => {
    if (hasInitializedSelectionRef.current) return

    const dateParam = selectedDateParam ? getDateKey(selectedDateParam) : null
    const startParam = selectedStartParam
    const durationParam = selectedDurationParam
    let didApplyFromUrl = false

    if (
      dateParam &&
      startParam !== null &&
      Number.isFinite(startParam) &&
      Number.isFinite(durationParam) &&
      startParam >= 0 &&
      startParam <= 23 &&
      durationParam >= 1 &&
      durationParam <= 24
    ) {

      const matchedDayIndex = upcomingDays.findIndex((day) => getDateKey(day.date) === dateParam)
      if (matchedDayIndex >= 0) {
        const matchedDay = upcomingDays[matchedDayIndex]
        const selectedRangeEnd = startParam + durationParam
        if (selectedRangeEnd <= 24) {
          const canApplyPrefill = Array.from({ length: durationParam }, (_, idx) => startParam + idx).every((hour) =>
            canBookCell(matchedDay, matchedDayIndex, hour)
          )

          if (canApplyPrefill) {
            setSelectedDayIndex(matchedDayIndex)
            setSelectedStartHour(startParam)
            setSelectedEndHour(selectedRangeEnd)
            didApplyFromUrl = true
          }
        }
      }
    }

    if (didApplyFromUrl) {
      hasInitializedSelectionRef.current = true
      return
    }

    const currentNow = new Date()
    const todayKey = getDateKey(currentNow)
    const nextBookableHourToday =
      currentNow.getMinutes() > 0 || currentNow.getSeconds() > 0 || currentNow.getMilliseconds() > 0
        ? currentNow.getHours() + 1
        : currentNow.getHours()

    for (let dayIndex = 0; dayIndex < upcomingDays.length; dayIndex += 1) {
      const day = upcomingDays[dayIndex]
      const isToday = getDateKey(day.date) === todayKey
      const startAt = isToday ? Math.min(nextBookableHourToday, 23) : 0

      for (let hour = startAt; hour <= 23; hour += 1) {
        if (!canBookCell(day, dayIndex, hour)) continue

        setSelectedDayIndex(dayIndex)
        setSelectedStartHour(hour)
        setSelectedEndHour(hour + 1)
        hasInitializedSelectionRef.current = true
        return
      }
    }

    hasInitializedSelectionRef.current = true
  }, [selectedDateParam, selectedStartParam, selectedDurationParam, upcomingDays, bookedSlotKeys])

  if (isUuidId && listingQuery.isLoading) {
    return (
      <div className="min-h-[calc(100vh-5.5rem)] bg-[#f5f5f5]">
        <main className="p-8">
          <div className="mx-auto max-w-5xl rounded-2xl bg-[#ffffff] p-8 shadow-sm">
            <h1 className="text-2xl font-semibold text-[#000000]">Loading listing...</h1>
          </div>
        </main>
      </div>
    )
  }

  if (!listing) {
    return (
      <div className="min-h-[calc(100vh-5.5rem)] bg-[#f5f5f5]">
        <main className="p-8">
          <div className="mx-auto max-w-5xl rounded-2xl bg-[#ffffff] p-8 shadow-sm">
            <h1 className="text-2xl font-semibold text-[#000000]">Listing not found</h1>
            <p className="mt-2 text-sm text-[#6a6a6a]">The listing you are looking for does not exist.</p>
            <Link
              to={homeTo}
              className="mt-6 inline-flex items-center gap-2 rounded-full border border-[#dadada] px-4 py-2 text-sm text-[#000000] hover:bg-[#f5f5f5]"
            >
              <ChevronLeft className="h-4 w-4" />
              Back to listings
            </Link>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-[calc(100vh-5.5rem)] bg-[#f5f5f5]">
      <main className="p-6 md:p-8">
        <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex items-center justify-between gap-4">
          <Link
            to={homeTo}
            className="inline-flex items-center gap-2 rounded-full border border-[#dadada] bg-[#ffffff] px-4 py-2 text-sm text-[#000000] hover:bg-[#e9e9e9]"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="rounded-full border-[#dadada] bg-[#ffffff]">
              <Share className="h-4 w-4" />
              Share
            </Button>
            <Button variant="outline" className="rounded-full border-[#dadada] bg-[#ffffff]">
              <Heart className="h-4 w-4" />
              Save
            </Button>
          </div>
        </div>

        <h1 className="text-2xl font-semibold text-[#000000] md:text-3xl">{listing.title}</h1>

        <div className="mt-2 flex items-center gap-2 text-sm text-[#6a6a6a]">
          {listing.reviews > 0 ? (
            <>
              <Star className="h-4 w-4 fill-[#000000] text-[#000000]" />
              <span className="text-[#000000]">{listing.rating}</span>
              <span>({listing.reviews} reviews)</span>
              <span>•</span>
            </>
          ) : null}
          <span>{listing.subtitle}</span>
        </div>

        <section className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-4 md:grid-rows-2">
          {primaryImage ? (
            <img
              src={primaryImage}
              alt={listing.title}
              className="h-72 w-full rounded-2xl object-cover md:col-span-2 md:row-span-2 md:h-full"
            />
          ) : (
            <div className="flex h-72 w-full items-center justify-center rounded-2xl bg-[#efefef] text-sm text-[#8a8a8a] md:col-span-2 md:row-span-2 md:h-full">
              No images available
            </div>
          )}

          {Array.from({ length: 4 }, (_, idx) => {
            const image = galleryImages[idx + 1] ?? primaryImage

            return image ? (
              <img
                key={`${image}-${idx}`}
                src={image}
                alt={`${listing.title} photo ${idx + 2}`}
                className="h-36 w-full rounded-2xl object-cover md:h-full"
              />
            ) : (
              <div
                key={`empty-photo-${idx}`}
                className="flex h-36 w-full items-center justify-center rounded-2xl bg-[#efefef] text-xs text-[#8a8a8a] md:h-full"
              >
                No image
              </div>
            )
          })}
        </section>

        <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22rem]">
          <div className="space-y-6">
            <div className="rounded-2xl bg-[#ffffff] p-6 shadow-sm">
              <h2 className="text-xl font-semibold text-[#000000]">{listing.title}</h2>
              <p className="mt-2 text-sm text-[#6a6a6a]">
                {formatListingCategory(listing.category)} · Perfect for creators, teams, and rehearsals.
              </p>
            </div>

            <div className="rounded-2xl bg-[#ffffff] p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-[#000000]">About this space</h3>
              <p className="mt-3 text-sm leading-6 text-[#4a4a4a]">
                {listing.description ?? `This Airbnb-style listing page is set up for ${listing.title}. The space is located in ${listing.subtitle} and is ideal for sessions that need a clean, flexible layout.`}
              </p>
            </div>

            <div className="rounded-2xl bg-[#ffffff] p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-[#000000]">What this place offers</h3>
              <ul className="mt-3 grid grid-cols-1 gap-2 text-sm text-[#4a4a4a] sm:grid-cols-2">
                {(listing.amenities?.length ? listing.amenities : [
                  "High-speed Wi-Fi",
                  "Sound-treated environment",
                  "Flexible seating",
                  "Whiteboard + monitor",
                  "Coffee & water",
                  "Easy self check-in",
                ]).map((amenity: string) => (
                  <li key={amenity}>• {amenity}</li>
                ))}
              </ul>
            </div>

            {listing.reviews > 0 ? (
              <div className="rounded-2xl bg-[#ffffff] p-6 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <Star className="h-5 w-5 fill-[#000000] text-[#000000]" />
                  <h3 className="text-lg font-semibold text-[#000000]">
                    {listing.rating} · {reviewCountForLabel} reviews
                  </h3>
                </div>

                {reviewsQuery.isLoading ? (
                  <p className="text-sm text-[#6a6a6a]">Loading reviews...</p>
                ) : previewReviews.length > 0 ? (
                  <>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {previewReviews.map((review) => (
                        <button
                          key={review.id}
                          type="button"
                          onClick={() => setIsReviewsModalOpen(true)}
                          className="rounded-xl border border-[#e9e9e9] p-4 text-left transition-colors hover:bg-[#f9f9f9]"
                        >
                          <p className="text-sm font-medium text-[#000000]">{review.author}</p>
                          <p className="mt-1 text-xs text-[#6a6a6a]">
                            {"★".repeat(Math.round(review.rating))}
                            <span className="ml-2">{formatReviewMonth(review.createdAt)}</span>
                          </p>
                          <p className="mt-3 text-sm leading-6 text-[#4a4a4a]">{getReviewPreview(review.text)}</p>
                          <p className="mt-3 text-sm font-medium text-[#000000] underline">Show more</p>
                        </button>
                      ))}
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsReviewsModalOpen(true)}
                      className="mt-5 rounded-xl border-[#dadada] bg-[#ffffff]"
                    >
                      Show all {reviewCountForLabel} reviews
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-[#6a6a6a]">No review comments available yet.</p>
                )}
              </div>
            ) : null}
          </div>

          <aside className="h-fit rounded-2xl bg-[#ffffff] p-6 shadow-md lg:sticky lg:top-6">
            <p className="text-xl font-semibold text-[#000000]">{listing.priceLabel}</p>
            {listing.distance ? <p className="mt-1 text-sm text-[#6a6a6a]">{listing.distance}</p> : null}

            <Button
              onClick={() => setIsBookingOpen(true)}
              className="mt-4 h-11 w-full rounded-xl bg-[#000000] text-[#ffffff] hover:bg-[#333333]"
            >
              Reserve
            </Button>
            <p className="mt-3 text-center text-xs text-[#6a6a6a]">You won’t be charged yet</p>
          </aside>
        </section>
        </div>
      </main>

      {isBookingOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#000000]/35 p-4">
          <div className="relative h-[min(90vh,52rem)] w-[min(96vw,72rem)] rounded-2xl border border-[#dadada] bg-[#ffffff] shadow-2xl">
            <button
              aria-label="Close booking"
              onClick={() => setIsBookingOpen(false)}
              className="absolute right-3 top-3 z-20 rounded-full border border-[#dadada] bg-[#ffffff] p-1.5 text-[#4a4a4a] hover:bg-[#f5f5f5]"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex h-full flex-col">
              <div className="border-b border-[#e9e9e9] px-5 py-4">
                <h2 className="text-lg font-semibold text-[#000000]">Select date and time</h2>
                <p className="mt-1 text-sm text-[#6a6a6a]">Choose from available hours for {listing.title}</p>
                <p className="mt-1 text-xs text-[#6a6a6a]">Scroll right for later dates (booking window up to {bookingWindowEndLabel}).</p>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                <div className="overflow-x-auto rounded-xl border border-[#dadada]">
                  <div className="grid w-max min-w-full" style={{ gridTemplateColumns: `5rem repeat(${upcomingDays.length}, 5.5rem)` }}>
                    <div className="border-b border-r border-[#e9e9e9] bg-[#f5f5f5] p-2 text-center text-xs font-medium text-[#6a6a6a]">Time</div>
                    {upcomingDays.map((day) => (
                      <div key={day.monthDayLabel + day.dayLabel} className="border-b border-r border-[#e9e9e9] bg-[#f5f5f5] p-2 text-center">
                        <p className="text-xs font-medium text-[#000000]">{day.dayLabel}</p>
                        <p className="text-[0.7rem] text-[#6a6a6a]">{day.monthDayLabel}</p>
                      </div>
                    ))}

                    {HOURS.map((hour) => (
                      <Fragment key={`row-${hour}`}>
                        <div className="border-b border-r border-[#e9e9e9] bg-[#fafafa] p-2 text-center text-[0.7rem] text-[#6a6a6a]">
                          {formatHourLabel(hour)}
                        </div>
                        {upcomingDays.map((day, dayIndex) => {
                          const isAvailable = canBookCell(day, dayIndex, hour)
                          const isBooked = isBookedCell(dayIndex, hour)
                          const rate = getSlotPrice(day, hour)
                          const isSameDay = selectedDayIndex === dayIndex
                          const isStart = isSameDay && selectedStartHour === hour
                          const isEnd = isSameDay && selectedEndHour !== null && selectedEndHour - 1 === hour
                          const isInRange =
                            isSameDay &&
                            selectedStartHour !== null &&
                            selectedEndHour !== null &&
                            hour >= selectedStartHour &&
                            hour < selectedEndHour

                          return (
                            <button
                              type="button"
                              disabled={!isAvailable}
                              onClick={() => handleTimeCellClick(day, dayIndex, hour)}
                              key={`${day.monthDayLabel}-${hour}`}
                              className={[
                                "border-b border-r border-[#e9e9e9] p-2 text-center text-[0.7rem] font-medium transition-colors",
                                isInRange || isStart || isEnd
                                  ? "bg-[#0f6130] text-[#ffffff]"
                                  : isAvailable
                                  ? "bg-[#ffffff] text-[#2a2a2a] hover:bg-[#f5f5f5] cursor-pointer"
                                  : isBooked
                                  ? "bg-[#dcdcdc] text-[#7a7a7a] cursor-not-allowed"
                                  : "bg-[#efefef] text-[#9a9a9a] cursor-not-allowed",
                              ].join(" ")}
                            >
                              {isAvailable && rate !== null ? `$${Math.round(rate)}` : isBooked ? "Booked" : "—"}
                            </button>
                          )
                        })}
                      </Fragment>
                    ))}
                  </div>
                </div>
              </div>

              <div className="border-t border-[#e9e9e9] px-5 py-4">
                <div className="mb-4 rounded-lg border border-[#dadada] bg-[#fafafa] px-3 py-2">
                  <p className="text-xs font-medium text-[#000000]">Selected time</p>
                  <p className="mt-1 text-sm text-[#4a4a4a]">
                    {selectedSlotLabel ?? "Click one available slot for start, then another for end"}
                  </p>
                  <p className="mt-1 text-xs text-[#6a6a6a]">Gray cells marked “Booked” are already rented and can’t be selected.</p>
                </div>

                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-[#000000]">Number of guests</p>
                    <p className="text-xs text-[#6a6a6a]">Adjust participant count before continuing</p>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setGuestCount((prev) => Math.max(1, prev - 1))}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-[#dadada] text-[#6a6a6a] hover:border-[#000000] hover:text-[#000000]"
                      aria-label="Decrease guest count"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="min-w-10 text-center text-sm font-semibold text-[#000000]">{guestCount}</span>
                    <button
                      onClick={() => setGuestCount((prev) => Math.min(20, prev + 1))}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-[#dadada] text-[#6a6a6a] hover:border-[#000000] hover:text-[#000000]"
                      aria-label="Increase guest count"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>

                  <Button
                    disabled={!selectedSlotLabel}
                    onClick={handleContinueToPayment}
                    className="h-10 rounded-lg bg-[#000000] px-6 text-[#ffffff] hover:bg-[#333333] disabled:cursor-not-allowed disabled:bg-[#bdbdbd]"
                  >
                    Continue
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {isReviewsModalOpen ? (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-[#000000]/45 p-4">
          <div className="relative h-[min(90vh,52rem)] w-[min(96vw,62rem)] rounded-2xl border border-[#dadada] bg-[#ffffff] shadow-2xl">
            <button
              type="button"
              aria-label="Close reviews"
              onClick={() => setIsReviewsModalOpen(false)}
              className="absolute right-3 top-3 z-20 rounded-full border border-[#dadada] bg-[#ffffff] p-1.5 text-[#4a4a4a] hover:bg-[#f5f5f5]"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex h-full flex-col">
              <div className="border-b border-[#e9e9e9] px-5 py-4">
                <h2 className="text-xl font-semibold text-[#000000]">{reviewCountForLabel} reviews</h2>
                <p className="mt-1 text-sm text-[#6a6a6a]">{listing.title}</p>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                {reviews.length > 0 ? (
                  <div className="space-y-5">
                    {reviews.map((review) => (
                      <article key={review.id} className="border-b border-[#ececec] pb-5 last:border-0">
                        <p className="text-sm font-semibold text-[#000000]">{review.author}</p>
                        <p className="mt-1 text-xs text-[#6a6a6a]">
                          {"★".repeat(Math.round(review.rating))}
                          <span className="ml-2">{formatReviewMonth(review.createdAt)}</span>
                        </p>
                        <p className="mt-3 text-sm leading-6 text-[#4a4a4a]">{review.text}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-[#6a6a6a]">No review comments available yet.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <AuthRequiredModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onLogin={() => {
          if (!listing || !selectedDay || selectedStartHour === null || selectedEndHour === null) {
            navigate(`/login?redirect=${encodeURIComponent(`/listing/${listing?.id ?? ""}`)}`)
            return
          }

          const params = new URLSearchParams({
            listingId: String(listing.id),
            date: getDateKey(selectedDay.date),
            start: String(selectedStartHour),
            end: String(selectedEndHour),
            guests: String(guestCount),
          })

          navigate(`/login?redirect=${encodeURIComponent(`/payment?${params.toString()}`)}`)
        }}
        onSignup={() => {
          if (!listing || !selectedDay || selectedStartHour === null || selectedEndHour === null) {
            navigate(`/signup?redirect=${encodeURIComponent(`/listing/${listing?.id ?? ""}`)}`)
            return
          }

          const params = new URLSearchParams({
            listingId: String(listing.id),
            date: getDateKey(selectedDay.date),
            start: String(selectedStartHour),
            end: String(selectedEndHour),
            guests: String(guestCount),
          })

          navigate(`/signup?redirect=${encodeURIComponent(`/payment?${params.toString()}`)}`)
        }}
        title="Login required to continue"
        description="Please log in or sign up to continue to checkout."
      />
    </div>
  )
}
