import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { ChevronLeft, Heart, MessageCircle, Plus, Share, Star, X, Minus } from "lucide-react"
import { AuthRequiredModal } from "@/components/auth-required-modal"
import { TimeWithLocalHint } from "@/components/time-with-local-hint"
import { UserProfileCard } from "@/components/user-profile-card"
import { useGetListing } from "@/hooks/useListings"
import { usePublicProfile } from "@/hooks/useProfile"
import { useReviews } from "@/hooks/useReviews"
import { queries } from "@/queries/queries"
import {
  formatDateRangeInTimeZone,
  formatDateRangeInViewerTimeZone,
  getTimeZoneLabel,
} from "@/lib/date-time"
import { formatListingCategory } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useHostListings } from "@/store/host_listings_state"
import { useSearchStore } from "@/store/search-store"
import { useUser } from "@/store/user_state"
import type { Listing as ApiListing, PublicProfile } from "@/types/custom/api.types"
import { useQueries } from "@tanstack/react-query"

type DaySlot = {
  dateKey: string
  dayLabel: string
  monthDayLabel: string
}

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const REVIEWS_PAGE_SIZE = 6

function getFormatterForTimeZone(
  timeZone: string,
  options: Intl.DateTimeFormatOptions = {}
) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    ...options,
  })
}

function getTimeZoneDateTimeParts(date: Date, timeZone: string) {
  const parts = getFormatterForTimeZone(timeZone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  ) as Record<string, number>

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour ?? 0,
    minute: values.minute ?? 0,
    second: values.second ?? 0,
  }
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const values = getTimeZoneDateTimeParts(date, timeZone)

  const asUtc = Date.UTC(
    values.year,
    (values.month ?? 1) - 1,
    values.day ?? 1,
    values.hour ?? 0,
    values.minute ?? 0,
    values.second ?? 0,
    0
  )

  return asUtc - date.getTime()
}

function getDateKeyFromUtcDate(date: Date) {
  const year = date.getUTCFullYear()
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0")
  const day = `${date.getUTCDate()}`.padStart(2, "0")
  return `${year}-${month}-${day}`
}

function parseHourlyPrice(price: string) {
  const match = price.match(/\$\s*(\d+(?:\.\d+)?)/)
  if (!match) return 30
  return Number(match[1])
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

function getMonthStartKey(dateKey: string) {
  return `${dateKey.slice(0, 7)}-01`
}

function listingLocalDateHourToUtc(dateKey: string, hour: number, timeZone: string) {
  const [yearRaw, monthRaw, dayRaw] = dateKey.split("-")
  const year = Number(yearRaw)
  const month = Number(monthRaw)
  const day = Number(dayRaw)

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day) || !Number.isFinite(hour)) {
    return new Date(NaN)
  }

  const baseUtc = Date.UTC(year, month - 1, day, hour, 0, 0, 0)
  let result = new Date(baseUtc)

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const offset = getTimeZoneOffsetMs(result, timeZone)
    const next = new Date(baseUtc - offset)
    if (next.getTime() === result.getTime()) break
    result = next
  }

  return result
}

function getBookingWindowDays(maxMonthsAhead: number, timeZone: string) {
  const now = new Date()
  const nowParts = getTimeZoneDateTimeParts(now, timeZone)
  const start = new Date(Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day, 12, 0, 0, 0))
  const end = new Date(start)
  end.setUTCMonth(end.getUTCMonth() + maxMonthsAhead)

  const dayFormatter = getFormatterForTimeZone(timeZone, { weekday: "short" })
  const monthDayFormatter = getFormatterForTimeZone(timeZone, { day: "numeric", month: "short" })
  const days: DaySlot[] = []
  const cursor = new Date(start)

  while (cursor.getTime() <= end.getTime()) {
    const dateKey = getDateKeyFromUtcDate(cursor)
    const displayDate = listingLocalDateHourToUtc(dateKey, 12, timeZone)

    days.push({
      dateKey,
      dayLabel: dayFormatter.format(displayDate),
      monthDayLabel: monthDayFormatter.format(displayDate),
    })

    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return days
}

function getMinimumBookableStart(referenceAt: Date, advanceNoticeHours: number | null | undefined, timeZone: string) {
  const localParts = getTimeZoneDateTimeParts(referenceAt, timeZone)
  const minimumStartDate = new Date(Date.UTC(localParts.year, localParts.month - 1, localParts.day, 12, 0, 0, 0))
  let minimumStartHour = localParts.hour

  if (localParts.minute > 0 || localParts.second > 0) {
    minimumStartHour += 1
  }

  if (typeof advanceNoticeHours === "number" && advanceNoticeHours > 0) {
    minimumStartHour += advanceNoticeHours
  }

  if (minimumStartHour >= 24) {
    minimumStartDate.setUTCDate(minimumStartDate.getUTCDate() + Math.floor(minimumStartHour / 24))
    minimumStartHour %= 24
  }

  return listingLocalDateHourToUtc(getDateKeyFromUtcDate(minimumStartDate), minimumStartHour, timeZone)
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

function getReviewerInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "G"
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase()
  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase()
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
  const [authModalIntent, setAuthModalIntent] = useState<"booking" | "chat">("booking")
  const [reviewsPage, setReviewsPage] = useState(1)
  const hasInitializedSelectionRef = useRef(false)
  const now = new Date()
  const localBrowserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  const { id } = useParams()
  const isUuidId = useMemo(
    () => Boolean(id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)),
    [id]
  )
  const listingQuery = useGetListing(isUuidId ? id : undefined)
  const remoteListing = listingQuery.data as ApiListing | null
  const localListing = useMemo(() => {
    if (!id) return null
    return hostListings.find((item) => String(item.id) === id) ?? null
  }, [hostListings, id])
  const listingTimeZone = remoteListing?.timezone ?? localBrowserTimeZone
  const upcomingDays = useMemo(() => getBookingWindowDays(1, listingTimeZone), [listingTimeZone])
  const monthStartsForWindow = useMemo(
    () => Array.from(new Set(upcomingDays.map((day) => getMonthStartKey(day.dateKey)))),
    [upcomingDays]
  )
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
          p_limit: REVIEWS_PAGE_SIZE,
          p_offset: (reviewsPage - 1) * REVIEWS_PAGE_SIZE,
        }
      : undefined,
    { enabled: Boolean(isUuidId && id) }
  )

  const listing = useMemo(() => {
    const remote = remoteListing

    if (remote) {
      return {
        id: remote.id,
        lat: remote.lat,
        lng: remote.lng,
        title: remote.title,
        subtitle: remote.subtitle,
        category: remote.category,
        description: remote.description,
        equipmentDesc: remote.equipment_desc,
        conveniencesDesc: remote.conveniences_desc,
        areaM2: remote.area_m2,
        cancellationPolicyHours: remote.cancellation_policy_hours,
        advanceNoticeHours: remote.advance_notice_hours,
        timezone: remote.timezone,
        images: remote.images,
        priceLabel: `$${remote.price} CAD/hour`,
        priceNumber: remote.price,
        rating: remote.average_rating,
        reviews: remote.review_count,
        ownerId: remote.owner_id,
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
        equipmentDesc: localListing.equipmentDesc,
        conveniencesDesc: localListing.conveniencesDesc,
        areaM2: localListing.areaM2,
        cancellationPolicyHours: null,
        advanceNoticeHours: localListing.advanceNoticeHours ?? null,
        timezone: localBrowserTimeZone,
        images: localListing.images,
        priceLabel: localListing.price,
        priceNumber: parseHourlyPrice(localListing.price),
        rating: localListing.rating,
        reviews: localListing.reviews,
        ownerId: null,
        distance: localListing.distance,
      }
    }

    return null
  }, [remoteListing, localListing, localBrowserTimeZone])

  const hostProfileQuery = usePublicProfile(
    {
      p_user_id: listing?.ownerId ?? undefined,
      p_limit: 6,
      p_offset: 0,
    },
    { enabled: Boolean(listing?.ownerId) }
  )
  const hostProfile = (hostProfileQuery.data as PublicProfile | null) ?? null

  const galleryImages = listing?.images?.filter(Boolean) ?? []
  const primaryImage = galleryImages[0] ?? null
  const reviews = useMemo(() => {
    const rows = (reviewsQuery.data as Array<Record<string, unknown>> | null) ?? []

    return rows
      .map((row) => {
        const ratingValue = Number(row.rating)
        const reviewerUserId = typeof row.user_id === "string" ? row.user_id : ""

        return {
          id: String(row.id ?? ""),
          reviewerUserId,
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
  const previewReviews = reviews
  const reviewCountForLabel = listing?.reviews ?? reviews.length
  const totalReviewPages = Math.max(1, Math.ceil(reviewCountForLabel / REVIEWS_PAGE_SIZE))
  const homeTo = "/"
  const bookingWindowEndLabel = useMemo(() => {
    const lastDay = upcomingDays[upcomingDays.length - 1]
    if (!lastDay) return ""
    return getFormatterForTimeZone(listingTimeZone, { month: "short", day: "numeric", year: "numeric" }).format(
      listingLocalDateHourToUtc(lastDay.dateKey, 12, listingTimeZone)
    )
  }, [listingTimeZone, upcomingDays])
  const listingTimeZoneLabel = useMemo(() => getTimeZoneLabel(listingTimeZone), [listingTimeZone])

  useEffect(() => {
    if (!Number.isFinite(participantsParam)) return
    if (participantsParam < 1 || participantsParam > 20) return

    setGuestCount(participantsParam)
  }, [participantsParam])

  useEffect(() => {
    setReviewsPage((currentPage) => Math.min(currentPage, totalReviewPages))
  }, [totalReviewPages])

  const handleOpenReviewsModal = () => {
    setReviewsPage(1)
    setIsReviewsModalOpen(true)
  }

  const handleCloseReviewsModal = () => {
    setIsReviewsModalOpen(false)
    setReviewsPage(1)
  }

  const slotMap = useMemo(() => {
    const rows = monthSlotsQueries.flatMap((query) =>
      ((query.data as Array<Record<string, unknown>> | null) ?? [])
    )

    const map = new Map<string, { price: number | null; isBooked: boolean; isBookingRestricted: boolean }>()

    rows.forEach((row) => {
      const rawDate = typeof row.date === "string" ? row.date : ""
      const hour = typeof row.hour === "number" ? row.hour : -1
      const dateKey = rawDate ? rawDate.slice(0, 10) : ""

      if (!dateKey || hour < 0 || hour > 23) return

      const key = `${dateKey}-${hour}`
      map.set(key, {
        price: typeof row.price === "number" ? row.price : null,
        isBooked: Boolean(row.is_booked),
        isBookingRestricted: Boolean(row.is_booking_restricted),
      })
    })

    return map
  }, [monthSlotsQueries])

  const areMonthSlotsReady = useMemo(() => {
    if (!id || monthSlotsQueries.length === 0) return false
    return monthSlotsQueries.every((query) => !query.isPending && !query.isLoading)
  }, [id, monthSlotsQueries])

  const bookedSlotKeys = useMemo(() => {
    const booked = new Set<string>()

    upcomingDays.forEach((day, dayIndex) => {
      HOURS.forEach((hour) => {
        const slot = slotMap.get(`${day.dateKey}-${hour}`)
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
    if (!listing) return false
    const slotStart = listingLocalDateHourToUtc(day.dateKey, hour, listing.timezone)

    return slotStart.getTime() < now.getTime()
  }

  const isBaseAvailabilityWindow = (day: DaySlot, hour: number) => {
    const slot = slotMap.get(`${day.dateKey}-${hour}`)
    return typeof slot?.price === "number" && Number.isFinite(slot.price) && slot.price > 0
  }

  const isRestrictedByAdvanceBooking = (day: DaySlot, hour: number) => {
    const slot = slotMap.get(`${day.dateKey}-${hour}`)
    return Boolean(slot?.isBookingRestricted)
  }

  const isInAdvanceNoticeWindow = (day: DaySlot, hour: number) => {
    if (!listing) return false

    const minimumBookableStart = getMinimumBookableStart(new Date(), listing.advanceNoticeHours, listing.timezone)
    const slotStart = listingLocalDateHourToUtc(day.dateKey, hour, listing.timezone)

    return slotStart.getTime() >= now.getTime() && slotStart.getTime() < minimumBookableStart.getTime()
  }

  const getSlotPrice = (day: DaySlot, hour: number) => {
    const slot = slotMap.get(`${day.dateKey}-${hour}`)
    return typeof slot?.price === "number" && Number.isFinite(slot.price) ? slot.price : null
  }

  const canBookCell = (day: DaySlot, dayIndex: number, hour: number) => {
    return (
      isBaseAvailabilityWindow(day, hour) &&
      !isPastCell(day, hour) &&
      !isRestrictedByAdvanceBooking(day, hour) &&
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
      ? formatDateRangeInTimeZone(
          listingLocalDateHourToUtc(selectedDay.dateKey, selectedStartHour, listing.timezone).toISOString(),
          listingLocalDateHourToUtc(selectedDay.dateKey, selectedEndHour, listing.timezone).toISOString(),
          listing.timezone,
        )
      : null

  const cancellationWarning = useMemo(() => {
    if (!listing || !selectedDay || selectedStartHour === null) return null

    if (listing.cancellationPolicyHours === null) {
      return "Cancellation for this listing is disabled."
    }

    if (typeof listing.cancellationPolicyHours !== "number") return null

    const selectedStart = listingLocalDateHourToUtc(selectedDay.dateKey, selectedStartHour, listing.timezone)

    const msUntilStart = selectedStart.getTime() - Date.now()
    const hoursUntilStart = msUntilStart / (1000 * 60 * 60)

    if (hoursUntilStart < listing.cancellationPolicyHours) {
      return `Cancellation will not be possible for this booking. This listing requires cancellations at least ${listing.cancellationPolicyHours} hour(s) before the start time.`
    }

    return null
  }, [listing, selectedDay, selectedStartHour])

  const handleContinueToPayment = () => {
    if (!listing || !selectedDay) return
    if (selectedStartHour === null || selectedEndHour === null) return

    const params = new URLSearchParams({
      listingId: String(listing.id),
      date: selectedDay.dateKey,
      start: String(selectedStartHour),
      end: String(selectedEndHour),
      guests: String(guestCount),
    })

    if (!user) {
    setAuthModalIntent("booking")
      setIsAuthModalOpen(true)
      return
    }

    navigate(`/payment?${params.toString()}`)
  }

  const hostChatUrl = useMemo(() => {
  if (!listing?.id || !listing.ownerId) return null

  const params = new URLSearchParams({
    listingId: String(listing.id),
    targetUserId: listing.ownerId,
  })

  return `/chat?${params.toString()}`
  }, [listing?.id, listing?.ownerId])

  const handleHostChatClick = () => {
  if (!hostChatUrl) return

  if (!user) {
    setAuthModalIntent("chat")
    setIsAuthModalOpen(true)
    return
  }

  navigate(hostChatUrl)
  }

  useEffect(() => {
    if (hasInitializedSelectionRef.current) return
    if (!listing || !areMonthSlotsReady) return

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

      const matchedDayIndex = upcomingDays.findIndex((day) => day.dateKey === dateParam)
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
    const minimumBookableStart = getMinimumBookableStart(currentNow, listing.advanceNoticeHours, listing.timezone)

    for (let dayIndex = 0; dayIndex < upcomingDays.length; dayIndex += 1) {
      const day = upcomingDays[dayIndex]

      for (let hour = 0; hour <= 23; hour += 1) {
        const slotStart = listingLocalDateHourToUtc(day.dateKey, hour, listing.timezone)

        if (slotStart.getTime() < minimumBookableStart.getTime()) continue
        if (!canBookCell(day, dayIndex, hour)) continue

        setSelectedDayIndex(dayIndex)
        setSelectedStartHour(hour)
        setSelectedEndHour(hour + 1)
        hasInitializedSelectionRef.current = true
        return
      }
    }

    hasInitializedSelectionRef.current = true
  }, [selectedDateParam, selectedStartParam, selectedDurationParam, upcomingDays, bookedSlotKeys, slotMap, listing, areMonthSlotsReady])

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

        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold leading-none text-[#000000] md:text-3xl">{listing.title}</h1>
          {typeof listing.areaM2 === "number" && listing.areaM2 > 0 ? (
            <span className="inline-flex h-8 items-center rounded-full border border-[#dadada] bg-[#ffffff] ml-2 px-3 text-sm font-medium leading-none text-[#4a4a4a]">
              {listing.areaM2} m²
            </span>
          ) : null}
        </div>

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
              <h3 className="text-lg font-semibold text-[#000000]">Space Description</h3>
              <p className="mt-3 text-sm leading-6 text-[#4a4a4a]">
                {listing.description ?? `This Airbnb-style listing page is set up for ${listing.title}. The space is located in ${listing.subtitle} and is ideal for sessions that need a clean, flexible layout.`}
              </p>
            </div>

            <div className="rounded-2xl bg-[#ffffff] p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-[#000000]">Equipment Description</h3>
              <p className="mt-3 text-sm leading-6 text-[#4a4a4a]">
                {listing.equipmentDesc?.trim() || "Professional audio setup available on-site."}
              </p>
            </div>

            <div className="rounded-2xl bg-[#ffffff] p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-[#000000]">Space conveniences</h3>
              <p className="mt-3 text-sm leading-6 text-[#4a4a4a]">
                {listing.conveniencesDesc?.trim() || "Bathroom, A/C, and Wi-Fi available."}
              </p>
            </div>

            {listing.ownerId ? (
              <div className="rounded-2xl bg-[#ffffff] p-6 shadow-sm">
                {hostProfileQuery.isLoading ? (
                  <div className="rounded-2xl border border-[#efefef] bg-[#fbfbfb] px-4 py-5 text-sm text-[#6a6a6a]">
                    Loading host info...
                  </div>
                ) : null}

                {hostProfileQuery.isError ? (
                  <div className="rounded-2xl border border-[#f1c3bd] bg-[#fff3f2] px-4 py-5 text-sm text-[#b42318]">
                    Could not load host info right now.
                  </div>
                ) : null}

                {!hostProfileQuery.isLoading && !hostProfileQuery.isError && hostProfile ? (
                  <UserProfileCard
                    profile={hostProfile}
                    variant="compact"
                    title="Hosted by"
                    description="See who runs this space before you book."
                    footer={
            hostChatUrl && user?.id !== listing.ownerId ? (
            <Button
              type="button"
              onClick={handleHostChatClick}
              className="w-full rounded-2xl bg-[#111111] text-[#ffffff] hover:bg-[#222222]"
            >
              <MessageCircle className="mr-2 h-4 w-4" />
              Chat with host
            </Button>
            ) : null
          }
                    className="p-0 border-none bg-transparent shadow-none"
                  />
                ) : null}
              </div>
            ) : null}

            {listing.reviews > 0 ? (
              <div className="rounded-2xl bg-[#ffffff] p-6 shadow-sm">
                <div className="mb-6 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <Star className="h-5 w-5 fill-[#000000] text-[#000000]" />
                    <h3 className="text-lg font-semibold text-[#000000]">
                      {listing.rating} · {reviewCountForLabel} reviews
                    </h3>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleOpenReviewsModal}
                    className="rounded-full border-[#dadada] bg-[#ffffff] px-4"
                  >
                    Show all
                  </Button>
                </div>

                {reviewsQuery.isLoading ? (
                  <p className="text-sm text-[#6a6a6a]">Loading reviews...</p>
                ) : previewReviews.length > 0 ? (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {previewReviews.map((review) => (
                      <div
                        key={review.id}
                        onClick={handleOpenReviewsModal}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault()
                            handleOpenReviewsModal()
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        className="rounded-[1.5rem] border border-[#ececec] bg-[#ffffff] p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md"
                      >
                        <div className="flex items-start gap-3">
                          {review.reviewerUserId ? (
                            <Link
                              to={`/profile/${review.reviewerUserId}`}
                              onClick={(event) => event.stopPropagation()}
                              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f3f3f3] text-sm font-semibold text-[#111111] transition-colors hover:bg-[#e7e7e7]"
                              aria-label={`Open ${review.author} profile`}
                            >
                              {getReviewerInitials(review.author)}
                            </Link>
                          ) : (
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f3f3f3] text-sm font-semibold text-[#111111]">
                              {getReviewerInitials(review.author)}
                            </div>
                          )}
                          <div className="min-w-0">
                            {review.reviewerUserId ? (
                              <Link
                                to={`/profile/${review.reviewerUserId}`}
                                onClick={(event) => event.stopPropagation()}
                                className="truncate text-sm font-semibold text-[#000000] underline-offset-4 hover:underline"
                              >
                                {review.author}
                              </Link>
                            ) : (
                              <p className="truncate text-sm font-semibold text-[#000000]">{review.author}</p>
                            )}
                            <div className="mt-1 flex items-center gap-2 text-xs text-[#6a6a6a]">
                              <span className="font-medium text-[#000000]">{"★".repeat(Math.max(1, Math.round(review.rating)))}</span>
                              {formatReviewMonth(review.createdAt) ? <span>·</span> : null}
                              {formatReviewMonth(review.createdAt) ? <span>{formatReviewMonth(review.createdAt)}</span> : null}
                            </div>
                          </div>
                        </div>
                        <p className="mt-4 text-sm leading-6 text-[#4a4a4a]">{getReviewPreview(review.text, 180)}</p>
                        <p className="mt-4 text-sm font-medium text-[#000000] underline underline-offset-4">Show more</p>
                      </div>
                    ))}
                  </div>
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
                <p className="mt-1 text-xs text-[#6a6a6a]">Selected booking times are shown in {listingTimeZoneLabel}.</p>
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
                          const isRestricted = isRestrictedByAdvanceBooking(day, hour)
                          const isAdvanceNoticeBlocked = isRestricted && isInAdvanceNoticeWindow(day, hour)
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
                                  : isAdvanceNoticeBlocked
                                  ? "bg-[#fff8eb] text-[#9a6700] cursor-not-allowed"
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
                    {selectedDay && selectedStartHour !== null && selectedEndHour !== null ? (
                      <TimeWithLocalHint
                        primaryText={selectedSlotLabel}
                        localTime={formatDateRangeInViewerTimeZone(
                          listingLocalDateHourToUtc(selectedDay.dateKey, selectedStartHour, listing.timezone).toISOString(),
                          listingLocalDateHourToUtc(selectedDay.dateKey, selectedEndHour, listing.timezone).toISOString(),
                        )}
                      >
                        {selectedSlotLabel}
                      </TimeWithLocalHint>
                    ) : (
                      "Click one available slot for start, then another for end"
                    )}
                  </p>
                  <p className="mt-1 text-xs text-[#6a6a6a]">Gray cells are unavailable. Yellow cells require more advance notice based on the listing&apos;s schedule.</p>
                </div>

                {typeof listing.advanceNoticeHours === "number" && listing.advanceNoticeHours > 0 ? (
                  <div className="mb-4 rounded-lg border border-[#f3d49b] bg-[#fff8eb] px-3 py-2">
                    <p className="text-xs font-semibold text-[#9a6700]">Advance notice</p>
                    <p className="mt-1 text-sm text-[#9a6700]">This host requires {listing.advanceNoticeHours} hour(s) of advance notice before the start time shown in {listingTimeZoneLabel}.</p>
                  </div>
                ) : null}

                {cancellationWarning ? (
                  <div className="mb-4 rounded-lg border border-[#f1c3bd] bg-[#fff3f2] px-3 py-2">
                    <p className="text-xs font-semibold text-[#b42318]">Cancellation notice</p>
                    <p className="mt-1 text-sm text-[#b42318]">{cancellationWarning}</p>
                  </div>
                ) : null}

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
          <div className="relative h-[min(90vh,52rem)] w-[min(96vw,62rem)] overflow-hidden rounded-[2rem] border border-[#e5e5e5] bg-[#ffffff] shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
            <button
              type="button"
              aria-label="Close reviews"
              onClick={handleCloseReviewsModal}
              className="absolute right-4 top-4 z-20 rounded-full border border-[#dcdcdc] bg-[#ffffff]/95 p-2 text-[#4a4a4a] backdrop-blur hover:bg-[#f5f5f5]"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex h-full flex-col">
              <div className="border-b border-[#ececec] bg-gradient-to-b from-[#fcfcfc] to-[#ffffff] px-6 py-5">
                <div className="flex flex-col gap-4 pr-12 md:flex-row md:items-end md:justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#7a7a7a]">Guest reviews</p>
                    <h2 className="mt-2 text-2xl font-semibold text-[#000000]">{reviewCountForLabel} reviews</h2>
                    <p className="mt-1 text-sm text-[#6a6a6a]">{listing.title}</p>
                  </div>

                  <div className="flex items-center gap-3 rounded-2xl border border-[#ececec] bg-[#ffffff] px-4 py-3 shadow-sm">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#111111] text-[#ffffff]">
                      <Star className="h-4 w-4 fill-current" />
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-[#000000]">{listing.rating}</p>
                      <p className="text-xs text-[#6a6a6a]">Average rating across {reviewCountForLabel} review{reviewCountForLabel === 1 ? "" : "s"}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto bg-[#fcfcfc] px-6 py-5">
                {reviews.length > 0 ? (
                  <>
                    <div className="space-y-4">
                      {reviews.map((review) => (
                        <article
                          key={review.id}
                          className="rounded-[1.6rem] border border-[#ececec] bg-[#ffffff] p-5 shadow-[0_8px_24px_rgba(17,17,17,0.04)]"
                        >
                          <div className="flex items-start gap-3">
                            {review.reviewerUserId ? (
                              <Link
                                to={`/profile/${review.reviewerUserId}`}
                                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#f3f3f3] text-sm font-semibold text-[#111111] transition-colors hover:bg-[#e7e7e7]"
                                aria-label={`Open ${review.author} profile`}
                              >
                                {getReviewerInitials(review.author)}
                              </Link>
                            ) : (
                              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#f3f3f3] text-sm font-semibold text-[#111111]">
                                {getReviewerInitials(review.author)}
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                {review.reviewerUserId ? (
                                  <Link
                                    to={`/profile/${review.reviewerUserId}`}
                                    className="truncate text-sm font-semibold text-[#000000] underline-offset-4 hover:underline"
                                  >
                                    {review.author}
                                  </Link>
                                ) : (
                                  <p className="truncate text-sm font-semibold text-[#000000]">{review.author}</p>
                                )}
                                {formatReviewMonth(review.createdAt) ? (
                                  <p className="text-xs text-[#8a8a8a]">{formatReviewMonth(review.createdAt)}</p>
                                ) : null}
                              </div>
                              <div className="mt-2 flex items-center gap-2 text-xs">
                                <span className="rounded-full bg-[#f7f7f7] px-2.5 py-1 font-medium text-[#111111]">
                                  {"★".repeat(Math.max(1, Math.round(review.rating)))}
                                </span>
                                <span className="text-[#6a6a6a]">{Number.isInteger(review.rating) ? review.rating : review.rating.toFixed(1)} / 5</span>
                              </div>
                            </div>
                          </div>

                          <p className="mt-4 text-sm leading-7 text-[#4a4a4a]">{review.text}</p>
                        </article>
                      ))}
                    </div>

                    {reviewCountForLabel > REVIEWS_PAGE_SIZE ? (
                      <div className="mt-5 flex items-center justify-between rounded-2xl border border-[#ececec] bg-[#ffffff] px-4 py-3 shadow-sm">
                        <p className="text-sm text-[#6a6a6a]">Page {reviewsPage} of {totalReviewPages}</p>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setReviewsPage((page) => Math.max(1, page - 1))}
                            disabled={reviewsPage === 1 || reviewsQuery.isLoading}
                          >
                            Previous
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setReviewsPage((page) => Math.min(totalReviewPages, page + 1))}
                            disabled={reviewsPage === totalReviewPages || reviewsQuery.isLoading}
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="flex h-full min-h-[16rem] items-center justify-center rounded-[1.6rem] border border-dashed border-[#d8d8d8] bg-[#ffffff] px-6 text-center">
                    <div>
                      <p className="text-sm font-medium text-[#000000]">No review comments yet</p>
                      <p className="mt-2 text-sm text-[#6a6a6a]">Once guests leave feedback, it will show up here.</p>
                    </div>
                  </div>
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
          if (authModalIntent === "chat") {
			const redirect = hostChatUrl ?? `/listing/${listing?.id ?? ""}`
			navigate(`/login?redirect=${encodeURIComponent(redirect)}`)
			return
		  }

          if (!listing || !selectedDay || selectedStartHour === null || selectedEndHour === null) {
            navigate(`/login?redirect=${encodeURIComponent(`/listing/${listing?.id ?? ""}`)}`)
            return
          }

          const params = new URLSearchParams({
            listingId: String(listing.id),
            date: selectedDay.dateKey,
            start: String(selectedStartHour),
            end: String(selectedEndHour),
            guests: String(guestCount),
          })

          navigate(`/login?redirect=${encodeURIComponent(`/payment?${params.toString()}`)}`)
        }}
        onSignup={() => {
          if (authModalIntent === "chat") {
			const redirect = hostChatUrl ?? `/listing/${listing?.id ?? ""}`
			navigate(`/signup?redirect=${encodeURIComponent(redirect)}`)
			return
		  }

          if (!listing || !selectedDay || selectedStartHour === null || selectedEndHour === null) {
            navigate(`/signup?redirect=${encodeURIComponent(`/listing/${listing?.id ?? ""}`)}`)
            return
          }

          const params = new URLSearchParams({
            listingId: String(listing.id),
            date: selectedDay.dateKey,
            start: String(selectedStartHour),
            end: String(selectedEndHour),
            guests: String(guestCount),
          })

          navigate(`/signup?redirect=${encodeURIComponent(`/payment?${params.toString()}`)}`)
        }}
        title={authModalIntent === "chat" ? "Login required to message host" : "Login required to continue"}
        description={authModalIntent === "chat" ? "Please log in or sign up to start chatting with this host." : "Please log in or sign up to continue to checkout."}
      />
    </div>
  )
}
