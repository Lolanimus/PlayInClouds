import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

type ListingModerationMessageState = {
  id: string
  moderation_status: string
  moderation_message: string | null
  reviewed_at: string | null
}

const isBrowser = typeof window !== "undefined"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function isListingModerationMessageDismissed(listing: ListingModerationMessageState) {
  if (!isBrowser || !listing.moderation_message) return false

  try {
    return localStorage.getItem(getListingModerationMessageStorageKey(listing.id)) === getListingModerationMessageVersion(listing)
  } catch {
    return false
  }
}

export function dismissListingModerationMessage(listing: ListingModerationMessageState) {
  if (!isBrowser || !listing.moderation_message) return

  try {
    localStorage.setItem(getListingModerationMessageStorageKey(listing.id), getListingModerationMessageVersion(listing))
  } catch {
    return
  }
}

export function formatListingCategory(value?: string | null) {
  if (!value) return ""

  const normalized = value.trim()

  const labelByCategory: Record<string, string> = {
    REHEARSAL_SPACE: "Rehearsal Space",
    RECORDING_STUDIO: "Recording Studio",
    OTHER: "Other",
  }

  if (labelByCategory[normalized]) {
    return labelByCategory[normalized]
  }

  return normalized
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

function getListingModerationMessageStorageKey(listingId: string) {
  return `playinclouds:listings:${listingId}:moderation-message-dismissed`
}

function getListingModerationMessageVersion(listing: ListingModerationMessageState) {
  return [listing.moderation_status, listing.reviewed_at ?? "", listing.moderation_message ?? ""].join("::")
}
