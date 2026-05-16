import { useEffect, useMemo, useState, type ComponentType } from "react"
import { Link, useNavigate, useSearchParams } from "react-router"
import {
  Bell,
  Globe,
  Hand,
  Shield,
  UserRound,
} from "lucide-react"

import { updateAccountSettings } from "~/app/api/supabase/auth"
import {
  getEmailNotificationSettings,
  updateEmailNotificationSettings,
} from "@/db_rpc/account_settings_rpc"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { errorStore, useError, useErrorActions } from "@/store/error_state"
import { useUser } from "@/store/user_state"
import type { EmailNotificationSettings } from "@/types/custom/api.types"

type FormState = {
  firstName: string
  lastName: string
  email: string
  currentPassword: string
  newPassword: string
  confirmNewPassword: string
}

type AccountTab = "personal" | "login-security" | "notifications" | "locale"

type SettingsNavItem = {
  id: AccountTab | string
  label: string
  icon: ComponentType<{ className?: string }>
  enabled: boolean
}

const settingsNavItems: SettingsNavItem[] = [
  { id: "personal", label: "Personal information", icon: UserRound, enabled: true },
  { id: "login-security", label: "Login & security", icon: Shield, enabled: true },
  { id: "privacy", label: "Privacy", icon: Hand, enabled: false },
  { id: "notifications", label: "Notifications", icon: Bell, enabled: true },
  { id: "locale", label: "Currency & time zone", icon: Globe, enabled: true },
]

function isAccountTab(value: string | null): value is AccountTab {
  return value === "personal" || value === "login-security" || value === "notifications" || value === "locale"
}

function SettingsSidebar(props: {
  activeTab: AccountTab
  onSelect: (tab: AccountTab) => void
}) {
  return (
    <aside className="w-full border-b border-[#e9e9e9] pb-6 md:w-[320px] md:flex-shrink-0 md:border-b-0 md:border-r md:pb-0 md:pr-8">
      <div className="space-y-5">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-[#111111]">Account settings</h1>
          <p className="mt-2 text-sm text-[#6a6a6a]">
            Manage your profile details and email notification preferences.
          </p>
        </div>

        <nav className="space-y-2">
          {settingsNavItems.map((item) => {
            const Icon = item.icon
            const isActive = item.id === props.activeTab

            if (!item.enabled) {
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-2xl px-4 py-3 text-[#9a9a9a] opacity-60"
                >
                  <Icon className="h-5 w-5" />
                  <span className="font-medium">{item.label}</span>
                </div>
              )
            }

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => props.onSelect(item.id as AccountTab)}
                className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors ${
                  isActive
                    ? "bg-[#f3f3f3] text-[#111111]"
                    : "text-[#3d3d3d] hover:bg-[#f7f7f7]"
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="font-medium">{item.label}</span>
              </button>
            )
          })}
        </nav>

        <Button asChild variant="outline" className="w-full justify-center border-[#d9d9d9]">
          <Link to="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </aside>
  )
}

function PersonalInformationPanel(props: {
  form: FormState
  error: string | null
  isSaving: boolean
  onChangeField: (key: keyof FormState, value: string) => void
  onSave: () => Promise<void>
}) {
  return (
    <section className="space-y-8">
      <div>
        <h2 className="text-3xl font-semibold tracking-tight text-[#111111]">Personal information</h2>
        <p className="mt-2 text-sm text-[#6a6a6a]">
          Update your name.
        </p>
      </div>

      <div className="rounded-[28px] border border-[#e9e9e9] bg-[#ffffff] p-6 shadow-sm">
        <FieldGroup>
          <div className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="firstName">First name</FieldLabel>
              <Input
                id="firstName"
                value={props.form.firstName}
                onChange={(event) => props.onChangeField("firstName", event.target.value)}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="lastName">Last name</FieldLabel>
              <Input
                id="lastName"
                value={props.form.lastName}
                onChange={(event) => props.onChangeField("lastName", event.target.value)}
              />
            </Field>
          </div>

          {props.error && (
            <FieldError className="rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-center">
              {props.error}
            </FieldError>
          )}

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => void props.onSave()}
              className="min-w-[180px] rounded-full bg-[#111111] text-[#ffffff] hover:bg-[#1f1f1f]"
              disabled={props.isSaving}
            >
              {props.isSaving ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </FieldGroup>
      </div>
    </section>
  )
}

function LoginSecurityPanel(props: {
  form: FormState
  emailError: string | null
  passwordError: string | null
  isSaving: boolean
  onChangeField: (key: keyof FormState, value: string) => void
  onSaveEmail: () => Promise<void>
  onSavePassword: () => Promise<void>
}) {
  return (
    <section className="space-y-8">
      <div>
        <h2 className="text-3xl font-semibold tracking-tight text-[#111111]">Login & security</h2>
        <p className="mt-2 text-sm text-[#6a6a6a]">
          Update your email address and password.
        </p>
      </div>

      <div className="space-y-6">
        <div className="rounded-[28px] border border-[#e9e9e9] bg-[#ffffff] p-6 shadow-sm">
          <FieldGroup>
            <div>
              <h3 className="text-xl font-semibold text-[#111111]">Email</h3>
              <p className="mt-1 text-sm text-[#6a6a6a]">
                Update the email address used for this account.
              </p>
            </div>

            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input
                id="email"
                type="email"
                value={props.form.email}
                onChange={(event) => props.onChangeField("email", event.target.value)}
              />
            </Field>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
              If you change your email, AirDrums will send confirmation links to both your current email
              and your new email. To finish the change, open both emails and click both confirmation links.
            </div>

            {props.emailError && (
              <FieldError className="rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-center">
                {props.emailError}
              </FieldError>
            )}

            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() => void props.onSaveEmail()}
                className="min-w-[180px] rounded-full bg-[#111111] text-[#ffffff] hover:bg-[#1f1f1f]"
                disabled={props.isSaving}
              >
                {props.isSaving ? "Saving..." : "Save email"}
              </Button>
            </div>
          </FieldGroup>
        </div>

        <div className="rounded-[28px] border border-[#e9e9e9] bg-[#ffffff] p-6 shadow-sm">
          <FieldGroup>
            <div>
              <h3 className="text-xl font-semibold text-[#111111]">Password</h3>
              <p className="mt-1 text-sm text-[#6a6a6a]">
                Change your password after confirming your current password.
              </p>
            </div>

            <Field>
              <FieldLabel htmlFor="currentPassword">Current password</FieldLabel>
              <Input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                value={props.form.currentPassword}
                onChange={(event) => props.onChangeField("currentPassword", event.target.value)}
              />
              <FieldDescription>
                Required when setting a new password.
              </FieldDescription>
            </Field>

            <div className="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="newPassword">New password</FieldLabel>
                <Input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  value={props.form.newPassword}
                  onChange={(event) => props.onChangeField("newPassword", event.target.value)}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="confirmNewPassword">Confirm new password</FieldLabel>
                <Input
                  id="confirmNewPassword"
                  type="password"
                  autoComplete="new-password"
                  value={props.form.confirmNewPassword}
                  onChange={(event) => props.onChangeField("confirmNewPassword", event.target.value)}
                />
              </Field>
            </div>

            {props.passwordError && (
              <FieldError className="rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-center">
                {props.passwordError}
              </FieldError>
            )}

            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() => void props.onSavePassword()}
                className="min-w-[180px] rounded-full bg-[#111111] text-[#ffffff] hover:bg-[#1f1f1f]"
                disabled={props.isSaving}
              >
                {props.isSaving ? "Saving..." : "Save password"}
              </Button>
            </div>
          </FieldGroup>
        </div>
      </div>
    </section>
  )
}

function NotificationsPanel(props: {
  settings: EmailNotificationSettings
  error: string | null
  isLoading: boolean
  isSaving: boolean
  isDirty: boolean
  onToggle: (key: keyof EmailNotificationSettings, checked: boolean) => void
  onSave: () => Promise<void>
}) {
  const groups = [
    {
      title: "Account activity and policies",
      description:
        "Confirm your booking and account activity, and learn about important AirDrums policies.",
      items: [
        {
          key: "email_account_activity_enabled" as const,
          title: "Account activity",
          description: props.settings.email_account_activity_enabled ? "On: Email" : "Off",
        },
        {
          key: "email_listing_activity_enabled" as const,
          title: "Listing activity",
          description: props.settings.email_listing_activity_enabled ? "On: Email" : "Off",
        },
      ],
    },
    {
      title: "Reminders",
      description:
        "Get important reminders about your reservations, listings, and account activity.",
      items: [
        {
          key: "email_reminders_enabled" as const,
          title: "Reminders",
          description: props.settings.email_reminders_enabled ? "On: Email" : "Off",
        },
      ],
    },
    {
      title: "Guest and Host messages",
      description:
        "Keep in touch with hosts and guests before, during, and after your reservation.",
      items: [
        {
          key: "email_messages_enabled" as const,
          title: "Messages",
          description: props.settings.email_messages_enabled ? "On: Email" : "Off",
        },
      ],
    },
  ]

  return (
    <section className="space-y-8">
      <div>
        <h2 className="text-3xl font-semibold tracking-tight text-[#111111]">Notifications</h2>
        <p className="mt-2 text-sm text-[#6a6a6a]">
          Control whether AirDrums can send you email notifications for reservations, listings,
          chat, reviews, payouts, and account activity.
        </p>
      </div>

      <div className="rounded-[28px] border border-[#e9e9e9] bg-[#ffffff] p-6 shadow-sm">
        <div className="space-y-8">
          <div className="border-b border-[#ececec] pb-6">
            <h3 className="text-2xl font-semibold text-[#111111]">Email notifications</h3>
            <p className="mt-2 max-w-2xl text-sm text-[#6a6a6a]">
              Turn AirDrums email notifications on or off. This affects queued reservation,
              listing, message, payout, review, and account emails sent after the setting changes.
            </p>
          </div>

          {groups.map((group) => (
            <div key={group.title} className="border-b border-[#ececec] pb-8 last:border-b-0 last:pb-0">
              <h4 className="text-2xl font-semibold text-[#111111]">{group.title}</h4>
              <p className="mt-2 max-w-2xl text-sm text-[#6a6a6a]">{group.description}</p>

              <div className="mt-8 space-y-8">
                {group.items.map((item) => (
                  <div key={item.title} className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xl font-medium text-[#111111]">{item.title}</p>
                      <p className="mt-1 text-sm text-[#6a6a6a]">{item.description}</p>
                    </div>

                    <div className="flex items-center gap-4">
                      <Switch
                        checked={props.settings[item.key]}
                        disabled={props.isLoading || props.isSaving}
                        onCheckedChange={(checked) => props.onToggle(item.key, checked)}
                        aria-label={`Toggle ${item.title} email notifications`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="flex justify-end pt-2">
            <Button
              type="button"
              disabled={props.isLoading || props.isSaving || !props.isDirty}
              onClick={() => void props.onSave()}
              className="min-w-[220px] rounded-full bg-[#111111] text-[#ffffff] hover:bg-[#1f1f1f]"
            >
              {props.isSaving ? "Saving..." : "Save notification settings"}
            </Button>
          </div>

          {props.error && (
            <FieldError className="rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-center">
              {props.error}
            </FieldError>
          )}
        </div>
      </div>
    </section>
  )
}

function LocalePanel() {
  return (
    <section className="space-y-8">
      <div>
        <h2 className="text-3xl font-semibold tracking-tight text-[#111111]">Currency & time zone</h2>
        <p className="mt-2 text-sm text-[#6a6a6a]">
          Currency and time zone preferences are not wired to a user-level setting yet.
        </p>
      </div>

      <div className="rounded-[28px] border border-[#e9e9e9] bg-[#ffffff] p-6 shadow-sm">
        <div className="space-y-4">
          <div>
            <p className="text-lg font-medium text-[#111111]">Currency</p>
            <p className="mt-1 text-sm text-[#6a6a6a]">
              AirDrums currently uses listing and payment-level currency handling.
            </p>
          </div>

          <div className="border-t border-[#ececec] pt-4">
            <p className="text-lg font-medium text-[#111111]">Time zone</p>
            <p className="mt-1 text-sm text-[#6a6a6a]">
              Reservation timing currently uses listing time zones rather than a user account preference.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

export default function AccountSettingsPage() {
  const navigate = useNavigate()
  const user = useUser()
  const error = useError()
  const { setError, setSuccess } = useErrorActions()
  const [searchParams, setSearchParams] = useSearchParams()

  const activeTab: AccountTab = isAccountTab(searchParams.get("tab"))
    ? searchParams.get("tab") as AccountTab
    : "personal"

  const [isSavingAccount, setIsSavingAccount] = useState(false)
  const [loginSecurityEmailError, setLoginSecurityEmailError] = useState<string | null>(null)
  const [loginSecurityPasswordError, setLoginSecurityPasswordError] = useState<string | null>(null)
  const [isLoadingNotifications, setIsLoadingNotifications] = useState(false)
  const [isSavingNotifications, setIsSavingNotifications] = useState(false)
  const [notificationSettings, setNotificationSettings] = useState<EmailNotificationSettings>({
    email_account_activity_enabled: true,
    email_listing_activity_enabled: true,
    email_reminders_enabled: true,
    email_messages_enabled: true,
  })
  const [savedNotificationSettings, setSavedNotificationSettings] = useState<EmailNotificationSettings>({
    email_account_activity_enabled: true,
    email_listing_activity_enabled: true,
    email_reminders_enabled: true,
    email_messages_enabled: true,
  })
  const [form, setForm] = useState<FormState>({
    firstName: "",
    lastName: "",
    email: "",
    currentPassword: "",
    newPassword: "",
    confirmNewPassword: "",
  })

  const isNotificationsDirty = useMemo(
    () =>
      notificationSettings.email_account_activity_enabled !== savedNotificationSettings.email_account_activity_enabled ||
      notificationSettings.email_listing_activity_enabled !== savedNotificationSettings.email_listing_activity_enabled ||
      notificationSettings.email_reminders_enabled !== savedNotificationSettings.email_reminders_enabled ||
      notificationSettings.email_messages_enabled !== savedNotificationSettings.email_messages_enabled,
    [notificationSettings, savedNotificationSettings]
  )

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
    setSuccess(null)
  }, [setError, setSuccess])

  useEffect(() => {
    if (!user) return

    let isCancelled = false

    const loadNotificationSettings = async () => {
      setIsLoadingNotifications(true)
      const result = await getEmailNotificationSettings()

      if (!isCancelled && result) {
        const nextSettings = {
          email_account_activity_enabled: result.email_account_activity_enabled !== false,
          email_listing_activity_enabled: result.email_listing_activity_enabled !== false,
          email_reminders_enabled: result.email_reminders_enabled !== false,
          email_messages_enabled: result.email_messages_enabled !== false,
        }
        setNotificationSettings(nextSettings)
        setSavedNotificationSettings(nextSettings)
      }

      if (!isCancelled) {
        setIsLoadingNotifications(false)
      }
    }

    void loadNotificationSettings()

    return () => {
      isCancelled = true
    }
  }, [user])

  if (!user) return null

  const onChangeField = (key: keyof FormState, value: string) => {
    setSuccess(null)
    setError(null)
    if (key === "email") {
      setLoginSecurityEmailError(null)
    }
    if (key === "currentPassword" || key === "newPassword" || key === "confirmNewPassword") {
      setLoginSecurityPasswordError(null)
    }
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const setActiveTab = (tab: AccountTab) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set("tab", tab)
      return next
    })
    setSuccess(null)
    setError(null)
  }

  const handleSavePersonalInformation = async () => {
    if (isSavingAccount) return

    const firstName = form.firstName.trim()
    const lastName = form.lastName.trim()

    if (!firstName || !lastName) {
      setError("First and last name are required.")
      return
    }

    setIsSavingAccount(true)
    setError(null)
    setSuccess(null)

    await updateAccountSettings({
      first_name: firstName,
      last_name: lastName,
    })

    const latestError = errorStore.getState().error

    if (!latestError) {
      setSuccess("Account settings updated.")
    }

    setIsSavingAccount(false)
  }

  const handleSaveEmail = async () => {
    if (isSavingAccount) return

    const email = form.email.trim()

    if (!email) {
      setLoginSecurityEmailError("Email is required.")
      return
    }

    setIsSavingAccount(true)
    setError(null)
    setLoginSecurityEmailError(null)
    setLoginSecurityPasswordError(null)
    setSuccess(null)

    await updateAccountSettings({
      email,
    })

    const latestError = errorStore.getState().error

    if (latestError) {
      setLoginSecurityEmailError(latestError)
      setError(null)
    } else {
      const emailChanged = email !== (user.email ?? "")

      setSuccess(
        emailChanged
          ? "Email change requested. To finish the change, open both emails and click the confirmation link in each one."
          : "Login and security settings updated."
      )
      setForm((prev) => ({
        ...prev,
        currentPassword: "",
        newPassword: "",
        confirmNewPassword: "",
      }))
    }

    setIsSavingAccount(false)
  }

  const handleSavePassword = async () => {
    if (isSavingAccount) return

    const currentPassword = form.currentPassword.trim()
    const newPassword = form.newPassword.trim()
    const confirmNewPassword = form.confirmNewPassword.trim()

    if (!currentPassword) {
      setLoginSecurityPasswordError("Current password is required when setting a new password.")
      return
    }

    if (!newPassword) {
      setLoginSecurityPasswordError("New password is required.")
      return
    }

    if (newPassword.length < 6) {
      setLoginSecurityPasswordError("New password must be at least 6 characters.")
      return
    }

    if (newPassword !== confirmNewPassword) {
      setLoginSecurityPasswordError("New password and confirmation do not match.")
      return
    }

    setIsSavingAccount(true)
    setError(null)
    setLoginSecurityEmailError(null)
    setLoginSecurityPasswordError(null)
    setSuccess(null)

    await updateAccountSettings({
      current_password: currentPassword,
      password: newPassword,
    })

    const latestError = errorStore.getState().error

    if (latestError) {
      setLoginSecurityPasswordError(latestError)
      setError(null)
    } else {
      setSuccess("Password updated.")
      setForm((prev) => ({
        ...prev,
        currentPassword: "",
        newPassword: "",
        confirmNewPassword: "",
      }))
    }

    setIsSavingAccount(false)
  }

  const handleSaveNotifications = async () => {
    if (isSavingNotifications || !isNotificationsDirty) return

    setIsSavingNotifications(true)
    setError(null)
    setSuccess(null)

    const result = await updateEmailNotificationSettings(notificationSettings)
    const latestError = errorStore.getState().error

    if (!latestError && result) {
      const nextSettings = {
        email_account_activity_enabled: result.email_account_activity_enabled !== false,
        email_listing_activity_enabled: result.email_listing_activity_enabled !== false,
        email_reminders_enabled: result.email_reminders_enabled !== false,
        email_messages_enabled: result.email_messages_enabled !== false,
      }
      setNotificationSettings(nextSettings)
      setSavedNotificationSettings(nextSettings)
      setSuccess("Notification settings updated.")
    }

    setIsSavingNotifications(false)
  }

  return (
    <main className="min-h-[calc(100vh-5.5rem)] bg-[#fbfbf8] px-4 py-8 md:px-6 md:py-10 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-[32px] border border-[#e9e9e9] bg-[#ffffff] p-6 shadow-sm md:p-8">
        <div className="flex flex-col gap-8 md:flex-row md:gap-10">
          <SettingsSidebar activeTab={activeTab} onSelect={setActiveTab} />

          <div className="min-w-0 flex-1">
            {activeTab === "notifications" ? (
              <NotificationsPanel
                settings={notificationSettings}
                error={error}
                isLoading={isLoadingNotifications}
                isSaving={isSavingNotifications}
                isDirty={isNotificationsDirty}
                onToggle={(key, checked) => {
                  setSuccess(null)
                  setError(null)
                  setNotificationSettings((prev) => ({ ...prev, [key]: checked }))
                }}
                onSave={handleSaveNotifications}
              />
            ) : activeTab === "locale" ? (
              <LocalePanel />
            ) : activeTab === "login-security" ? (
              <LoginSecurityPanel
                form={form}
                emailError={loginSecurityEmailError}
                passwordError={loginSecurityPasswordError}
                isSaving={isSavingAccount}
                onChangeField={onChangeField}
                onSaveEmail={handleSaveEmail}
                onSavePassword={handleSavePassword}
              />
            ) : (
              <PersonalInformationPanel
                form={form}
                error={error}
                isSaving={isSavingAccount}
                onChangeField={onChangeField}
                onSave={handleSavePersonalInformation}
              />
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
