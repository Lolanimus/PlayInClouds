import type { ReactNode } from "react"

export function TimeWithLocalHint({
  children,
  primaryText,
  localTime,
  align = "left",
}: {
  children: ReactNode
  primaryText: string
  localTime: string
  align?: "left" | "right"
}) {
  if (primaryText.trim() === localTime.trim()) {
    return <span className="min-w-0">{children}</span>
  }

  return (
    <span className="group relative inline-flex max-w-full">
      <span className="min-w-0">{children}</span>
      <span
        className={[
          "pointer-events-none absolute top-full z-30 mt-2 hidden min-w-[240px] rounded-xl border border-[#d8e3f0] bg-[#ffffff] px-3 py-2 text-left shadow-[0_10px_30px_rgba(0,0,0,0.12)] group-hover:block group-focus-within:block",
          align === "right" ? "right-0" : "left-0",
        ].join(" ")}
      >
        <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#5e738a]">
          Your local time
        </span>
        <span className="mt-1 block text-xs leading-5 text-[#16324f]">
          {localTime}
        </span>
      </span>
    </span>
  )
}
