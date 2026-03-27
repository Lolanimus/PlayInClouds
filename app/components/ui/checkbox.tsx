import * as React from "react"

import { cn } from "~/lib/utils"

function Checkbox({ className, checked, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type="checkbox"
      checked={checked}
      className={cn(
        "h-4 w-4 rounded border border-input text-primary accent-primary outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Checkbox }
