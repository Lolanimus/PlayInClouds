import { ResendConfirmation } from "@/components/resend-confirmation"
import { useEffect, useRef, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router"
import { signup, verifySignupCode } from "~/app/api/supabase/auth"
import { AuthTurnstile, isTurnstileEnabled } from "@/components/auth-turnstile"
import { getSiteRedirectUrl } from "@/utils/site-url"
import { useUser } from "@/store/user_state"
import { queryClient } from "@/queries/queries"
import { useError, useErrorActions } from "@/store/error_state"
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
  const user = useUser()
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
  const safeRedirect = redirectParam && redirectParam.startsWith("/") && !redirectParam.startsWith("//") ? redirectParam : null
  const turnstileRef = useRef<TurnstileInstance | null>(null)
  const confirmedRedirect = safeRedirect ?? "/dashboard"

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const submitEvent = async () => {
    if (isSubmitting) return

    // Clear feedback before attempting signup.
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
      const result = await signup(formData, captchaToken, getSiteRedirectUrl(confirmedRedirect))

      if (!result.success) {
        setError(result.message)
        return
      }

      void queryClient.invalidateQueries({ refetchType: "none" })
      if (!result.needsVerification) {
        setSuccess(result.message)
        navigate(confirmedRedirect, { replace: true })
        return
      }

      setVerificationCode("")
      setAwaitingVerification(true)
      setSuccess("Check your email and follow the confirmation link to activate your account.")
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
      void queryClient.invalidateQueries({ refetchType: "none" })
      setSuccess("Email verified.")
      navigate(confirmedRedirect, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  useEffect(() => {
    if (awaitingVerification && user?.email_confirmed_at) {
      navigate(confirmedRedirect, { replace: true })
    }
  }, [awaitingVerification, user, navigate, confirmedRedirect])

  useEffect(() => {
    setIsHydrated(true)
    setError(null)
    setSuccess(null)
  }, [setError, setSuccess])

  return (
    <main className="min-h-[calc(100vh-5.5rem)] bg-muted/40 px-4 py-10">
      <Card className="mx-auto w-full max-w-md">
        <CardHeader>
          <CardTitle>{awaitingVerification ? "Check your email" : "Sign up"}</CardTitle>
          <CardDescription>
            {awaitingVerification ? "Confirm your email to finish creating your account." : "Create your account to continue."}
          </CardDescription>
        </CardHeader>

        <CardContent>
          <FieldGroup>
            {!awaitingVerification ? (
              <div>
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
                      required
                      disabled={isSubmitting}
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
                      required
                      disabled={isSubmitting}
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
                        required
                        disabled={isSubmitting}
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
                      required
                      disabled={isSubmitting}
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
                      required
                      disabled={isSubmitting}
                    />
                  </Field>

                  <AuthTurnstile
                    id="signup-turnstile"
                    captchaToken={captchaToken}
                    turnstileRef={turnstileRef}
                    onTokenChange={setCaptchaToken}
                  />

                  {isHydrated && error ? (
                    <FieldError role="alert" className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-center">
                      {error}
                    </FieldError>
                  ) : null}

                  <Button
                    type="button"
                    onClick={() => void submitEvent()}
                    className="h-10 w-full cursor-pointer"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Creating..." : "Create account"}
                  </Button>
                </FieldGroup>
              </div>
            ) : null}

            {awaitingVerification ? (
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <FieldGroup>
                  <p className="text-sm" role="status">
                    Check your email at {formData.email || "your email address"} and follow the confirmation link to activate your account. If it opens in another browser, return here and log in after confirming.
                  </p>
                  <ResendConfirmation email={formData.email ?? ""} redirect={confirmedRedirect} disabled={isSubmitting} />
                  <details>
                    <summary className="cursor-pointer text-sm">My email includes a confirmation code</summary>
                    <div className="mt-4 space-y-4">
                      <Field>
                        <FieldLabel htmlFor="verificationCode">Confirmation code</FieldLabel>
                        <Input
                          id="verificationCode"
                          name="verificationCode"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={64}
                          value={verificationCode}
                          onChange={(event) => setVerificationCode(event.target.value.replace(/\s+/g, ""))}
                        />
                        <FieldDescription>
                          Enter the code sent to {formData.email || "your email address"} to activate your account.
                        </FieldDescription>
                      </Field>

                      <Button
                        type="button"
                        onClick={() => void submitVerification()}
                        className="h-10 w-full cursor-pointer"
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? "Verifying..." : "Verify email"}
                      </Button>
                    </div>
                  </details>

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
                    Back
                  </Button>
                </FieldGroup>
              </div>
            ) : null}

            {isHydrated && awaitingVerification && error ? (
              <FieldError className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-center">
                {error}
              </FieldError>
            ) : null}
          </FieldGroup>
        </CardContent>

        <CardFooter className="justify-center text-sm text-muted-foreground">
          <Link
            className="underline-offset-4 hover:underline"
            to={safeRedirect ? `/login?redirect=${encodeURIComponent(safeRedirect)}` : "/login"}
          >
            Already have an account? Login
          </Link>
        </CardFooter>
      </Card>
    </main>
  )
}
