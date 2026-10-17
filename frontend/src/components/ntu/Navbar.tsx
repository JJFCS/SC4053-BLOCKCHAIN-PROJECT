import { Wallet, LogOut } from "lucide-react"
import { shortenHex } from "./handlers"

export function Navbar({
  account,
  connecting,
  onConnect,
  onDisconnect,
}: {
  account: string | null
  connecting: boolean
  onConnect: () => void
  onDisconnect: () => void
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/80 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <a href="#" className="flex items-center gap-2.5" aria-label=".ntu Domains home">
          <span className="flex size-8 items-center justify-center rounded-lg bg-[#0047AB] font-mono text-sm font-bold text-white">
            .n
          </span>
          <span className="text-base font-semibold tracking-tight text-zinc-900">
            <span className="font-mono text-[#0047AB]">.ntu</span> Domains
          </span>
        </a>

        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1 text-xs text-zinc-600 sm:inline-flex">
            <span className="size-1.5 rounded-full bg-[#0047AB]" aria-hidden="true" />
            Sepolia
          </span>
          {account ? (
            <button
              type="button"
              onClick={onDisconnect}
              className="group inline-flex h-10 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 font-mono text-sm text-zinc-900 transition-colors hover:bg-zinc-100"
              aria-label={`Connected as ${account}. Click to disconnect.`}
            >
              <span className="size-2 rounded-full bg-[#0047AB]" aria-hidden="true" />
              {shortenHex(account)}
              <LogOut className="size-3.5 text-zinc-500 group-hover:text-zinc-800" aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onConnect}
              disabled={connecting}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0047AB] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#003a8c] disabled:opacity-60"
            >
              <Wallet className="size-4" aria-hidden="true" />
              {connecting ? "Connecting…" : "Connect Wallet"}
            </button>
          )}
        </div>
      </nav>
    </header>
  )
}
