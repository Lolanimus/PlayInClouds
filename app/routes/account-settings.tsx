import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router"

import { updateAccountSettings } from "~/api/auth"
import { Button } from "~/components/ui/button"
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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field"
import { Input } from "~/components/ui/input"
import { errorStore, useError, useErrorActions } from "~/store/error_state"
import { useUser } from "~/store/user_state"

type FormState = {
  firstName: string
  lastName: string
  email: string
  newPassword: string
  confirmNewPassword: string
}

export default function AccountSettingsPage() {
  const navigate = useNavigate()
  const user = useUser()
  const error = useError()
  const { setError } = useErrorActions()

  const [isSaving, setIsSaving] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>({
    firstName: "",
    lastName: "",
    email: "",
    newPassword: "",
    confirmNewPassword: "",
  })

  useEffect(() => {
    if (!user) {
      navigate("/login?redirect=%2Faccount-settings", { replace: true })
      return
    }

    setForm((prev) => ({
      ...prev,
      firstName: String(user.user_metadata?.first_name ?? ""),
      lastName: String(user.user_metadata?.last_name ?? ""),
      email: user.email ?? "",
    }))
  }, [user, navigate])

  useEffect(() => {
    setError(null)
  }, [setError])

  if (!user) return null

  const onChangeField = (key: keyof FormState, value: string) => {
    setSuccessMessage(null)
    setError(null)
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    if (isSaving) return

    const firstName = form.firstName.trim()
    const lastName = form.lastName.trim()
    const email = form.email.trim()
    const newPassword = form.newPassword.trim()
    const confirmNewPassword = form.confirmNewPassword.trim()

    if (!firstName || !lastName) {
      setError("First and last name are required.")
      return
    }

    if (!email) {
      setError("Email is required.")
      return
    }

    if (newPassword || confirmNewPassword) {
      if (newPassword.length < 6) {
        setError("New password must be at least 6 characters.")
        return
      }

      if (newPassword !== confirmNewPassword) {
        setError("New password and confirmation do not match.")
        return
      }
    }

    setIsSaving(true)
    setError(null)
    setSuccessMessage(null)

    await updateAccountSettings({
      first_name: firstName,
      last_name: lastName,
      email,
      ...(newPassword ? { password: newPassword } : {}),
    })

    const latestError = errorStore.getState().error

    if (!latestError) {
      setSuccessMessage("Account settings updated.")
      setForm((prev) => ({ ...prev, newPassword: "", confirmNewPassword: "" }))
    }

    setIsSaving(false)
  }

  return (
    <main className="min-h-[calc(100vh-5.5rem)] bg-muted/40 px-4 py-10">
      <Card className="mx-auto w-full max-w-2xl overflow-hidden border-[#e9e9e9] bg-[#ffffff] shadow-lg">
        <CardHeader className="border-b border-[#e9e9e9] bg-gradient-to-b from-[#fcfcfc] to-[#ffffff]">
          <CardTitle className="text-2xl text-[#000000]">Account settings</CardTitle>
          <CardDescription>Update your profile, email, and password.</CardDescription>
        </CardHeader>

        <CardContent className="p-6">
          <FieldGroup>
            <div className="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="firstName">First name</FieldLabel>
                <Input
                  id="firstName"
                  value={form.firstName}
                  onChange={(event) => onChangeField("firstName", event.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="lastName">Last name</FieldLabel>
                <Input
                  id="lastName"
                  value={form.lastName}
                  onChange={(event) => onChangeField("lastName", event.target.value)}
                />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(event) => onChangeField("email", event.target.value)}
              />
              <FieldDescription>
                Changing email may require confirmation depending on your auth settings.
              </FieldDescription>
            </Field>

            <div className="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="newPassword">New password</FieldLabel>
                <Input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  value={form.newPassword}
                  onChange={(event) => onChangeField("newPassword", event.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="confirmNewPassword">Confirm new password</FieldLabel>
                <Input
                  id="confirmNewPassword"
                  type="password"
                  autoComplete="new-password"
                  value={form.confirmNewPassword}
                  onChange={(event) => onChangeField("confirmNewPassword", event.target.value)}
                />
              </Field>
            </div>

            {error && (
              <FieldError className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-center">
                {error}
              </FieldError>
            )}

            {successMessage && (
              <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-center text-sm text-emerald-700">
                {successMessage}
              </p>
            )}

            <Button type="button" onClick={() => void handleSave()} className="h-10 w-full" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save changes"}
            </Button>
          </FieldGroup>
        </CardContent>

        <CardFooter className="border-t border-[#e9e9e9] p-6">
          <Button asChild variant="outline">
            <Link to="/dashboard">Back to dashboard</Link>
          </Button>
        </CardFooter>
      </Card>
    </main>
  )
}
