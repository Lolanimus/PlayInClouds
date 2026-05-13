import { create } from "zustand"

type SearchStore = {
  where: string
  date: Date | null
  startHour: number | null
  duration: number
  participants: number
  priceMax: number
  distanceMax: number
  setWhere: (where: string) => void
  setDate: (date: Date | null) => void
  setStartHour: (startHour: number | null) => void
  setDuration: (duration: number) => void
  setParticipants: (participants: number) => void
  setPriceMax: (priceMax: number) => void
  setDistanceMax: (distanceMax: number) => void
}

const now = new Date()
const nextBookableHourToday =
  now.getMinutes() > 0 || now.getSeconds() > 0 || now.getMilliseconds() > 0
    ? now.getHours() + 1
    : now.getHours()
const hasBookableHourToday = nextBookableHourToday <= 23
const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)

export const useSearchStore = create<SearchStore>((set) => ({
  where: "",
  date: hasBookableHourToday ? todayStart : tomorrowStart,
  startHour: hasBookableHourToday ? nextBookableHourToday : 0,
  duration: 1,
  participants: 1,
  priceMax: 200,
  distanceMax: 50,
  setWhere: (where) => set({ where }),
  setDate: (date) => set({ date }),
  setStartHour: (startHour) => set({ startHour }),
  setDuration: (duration) => set({ duration }),
  setParticipants: (participants) => set({ participants }),
  setPriceMax: (priceMax) => set({ priceMax }),
  setDistanceMax: (distanceMax) => set({ distanceMax }),
}))
