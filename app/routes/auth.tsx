import { useEffect, useState } from "react"
import { Link, useNavigate, useSearchParams } from "react-router"
import { Button } from "~/components/ui/button"
import { login } from "~/api/auth"
import { queryClient } from "~/queries/queries"
import { useError, useErrorActions } from "~/store/error_state"
import { useUser } from "~/store/user_state"
import type { UserLogin } from "~/types/custom/api.types"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "~/components/ui/card"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"

export default function AuthPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const user = useUser()
    const redirectParam = searchParams.get("redirect")
    const safeRedirect = redirectParam && redirectParam.startsWith("/") ? redirectParam : "/dashboard"

  const [formData, setFormData] = useState<UserLogin>({
    email: "",
    password: "",
  });
  const error = useError();
  const { setError } = useErrorActions();

  const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const submitEvent = async () => {
    // Clear any previous error before attempting login
    setError(null);

    await login(formData);
    await queryClient.invalidateQueries();
  }

  useEffect(() => {
    setError(null);
  }, [formData]);

  useEffect(() => {
    if (user) {
      navigate(safeRedirect, { replace: true })
    }
  }, [user, navigate, safeRedirect])

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
                />
              </Field>

              {error && (
                <FieldError className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-center">
                  {error}
                </FieldError>
              )}

              <Button type="submit" className="h-10 w-full">
                Login
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
    </main>
  )
}
