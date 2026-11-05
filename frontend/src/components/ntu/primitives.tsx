import type { ButtonHTMLAttributes, ReactNode } from "react"
import { Loader2 } from "lucide-react"

export function Card({
  title,
  description,
  icon,
  step,
  children,
  className = "",
}: {
  title: string
  description?: string
  icon?: ReactNode
  step?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={`rounded-2xl border border-zinc-200 bg-white p-5 backdrop-blur-sm sm:p-6 ${className}`}
    >
      <header className="mb-5 flex items-start gap-3">
        {icon && (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#0047AB]">
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
            {step && (
              <span className="rounded-full border border-zinc-200 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                {step}
              </span>
            )}
          </div>
          {description && <p className="mt-1 text-sm leading-relaxed text-zinc-600">{description}</p>}
        </div>
      </header>
      {children}
    </section>
  )
}

export function Button({
  children,
  loading,
  variant = "primary",
  className = "",
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean
  variant?: "primary" | "secondary"
}) {
  const styles =
    variant === "primary"
      ? "bg-[#0047AB] text-white hover:bg-[#003a8c]"
      : "border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-100"
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0047AB] focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  )
}

export function Field({
  id,
  label,
  hint,
  suffix,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  id: string
  label: string
  hint?: string
  suffix?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium uppercase tracking-wider text-zinc-600">
        {label}
      </label>
      <div className="flex h-11 items-center rounded-xl border border-zinc-200 bg-zinc-50 transition-colors focus-within:border-[#0047AB] focus-within:ring-2 focus-within:ring-[#0047AB]/15">
        <input
          id={id}
          {...props}
          className="h-full min-w-0 flex-1 bg-transparent px-3.5 font-mono text-sm text-zinc-900 outline-none placeholder:text-zinc-400 disabled:opacity-50"
        />
        {suffix && <span className="pr-3.5 font-mono text-sm text-zinc-500">{suffix}</span>}
      </div>
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
    </div>
  )
}

export function Notice({ tone = "info", children }: { tone?: "info" | "success" | "warn"; children: ReactNode }) {
  const styles = {
    info: "border-zinc-200 bg-white text-zinc-700",
    success: "border-blue-200 bg-blue-50 text-[#003a8c]",
    warn: "border-amber-200 bg-amber-50 text-amber-800",
  }[tone]
  return (
    <div role="status" className={`rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed ${styles}`}>
      {children}
    </div>
  )
}
