import { useEffect, useRef, useState } from "react"
import { Link, useSearchParams } from "react-router"
import { signup } from "~/app/api/supabase/auth"
import { AuthTurnstile, isTurnstileEnabled } from "@/components/auth-turnstile"
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
  const [searchParams] = useSearchParams()
  const [formData, setFormData] = useState<UserSignup>({
    email: "",
    first_name: "",
    last_name: "",
    password: "",
    confirmPassword: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const error = useError();
  const { setError, setSuccess } = useErrorActions();
  const redirectParam = searchParams.get("redirect")
  const safeRedirect = redirectParam && redirectParam.startsWith("/") ? redirectParam : null
  const turnstileRef = useRef<TurnstileInstance | null>(null)

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
      const result = await signup(formData, captchaToken)

      if (!result.success) {
        setError(result.message)
        return
      }

      await queryClient.invalidateQueries()
      setSuccess(result.message)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed. Please try again.")
    } finally {
      turnstileRef.current?.reset()
      setCaptchaToken(null)
      setIsSubmitting(false)
    }
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
              />
            </Field>

            <AuthTurnstile
              id="signup-turnstile"
              captchaToken={captchaToken}
              turnstileRef={turnstileRef}
              onTokenChange={setCaptchaToken}
            />

            <Button type="button" onClick={() => void submitEvent()} className="h-10 w-full cursor-pointer" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create account"}
            </Button>

            {isHydrated && error ? (
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
