import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export type ToastVariant = "default" | "destructive"

export type ToastProps = {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  variant?: ToastVariant
  className?: string
  children?: ReactNode
}

export type ToastActionElement = never

export function Toast({ open, onOpenChange, children, className }: ToastProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (open) {
      // Trigger enter animation on next frame
      requestAnimationFrame(() => setVisible(true))
      const timer = setTimeout(() => {
        onOpenChange?.(false)
      }, 800)
      return () => clearTimeout(timer)
    } else {
      setVisible(false)
    }
  }, [open])

  if (!open && !visible) return null

  return (
    <div
      className={cn(
        "pointer-events-auto flex items-center justify-center rounded-full p-2 shadow-lg bg-white dark:bg-gray-800 transition-all duration-200",
        visible && open ? "opacity-100 scale-100" : "opacity-0 scale-95",
        className
      )}
    >
      {children}
    </div>
  )
}

export function ToastViewport({ children }: { children?: ReactNode }) {
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex items-center justify-center">
      {children}
    </div>
  )
}
