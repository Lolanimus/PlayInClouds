export function getBrowserTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
}

function getReadableTimeZone(timeZone: string) {
  return timeZone.replaceAll("_", " ")
}

export function getTimeZoneLabel(timeZone: string) {
  try {
    const timeZoneName = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "short",
    })
      .formatToParts(new Date())
      .find((part) => part.type === "timeZoneName")?.value

    return timeZoneName ? `${timeZoneName} (${getReadableTimeZone(timeZone)})` : getReadableTimeZone(timeZone)
  } catch {
    return getReadableTimeZone(timeZone)
  }
}

function toDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function isValidTimeZone(timeZone: string | null | undefined) {
  if (!timeZone?.trim()) return false

  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date())
    return true
  } catch {
    return false
  }
}

export function getSupportedTimeZones() {
  const intlWithSupportedValues = Intl as typeof Intl & {
    supportedValuesOf?: (key: string) => string[]
  }

  const timeZones = intlWithSupportedValues.supportedValuesOf?.("timeZone")
  return Array.isArray(timeZones) ? timeZones : []
}

export function formatDateTimeInTimeZone(
  value: string | Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = {},
) {
  const date = toDate(value)

  if (!date) {
    return "Unknown"
  }

  const formatted = date.toLocaleString("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
    ...options,
  })

  if (options.timeZoneName === undefined || options.timeZoneName === "short") {
    return `${formatted} (${getReadableTimeZone(timeZone)})`
  }

  return formatted
}

export function formatDateInTimeZone(
  value: string | Date,
  timeZone: string,
  options: Intl.DateTimeFormatOptions = {},
) {
  const date = toDate(value)

  if (!date) {
    return "Unknown"
  }

  return date.toLocaleDateString("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    year: "numeric",
    ...options,
  })
}

export function formatDateRangeInTimeZone(startAtIso: string, endAtIso: string, timeZone: string) {
  const start = toDate(startAtIso)
  const end = toDate(endAtIso)

  if (!start || !end) {
    return "Unknown date"
  }

  const dayLabel = formatDateInTimeZone(start, timeZone, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: undefined,
  })

  const timeFormatterOptions: Intl.DateTimeFormatOptions = {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }

  const startTimeLabel = start.toLocaleTimeString("en-US", timeFormatterOptions)
  const endTimeLabel = end.toLocaleTimeString("en-US", timeFormatterOptions)

  return `${dayLabel}, ${startTimeLabel}–${endTimeLabel} ${getTimeZoneLabel(timeZone)}`
}
