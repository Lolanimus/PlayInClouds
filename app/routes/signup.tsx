import { useEffect, useRef, useState } from "react"
import { useNavigate, useSearchParams } from "react-router"
import { signup, verifySignupCode } from "~/app/api/supabase/auth"
import { AuthTurnstile, isTurnstileEnabled } from "@/components/auth-turnstile"
import { queryClient } from "@/queries/queries"
import { useError, useErrorActions } from "@/store/error_state"
import { getSiteRedirectUrl } from "@/utils/site-url"
import type { UserSignup } from "@/types/custom/api.types"
import { Button } from "@/components/ui/button"
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
import {
  InputGroup,
  InputGroupAddon,
  InputGroupText,
} from "@/components/ui/input-group"
import type { TurnstileInstance } from "@marsidev/react-turnstile"

export default function SignupPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [formData, setFormData] = useState<UserSignup>({
    email: searchParams.get("email") ?? "",
    first_name: "",
    last_name: "",
    password: "",
    confirmPassword: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [verificationCode, setVerificationCode] = useState("")
  const [awaitingVerification, setAwaitingVerification] = useState(false)
  const error = useError();
  const { setError, setSuccess } = useErrorActions();
  const redirectParam = searchParams.get("redirect")
  const safeRedirect = redirectParam && redirectParam.startsWith("/") ? redirectParam : null
  const turnstileRef = useRef<TurnstileInstance | null>(null)
  const confirmedRedirect = safeRedirect ?? "/dashboard"
  const loginPath = safeRedirect ? `/login?redirect=${encodeURIComponent(safeRedirect)}` : "/login"

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const submitEvent = async () => {
    if (isSubmitting) return

    // Clear any previous error before attempting login
    setIsSubmitting(true)
    setSuccess(null)
    setError(null)

    if (!formData.email || !formData.password || !formData.first_name || !formData.last_name) {
      setError("Please fill in all required fields.")
      setIsSubmitting(false)
      return
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match.")
      setIsSubmitting(false)
      return
    }

    if (isTurnstileEnabled() && !captchaToken) {
      setError("Please complete the CAPTCHA challenge.")
      setIsSubmitting(false)
      return
    }

    try {
      const emailRedirectTo = getSiteRedirectUrl(confirmedRedirect)
      const result = await signup(formData, captchaToken, emailRedirectTo)

      if (!result.success) {
        setError(result.message)
        return
      }

      await queryClient.invalidateQueries()

      if (!result.needsVerification) {
        setSuccess(result.message)
        navigate(confirmedRedirect, { replace: true })
        return
      }

      setVerificationCode("")
      setAwaitingVerification(true)
      setSuccess("Enter the confirmation code from your email to activate your account.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed. Please try again.")
    } finally {
      turnstileRef.current?.reset()
      setCaptchaToken(null)
      setIsSubmitting(false)
    }
  }

  const submitVerification = async () => {
    if (isSubmitting) return

    setIsSubmitting(true)
    setError(null)
    setSuccess(null)

    if (!verificationCode.trim()) {
      setError("Enter the confirmation code from your email.")
      setIsSubmitting(false)
      return
    }

    try {
      await verifySignupCode(formData.email!, verificationCode)
      await queryClient.invalidateQueries()
      setSuccess("Email verified.")
      navigate(confirmedRedirect, { replace: true })
    } catch (err) {
      setAwaitingVerification(true)
      setError(err instanceof Error ? err.message : "Verification failed. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const goToLogin = () => {
    setAwaitingVerification(false)
    setVerificationCode("")
    setError(null)
    setSuccess(null)
    navigate(loginPath)
  }

  useEffect(() => {
    setIsHydrated(true)
    setError(null)
    setSuccess(null)
  }, [setError, setSuccess])

  return (
    <main className="min-h-[calc(100vh-5.5rem)] bg-muted/40 px-4 py-10">
      <Card className="mx-auto w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign up</CardTitle>
          <CardDescription>Create your account to continue.</CardDescription>
        </CardHeader>

        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="first_name">First name</FieldLabel>
              <Input
                id="first_name"
                name="first_name"
                type="text"
                autoComplete="given-name"
                value={formData.first_name}
                onChange={handleInputChange}
                disabled={awaitingVerification}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="last_name">Last name</FieldLabel>
              <Input
                id="last_name"
                name="last_name"
                type="text"
                autoComplete="family-name"
                value={formData.last_name}
                onChange={handleInputChange}
                disabled={awaitingVerification}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <InputGroupText>@</InputGroupText>
                </InputGroupAddon>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={formData.email ?? ""}
                  onChange={handleInputChange}
                  className="rounded-l-none"
                  disabled={awaitingVerification}
                />
              </InputGroup>
              <FieldDescription>Use a valid email address.</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                value={formData.password}
                onChange={handleInputChange}
                disabled={awaitingVerification}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="confirmPassword">Confirm password</FieldLabel>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                value={formData.confirmPassword}
                onChange={handleInputChange}
                disabled={awaitingVerification}
              />
            </Field>

            {!awaitingVerification ? (
              <AuthTurnstile
                id="signup-turnstile"
                captchaToken={captchaToken}
                turnstileRef={turnstileRef}
                onTokenChange={setCaptchaToken}
              />
            ) : null}

            <Button
              type="button"
              onClick={() => void submitEvent()}
              className="h-10 w-full cursor-pointer"
              disabled={isSubmitting || awaitingVerification}
            >
              {isSubmitting ? "Creating..." : "Create account"}
            </Button>

            {isHydrated && error && !awaitingVerification ? (
              <FieldError className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-center">
                {error}
              </FieldError>
            ) : null}
          </FieldGroup>
        </CardContent>

        <CardFooter className="justify-center text-sm text-muted-foreground">
          <button
            type="button"
            className="cursor-pointer underline-offset-4 hover:underline"
            onClick={goToLogin}
          >
            Already have an account? Login
          </button>
        </CardFooter>
      </Card>

      {awaitingVerification ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center px-4 py-6">
          <div className="absolute inset-0 bg-black/45" />

          <Card className="relative w-full max-w-md border-border bg-background shadow-2xl">
            <CardHeader>
              <CardTitle>Verify your email</CardTitle>
              <CardDescription>
                Enter the confirmation code sent to {formData.email || "your email address"}.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="verificationCode">Confirmation code</FieldLabel>
                  <Input
                    id="verificationCode"
                    name="verificationCode"
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

                {isHydrated && error ? (
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
                  {isSubmitting ? "Verifying..." : "Verify email"}
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={goToLogin}
                  className="h-10 w-full cursor-pointer"
                  disabled={isSubmitting}
                >
                  Go to login
                </Button>
              </FieldGroup>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </main>
  )
}
