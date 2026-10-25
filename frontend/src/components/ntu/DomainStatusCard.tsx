import {
  CheckCircle2,
  Clock3,
  Gavel,
  Search,
  User,
} from "lucide-react"

import {
  useEffect,
  useState,
} from "react"

import {
  formatTimeLeft,
  shortenHex,
  type DomainInfo,
} from "./handlers"

export function DomainStatusCard({
  domain,
  onPhaseExpired,
}: {
  domain: DomainInfo | null
  onPhaseExpired?: () => void
}) {
  const [
    timeLeft,
    setTimeLeft,
  ] = useState("—")

  /*
    LIVE COUNTDOWN

    We don't query Ethereum every second.

    Instead:
    - contract gives us phaseEndsAt once
    - browser counts down locally
    - when countdown reaches zero,
      we ask NtuApp to refresh contract state
  */
  useEffect(() => {
    if (
      !domain?.phaseEndsAt
    ) {
      setTimeLeft("—")
      return
    }

    let expired = false

    const updateTimer = () => {
      const remaining =
        domain.phaseEndsAt! -
        Date.now()

      setTimeLeft(
        formatTimeLeft(
          domain.phaseEndsAt
        )
      )

      if (
        remaining <= 0 &&
        !expired
      ) {
        expired = true

        onPhaseExpired?.()
      }
    }

    updateTimer()

    const timer =
      window.setInterval(
        updateTimer,
        1000
      )

    return () => {
      window.clearInterval(
        timer
      )
    }
  }, [
    domain?.phaseEndsAt,
    onPhaseExpired,
  ])

  /*
    BEFORE USER SEARCHES
  */
  if (!domain) {
    return (
      <section className="rounded-2xl border border-zinc-200 bg-white p-6">
        <div className="flex items-start gap-3">
          <div className="flex size-9 items-center justify-center rounded-lg bg-zinc-100">
            <Search className="size-4 text-zinc-500" />
          </div>

          <div>
            <p className="font-medium text-zinc-900">
              Search for a .ntu name
            </p>

            <p className="mt-1 text-sm text-zinc-500">
              Domain availability and auction status will appear here.
            </p>
          </div>
        </div>
      </section>
    )
  }

  /*
    REGISTERED DOMAIN
  */
  if (
    domain.status ===
    "registered"
  ) {
    return (
      <section className="rounded-2xl border border-zinc-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-[#0047AB]" />

              <h2 className="text-lg font-semibold text-zinc-900">
                {domain.name}
                <span className="text-[#0047AB]">
                  .ntu
                </span>
              </h2>
            </div>

            <p className="mt-1 text-sm text-zinc-500">
              This name is registered.
            </p>
          </div>

          <StatusBadge
            status="Registered"
          />
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <InfoItem
            label="Owner"
            value={
              domain.owner
                ? shortenHex(
                    domain.owner,
                    6
                  )
                : "—"
            }
          />

          <InfoItem
            label="Round won"
            value={
              domain.roundId ??
              "—"
            }
          />

          <InfoItem
            label="Winning bid"
            value={
              domain.highestBid
                ? `${domain.highestBid} ETH`
                : "—"
            }
          />

          <InfoItem
            label="Commitment"
            value={
              domain.winningCommitmentId ??
              "—"
            }
          />
        </div>
      </section>
    )
  }

  /*
    COMMIT / REVEAL / AVAILABLE
  */

  const isCommit =
    domain.status ===
    "commit"

  const isReveal =
    domain.status ===
    "reveal"

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            {isCommit ? (
              <Gavel className="size-5 text-[#0047AB]" />
            ) : isReveal ? (
              <Clock3 className="size-5 text-amber-600" />
            ) : (
              <CheckCircle2 className="size-5 text-emerald-600" />
            )}

            <h2 className="text-lg font-semibold text-zinc-900">
              {domain.name}
              <span className="text-[#0047AB]">
                .ntu
              </span>
            </h2>
          </div>

          <p className="mt-1 text-sm text-zinc-500">
            {isCommit
              ? "Sealed bids can be submitted during the commit phase."
              : isReveal
                ? "Committed bids can now be revealed."
                : "This name is currently available."}
          </p>
        </div>

        <StatusBadge
          status={
            isCommit
              ? "Commit phase"
              : isReveal
                ? "Reveal phase"
                : "Available"
          }
        />
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <InfoItem
          label="Round"
          value={
            domain.roundId ??
            "—"
          }
        />

        <InfoItem
          label="Current phase"
          value={
            isCommit
              ? "Commit"
              : isReveal
                ? "Reveal"
                : "Available"
          }
        />

        <InfoItem
          label="Time remaining"
          value={
            isCommit ||
            isReveal
              ? timeLeft
              : "—"
          }
        />

        <InfoItem
          label="Highest revealed bid"
          value={
            domain.highestBid
              ? `${domain.highestBid} ETH`
              : "None yet"
          }
        />
      </div>

      {isReveal &&
        domain.winningCommitmentId && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
            <User className="size-4" />

            Current leading commitment:
            <span className="font-mono font-medium text-zinc-900">
              #
              {
                domain.winningCommitmentId
              }
            </span>
          </div>
        )}
    </section>
  )
}

function InfoItem({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
        {label}
      </p>

      <p className="mt-1 font-mono text-sm font-medium text-zinc-900">
        {value}
      </p>
    </div>
  )
}

function StatusBadge({
  status,
}: {
  status: string
}) {
  let styles =
    "border-zinc-200 bg-zinc-50 text-zinc-700"

  if (
    status ===
    "Commit phase"
  ) {
    styles =
      "border-blue-200 bg-blue-50 text-[#0047AB]"
  }

  if (
    status ===
    "Reveal phase"
  ) {
    styles =
      "border-amber-200 bg-amber-50 text-amber-700"
  }

  if (
    status ===
      "Registered" ||
    status ===
      "Available"
  ) {
    styles =
      "border-emerald-200 bg-emerald-50 text-emerald-700"
  }

  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-medium ${styles}`}
    >
      {status}
    </span>
  )
}