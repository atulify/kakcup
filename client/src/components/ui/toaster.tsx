import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastProvider,
  ToastViewport,
} from "@/components/ui/toast"
import { Check, X } from "@/components/icons"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider duration={800}>
      {toasts.map(function ({ id, title, variant, ...props }) {
        const isError = variant === "destructive" ||
          title === "Error" ||
          title === "Unauthorized" ||
          title === "Login Failed" ||
          title === "Registration Failed" ||
          title === "Admin Access Required"

        return (
          <Toast key={id} variant={variant} {...props}>
            {isError ? (
              <X className="h-5 w-5 text-red-500" />
            ) : (
              <Check className="h-5 w-5 text-green-500" />
            )}
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
