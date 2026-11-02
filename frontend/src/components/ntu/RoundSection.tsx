import {
    useEffect,
    useRef,
    useState,
  } from "react"
  
  import {
    Clock3,
    Play,
    RefreshCw,
  } from "lucide-react"
  
  import {
    type RoundState,
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
  
  export function RoundSection({
    account,
    round,
    loading,
    starting,
    onRefresh,
    onStartRound,
  }: {
    account: string | null
    round: RoundState | null
    loading: boolean
    starting: boolean
    onRefresh: () => void
    onStartRound: () => void
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
  
    useEffect(() => {
      if (
        !round?.phaseEndsAt
      ) {
        return
      }
  
      const phaseEndsAt =
        round.phaseEndsAt
  
      const intervalId =
        window.setInterval(
          () => {
            const currentTime =
              Date.now()
  
            setNow(
              currentTime
            )
  
            /*
              Refresh the round once when its
              current phase expires.
            */
  
            if (
              currentTime >=
                phaseEndsAt &&
              expiredForRef.current !==
                phaseEndsAt
            ) {
              expiredForRef.current =
                phaseEndsAt
  
              onRefresh()
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
      round?.phaseEndsAt,
      onRefresh,
    ])
  
    const timeLeft =
      round?.phaseEndsAt
        ? getTimeLeft(
            round.phaseEndsAt,
            now
          )
        : "—"
  
    const canStartRound =
      !round ||
      round.phase === "ended"
  
    return (
      <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Auction
            </p>
  
            <h2 className="mt-1 text-xl font-semibold text-zinc-900">
              {round
                ? `Round ${round.roundId}`
                : "No active round"}
            </h2>
  
            <p className="mt-1 text-sm text-zinc-500">
              Commit and reveal auction for .ntu domains.
            </p>
          </div>
  
          <button
            type="button"
            disabled={
              loading
            }
            onClick={
              onRefresh
            }
            className="inline-flex size-10 items-center justify-center rounded-xl border border-zinc-200 text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-50"
            aria-label="Refresh auction round"
          >
            <RefreshCw
              className={`size-4 ${
                loading
                  ? "animate-spin"
                  : ""
              }`}
            />
          </button>
        </div>
  
        {round ? (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl bg-zinc-50 p-4">
                <p className="text-xs text-zinc-500">
                  Phase
                </p>
  
                <p className="mt-1 text-sm font-semibold capitalize text-zinc-900">
                  {round.phase}
                </p>
              </div>
  
              <div className="rounded-2xl bg-zinc-50 p-4">
                <p className="flex items-center gap-1.5 text-xs text-zinc-500">
                  <Clock3 className="size-3.5" />
                  Time remaining
                </p>
  
                <p className="mt-1 font-mono text-sm font-semibold text-zinc-900">
                  {timeLeft}
                </p>
              </div>
  
              <div className="rounded-2xl bg-zinc-50 p-4">
                <p className="text-xs text-zinc-500">
                  Fixed deposit
                </p>
  
                <p className="mt-1 text-sm font-semibold text-zinc-900">
                  {round.deposit} ETH
                </p>
              </div>
  
              <div className="rounded-2xl bg-zinc-50 p-4">
                <p className="text-xs text-zinc-500">
                  Non-reveal penalty
                </p>
  
                <p className="mt-1 text-sm font-semibold text-zinc-900">
                  {round.nonRevealPenalty} ETH
                </p>
              </div>
            </div>
  
            <div className="mt-4 text-xs text-zinc-500">
              Pending domains:{" "}
              <span className="font-mono text-zinc-800">
                {
                  round.pendingDomainCount
                }
              </span>
            </div>
          </>
        ) : (
          <div className="mt-6 rounded-2xl bg-zinc-50 p-5 text-sm text-zinc-600">
            No auction round is currently active.
          </div>
        )}
  
        {canStartRound && (
          <button
            type="button"
            disabled={
              !account ||
              starting
            }
            onClick={
              onStartRound
            }
            className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0047AB] px-5 text-sm font-semibold text-white transition hover:bg-[#003a8c] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Play className="size-4" />
  
            {starting
              ? "Starting round…"
              : "Start auction round"}
          </button>
        )}
  
        {!account &&
          canStartRound && (
            <p className="mt-2 text-xs text-zinc-500">
              Connect your wallet to start a round.
            </p>
          )}
      </section>
    )
  }