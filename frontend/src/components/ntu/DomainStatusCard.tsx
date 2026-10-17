import { Globe } from "lucide-react"
import { Card } from "./primitives"
import { formatTimeLeft, shortenHex, type DomainInfo, type DomainStatus } from "./handlers"

const STATUS_META: Record<DomainStatus, { label: string; dot: string; badge: string; text: string }> = {
  available: {
    label: "Available",
    dot: "bg-[#0047AB]",
    badge: "border-blue-200 bg-blue-50 text-[#0047AB]",
    text: "No auction yet. Place a sealed bid to start one.",
  },
  commit: {
    label: "Commit Phase",
    dot: "bg-violet-500",
    badge: "border-violet-200 bg-violet-50 text-violet-700",
    text: "Auction is open. Submit a sealed bid before the phase ends.",
  },
  reveal: {
    label: "Reveal Phase",
    dot: "bg-amber-500",
    badge: "border-amber-200 bg-amber-50 text-amber-700",
    text: "Bidding closed. Reveal your bid to be counted.",
  },
  registered: {
    label: "Registered",
    dot: "bg-zinc-400",
    badge: "border-zinc-200 bg-white text-zinc-700",
    text: "This name is owned. You can still send ETH to it below.",
  },
}

const PHASES: DomainStatus[] = ["available", "commit", "reveal", "registered"]

export function DomainStatusCard({ domain }: { domain: DomainInfo | null }) {
  if (!domain) {
    return (
      <Card title="Domain status" icon={<Globe className="size-4" />} description="Search a name to see its auction state.">
        <PhaseTrack current={null} />
      </Card>
    )
  }

  const meta = STATUS_META[domain.status]

  return (
    <Card title="Domain status" icon={<Globe className="size-4" />}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="break-all font-mono text-2xl font-semibold text-zinc-900 sm:text-3xl">
            {domain.name}
            <span className="text-[#0047AB]">.ntu</span>
          </p>
          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium ${meta.badge}`}>
            <span className={`size-2 rounded-full ${meta.dot}`} aria-hidden="true" />
            {meta.label}
          </span>
        </div>
        <p className="text-sm text-zinc-600">{meta.text}</p>

        <PhaseTrack current={domain.status} />

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(domain.status === "commit" || domain.status === "reveal") && (
            <Stat label="Phase ends in" value={formatTimeLeft(domain.phaseEndsAt)} />
          )}
          {domain.bidCount !== undefined && <Stat label="Sealed bids" value={String(domain.bidCount)} />}
          {domain.highestBid && <Stat label={domain.status === "registered" ? "Winning bid" : "Top revealed"} value={`${domain.highestBid} ETH`} />}
          {domain.owner && <Stat label="Owner" value={shortenHex(domain.owner)} />}
          {domain.status === "available" && <Stat label="Min. bid" value="0.01 ETH" />}
        </dl>
      </div>
    </Card>
  )
}

function PhaseTrack({ current }: { current: DomainStatus | null }) {
  const currentIndex = current ? PHASES.indexOf(current) : -1
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Auction phases">
      {PHASES.map((phase, i) => {
        const active = i === currentIndex
        const done = i < currentIndex
        return (
          <li key={phase} className="flex flex-col gap-2" aria-current={active ? "step" : undefined}>
            <span
              className={`h-1 rounded-full ${active ? STATUS_META[phase].dot : done ? "bg-zinc-300" : "bg-zinc-100"}`}
            />
            <span className={`text-[11px] font-medium sm:text-xs ${active ? "text-zinc-900" : "text-zinc-500"}`}>
              {STATUS_META[phase].label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-1 font-mono text-sm text-zinc-900">{value}</dd>
    </div>
  )
}
