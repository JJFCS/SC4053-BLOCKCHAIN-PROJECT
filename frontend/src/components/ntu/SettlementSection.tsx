import {
    ArrowDownToLine,
    CheckCircle2,
    Coins,
    RefreshCcw,
  } from "lucide-react"
  
  import {
    Button,
    Card,
    Notice,
  } from "./primitives"
  
  import {
    shortenHex,
    type Commitment,
  } from "./handlers"
  
  export interface SettlementResult {
    name: string
    commitmentId: string
    refundEth: string
    proceedsEth: string
    txHash: string
  }
  
  export interface WithdrawalResult {
    amountEth: string
    txHash: string
  }
  
  export function SettlementSection({
    account,
    commitments,
    settlingHash,
    withdrawalCreditEth,
    loadingCredit,
    withdrawing,
    lastSettlement,
    lastWithdrawal,
    onSettle,
    onRefreshCredit,
    onWithdraw,
  }: {
    account: string | null
  
    commitments: Commitment[]
  
    settlingHash: string | null
  
    withdrawalCreditEth: string
  
    loadingCredit: boolean
  
    withdrawing: boolean
  
    lastSettlement: SettlementResult | null
  
    lastWithdrawal: WithdrawalResult | null
  
    onSettle: (
      commitment: Commitment
    ) => void
  
    onRefreshCredit: () => void
  
    onWithdraw: () => void
  }) {
    const userCommitments =
      account
        ? commitments.filter(
            (commitment) =>
              commitment.bidder.toLowerCase() ===
              account.toLowerCase()
          )
        : commitments
  
    const hasCredit =
      Number(
        withdrawalCreditEth
      ) > 0
  
    return (
      <Card
        title="Settle bids & withdraw"
        step="Step 3"
        icon={
          <Coins className="size-4" />
        }
        description="After an auction ends, settle your commitment to calculate any refund or penalty. Then withdraw your credited ETH."
      >
        {!account && (
          <div className="mb-4">
            <Notice tone="warn">
              Connect the wallet that created the bid before settling or withdrawing.
            </Notice>
          </div>
        )}
  
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                Withdrawal credit
              </p>
  
              <p className="mt-1 font-mono text-xl font-semibold text-zinc-900">
                {withdrawalCreditEth} ETH
              </p>
            </div>
  
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="h-10 px-3"
                disabled={
                  !account ||
                  loadingCredit
                }
                loading={
                  loadingCredit
                }
                onClick={
                  onRefreshCredit
                }
              >
                <RefreshCcw className="size-4" />
                Refresh
              </Button>
  
              <Button
                className="h-10"
                disabled={
                  !account ||
                  !hasCredit
                }
                loading={
                  withdrawing
                }
                onClick={
                  onWithdraw
                }
              >
                <ArrowDownToLine className="size-4" />
                Withdraw
              </Button>
            </div>
          </div>
  
          <p className="mt-3 text-xs leading-relaxed text-zinc-500">
            Settlement does not immediately send ETH back to your wallet. It adds the refund to your withdrawal credit. You then withdraw that credit in a separate transaction.
          </p>
        </div>
  
        <div className="mt-5">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
            Your commitments
          </p>
  
          {userCommitments.length ===
          0 ? (
            <div className="rounded-xl border border-dashed border-zinc-200 px-4 py-8 text-center">
              <p className="text-sm text-zinc-600">
                No commitments available to settle.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {userCommitments.map(
                (
                  commitment
                ) => {
                  const correctWallet =
                    !!account &&
                    commitment.bidder.toLowerCase() ===
                      account.toLowerCase()
  
                  return (
                    <li
                      key={
                        commitment.hash
                      }
                      className="rounded-xl border border-zinc-200 bg-white p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-mono text-sm font-semibold text-zinc-900">
                            {
                              commitment.name
                            }
                            <span className="text-[#0047AB]">
                              .ntu
                            </span>
                          </p>
  
                          <p className="mt-1 text-xs text-zinc-500">
                            Round{" "}
                            {
                              commitment.roundId
                            }{" "}
                            · Commitment{" "}
                            {commitment.commitmentId
                              ? `#${commitment.commitmentId}`
                              : "—"}
                          </p>
                        </div>
  
                        <SettlementBadge
                          commitment={
                            commitment
                          }
                        />
                      </div>
  
                      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                        <dt className="text-zinc-500">
                          Bid
                        </dt>
  
                        <dd className="text-right font-mono text-zinc-800">
                          {
                            commitment.amount
                          }{" "}
                          ETH
                        </dd>
  
                        <dt className="text-zinc-500">
                          Wallet
                        </dt>
  
                        <dd className="text-right font-mono text-zinc-800">
                          {shortenHex(
                            commitment.bidder,
                            6
                          )}
                        </dd>
  
                        <dt className="text-zinc-500">
                          Reveal status
                        </dt>
  
                        <dd className="text-right text-zinc-800">
                          {commitment.revealed
                            ? "Revealed"
                            : "Not revealed"}
                        </dd>
                      </dl>
  
                      {!commitment.settled && (
                        <Button
                          variant="secondary"
                          className="mt-4 h-10 w-full"
                          disabled={
                            !correctWallet ||
                            !commitment.commitmentId
                          }
                          loading={
                            settlingHash ===
                            commitment.hash
                          }
                          onClick={() =>
                            onSettle(
                              commitment
                            )
                          }
                        >
                          {!account
                            ? "Connect wallet to settle"
                            : !correctWallet
                              ? "Switch to original wallet"
                              : "Settle bid"}
                        </Button>
                      )}
                    </li>
                  )
                }
              )}
            </ul>
          )}
        </div>
  
        <div className="mt-4">
          <Notice>
            Settlement is only available after the round ends. For a revealed bid, the domain must also be finalized first.
          </Notice>
        </div>
  
        {lastSettlement && (
          <div className="mt-4">
            <Notice tone="success">
              <CheckCircle2 className="mr-1 inline size-4" />
              Settled{" "}
              <span className="font-mono">
                {
                  lastSettlement.name
                }
                .ntu
              </span>
              . Refund credited:{" "}
              <span className="font-mono font-semibold">
                {
                  lastSettlement.refundEth
                }{" "}
                ETH
              </span>
              . Tx{" "}
              <span className="font-mono">
                {shortenHex(
                  lastSettlement.txHash,
                  6
                )}
              </span>
            </Notice>
          </div>
        )}
  
        {lastWithdrawal && (
          <div className="mt-3">
            <Notice tone="success">
              <CheckCircle2 className="mr-1 inline size-4" />
              Withdrew{" "}
              <span className="font-mono font-semibold">
                {
                  lastWithdrawal.amountEth
                }{" "}
                ETH
              </span>{" "}
              to your wallet. Tx{" "}
              <span className="font-mono">
                {shortenHex(
                  lastWithdrawal.txHash,
                  6
                )}
              </span>
            </Notice>
          </div>
        )}
      </Card>
    )
  }
  
  function SettlementBadge({
    commitment,
  }: {
    commitment: Commitment
  }) {
    if (
      commitment.settled
    ) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs text-emerald-700">
          <CheckCircle2 className="size-3" />
          Settled
        </span>
      )
    }
  
    if (
      commitment.revealed
    ) {
      return (
        <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs text-[#0047AB]">
          Revealed
        </span>
      )
    }
  
    return (
      <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs text-amber-700">
        Unrevealed
      </span>
    )
  }