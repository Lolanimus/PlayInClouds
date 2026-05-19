import { Ban, MessageCircleMore, ShieldCheck, Star } from "lucide-react"
import type { ReactNode } from "react"
import { Link } from "react-router"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { useUser } from "@/store/user_state"

export type UserProfileCardData = {
  id?: string | null
  first_name?: string | null
  last_name?: string | null
  profile_role?: string | null
  id_verified?: boolean | null
  review_count?: number | null
  average_rating?: number | null
  years_hosting?: number | null
  member_since?: string | null
  phone_number?: string | null
}

type UserProfileCardProps = {
  profile: UserProfileCardData
  variant?: "full" | "compact"
  title?: string
  description?: string
  footer?: ReactNode
  showBlockAction?: boolean
  className?: string
}

function formatMemberSince(value?: string | null) {
  if (!value) return "Unknown"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Unknown"

  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  })
}

function getFullName(profile: UserProfileCardData) {
  return `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || "User"
}

function getInitials(profile: UserProfileCardData) {
  const fullName = getFullName(profile)
  const parts = fullName.split(/\s+/).filter(Boolean)

  if (parts.length === 0) return "U"
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase()

  return `${parts[0].slice(0, 1)}${parts[1].slice(0, 1)}`.toUpperCase()
}

function formatAverageRating(value?: number | null) {
  if (typeof value !== "number") return null
  return Number.isInteger(value) ? `${value} / 5` : `${value.toFixed(1)} / 5`
}

function formatYearsHosting(value?: number | null) {
  if (value === null || value === undefined) return null
  if (value < 1) return "Less than 1 year"
  return `${value} year${value === 1 ? "" : "s"}`
}

function getRoleTone(role?: string | null) {
  if (role === "Host & Booker") {
    return "border-[#d9d9d9] bg-[#111111] text-[#ffffff]"
  }

  if (role === "Host") {
    return "border-[#d9d9d9] bg-[#f3f3f3] text-[#111111]"
  }

  return "border-[#dadada] bg-[#fafafa] text-[#6a6a6a]"
}

export function UserProfileCard({
  profile,
  variant = "full",
  title,
  description,
  footer,
  showBlockAction = false,
  className,
}: UserProfileCardProps) {
  const user = useUser()
  const { toast } = useToast()
  const fullName = getFullName(profile)
  const initials = getInitials(profile)
  const averageRating = formatAverageRating(profile.average_rating)
  const yearsHosting = formatYearsHosting(profile.years_hosting)
  const isOwnProfile = Boolean(user?.id && profile.id && user.id === profile.id)

  if (variant === "compact") {
    const avatar = (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#111111] text-sm font-semibold text-[#ffffff] transition-transform hover:scale-[1.02]">
        {initials}
      </div>
    )

    return (
      <Card className={cn("border-[#e9e9e9] bg-[#ffffff] shadow-sm", className)}>
        <CardHeader className="pb-4">
          {title ? <CardTitle className="text-xl text-[#000000]">{title}</CardTitle> : null}
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-2xl border border-[#efefef] bg-[#fbfbfb] px-4 py-4">
            <div className="flex items-start gap-4">
              {profile.id ? (
                <Link to={`/profile/${profile.id}`} aria-label={`Open ${fullName} profile`} className="shrink-0">
                  {avatar}
                </Link>
              ) : avatar}
              <div className="min-w-0 flex-1">
                {profile.profile_role ? (
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#6a6a6a]">{profile.profile_role}</p>
                ) : null}
                <p className="mt-1 text-sm font-semibold text-[#000000]">{fullName}</p>
                {profile.phone_number ? <p className="mt-1 text-sm text-[#6a6a6a]">{profile.phone_number}</p> : null}
              </div>
            </div>
          </div>
          {footer ? footer : null}
        </CardContent>
      </Card>
    )
  }

  const heroAvatar = (
    <div className="flex h-24 w-24 items-center justify-center rounded-[2rem] border border-[#ffffff]/12 bg-[#ffffff]/10 text-[1.75rem] font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-sm transition-transform hover:scale-[1.02]">
      {initials}
    </div>
  )

  return (
    <Card className={cn("overflow-hidden border-[#e7e7e7] bg-[#ffffff] p-0 shadow-[0_18px_50px_rgba(17,17,17,0.06)]", className)}>
      <div className="bg-[radial-gradient(circle_at_top_left,#343434_0%,#171717_48%,#090909_100%)] px-6 pb-8 pt-8 text-[#ffffff]">
        <div className="flex items-start justify-between gap-4">
          {profile.id ? (
            <Link to={`/profile/${profile.id}`} aria-label={`Open ${fullName} profile`} className="shrink-0">
              {heroAvatar}
            </Link>
          ) : heroAvatar}
          <div className="flex flex-col items-end gap-2">
            {profile.profile_role ? (
              <Badge variant="outline" className={getRoleTone(profile.profile_role)}>
                {profile.profile_role}
              </Badge>
            ) : null}
            {profile.id_verified ? (
              <Badge variant="outline" className="border-[#ffffff]/20 bg-[#ffffff]/10 text-[#ffffff]">
                <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                ID verified
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="mt-7">
          <CardTitle className="text-[2rem] leading-tight text-[#ffffff]">{fullName}</CardTitle>
          <CardDescription className="mt-2 max-w-sm text-sm leading-6 text-[#ffffff]/72">
            {yearsHosting && profile.profile_role?.includes("Host")
              ? `${yearsHosting} hosting on PlayInClouds`
              : `Booker community member on PlayInClouds`}
          </CardDescription>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-[#ffffff]/10 bg-[#ffffff]/6 px-4 py-3 backdrop-blur-sm">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#ffffff]/55">Overall rating</p>
            <div className="mt-2 flex items-center gap-2">
              <Star className="h-4 w-4 fill-current text-[#ffffff]" />
              <span className="text-lg font-semibold text-[#ffffff]">{averageRating ?? "—"}</span>
            </div>
          </div>
          <div className="rounded-2xl border border-[#ffffff]/10 bg-[#ffffff]/6 px-4 py-3 backdrop-blur-sm">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#ffffff]/55">Reviews</p>
            <p className="mt-2 text-lg font-semibold text-[#ffffff]">{profile.review_count ?? 0}</p>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-6">
        <div className="rounded-[1.5rem] border border-[#ededed] bg-[linear-gradient(180deg,#ffffff_0%,#fafafa_100%)] p-5">
          <div className="flex items-center gap-2">
            <MessageCircleMore className="h-4 w-4 text-[#6a6a6a]" />
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#7a7a7a]">Profile details</p>
          </div>

          <div className="mt-5 space-y-3">
            {profile.profile_role ? (
              <div className="flex items-center justify-between gap-4 rounded-2xl bg-[#ffffff] px-3 py-3 text-sm">
                <span className="text-[#6a6a6a]">Booker/Host</span>
                <span className="font-semibold text-[#111111]">{profile.profile_role}</span>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-4 rounded-2xl bg-[#ffffff] px-3 py-3 text-sm">
              <span className="text-[#6a6a6a]">ID Verified</span>
              <span className="font-semibold text-[#111111]">{profile.id_verified ? "Yes" : "No"}</span>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-2xl bg-[#ffffff] px-3 py-3 text-sm">
              <span className="text-[#6a6a6a]">Reviews Amount</span>
              <span className="font-semibold text-[#111111]">{profile.review_count ?? 0}</span>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-2xl bg-[#ffffff] px-3 py-3 text-sm">
              <span className="text-[#6a6a6a]">Overall Rating</span>
              <span className="font-semibold text-[#111111]">{averageRating ?? "—"}</span>
            </div>
            {yearsHosting ? (
              <div className="flex items-center justify-between gap-4 rounded-2xl bg-[#ffffff] px-3 py-3 text-sm">
                <span className="text-[#6a6a6a]">Years Hosting</span>
                <span className="font-semibold text-[#111111]">{yearsHosting}</span>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-4 rounded-2xl bg-[#ffffff] px-3 py-3 text-sm">
              <span className="text-[#6a6a6a]">Joined PlayInClouds</span>
              <span className="font-semibold text-[#111111]">{formatMemberSince(profile.member_since)}</span>
            </div>
          </div>
        </div>

        {showBlockAction && !isOwnProfile ? (
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full rounded-2xl border-[#efc5c0] bg-[#ffffff] text-[#b42318] shadow-sm hover:bg-[#fff4f2] hover:text-[#b42318]"
            onClick={() => {
              toast({
                title: "Block user",
                description: "User blocking isn't available yet.",
              })
            }}
          >
            <Ban className="mr-2 h-4 w-4" />
            Block user
          </Button>
        ) : null}

        {footer ? footer : null}
      </div>
    </Card>
  )
}
