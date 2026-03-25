export type ListingAvailabilityWindow = {
  days: number[]
  startHour: number
  endHour: number
}

export type ListingBookedHoursByWeekday = Record<number, number[]>

export const listingAvailability: Record<number, ListingAvailabilityWindow> = {
  1: { days: [1, 2, 3, 4, 5], startHour: 9, endHour: 20 },
  2: { days: [1, 2, 3, 4, 5], startHour: 8, endHour: 18 },
  3: { days: [2, 3, 4, 5, 6], startHour: 10, endHour: 22 },
  4: { days: [1, 2, 3, 4, 5, 6], startHour: 7, endHour: 17 },
  5: { days: [3, 4, 5, 6, 0], startHour: 12, endHour: 23 },
  6: { days: [1, 2, 3, 4, 5], startHour: 9, endHour: 21 },
  7: { days: [0, 6], startHour: 8, endHour: 16 },
  8: { days: [4, 5, 6], startHour: 14, endHour: 23 },
  9: { days: [1, 2, 3, 4, 5], startHour: 9, endHour: 19 },
}

// Mocked booked-hour blocks per listing and weekday (0=Sun ... 6=Sat).
// These are explicit fixtures (non-random) used by the booking grid.
export const listingBookedHours: Record<number, ListingBookedHoursByWeekday> = {
  1: { 1: [10, 11, 15], 3: [9, 16], 5: [12, 13, 18] },
  2: { 1: [8, 14], 2: [9, 10, 16], 4: [11, 12] },
  3: { 2: [12, 18], 4: [10, 11, 20], 6: [14, 15] },
  4: { 1: [7, 8], 3: [12, 13], 6: [9, 10, 11] },
  5: { 0: [18, 19], 4: [15, 16, 17], 6: [20, 21] },
  6: { 1: [9, 17], 2: [10, 11], 5: [14, 18, 19] },
  7: { 0: [9, 12], 6: [8, 13, 14] },
  8: { 4: [16, 17], 5: [14, 20], 6: [18, 21] },
  9: { 1: [10, 11], 3: [12, 13, 14], 5: [15, 16] },
}
