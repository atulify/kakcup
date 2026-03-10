import type { JSX } from "preact"
import { cn } from "@/lib/utils"

export function Label({ className, ...props }: JSX.HTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70", className)} {...props} />
}
