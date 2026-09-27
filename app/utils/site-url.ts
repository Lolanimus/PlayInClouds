function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "")
}

export function getSiteUrl() {
  const configuredSiteUrl = import.meta.env.VITE_PUBLIC_SITE_URL?.trim()

  if (configuredSiteUrl) {
    return trimTrailingSlash(configuredSiteUrl)
  }

  return trimTrailingSlash(window.location.origin)
}

export function getSiteRedirectUrl(path: string) {
  return new URL(path, getSiteUrl()).toString()
}
