import {
    Gavel,
    Play,
    RefreshCcw,
  } from "lucide-react"
  
  import {
    useEffect,
    useState,
  } from "react"
  
  import {
    Button,
    Card,
    Notice,
  } from "./primitives"
  
  import {
    formatTimeLeft,
    type RoundState,
  } from "./handlers"
  
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
      timeLeft,
      setTimeLeft,
    ] = useState("—")
  
    /*
      Local countdown.
  
      We use the timestamp already returned by the
      contract instead of querying Ethereum every second.
    */
    useEffect(() => {
      if (
        !round?.phaseEndsAt
      ) {
        setTimeLeft("—")
  
        return
      }
  
      const update =
        () => {
          setTimeLeft(
            formatTimeLeft(
              round.phaseEndsAt
            )
          )
        }
  
      update()
  
      const timer =
        window.setInterval(
          update,
          1000
        )
  
      return () => {
        window.clearInterval(
          timer
        )
      }
    }, [
      round?.phaseEndsAt,
    ])
  
    /*
      ========================================================
      NO ROUND HAS EVER BEEN STARTED
      ========================================================
    */
  
    if (!round) {
      return (
        <Card
          title="Auction round"
          icon={
            <Gavel className="size-4" />
          }
          description="The registrar operates in timed commit and reveal rounds."
        >
          <div className="rounded-xl border border-dashed border-zinc-200 px-4 py-8 text-center">
            <p className="font-medium text-zinc-900">
              No auction round is currently available.
            </p>
  
            <p className="mt-2 text-sm text-zinc-500">
              A wallet can start the first auction round.
            </p>
  
            <Button
              className="mt-5"
              disabled={
                !account
              }
              loading={
                starting
              }
              onClick={
                onStartRound
              }
            >
              <Play className="size-4" />
  
              {account
                ? "Start auction round"
                : "Connect wallet to start"}
            </Button>
          </div>
        </Card>
      )
    }
  
    const isCommit =
      round.phase ===
      "commit"
  
    const isReveal =
      round.phase ===
      "reveal"
  
    const isEnded =
      round.phase ===
      "ended"
  
    return (
      <Card
        title="Auction round"
        icon={
          <Gavel className="size-4" />
        }
        description="Live state of the current registrar auction round."
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Current round
            </p>
  
            <p className="mt-1 font-mono text-2xl font-semibold text-zinc-900">
              #
              {
                round.roundId
              }
            </p>
          </div>
  
          <RoundBadge
            phase={
              round.phase
            }
          />
        </div>
  
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <InfoItem
            label="Phase"
            value={
              isCommit
                ? "Commit"
                : isReveal
                  ? "Reveal"
                  : isEnded
                    ? "Ended"
                    : "Not started"
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
            label="Commit deposit"
            value={`${round.deposit} ETH`}
          />
  
          <InfoItem
            label="Non-reveal penalty"
            value={`${round.nonRevealPenalty} ETH`}
          />
        </div>
  
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <InfoItem
            label="Pending domains"
            value={
              round.pendingDomainCount
            }
          />
  
          <InfoItem
            label="Treasury"
            value={
              shortenAddress(
                round.treasury
              )
            }
          />
        </div>
  
        {isCommit && (
          <div className="mt-5">
            <Notice>
              Sealed bids can be submitted now. Each wallet may create one commitment in this round.
            </Notice>
          </div>
        )}
  
        {isReveal && (
          <div className="mt-5">
            <Notice tone="warn">
              The commit phase has ended. Existing bidders must reveal their saved bid and salt before the reveal period expires.
            </Notice>
          </div>
        )}
  
        {isEnded && (
          <div className="mt-5">
            <Notice tone="success">
              Round #{round.roundId} has ended. Winning domains can now be finalized and bidders can settle their commitments.
            </Notice>
          </div>
        )}
  
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button
            variant="secondary"
            disabled={
              loading
            }
            loading={
              loading
            }
            onClick={
              onRefresh
            }
          >
            <RefreshCcw className="size-4" />
            Refresh
          </Button>
  
          {isEnded && (
            <Button
              disabled={
                !account
              }
              loading={
                starting
              }
              onClick={
                onStartRound
              }
            >
              <Play className="size-4" />
  
              {account
                ? "Start next round"
                : "Connect wallet to start"}
            </Button>
          )}
        </div>
      </Card>
    )
  }
  
  function RoundBadge({
    phase,
  }: {
    phase: RoundState["phase"]
  }) {
    let label =
      "Not started"
  
    let styles =
      "border-zinc-200 bg-zinc-50 text-zinc-700"
  
    if (
      phase ===
      "commit"
    ) {
      label =
        "Commit phase"
  
      styles =
        "border-blue-200 bg-blue-50 text-[#0047AB]"
    }
  
    if (
      phase ===
      "reveal"
    ) {
      label =
        "Reveal phase"
  
      styles =
        "border-amber-200 bg-amber-50 text-amber-700"
    }
  
    if (
      phase ===
      "ended"
    ) {
      label =
        "Round ended"
  
      styles =
        "border-emerald-200 bg-emerald-50 text-emerald-700"
    }
  
    return (
      <span
        className={`rounded-full border px-3 py-1 text-xs font-medium ${styles}`}
      >
        {label}
      </span>
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
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          {label}
        </p>
  
        <p className="mt-1 font-mono text-sm font-medium text-zinc-900">
          {value}
        </p>
      </div>
    )
  }
  
  function shortenAddress(
    address: string
  ) {
    if (
      address.length <
      12
    ) {
      return address
    }
  
    return `${address.slice(
      0,
      8
    )}…${address.slice(
      -6
    )}`
  }