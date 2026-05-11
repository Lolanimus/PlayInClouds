import { Link, Outlet, useLocation } from "react-router"
import {
  ArrowLeft,
  CalendarDays,
  ClipboardList,
  DollarSign,
  LayoutDashboard,
  MessageSquare,
  Settings,
} from "lucide-react"

import { Button } from "@/components/ui/button"

export default function HostLayoutPage() {
  const location = useLocation()

  const sideNavItems = [
    { label: "Overview", icon: LayoutDashboard, href: "/host/dashboard" },
    { label: "Calendar", icon: CalendarDays, href: "/host/calendar" },
    { label: "Reservations", icon: ClipboardList, href: "/host/reservations" },
    { label: "Finances", icon: DollarSign, href: "/host/finances" },
    { label: "Messages", icon: MessageSquare, href: "/host/chat" },
    { label: "Settings", icon: Settings, href: "#" },
  ]

  return (
    <main className="h-[calc(100vh-5.5rem)] w-full overflow-hidden bg-gradient-to-b from-muted/50 to-muted/20">
      <div className="flex h-full w-full min-h-0">
        <aside className="hidden h-full w-[84px] flex-col items-center justify-between border-r border-[#e9e9e9] bg-[#ffffff] py-5 shadow-sm md:flex">
          <div className="flex w-full flex-col items-center gap-2 px-3">
            {sideNavItems.map((item) => {
              const Icon = item.icon

              if (item.href === "#") {
                return (
                  <button
                    key={item.label}
                    type="button"
                    disabled
                    title={`${item.label} (soon)`}
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-transparent text-[#8a8a8a] opacity-60"
                  >
                    <Icon className="h-5 w-5" />
                    <span className="sr-only">{item.label}</span>
                  </button>
                )
              }

              const isActive = location.pathname === item.href

              return (
                <Link
                  key={item.label}
                  to={item.href}
                  title={item.label}
                  className={`flex h-11 w-11 items-center justify-center rounded-xl border transition-colors ${
                    isActive
                      ? "border-[#000000] bg-[#000000] text-[#ffffff]"
                      : "border-[#e9e9e9] bg-[#ffffff] text-[#4a4a4a] hover:bg-[#f6f6f6]"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="sr-only">{item.label}</span>
                </Link>
              )
            })}
          </div>

          <Button asChild variant="outline" size="icon" className="mb-16 h-11 w-11 rounded-xl border-[#dadada]">
            <Link to="/dashboard" title="Back to dashboard">
              <ArrowLeft className="h-5 w-5" />
              <span className="sr-only">Back to dashboard</span>
            </Link>
          </Button>
        </aside>
        <div className="min-h-0 min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </main>
  )
}
