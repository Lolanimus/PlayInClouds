import { create } from "zustand"

export type ReservationRecord = {
  id: string
  userId: string
  listingId: string | number
  listingTitle: string
  listingSubtitle: string
  listingImage: string
  dateKey: string
  startHour: number
  endHour: number
  guests: number
  subtotal: number
  processingFee: number
  total: number
  createdAt: string
}

type ReservationsState = {
  reservations: ReservationRecord[]
  actions: {
    addReservation: (reservation: ReservationRecord) => void
    clearReservationsForUser: (userId: string) => void
  }
}

const useReservationsStore = create<ReservationsState>((set) => ({
  reservations: [],
  actions: {
    addReservation: (reservation) =>
      set((state) => ({
        reservations: [reservation, ...state.reservations],
      })),
    clearReservationsForUser: (userId) =>
      set((state) => ({
        reservations: state.reservations.filter((reservation) => reservation.userId !== userId),
      })),
  },
}))

export const reservationsStore = useReservationsStore
export const useReservations = () => useReservationsStore((state) => state.reservations)
export const useReservationsActions = () => useReservationsStore((state) => state.actions)
