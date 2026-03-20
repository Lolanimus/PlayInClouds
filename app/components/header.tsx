"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Search, X, Menu, MapPin, ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const HOUR_HEIGHT = 40
const VISIBLE_ITEMS = 5
const DROPDOWN_ANIMATION_MS = 200

type CitySuggestion = {
  id: string
  name: string
}

type GoogleAutocompleteResponse = {
  suggestions?: Array<{
    placePrediction?: {
      placeId?: string
      text?: {
        text?: string
      }
    }
  }>
}

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_PUBLIC_GOOGLE_MAPS_API_KEY as string | undefined

function IOSTimePicker({
  value,
  onChange,
  minHour = 0,
  maxHour = 23,
}: {
  value: number | null
  onChange: (hour: number) => void
  minHour?: number
  maxHour?: number
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [isScrolling, setIsScrolling] = useState(false)
  const scrollTimeout = useRef<NodeJS.Timeout | null>(null)

  const safeMaxHour = Math.max(minHour, Math.min(23, maxHour))
  const hours = Array.from({ length: Math.max(0, safeMaxHour - minHour + 1) }, (_, i) => i + minHour)

  const scrollToHour = useCallback((hour: number, smooth = true) => {
    if (scrollRef.current) {
      const safeHour = Math.max(minHour, Math.min(safeMaxHour, hour))
      const offset = (safeHour - minHour) * HOUR_HEIGHT
      scrollRef.current.scrollTo({
        top: offset,
        behavior: smooth ? "smooth" : "auto",
      })
    }
  }, [minHour, safeMaxHour])

  useEffect(() => {
    if (value !== null && !isScrolling) {
      scrollToHour(value, false)
    }
  }, [value, scrollToHour, isScrolling])

  const handleScroll = () => {
    if (!scrollRef.current) return

    setIsScrolling(true)

    if (scrollTimeout.current) {
      clearTimeout(scrollTimeout.current)
    }

    scrollTimeout.current = setTimeout(() => {
      if (!scrollRef.current) return
      const scrollTop = scrollRef.current.scrollTop
      const selectedIndex = Math.round(scrollTop / HOUR_HEIGHT)
      const selectedHour = minHour + selectedIndex
      const clampedHour = Math.max(minHour, Math.min(safeMaxHour, selectedHour))

      scrollToHour(clampedHour)
      onChange(clampedHour)
      setIsScrolling(false)
    }, 100)
  }

  const centerOffset = Math.floor(VISIBLE_ITEMS / 2) * HOUR_HEIGHT

  return (
    <div className="relative h-[200px] overflow-hidden">
    {/* Selection highlight */}
      <div
        className="absolute left-0 right-0 bg-[#e6e6e6] rounded-lg pointer-events-none z-10"
        style={{
          top: centerOffset,
          height: HOUR_HEIGHT,
        }}
      />
      {/* Gradient overlays */}
      <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-[#ffffff] to-transparent pointer-events-none z-20" />
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#ffffff] to-transparent pointer-events-none z-20" />

      {/* Scrollable list */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="relative z-30 h-full overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        style={{
          paddingTop: centerOffset,
          paddingBottom: centerOffset,
          scrollSnapType: "y mandatory",
        }}
      >
        {hours.map((hour) => {
          const isSelected = value === hour
          return (
            <div
              key={hour}
              onClick={() => {
                onChange(hour)
                scrollToHour(hour)
              }}
              className={cn(
                "relative z-30 flex items-center justify-center cursor-pointer transition-all",
                isSelected ? "text-[#000000] font-semibold text-lg" : "text-[#8a8a8a] text-base"
              )}
              style={{
                height: HOUR_HEIGHT,
                scrollSnapAlign: "center",
              }}
            >
              {hour.toString().padStart(2, "0")}:00
            </div>
          )
        })}
      </div>
    </div>
  )
}

const daysOfWeek = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}

function formatHour(hour: number) {
  return `${hour.toString().padStart(2, "0")}:00`
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function Header({ onOpenFilters }: { onOpenFilters?: () => void }) {
  const [activeField, setActiveField] = useState<"where" | "when" | "who" | null>(null)
  const [closingField, setClosingField] = useState<"where" | "when" | "who" | null>(null)
  const [location, setLocation] = useState("")
  const [locationSearch, setLocationSearch] = useState("")
  const [locationSuggestions, setLocationSuggestions] = useState<CitySuggestion[]>([])
  const [isLoadingLocations, setIsLoadingLocations] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [participantCount, setParticipantCount] = useState(1)
  const [currentMonth, setCurrentMonth] = useState(new Date(2026, 2)) // March 2026
  const [startHour, setStartHour] = useState<number | null>(null)
  const [duration, setDuration] = useState(1)
  const headerRef = useRef<HTMLDivElement>(null)
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const activeFieldRef = useRef<"where" | "when" | "who" | null>(null)

  const query = locationSearch.trim()
  const showWhereSuggestions = query.length >= 2

  const handleLocationSelect = (locationName: string) => {
    setLocation(locationName)
    setLocationSearch("")
    if (activeField) {
      setClosingField(activeField)
      setActiveField(null)
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = setTimeout(() => setClosingField(null), DROPDOWN_ANIMATION_MS)
    }
  }

  const handleClickOutside = (e: MouseEvent) => {
    const currentActiveField = activeFieldRef.current
    if (headerRef.current && !headerRef.current.contains(e.target as Node) && currentActiveField) {
      setClosingField(currentActiveField)
      setActiveField(null)
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current)
      closeTimeoutRef.current = setTimeout(() => setClosingField(null), DROPDOWN_ANIMATION_MS)
    }
  }

  useEffect(() => {
    activeFieldRef.current = activeField
  }, [activeField])

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    const trimmedQuery = locationSearch.trim()

    if (trimmedQuery.length < 2) {
      setLocationSuggestions([])
      setIsLoadingLocations(false)
      setLocationError(null)
      return
    }

    if (!GOOGLE_MAPS_API_KEY) {
      setLocationSuggestions([])
      setIsLoadingLocations(false)
      setLocationError("Missing Google Maps API key")
      return
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(async () => {
      setIsLoadingLocations(true)
      setLocationError(null)

      try {
        const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
            "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text",
          },
          body: JSON.stringify({
            input: trimmedQuery,
            includedPrimaryTypes: ["(cities)"],
          }),
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`Google API error: ${response.status}`)
        }

        const data = (await response.json()) as GoogleAutocompleteResponse
        const parsedSuggestions: CitySuggestion[] = (data.suggestions ?? [])
          .map((item) => item.placePrediction)
          .filter((prediction): prediction is NonNullable<typeof prediction> => Boolean(prediction?.placeId && prediction?.text?.text))
          .map((prediction) => ({
            id: prediction.placeId as string,
            name: prediction.text?.text as string,
          }))

        const uniqueSuggestions = Array.from(
          new Map(parsedSuggestions.map((item) => [item.id, item])).values()
        ).slice(0, 6)

        setLocationSuggestions(uniqueSuggestions)
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setLocationSuggestions([])
          setLocationError("Could not load city suggestions")
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoadingLocations(false)
        }
      }
    }, 250)

    return () => {
      clearTimeout(timeoutId)
      controller.abort()
    }
  }, [locationSearch])

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))
  }

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))
  }

  const monthName = currentMonth.toLocaleString("default", { month: "long", year: "numeric" })
  const daysInMonth = getDaysInMonth(currentMonth.getFullYear(), currentMonth.getMonth())
  const firstDay = getFirstDayOfMonth(currentMonth.getFullYear(), currentMonth.getMonth())

  const calendarDays = []
  for (let i = 0; i < firstDay; i++) {
    calendarDays.push(null)
  }
  for (let i = 1; i <= daysInMonth; i++) {
    calendarDays.push(i)
  }

  const selectedDateLabel = selectedDate
    ? selectedDate.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : ""

  const selectedTimeLabel =
    startHour !== null ? `${formatHour(startHour)} (${duration}h)` : ""

  const whenSummary =
    selectedDateLabel && selectedTimeLabel
      ? `${selectedDateLabel}, ${selectedTimeLabel}`
      : selectedDateLabel || selectedTimeLabel || "Add Dates"

  const participantsSummary =
    participantCount === 10
      ? "10+ participants"
      : participantCount === 1
        ? "1 participant"
        : `${participantCount} participants`

  return (
    <header ref={headerRef} className="relative z-40 bg-[#000000] w-full">
      <div className="relative flex items-center justify-between p-8">
        {/* Logo */}
        <div className="w-24 flex-shrink-0">
          <svg
            viewBox="0 0 100 40"
            className="h-8 w-auto text-[#ffffff]"
            fill="currentColor"
          >
            <path d="M10 30 Q 15 10, 30 15 Q 45 20, 40 30 Q 35 35, 25 32 Q 15 29, 10 30" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <path d="M30 15 L 45 8" stroke="currentColor" strokeWidth="1.5" fill="none" />
            <path d="M50 25 Q 55 15, 65 20 Q 75 25, 70 30" stroke="currentColor" strokeWidth="1.5" fill="none" />
          </svg>
        </div>

        {/* Search Bar */}
        <div className="absolute left-1/2 -translate-x-1/2">
          <div className="relative">
            <div className="flex items-center bg-[#ffffff] rounded-full shadow-lg">
              {/* Where Field */}
              <div
                className={cn(
                  "relative px-6 py-3 rounded-full transition-all w-[160px]",
                  activeField === "where" && "bg-[#e9e9e9]"
                )}
                onClick={() => setActiveField("where")}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-[#000000] whitespace-nowrap">Where</p>
                    <input
                      type="text"
                      placeholder="Search destination"
                      value={location || locationSearch}
                      onChange={(e) => {
                        setLocationSearch(e.target.value)
                        setLocation("")
                      }}
                      onClick={(e) => e.stopPropagation()}
                      onFocus={() => setActiveField("where")}
                      className="w-full text-sm bg-transparent text-[#000000] placeholder:text-[#6a6a6a] focus:outline-none"
                    />
                  </div>
                  {(location || locationSearch) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setLocation("")
                        setLocationSearch("")
                      }}
                      className="flex-shrink-0 p-1 hover:bg-[#dadada] rounded-full"
                    >
                      <X className="h-3 w-3 text-[#6a6a6a]" />
                    </button>
                  )}
                </div>
              </div>

              <div className="h-8 w-px bg-[#dadada] flex-shrink-0" />

              {/* When Field */}
              <div
                className={cn(
                  "relative px-6 py-3 cursor-pointer rounded-full transition-all w-[160px]",
                  activeField === "when" && "bg-[#e9e9e9]"
                )}
                onClick={() => setActiveField("when")}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[#000000] whitespace-nowrap">When</p>
                    <p className="text-sm text-[#6a6a6a] truncate">
                      {whenSummary}
                    </p>
                  </div>
                  {(selectedDate || startHour !== null) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedDate(null)
                        setStartHour(null)
                        setDuration(1)
                      }}
                      className="flex-shrink-0 p-1 hover:bg-[#dadada] rounded-full"
                    >
                      <X className="h-3 w-3 text-[#6a6a6a]" />
                    </button>
                  )}
                </div>
              </div>

              <div className="h-8 w-px bg-[#dadada] flex-shrink-0" />

              {/* Who Field */}
              <div
                className={cn(
                  "relative px-6 py-3 cursor-pointer rounded-full transition-all w-[160px]",
                  activeField === "who" && "bg-[#e9e9e9]"
                )}
                onClick={() => setActiveField("who")}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[#000000] whitespace-nowrap">Who</p>
                    <p className="text-sm text-[#6a6a6a] truncate">
                      {participantsSummary}
                    </p>
                  </div>
                  {participantCount > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setParticipantCount(1)
                      }}
                      className="flex-shrink-0 p-1 hover:bg-[#dadada] rounded-full"
                    >
                      <X className="h-3 w-3 text-[#6a6a6a]" />
                    </button>
                  )}
                </div>
              </div>

              {/* Search Button */}
              <div className="pr-2">
                <Button
                  size="icon"
                  className="h-10 w-10 rounded-full bg-[#000000] hover:bg-[#6a6a6a] text-[#ffffff]"
                >
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Where Dropdown */}
            {(activeField === "where" || closingField === "where") && showWhereSuggestions && (
              <div className={cn(
                "absolute top-full left-0 mt-2 w-80 bg-[#ffffff] rounded-2xl shadow-xl border border-[#e9e9e9] overflow-hidden z-[80]",
                activeField === "where"
                  ? "animate-in fade-in-0 slide-in-from-bottom-2 duration-200"
                  : "pointer-events-none animate-out fade-out-0 slide-out-to-bottom-2 duration-200 ease-out"
              )}>
                <div className="max-h-60 overflow-y-auto">
                  {isLoadingLocations && (
                    <div className="px-4 py-3 text-sm text-[#6a6a6a]">Searching cities...</div>
                  )}

                  {!isLoadingLocations && locationError && (
                    <div className="px-4 py-3 text-sm text-[#6a6a6a]">{locationError}</div>
                  )}

                  {!isLoadingLocations && !locationError && locationSuggestions.length === 0 && (
                    <div className="px-4 py-3 text-sm text-[#6a6a6a]">No cities found</div>
                  )}

                  {!isLoadingLocations && !locationError && locationSuggestions.map((loc) => (
                    <button
                      key={loc.id}
                      onClick={() => handleLocationSelect(loc.name)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#e9e9e9] transition-colors"
                    >
                      <div className="h-10 w-10 bg-[#e9e9e9] rounded-lg flex items-center justify-center">
                        <MapPin className="h-5 w-5 text-[#6a6a6a]" />
                      </div>
                      <span className="text-sm text-[#000000] text-left">{loc.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* When Dropdown */}
            {(activeField === "when" || closingField === "when") && (
              <div className={cn(
                "absolute top-full left-0 mt-2 w-full bg-[#ffffff] rounded-2xl shadow-xl border border-[#e9e9e9] overflow-hidden z-[80]",
                activeField === "when"
                  ? "animate-in fade-in-0 slide-in-from-bottom-2 duration-200"
                  : "pointer-events-none animate-out fade-out-0 slide-out-to-bottom-2 duration-200 ease-out"
              )}>                <div className="flex">
                  {/* Calendar */}
                  <div className="p-4 border-r border-[#e9e9e9]">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm font-medium text-[#000000]">{monthName}</span>
                      <div className="flex gap-1">
                        <button
                          onClick={prevMonth}
                          className="p-1 hover:bg-[#e9e9e9] rounded"
                        >
                          <ChevronLeft className="h-4 w-4 text-[#6a6a6a]" />
                        </button>
                        <button
                          onClick={nextMonth}
                          className="p-1 hover:bg-[#e9e9e9] rounded"
                        >
                          <ChevronRight className="h-4 w-4 text-[#6a6a6a]" />
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-center">
                      {daysOfWeek.map((day) => (
                        <div key={day} className="text-xs text-[#6a6a6a] py-2">
                          {day}
                        </div>
                      ))}
                      {calendarDays.map((day, idx) => (
                        <button
                          key={idx}
                          disabled={!day}
                          onClick={() => {
                            if (!day) return
                            setSelectedDate(
                              new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day)
                            )
                          }}
                          className={cn(
                            "h-8 w-8 text-sm rounded-full transition-colors",
                            day ? "hover:bg-[#e9e9e9] text-[#000000]" : "invisible",
                            day &&
                              selectedDate &&
                              isSameDay(
                                selectedDate,
                                new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day)
                              ) &&
                              "bg-[#000000] text-[#ffffff] hover:bg-[#000000]"
                          )}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Time Selection - iOS Style */}
                  <div className="p-4 min-w-[260px] self-center">
                    <div className="flex items-center justify-between gap-3">
                      <div className="w-[96px]">
                        <p className="text-xs font-medium text-[#6a6a6a] mb-2 text-center">Start</p>
                        <IOSTimePicker
                          value={startHour}
                          maxHour={23}
                          onChange={setStartHour}
                        />
                      </div>

                      <div className="w-[96px]">
                        <p className="text-xs font-medium text-[#6a6a6a] mb-2 text-center">Duration</p>
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => setDuration((prev) => Math.max(1, prev - 1))}
                            className="h-6 w-6 rounded-full border border-[#dadada] flex items-center justify-center text-[#6a6a6a] hover:border-[#000000]"
                          >
                            −
                          </button>
                          <span className="text-sm text-[#000000] w-8 text-center font-medium">
                            {duration}h
                          </span>
                          <button
                            onClick={() => setDuration((prev) => Math.min(12, prev + 1))}
                            className="h-6 w-6 rounded-full border border-[#dadada] flex items-center justify-center text-[#6a6a6a] hover:border-[#000000]"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Who Dropdown */}
            {(activeField === "who" || closingField === "who") && (
              <div className={cn(
                "absolute top-full right-0 mt-2 w-64 bg-[#ffffff] rounded-2xl shadow-xl border border-[#e9e9e9] overflow-hidden z-[80]",
                activeField === "who"
                  ? "animate-in fade-in-0 slide-in-from-bottom-2 duration-200"
                  : "pointer-events-none animate-out fade-out-0 slide-out-to-bottom-2 duration-200 ease-out"
              )}>
                <div className="p-4">
                  <p className="text-sm font-medium text-[#000000] mb-4">Number of Participants</p>
                  <div className="flex items-center justify-center">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setParticipantCount((prev) => Math.max(1, prev - 1))}
                        className="h-6 w-6 rounded-full border border-[#dadada] flex items-center justify-center text-[#6a6a6a] hover:border-[#000000]"
                      >
                        -
                      </button>
                      <span className="text-sm text-[#000000] w-8 text-center font-medium">
                        {participantCount === 10 ? "10+" : participantCount}
                      </span>
                      <button
                        onClick={() => setParticipantCount((prev) => Math.min(10, prev + 1))}
                        className="h-6 w-6 rounded-full border border-[#dadada] flex items-center justify-center text-[#6a6a6a] hover:border-[#000000]"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <Button
              variant="outline"
              onClick={onOpenFilters}
              className="absolute left-full ml-3 top-1/2 -translate-y-1/2 active:-translate-y-1/2 flex items-center gap-2 rounded-full border-[#dadada] bg-[#ffffff] text-[#000000] hover:bg-[#e9e9e9] transition-colors"
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span>Filters</span>
            </Button>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center justify-end gap-4 w-48 flex-shrink-0">
          <Button
            variant="ghost"
            className="text-[#ffffff] hover:bg-[#ffffff]/10 text-sm font-medium whitespace-nowrap"
          >
            Become a Host
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-10 w-10 text-[#ffffff] hover:bg-[#ffffff]/10 flex-shrink-0"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  )
}
