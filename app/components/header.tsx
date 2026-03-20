"use client"

import { useState, useRef, useEffect } from "react"
import { Search, X, Menu, MapPin, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const locations = [
  { id: 1, name: "London, United Kingdom", icon: MapPin },
  { id: 2, name: "London, Canada", icon: MapPin },
  { id: 3, name: "London International Airport, London, Canada", icon: MapPin },
]

const daysOfWeek = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}

export function Header() {
  const [activeField, setActiveField] = useState<"where" | "when" | "who" | null>(null)
  const [location, setLocation] = useState("")
  const [locationSearch, setLocationSearch] = useState("")
  const [dateRange, setDateRange] = useState("")
  const [participants, setParticipants] = useState("")
  const [participantCount, setParticipantCount] = useState({ "1hr": 0, "2hrs": 0, "3hrs": 0 })
  const [currentMonth, setCurrentMonth] = useState(new Date(2026, 2)) // March 2026
  const [startTime, setStartTime] = useState({ "1hr": false, "2hrs": false, "3hrs": false })
  const [endTime, setEndTime] = useState({ "1hr": false, "2hrs": false, "3hrs": false })
  const headerRef = useRef<HTMLDivElement>(null)

  const filteredLocations = locations.filter((loc) =>
    loc.name.toLowerCase().includes(locationSearch.toLowerCase())
  )

  const handleLocationSelect = (locationName: string) => {
    setLocation(locationName.split(",")[0])
    setLocationSearch("")
    setActiveField(null)
  }

  const handleClickOutside = (e: MouseEvent) => {
    if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
      setActiveField(null)
    }
  }

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

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

  return (
    <header ref={headerRef} className="bg-[#000000] w-full">
      <div className="flex items-center justify-between px-6 py-4">
        {/* Logo */}
        <div className="flex-shrink-0">
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
        <div className="flex-1 flex justify-center px-8">
          <div className="relative">
            <div className="flex items-center bg-[#ffffff] rounded-full shadow-lg">
              {/* Where Field */}
              <div
                className={cn(
                  "relative px-6 py-3 cursor-pointer rounded-full transition-all",
                  activeField === "where" && "bg-[#e9e9e9]"
                )}
                onClick={() => setActiveField("where")}
              >
                <div className="flex items-center gap-2">
                  <div>
                    <p className="text-xs font-medium text-[#000000]">Where</p>
                    <p className="text-sm text-[#6a6a6a]">
                      {location || "Search destination"}
                    </p>
                  </div>
                  {location && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setLocation("")
                      }}
                      className="p-1 hover:bg-[#dadada] rounded-full"
                    >
                      <X className="h-3 w-3 text-[#6a6a6a]" />
                    </button>
                  )}
                </div>
              </div>

              <div className="h-8 w-px bg-[#dadada]" />

              {/* When Field */}
              <div
                className={cn(
                  "relative px-6 py-3 cursor-pointer rounded-full transition-all",
                  activeField === "when" && "bg-[#e9e9e9]"
                )}
                onClick={() => setActiveField("when")}
              >
                <div className="flex items-center gap-2">
                  <div>
                    <p className="text-xs font-medium text-[#000000]">When</p>
                    <p className="text-sm text-[#6a6a6a]">
                      {dateRange || "Add Dates"}
                    </p>
                  </div>
                  {dateRange && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setDateRange("")
                      }}
                      className="p-1 hover:bg-[#dadada] rounded-full"
                    >
                      <X className="h-3 w-3 text-[#6a6a6a]" />
                    </button>
                  )}
                </div>
              </div>

              <div className="h-8 w-px bg-[#dadada]" />

              {/* Who Field */}
              <div
                className={cn(
                  "relative px-6 py-3 cursor-pointer rounded-full transition-all",
                  activeField === "who" && "bg-[#e9e9e9]"
                )}
                onClick={() => setActiveField("who")}
              >
                <div className="flex items-center gap-2">
                  <div>
                    <p className="text-xs font-medium text-[#000000]">Who</p>
                    <p className="text-sm text-[#6a6a6a]">
                      {participants || "Add guests"}
                    </p>
                  </div>
                  {participants && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setParticipants("")
                        setParticipantCount({ "1hr": 0, "2hrs": 0, "3hrs": 0 })
                      }}
                      className="p-1 hover:bg-[#dadada] rounded-full"
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
            {activeField === "where" && (
              <div className="absolute top-full left-0 mt-2 w-80 bg-[#ffffff] rounded-2xl shadow-xl border border-[#e9e9e9] overflow-hidden z-50">
                <div className="p-4">
                  <input
                    type="text"
                    placeholder="Search destination"
                    value={locationSearch}
                    onChange={(e) => setLocationSearch(e.target.value)}
                    className="w-full px-4 py-2 bg-[#e9e9e9] rounded-lg text-sm text-[#000000] placeholder:text-[#6a6a6a] focus:outline-none"
                    autoFocus
                  />
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {filteredLocations.map((loc) => (
                    <button
                      key={loc.id}
                      onClick={() => handleLocationSelect(loc.name)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#e9e9e9] transition-colors"
                    >
                      <div className="h-10 w-10 bg-[#e9e9e9] rounded-lg flex items-center justify-center">
                        <loc.icon className="h-5 w-5 text-[#6a6a6a]" />
                      </div>
                      <span className="text-sm text-[#000000]">{loc.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* When Dropdown */}
            {activeField === "when" && (
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-[#ffffff] rounded-2xl shadow-xl border border-[#e9e9e9] overflow-hidden z-50">
                <div className="flex">
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
                          className={cn(
                            "h-8 w-8 text-sm rounded-full transition-colors",
                            day ? "hover:bg-[#e9e9e9] text-[#000000]" : "invisible"
                          )}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Time Selection */}
                  <div className="p-4 min-w-[160px]">
                    <div className="mb-4">
                      <p className="text-sm font-medium text-[#000000] mb-2">Start</p>
                      <div className="flex gap-2">
                        {(["1hr", "2hrs", "3hrs"] as const).map((time) => (
                          <button
                            key={time}
                            onClick={() => setStartTime((prev) => ({ ...prev, [time]: !prev[time] }))}
                            className={cn(
                              "px-2 py-1 text-xs rounded border transition-colors",
                              startTime[time]
                                ? "bg-[#000000] text-[#ffffff] border-[#000000]"
                                : "border-[#dadada] text-[#6a6a6a] hover:border-[#000000]"
                            )}
                          >
                            {time}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[#000000] mb-2">End</p>
                      <div className="flex gap-2">
                        {(["1hr", "2hrs", "3hrs"] as const).map((time) => (
                          <button
                            key={time}
                            onClick={() => setEndTime((prev) => ({ ...prev, [time]: !prev[time] }))}
                            className={cn(
                              "px-2 py-1 text-xs rounded border transition-colors",
                              endTime[time]
                                ? "bg-[#000000] text-[#ffffff] border-[#000000]"
                                : "border-[#dadada] text-[#6a6a6a] hover:border-[#000000]"
                            )}
                          >
                            {time}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Who Dropdown */}
            {activeField === "who" && (
              <div className="absolute top-full right-0 mt-2 w-64 bg-[#ffffff] rounded-2xl shadow-xl border border-[#e9e9e9] overflow-hidden z-50">
                <div className="p-4">
                  <p className="text-sm font-medium text-[#000000] mb-4">Number of Participants</p>
                  <div className="space-y-3">
                    {(["1hr", "2hrs", "3hrs"] as const).map((duration) => (
                      <div key={duration} className="flex items-center justify-between">
                        <span className="text-sm text-[#6a6a6a]">{duration}</span>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() =>
                              setParticipantCount((prev) => ({
                                ...prev,
                                [duration]: Math.max(0, prev[duration] - 1),
                              }))
                            }
                            className="h-6 w-6 rounded-full border border-[#dadada] flex items-center justify-center text-[#6a6a6a] hover:border-[#000000]"
                          >
                            -
                          </button>
                          <span className="text-sm text-[#000000] w-4 text-center">
                            {participantCount[duration]}
                          </span>
                          <button
                            onClick={() => {
                              setParticipantCount((prev) => ({
                                ...prev,
                                [duration]: prev[duration] + 1,
                              }))
                              const total = Object.values(participantCount).reduce((a, b) => a + b, 0) + 1
                              setParticipants(`${total} participants`)
                            }}
                            className="h-6 w-6 rounded-full border border-[#dadada] flex items-center justify-center text-[#6a6a6a] hover:border-[#000000]"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            className="text-[#ffffff] hover:bg-[#ffffff]/10 text-sm font-medium"
          >
            Become a Host
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-10 w-10 text-[#ffffff] hover:bg-[#ffffff]/10"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  )
}
