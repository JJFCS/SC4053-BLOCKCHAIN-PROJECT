import {
  CheckCircle2,
  Clock3,
  Gavel,
  Search,
  Trophy,
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

import {
  Button,
} from "./primitives"

export function DomainStatusCard({
  domain,
  finalizing,
  onFinalize,
  onPhaseExpired,
}: {
  domain: DomainInfo | null

  finalizing: boolean

  onFinalize: (
    name: string
  ) => void

  onPhaseExpired?: () => void
}) {
  const [
    timeLeft,
    setTimeLeft,
  ] = useState("—")

  /*
    ========================================================
    LIVE COUNTDOWN
    ========================================================

    The contract gives us the exact timestamp when the
    current phase ends.

    We count down locally instead of querying Ethereum
    every second.

    When the timer reaches zero, NtuApp refreshes the
    domain state from the contract.
  */

  useEffect(() => {
    if (
      !domain?.phaseEndsAt
    ) {
      setTimeLeft("—")

      return
    }

    let expired =
      false

    const updateTimer =
      () => {
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
          expired =
            true

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
    ========================================================
    NOTHING SEARCHED YET
    ========================================================
  */

  if (!domain) {
    return (
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-zinc-100">
            <Search className="size-4 text-zinc-500" />
          </div>

          <div>
            <p className="font-medium text-zinc-900">
              Search for a .ntu name
            </p>

            <p className="mt-1 text-sm text-zinc-500">
              Domain ownership and auction information will appear here.
            </p>
          </div>
        </div>
      </section>
    )
  }

  /*
    ========================================================
    REGISTERED DOMAIN
    ========================================================
  */

  if (
    domain.status ===
    "registered"
  ) {
    return (
      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-600" />

              <h2 className="text-lg font-semibold text-zinc-900">
                {domain.name}
                <span className="text-[#0047AB]">
                  .ntu
                </span>
              </h2>
            </div>

            <p className="mt-1 text-sm text-zinc-500">
              This domain has been finalized and registered.
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
            label="Resolves to"
            value={
              domain.resolutionAddress
                ? shortenHex(
                    domain.resolutionAddress,
                    6
                  )
                : "—"
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
            label="Round"
            value={
              domain.roundId ??
              "—"
            }
          />
        </div>

        {domain.winningCommitmentId && (
          <div className="mt-4 rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
            Winning commitment{" "}
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

  /*
    ========================================================
    AUCTION ENDED — READY TO FINALIZE
    ========================================================

    The name is reserved and has a winning bidder,
    but finalizeName() has not been called yet.
  */

  if (
    domain.status ===
    "ended"
  ) {
    return (
      <section className="rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Trophy className="size-5 text-amber-600" />

              <h2 className="text-lg font-semibold text-zinc-900">
                {domain.name}
                <span className="text-[#0047AB]">
                  .ntu
                </span>
              </h2>
            </div>

            <p className="mt-1 text-sm text-zinc-500">
              The auction has ended. The winning bid is ready to be finalized.
            </p>
          </div>

          <StatusBadge
            status="Ready to finalize"
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
            label="Winning bidder"
            value={
              domain.highestBidder
                ? shortenHex(
                    domain.highestBidder,
                    6
                  )
                : "—"
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
              domain.winningCommitmentId
                ? `#${domain.winningCommitmentId}`
                : "—"
            }
          />
        </div>

        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">
            Finalization is required
          </p>

          <p className="mt-1 text-sm text-amber-700">
            Anyone may submit the finalization transaction. Ownership will still be assigned to the highest bidder.
          </p>
        </div>

        <Button
          variant="primary"
          className="mt-4 h-11 w-full"
          loading={
            finalizing
          }
          disabled={
            finalizing
          }
          onClick={() =>
            onFinalize(
              domain.name
            )
          }
        >
          <Trophy className="mr-2 size-4" />

          Finalize{" "}
          {domain.name}
          .ntu
        </Button>
      </section>
    )
  }

  /*
    ========================================================
    ACTIVE AUCTION / AVAILABLE
    ========================================================
  */

  const isCommit =
    domain.status ===
    "commit"

  const isReveal =
    domain.status ===
    "reveal"

  const isAvailable =
    domain.status ===
    "available"

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
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
              ? "The current auction is accepting sealed commitments."
              : isReveal
                ? "The reveal phase is active. Existing bidders can reveal their bids."
                : "This name is not currently registered or reserved."}
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
        domain.highestBidder && (
          <div className="mt-4 flex items-center gap-2 rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
            <User className="size-4" />

            Current highest bidder:

            <span className="font-mono font-medium text-zinc-900">
              {shortenHex(
                domain.highestBidder,
                6
              )}
            </span>
          </div>
        )}

      {isReveal &&
        domain.winningCommitmentId && (
          <div className="mt-2 rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
            Leading commitment:{" "}
            <span className="font-mono font-medium text-zinc-900">
              #
              {
                domain.winningCommitmentId
              }
            </span>
          </div>
        )}

      {isAvailable && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          This name can be bid on when an auction round enters its commit phase.
        </div>
      )}
    </section>
  )
}

/*
  ============================================================
  SMALL DISPLAY COMPONENTS
  ============================================================
*/

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

      <p className="mt-1 break-all font-mono text-sm font-medium text-zinc-900">
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
    "Ready to finalize"
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