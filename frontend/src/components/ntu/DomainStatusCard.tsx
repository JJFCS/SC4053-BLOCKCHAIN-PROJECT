import {
  useEffect,
  useRef,
  useState,
} from "react"

import {
  CheckCircle2,
  Clock3,
  Gavel,
} from "lucide-react"

import {
  type DomainInfo,
} from "./handlers"

function getTimeLeft(
  timestamp: number,
  now: number
): string {
  const difference =
    Math.max(
      0,
      timestamp - now
    )

  const totalSeconds =
    Math.floor(
      difference / 1000
    )

  const minutes =
    Math.floor(
      totalSeconds / 60
    )

  const seconds =
    totalSeconds % 60

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }

  return `${seconds}s`
}

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
  onPhaseExpired: () => void
}) {
  const [
    now,
    setNow,
  ] = useState(
    () => Date.now()
  )

  const expiredForRef =
    useRef<number | null>(
      null
    )

  /*
    Only the timer callback changes React state.

    There is no synchronous setState inside the effect,
    which resolves the lint warning.
  */

  useEffect(() => {
    if (
      !domain?.phaseEndsAt
    ) {
      return
    }

    const phaseEndsAt =
      domain.phaseEndsAt

    const intervalId =
      window.setInterval(
        () => {
          const currentTime =
            Date.now()

          setNow(
            currentTime
          )

          if (
            currentTime >=
              phaseEndsAt &&
            expiredForRef.current !==
              phaseEndsAt
          ) {
            expiredForRef.current =
              phaseEndsAt

            onPhaseExpired()
          }
        },
        1000
      )

    return () => {
      window.clearInterval(
        intervalId
      )
    }
  }, [
    domain?.phaseEndsAt,
    onPhaseExpired,
  ])

  if (!domain) {
    return (
      <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-zinc-100">
            <Gavel className="size-5 text-zinc-500" />
          </div>

          <div>
            <h2 className="font-semibold text-zinc-900">
              Domain status
            </h2>

            <p className="mt-1 text-sm text-zinc-500">
              Search for a .ntu name to view its status.
            </p>
          </div>
        </div>
      </section>
    )
  }

  const timeLeft =
    domain.phaseEndsAt
      ? getTimeLeft(
          domain.phaseEndsAt,
          now
        )
      : "—"

  const isRegistered =
    domain.status ===
    "registered"

  const canFinalize =
    domain.status ===
      "ended" &&
    !domain.finalized

  return (
    <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Domain
          </p>

          <h2 className="mt-1 font-mono text-2xl font-semibold text-zinc-900">
            {domain.name}.ntu
          </h2>
        </div>

        <span className="w-fit rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-medium capitalize text-zinc-700">
          {domain.status}
        </span>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {domain.roundId && (
          <div className="rounded-2xl bg-zinc-50 p-4">
            <p className="text-xs text-zinc-500">
              Round
            </p>

            <p className="mt-1 font-mono text-sm font-medium text-zinc-900">
              {domain.roundId}
            </p>
          </div>
        )}

        {domain.phaseEndsAt && (
          <div className="rounded-2xl bg-zinc-50 p-4">
            <p className="flex items-center gap-1.5 text-xs text-zinc-500">
              <Clock3 className="size-3.5" />
              Time remaining
            </p>

            <p className="mt-1 font-mono text-sm font-medium text-zinc-900">
              {timeLeft}
            </p>
          </div>
        )}

        {domain.highestBid && (
          <div className="rounded-2xl bg-zinc-50 p-4">
            <p className="text-xs text-zinc-500">
              Highest revealed bid
            </p>

            <p className="mt-1 text-sm font-semibold text-zinc-900">
              {domain.highestBid} ETH
            </p>
          </div>
        )}
      </div>

      {isRegistered && (
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center gap-2 text-emerald-900">
            <CheckCircle2 className="size-4" />

            <p className="font-semibold">
              Registered
            </p>
          </div>

          {domain.owner && (
            <div className="mt-3">
              <p className="text-xs text-emerald-700">
                Owner
              </p>

              <p className="mt-1 break-all font-mono text-xs text-emerald-950">
                {domain.owner}
              </p>
            </div>
          )}

          {domain.resolutionAddress && (
            <div className="mt-3">
              <p className="text-xs text-emerald-700">
                Resolution address
              </p>

              <p className="mt-1 break-all font-mono text-xs text-emerald-950">
                {domain.resolutionAddress}
              </p>
            </div>
          )}
        </div>
      )}

      {canFinalize && (
        <button
          type="button"
          disabled={
            finalizing
          }
          onClick={() =>
            onFinalize(
              domain.name
            )
          }
          className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-[#0047AB] px-5 text-sm font-semibold text-white transition hover:bg-[#003a8c] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {finalizing
            ? "Finalizing…"
            : "Finalize domain"}
        </button>
      )}
    </section>
  )
}