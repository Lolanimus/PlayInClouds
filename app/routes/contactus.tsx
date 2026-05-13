import { useMemo, useState } from "react"
import { useLocation } from "react-router"
import { Mail } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"

const SUPPORT_EMAIL = "support@artemmelnikov.com"
const ISSUE_TYPES = [
  "Bug report",
  "Reservation issue",
  "Payment issue",
  "Listing issue",
  "Account issue",
  "General question",
] as const

type ContactUsLocationState = {
  page?: string
}

export default function ContactUsPage() {
  const location = useLocation()
  const locationState = (location.state as ContactUsLocationState | null) ?? null
  const [issueType, setIssueType] = useState<(typeof ISSUE_TYPES)[number]>("Bug report")
  const [page, setPage] = useState(locationState?.page ?? "")
  const [message, setMessage] = useState("")

  const emailHref = useMemo(() => {
    const trimmedPage = page.trim()
    const trimmedMessage = message.trim()

    const bodySections = [
      trimmedPage ? `Page or feature: ${trimmedPage}` : null,
      "",
      trimmedMessage || "Describe what happened, what you expected, and any relevant IDs or screenshots.",
    ].filter((value) => value !== null)

    return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(issueType)}&body=${encodeURIComponent(bodySections.join("\n"))}`
  }, [issueType, page, message])

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    window.location.href = emailHref
  }

  return (
    <main className="min-h-[calc(100vh-5.5rem)] bg-[#f5f5f5] px-4 py-6">
      <div className="mx-auto max-w-2xl">
        <Card className="border-[#e9e9e9] bg-[#ffffff] shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl text-[#000000]">
              <Mail className="h-5 w-5" />
              Send a support email
            </CardTitle>
            <CardDescription>
              Fill out the form and we will open your email app with the support request prefilled on your side.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="contactus-issue-type">Issue type</FieldLabel>
                  <select
                    id="contactus-issue-type"
                    value={issueType}
                    onChange={(event) => setIssueType(event.target.value as (typeof ISSUE_TYPES)[number])}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {ISSUE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                  <FieldDescription>Choose the closest category. We will use it as the email subject.</FieldDescription>
                </Field>

                <Field>
                  <FieldLabel htmlFor="contactus-page">Page or feature</FieldLabel>
                  <input
                    id="contactus-page"
                    value={page}
                    onChange={(event) => setPage(event.target.value)}
                    placeholder="Reservation details, listing page, chat..."
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="contactus-message">Message</FieldLabel>
                  <Textarea
                    id="contactus-message"
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    placeholder="Describe what happened, what you expected, and include any relevant IDs if needed."
                    className="min-h-36"
                    required
                  />
                </Field>
              </FieldGroup>

              <Button type="submit" className="rounded-full bg-[#111111] px-5 text-[#ffffff] hover:bg-[#222222]">
                Open email app
              </Button>

              <p className="text-sm text-[#6a6a6a]">
                If the form does not work, email us directly at{" "}
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="font-medium text-[#111111] underline underline-offset-4"
                >
                  {SUPPORT_EMAIL}
                </a>
                .
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}