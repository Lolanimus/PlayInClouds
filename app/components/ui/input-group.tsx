import * as React from "react"

import { cn } from "@/lib/utils"

export function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex items-center", className)} {...props} />
}

export function InputGroupAddon({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("inline-flex h-10 items-center rounded-l-md border border-r-0 border-input bg-muted px-3", className)} {...props} />
}

export function InputGroupText({ className, ...props }: React.ComponentProps<"span">) {
  return <span className={cn("text-sm text-muted-foreground", className)} {...props} />
}

export const InputGroupTextarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          "flex min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    )
  },
)

InputGroupTextarea.displayName = "InputGroupTextarea"
