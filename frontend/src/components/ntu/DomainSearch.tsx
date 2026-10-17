import { useState, type FormEvent } from "react"
import { Search, Loader2 } from "lucide-react"
import { sanitizeLabel } from "./handlers"

export function DomainSearch({
  loading,
  onSearch,
}: {
  loading: boolean
  onSearch: (name: string) => void
}) {
  const [value, setValue] = useState("")

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (value) onSearch(value)
  }

  return (
    <div className="flex flex-col items-center text-center">
      <h1 className="text-balance text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl md:text-6xl">
        Claim your name on <span className="font-mono text-[#0047AB]">.ntu</span>
      </h1>
      <p className="mt-4 max-w-xl text-pretty leading-relaxed text-zinc-600">
        Search for a domain, place a sealed bid, and reveal it to win. Send ETH to any .ntu name instead of a long
        address.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 w-full max-w-2xl" role="search">
        <label htmlFor="domain-search" className="sr-only">
          Search for a .ntu domain
        </label>
        <div className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-2 shadow-2xl shadow-blue-900/15 transition-colors focus-within:border-[#0047AB] sm:flex-row">
          <div className="flex h-14 flex-1 items-center gap-3 px-3">
            <Search className="size-5 shrink-0 text-zinc-500" aria-hidden="true" />
            <input
              id="domain-search"
              value={value}
              onChange={(e) => setValue(sanitizeLabel(e.target.value))}
              placeholder="yourname"
              autoComplete="off"
              spellCheck={false}
              className="h-full min-w-0 flex-1 bg-transparent font-mono text-lg text-zinc-900 outline-none placeholder:text-zinc-400 sm:text-xl"
            />
            <span className="font-mono text-lg text-[#0047AB] sm:text-xl">.ntu</span>
          </div>
          <button
            type="submit"
            disabled={!value || loading}
            className="inline-flex h-14 items-center justify-center gap-2 rounded-xl bg-[#0047AB] px-7 text-base font-semibold text-white transition-colors hover:bg-[#003a8c] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            Search
          </button>
        </div>
        <p className="mt-2 text-xs text-zinc-500">Lowercase letters, numbers, and hyphens only.</p>
      </form>
    </div>
  )
}
