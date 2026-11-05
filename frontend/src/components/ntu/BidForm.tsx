import {
  useState,
  type FormEvent,
} from "react"

import {
  Gavel,
  RefreshCw,
} from "lucide-react"

import {
  Button,
  Card,
  Field,
  Notice,
} from "./primitives"

import {
  generateSalt,
  shortenHex,
  type DomainInfo,
} from "./handlers"

export function BidForm({
  domain,
  account,
  submitting,
  onCommit,
}: {
  domain: DomainInfo | null
  account: string | null
  submitting: boolean
  onCommit: (params: {
    name: string
    amount: string
    salt: string
  }) => void
}) {
  const [
    amount,
    setAmount,
  ] = useState("")

  const [
    salt,
    setSalt,
  ] = useState("")

  const canBid =
    Boolean(
      domain &&
      (
        domain.status ===
          "available" ||
        domain.status ===
          "commit"
      )
    )

  /*
    Bid rules:

    minimum = 1 wei
    maximum = 0.1 ETH

    1 wei =
    0.000000000000000001 ETH
  */

  const parsedAmount =
    Number(amount)

  const amountValid =
    amount.trim() !== "" &&
    Number.isFinite(
      parsedAmount
    ) &&
    parsedAmount >=
      0.000000000000000001 &&
    parsedAmount <=
      0.1

  const handleSubmit =
    (
      event: FormEvent
    ) => {
      event.preventDefault()

      if (
        !domain ||
        !canBid ||
        !amountValid
      ) {
        return
      }

      onCommit({
        name:
          domain.name,

        amount,

        salt:
          salt ||
          generateSalt(),
      })

      setAmount("")
      setSalt("")
    }

  return (
    <Card
      title="Place sealed bid"
      step="Step 1"
      icon={
        <Gavel className="size-4" />
      }
      description="Your bid amount stays hidden until the reveal phase."
    >
      <form
        onSubmit={
          handleSubmit
        }
        className="flex flex-col gap-4"
      >
        <Field
          id="bid-domain"
          label="Domain"
          value={
            domain?.name ??
            ""
          }
          placeholder="Search a domain first"
          suffix=".ntu"
          readOnly
        />

        <Field
          id="bid-amount"
          label="Bid amount"
          type="number"
          inputMode="decimal"
          min="0.000000000000000001"
          max="0.1"
          step="0.000000000000000001"
          placeholder="0.05"
          value={
            amount
          }
          onChange={(
            event
          ) =>
            setAmount(
              event.target.value
            )
          }
          suffix="ETH"
          hint="Bid from 1 wei up to 0.1 ETH. Every commitment sends a fixed 0.1 ETH deposit."
          disabled={
            !canBid
          }
        />

        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wider text-blue-700">
            Commitment deposit
          </p>

          <p className="mt-1 text-sm font-semibold text-blue-950">
            Fixed 0.1 ETH
          </p>

          <p className="mt-1 text-xs leading-5 text-blue-800">
            The deposit is fixed regardless of your bid amount. Your actual bid must be between 1 wei and 0.1 ETH.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-600">
            Secret salt
          </span>

          <div className="flex h-11 items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-zinc-50 pl-3.5 pr-1.5">
            <code
              className={`truncate font-mono text-sm ${
                salt
                  ? "text-zinc-700"
                  : "text-zinc-400"
              }`}
            >
              {salt
                ? shortenHex(
                    salt,
                    10
                  )
                : "Auto-generated on commit"}
            </code>

            <button
              type="button"
              onClick={() =>
                setSalt(
                  generateSalt()
                )
              }
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
              aria-label="Regenerate salt"
            >
              <RefreshCw
                className="size-4"
                aria-hidden="true"
              />
            </button>
          </div>

          <p className="text-xs text-zinc-500">
            Saved with your commitment. Required to reveal.
          </p>
        </div>

        {domain &&
          !canBid && (
            <Notice tone="warn">
              Bidding is closed for this name (
              {domain.status ===
              "reveal"
                ? "reveal phase"
                : domain.status}
              ).
            </Notice>
          )}

        {amount &&
          !amountValid && (
            <Notice tone="warn">
              Enter a bid between 1 wei and 0.1 ETH.
            </Notice>
          )}

        <Button
          type="submit"
          loading={
            submitting
          }
          disabled={
            !account ||
            !canBid ||
            !amountValid
          }
          className="w-full"
        >
          {account
            ? "Commit bid"
            : "Connect wallet to bid"}
        </Button>
      </form>
    </Card>
  )
}