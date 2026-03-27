import { X } from "lucide-react"

import { Button } from "@/components/ui/button"

export function AuthRequiredModal({
  isOpen,
  onClose,
  onLogin,
  onSignup,
  title = "Login required",
  description = "Please log in or create an account to continue.",
}: {
  isOpen: boolean
  onClose: () => void
  onLogin: () => void
  onSignup: () => void
  title?: string
  description?: string
}) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close login required modal"
        onClick={onClose}
        className="absolute inset-0 bg-[#000000]/45"
      />

      <div className="relative w-full max-w-md rounded-2xl border border-[#e9e9e9] bg-[#ffffff] p-6 shadow-2xl">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="absolute right-3 top-3 h-8 w-8 rounded-full text-[#6a6a6a] hover:bg-[#f2f2f2]"
        >
          <X className="h-4 w-4" />
        </Button>

        <h2 className="text-xl font-semibold text-[#000000]">{title}</h2>
        <p className="mt-2 text-sm text-[#6a6a6a]">{description}</p>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={onSignup}
            className="rounded-xl border-[#dadada]"
          >
            Sign up
          </Button>
          <Button
            type="button"
            onClick={onLogin}
            className="rounded-xl bg-[#000000] text-[#ffffff] hover:bg-[#1a1a1a]"
          >
            Log in
          </Button>
        </div>
      </div>
    </div>
  )
}