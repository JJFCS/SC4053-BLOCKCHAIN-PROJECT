import {
  useState,
} from "react"

import {
  ArrowRight,
  CheckCircle2,
  Send,
  ShieldCheck,
  X,
} from "lucide-react"

import {
  shortenHex,
  type PaymentPreview,
} from "./handlers"

export function PaymentSection({
  account,
  previewing,
  sending,
  preview,
  lastPayment,
  onPreview,
  onConfirm,
  onClearPreview,
}: {
  account: string | null

  previewing: boolean

  sending: boolean

  preview:
    PaymentPreview | null

  lastPayment: {
    name: string
    amount: string
    resolvedAddress: string
    txHash: string
  } | null

  onPreview: (
    params: {
      name: string
      amount: string
    }
  ) => void

  onConfirm: (
    preview:
      PaymentPreview
  ) => void

  onClearPreview:
    () => void
}) {
  const [
    name,
    setName,
  ] = useState("")

  const [
    amount,
    setAmount,
  ] = useState("")

  /*
    Any change to the payment inputs invalidates
    the previous confirmation.
  */

  const handleNameChange =
    (
      value: string
    ) => {
      setName(value)

      if (preview) {
        onClearPreview()
      }
    }

  const handleAmountChange =
    (
      value: string
    ) => {
      setAmount(value)

      if (preview) {
        onClearPreview()
      }
    }

  const handlePreview =
    () => {
      if (!account) {
        return
      }

      onPreview({
        name,
        amount,
      })
    }

  const handleConfirm =
    () => {
      if (
        !account ||
        !preview
      ) {
        return
      }

      onConfirm(
        preview
      )
    }

  return (
    <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#0047AB]">
          <Send className="size-5" />
        </div>

        <div>
          <h2 className="text-lg font-semibold text-zinc-900">
            Send ETH to a .ntu domain
          </h2>

          <p className="mt-1 text-sm leading-6 text-zinc-500">
            Resolve a .ntu name and review the full recipient before approving the payment.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4">
        <div>
          <label
            htmlFor="payment-domain"
            className="mb-1.5 block text-sm font-medium text-zinc-700"
          >
            Domain
          </label>

          <div className="flex items-center rounded-xl border border-zinc-200 bg-white focus-within:border-[#0047AB]">
            <input
              id="payment-domain"
              type="text"
              value={name}
              onChange={(event) =>
                handleNameChange(
                  event.target.value
                )
              }
              placeholder="alice"
              disabled={
                sending
              }
              className="min-w-0 flex-1 rounded-l-xl bg-transparent px-3.5 py-2.5 text-sm outline-none disabled:opacity-60"
            />

            <span className="border-l border-zinc-200 px-3 text-sm text-zinc-500">
              .ntu
            </span>
          </div>
        </div>

        <div>
          <label
            htmlFor="payment-amount"
            className="mb-1.5 block text-sm font-medium text-zinc-700"
          >
            Amount
          </label>

          <div className="flex items-center rounded-xl border border-zinc-200 bg-white focus-within:border-[#0047AB]">
            <input
              id="payment-amount"
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(event) =>
                handleAmountChange(
                  event.target.value
                )
              }
              placeholder="0.01"
              disabled={
                sending
              }
              className="min-w-0 flex-1 rounded-l-xl bg-transparent px-3.5 py-2.5 text-sm outline-none disabled:opacity-60"
            />

            <span className="border-l border-zinc-200 px-3 text-sm text-zinc-500">
              ETH
            </span>
          </div>
        </div>

        {!preview && (
          <button
            type="button"
            disabled={
              !account ||
              previewing ||
              sending ||
              !name.trim() ||
              !amount.trim()
            }
            onClick={
              handlePreview
            }
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#0047AB] px-4 text-sm font-semibold text-white transition hover:bg-[#003a8c] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ShieldCheck className="size-4" />

            {previewing
              ? "Resolving recipient…"
              : "Preview payment"}
          </button>
        )}

        {!account && (
          <p className="text-sm text-zinc-500">
            Connect your wallet to preview a payment.
          </p>
        )}
      </div>

      {/*
        ======================================================
        PAYMENT PREVIEW
        ======================================================
      */}

      {preview && (
        <div className="mt-6 overflow-hidden rounded-2xl border border-amber-200 bg-amber-50">
          <div className="flex items-start justify-between border-b border-amber-200 px-5 py-4">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-amber-700" />

                <p className="font-semibold text-amber-950">
                  Confirm payment
                </p>
              </div>

              <p className="mt-1 text-xs text-amber-800">
                Review all details before MetaMask opens.
              </p>
            </div>

            <button
              type="button"
              onClick={
                onClearPreview
              }
              disabled={
                sending
              }
              className="rounded-lg p-1.5 text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
              aria-label="Cancel payment preview"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="space-y-4 px-5 py-5">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-amber-700">
                Domain
              </p>

              <p className="mt-1 font-mono text-sm font-semibold text-zinc-900">
                {preview.name}.ntu
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-amber-700">
                Recipient
              </p>

              {/*
                IMPORTANT:
                Full address is intentionally displayed.
              */}
              <p className="mt-1 break-all font-mono text-sm text-zinc-900">
                {preview.recipient}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-amber-700">
                  Amount
                </p>

                <p className="mt-1 text-sm font-semibold text-zinc-900">
                  {preview.amount} ETH
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-amber-700">
                  Network
                </p>

                <p className="mt-1 text-sm font-semibold text-zinc-900">
                  {preview.networkName}
                </p>

                <p className="mt-0.5 font-mono text-xs text-zinc-500">
                  Chain {preview.chainId}
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-white/70 p-3 text-xs leading-5 text-amber-900">
              If the domain recipient, network, domain name or amount changes, this preview must be created again before payment.
            </div>

            <button
              type="button"
              disabled={
                sending
              }
              onClick={
                handleConfirm
              }
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-900 px-4 text-sm font-semibold text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? (
                "Waiting for confirmation…"
              ) : (
                <>
                  Confirm & open MetaMask
                  <ArrowRight className="size-4" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/*
        ======================================================
        SUCCESS
        ======================================================
      */}

      {lastPayment && (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-center gap-2 text-emerald-900">
            <CheckCircle2 className="size-5" />

            <p className="font-semibold">
              Payment confirmed
            </p>
          </div>

          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-emerald-700">
                Domain
              </span>

              <span className="font-mono text-emerald-950">
                {lastPayment.name}.ntu
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-emerald-700">
                Amount
              </span>

              <span className="font-semibold text-emerald-950">
                {lastPayment.amount} ETH
              </span>
            </div>

            <div className="flex justify-between gap-4">
              <span className="text-emerald-700">
                Recipient
              </span>

              <span
                className="font-mono text-emerald-950"
                title={
                  lastPayment.resolvedAddress
                }
              >
                {shortenHex(
                  lastPayment.resolvedAddress,
                  6
                )}
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}