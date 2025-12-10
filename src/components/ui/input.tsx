import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 bg-secondary/50 border border-border/50 px-3 py-1.5 text-xs transition-colors outline-none",
        "placeholder:text-muted-foreground/50",
        "focus:border-primary/50 focus:bg-secondary",
        "disabled:pointer-events-none disabled:opacity-40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
