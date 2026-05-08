export function getViewerTimeZone() {
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

export function getViewerTimeZoneLabel() {
  return getTimeZoneLabel(getViewerTimeZone())
}

function toDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
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

export function formatDateTimeInViewerTimeZone(
  value: string | Date,
  options: Intl.DateTimeFormatOptions = {},
) {
  return formatDateTimeInTimeZone(value, getViewerTimeZone(), options)
}

export function formatDateInViewerTimeZone(
  value: string | Date,
  options: Intl.DateTimeFormatOptions = {},
) {
  return formatDateInTimeZone(value, getViewerTimeZone(), options)
}

export function formatDateRangeInViewerTimeZone(startAtIso: string, endAtIso: string) {
  return formatDateRangeInTimeZone(startAtIso, endAtIso, getViewerTimeZone())
}
