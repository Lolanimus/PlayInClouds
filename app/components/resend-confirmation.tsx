import { useEffect, useRef, useState } from "react"
import type { TurnstileInstance } from "@marsidev/react-turnstile"
import { resendSignupConfirmation } from "@/api/supabase/auth"
import { AuthTurnstile, isTurnstileEnabled } from "@/components/auth-turnstile"
import { Button } from "@/components/ui/button"
import { confirmationWaitSeconds } from "@/utils/confirmation-cooldown"
import { getSiteRedirectUrl } from "@/utils/site-url"

export function ResendConfirmation({ email, redirect, disabled = false }: {
  email: string
  redirect: string
  disabled?: boolean
}) {
  const [remaining, setRemaining] = useState<number | null>(null)
  const [sending, setSending] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null)
  const turnstileRef = useRef<TurnstileInstance | null>(null)
  const inFlight = useRef(false)

  useEffect(() => {
    const update = () => setRemaining(confirmationWaitSeconds(email))
    update()
    const timer = window.setInterval(update, 1000)
    window.addEventListener("storage", update)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("storage", update)
    }
  }, [email])

  const resend = async () => {
    if (inFlight.current || disabled || confirmationWaitSeconds(email) > 0) return
    if (isTurnstileEnabled() && !captchaToken) return
    inFlight.current = true
    setSending(true)
    setFeedback(null)
    try {
      await resendSignupConfirmation(email, captchaToken, getSiteRedirectUrl(redirect))
      setFeedback({ error: false, text: "Confirmation link sent. Check your inbox and spam folder." })
    } catch (error) {
      setFeedback({ error: true, text: error && typeof error === "object" && "message" in error
        ? String(error.message) : "Could not send the link. Please try again." })
    } finally {
      turnstileRef.current?.reset()
      setCaptchaToken(null)
      setRemaining(confirmationWaitSeconds(email))
      setSending(false)
      inFlight.current = false
    }
  }

  return (
    <div className="space-y-3">
      {remaining === 0 ? (
        <AuthTurnstile id="resend-confirmation-turnstile" captchaToken={captchaToken}
          turnstileRef={turnstileRef} onTokenChange={setCaptchaToken} />
      ) : null}
      <Button type="button" variant="outline" className="w-full" onClick={() => void resend()}
        disabled={disabled || sending || remaining === null || remaining > 0 || (isTurnstileEnabled() && !captchaToken)}>
        {sending ? "Sending…" : remaining === null ? "Send confirmation link again"
          : remaining > 0 ? `Send again in ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`
          : "Send confirmation link again"}
      </Button>
      {feedback ? <p role={feedback.error ? "alert" : "status"}
        className={`text-sm ${feedback.error ? "text-destructive" : "text-muted-foreground"}`}>
        {feedback.text}
      </p> : null}
    </div>
  )
}
