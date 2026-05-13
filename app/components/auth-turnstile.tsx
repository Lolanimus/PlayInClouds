import { Turnstile } from "@marsidev/react-turnstile"
import type { TurnstileInstance } from "@marsidev/react-turnstile"
import { useEffect, useState } from "react"
import type { RefObject } from "react"

import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"

const turnstileTestSiteKey = "1x00000000000000000000AA"
const configuredTurnstileSiteKey = import.meta.env
  .VITE_PUBLIC_TURNSTILE_SITE_KEY as string | undefined

function resolveTurnstileSiteKey() {
  if (configuredTurnstileSiteKey) return configuredTurnstileSiteKey

  if (typeof window === "undefined") {
    return import.meta.env.DEV ? turnstileTestSiteKey : undefined
  }

  const hostname = window.location.hostname
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return turnstileTestSiteKey
  }

  return import.meta.env.DEV ? turnstileTestSiteKey : undefined
}

type AuthTurnstileProps = {
  id: string
  captchaToken: string | null
  turnstileRef: RefObject<TurnstileInstance | null>
  onTokenChange: (token: string | null) => void
}

export function AuthTurnstile({
  id,
  captchaToken,
  turnstileRef,
  onTokenChange,
}: AuthTurnstileProps) {
  const [isMounted, setIsMounted] = useState(false)
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string | undefined>(
    resolveTurnstileSiteKey(),
  )

  useEffect(() => {
    setIsMounted(true)
    setTurnstileSiteKey(resolveTurnstileSiteKey())
  }, [])

  if (!isMounted || !turnstileSiteKey) return null

  return (
    <Field>
      <FieldLabel>Verification</FieldLabel>
      <Turnstile
        key={`${id}-${turnstileSiteKey}`}
        ref={turnstileRef}
        id={id}
        siteKey={turnstileSiteKey}
        onSuccess={onTokenChange}
        onExpire={() => onTokenChange(null)}
        onError={() => onTokenChange(null)}
        options={{
          theme: "light",
          size: "flexible",
        }}
      />
      <FieldDescription>
        {captchaToken
          ? "Verification complete."
          : "Complete the CAPTCHA to continue."}
      </FieldDescription>
    </Field>
  )
}

export function isTurnstileEnabled() {
  return Boolean(resolveTurnstileSiteKey())
}
