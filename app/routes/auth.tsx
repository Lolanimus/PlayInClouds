import { useEffect, useRef, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router"
import { Button } from "@/components/ui/button"
import { login, verifySignupCode } from "~/app/api/supabase/auth"
import { AuthTurnstile, isTurnstileEnabled } from "@/components/auth-turnstile"
import { queryClient } from "@/queries/queries"
import { useError, useErrorActions } from "@/store/error_state"
import { useLoading } from "@/store/loading_state"
import { useUser } from "@/store/user_state"
import { getSiteRedirectUrl } from "@/utils/site-url"
import type { UserLogin } from "@/types/custom/api.types"
import type { TurnstileInstance } from "@marsidev/react-turnstile"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"

function isEmailConfirmationError(error: unknown) {
  const message = error instanceof Error
    ? error.message.toLowerCase()
    : String(error ?? "").toLowerCase()

  return (
    message.includes("email not confirmed")
    || message.includes("email not been confirmed")
    || message.includes("email has not been confirmed")
    || message.includes("confirm your email")
    || (message.includes("email") && message.includes("confirm"))
  )
}

export default function AuthPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const user = useUser()
  const isAuthLoading = useLoading()
  const redirectParam = searchParams.get("redirect")
  const safeRedirect = redirectParam && redirectParam.startsWith("/") ? redirectParam : "/dashboard"

  const [formData, setFormData] = useState<UserLogin>({
    email: "",
    password: "",
  });
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [verificationCode, setVerificationCode] = useState("")
  const [awaitingVerification, setAwaitingVerification] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const error = useError();
  const { setError, setSuccess } = useErrorActions();
  const turnstileRef = useRef<TurnstileInstance | null>(null)

  const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const submitEvent = async () => {
    if (isSubmitting) return

    setError(null);
    setSuccess(null);
    setIsSubmitting(true)

    if (!formData.email.trim()) {
      setError("Enter your email address.")
      setIsSubmitting(false)
      return
    }

    if (!formData.password) {
      setError("Enter your password.")
      setIsSubmitting(false)
      return
    }

    if (isTurnstileEnabled() && !captchaToken) {
      setError("Please complete the CAPTCHA challenge.")
      setIsSubmitting(false)
      return
    }

    try {
      const emailRedirectTo = getSiteRedirectUrl(safeRedirect)
      const result = await login(formData, captchaToken, emailRedirectTo);

      if (!result) {
        return
      }

      if (!result.success) {
        if (isEmailConfirmationError(result.message)) {
          setVerificationCode("")
          setAwaitingVerification(true)
          setSuccess("Your email is not confirmed yet. Enter the confirmation code from your email.")
          return
        }

        setError(result.message)
        return
      }

      setSuccess(result.message)

      if (result.needsSignupConfirmation) {
        setVerificationCode("")
        setAwaitingVerification(true)
        return
      }

      await queryClient.invalidateQueries()
      navigate(safeRedirect, { replace: true })
    } catch (err) {
      if (isEmailConfirmationError(err)) {
        setVerificationCode("")
        setAwaitingVerification(true)
        setSuccess("Your email is not confirmed yet. Enter the confirmation code from your email.")
        return
      }

      setError(err instanceof Error ? err.message : "Login failed.")
    } finally {
      turnstileRef.current?.reset()
      setCaptchaToken(null)
      setIsSubmitting(false)
    }
  }

  const submitVerification = async () => {
    if (isSubmitting) return

    setError(null)
    setSuccess(null)
    setIsSubmitting(true)

    if (!verificationCode.trim()) {
      setError("Enter the confirmation code from your email.")
      setIsSubmitting(false)
      return
    }

    try {
      await verifySignupCode(formData.email, verificationCode)
      await queryClient.invalidateQueries()
      setSuccess("Logged in.")
      navigate(safeRedirect, { replace: true })
    } catch (err) {
      setAwaitingVerification(true)
      setError(err instanceof Error ? err.message : "Login verification failed. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  useEffect(() => {
    setError(null);
  }, [formData]);

  useEffect(() => {
    if (!isAuthLoading && user && !isSubmitting && !awaitingVerification) {
      navigate(safeRedirect, { replace: true })
    }
  }, [awaitingVerification, isAuthLoading, isSubmitting, user, navigate, safeRedirect])

  return (
    <main className="min-h-[calc(100vh-5.5rem)] bg-muted/40 px-4 py-10">
      <Card className="mx-auto w-full max-w-md">
        <CardHeader>
          <CardTitle>Login</CardTitle>
          <CardDescription>Use your email and password to access your account.</CardDescription>
        </CardHeader>

        <CardContent>
          <form
            onSubmit={async (event) => {
              event.preventDefault()
              await submitEvent()
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={formData.email ?? ""}
                  onChange={handleInputChange}
                  disabled={awaitingVerification}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  value={formData.password}
                  onChange={handleInputChange}
                  disabled={awaitingVerification}
                />
              </Field>

              {!awaitingVerification ? (
                <AuthTurnstile
                  id="login-turnstile"
                  captchaToken={captchaToken}
                  turnstileRef={turnstileRef}
                  onTokenChange={setCaptchaToken}
                />
              ) : null}

              {error && !awaitingVerification ? (
                <FieldError className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-center">
                  {error}
                </FieldError>
              ) : null}

              <Button type="submit" className="h-10 w-full" disabled={isSubmitting || awaitingVerification}>
                {isSubmitting ? "Sending..." : "Login"}
              </Button>
            </FieldGroup>
          </form>
        </CardContent>

        <CardFooter className="flex-col items-center gap-1 pt-4 text-sm text-muted-foreground">
          <Link
            className="underline-offset-4 hover:underline"
            to={safeRedirect !== "/dashboard" ? `/signup?redirect=${encodeURIComponent(safeRedirect)}` : "/signup"}
          >
            Don’t have an account? Sign up
          </Link>
          <Link className="underline-offset-4 hover:underline" to="/">
            Back to home
          </Link>
        </CardFooter>
      </Card>

      {awaitingVerification ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center px-4 py-6">
          <div className="absolute inset-0 bg-black/45" />

          <Card className="relative w-full max-w-md border-border bg-background shadow-2xl">
            <CardHeader>
              <CardTitle>Check your email</CardTitle>
              <CardDescription>
                Your email is not confirmed yet. Enter the confirmation code sent to {formData.email || "your email address"}.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="loginVerificationCode">Confirmation code</FieldLabel>
                  <Input
                    id="loginVerificationCode"
                    name="loginVerificationCode"
                    inputMode="text"
                    autoComplete="one-time-code"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={64}
                    value={verificationCode}
                    onChange={(event) =>
                      setVerificationCode(event.target.value.replace(/\s+/g, "").trim())
                    }
                    autoFocus
                  />
                  <FieldDescription>
                    Use the full code from the email. If it is invalid or expired, this module will stay open.
                  </FieldDescription>
                </Field>

                {error ? (
                  <FieldError className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-center">
                    {error}
                  </FieldError>
                ) : null}

                <Button
                  type="button"
                  onClick={() => void submitVerification()}
                  className="h-10 w-full cursor-pointer"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Verifying..." : "Verify and log in"}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setAwaitingVerification(false)
                    setVerificationCode("")
                    setError(null)
                    setSuccess(null)
                  }}
                  className="h-10 w-full cursor-pointer"
                  disabled={isSubmitting}
                >
                  Back to login
                </Button>
              </FieldGroup>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </main>
  )
}
