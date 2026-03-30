import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
