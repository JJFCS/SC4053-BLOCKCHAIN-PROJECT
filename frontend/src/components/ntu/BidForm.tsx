import { useState, type FormEvent } from "react"
import { Gavel, RefreshCw } from "lucide-react"
import { Button, Card, Field, Notice } from "./primitives"
import { generateSalt, shortenHex, type DomainInfo } from "./handlers"

export function BidForm({
  domain,
  account,
  submitting,
  onCommit,
}: {
  domain: DomainInfo | null
  account: string | null
  submitting: boolean
  onCommit: (params: { name: string; amount: string; salt: string }) => void
}) {
  const [amount, setAmount] = useState("")
  const [salt, setSalt] = useState("")

  const canBid = domain && (domain.status === "available" || domain.status === "commit")
  const amountValid = Number(amount) >= 0.01

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!domain || !canBid || !amountValid) return
    onCommit({ name: domain.name, amount, salt: salt || generateSalt() })
    setAmount("")
    setSalt("")
  }

  return (
    <Card
      title="Place sealed bid"
      step="Step 1"
      icon={<Gavel className="size-4" />}
      description="Your bid amount stays hidden until the reveal phase."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field
          id="bid-domain"
          label="Domain"
          value={domain?.name ?? ""}
          placeholder="Search a domain first"
          suffix=".ntu"
          readOnly
        />
        <Field
          id="bid-amount"
          label="Bid amount"
          type="number"
          inputMode="decimal"
          min="0.01"
          step="0.001"
          placeholder="0.10"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          suffix="ETH"
          hint="Minimum 0.01 ETH. You may send extra ETH as a decoy deposit."
          disabled={!canBid}
        />
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-600">Secret salt</span>
          <div className="flex h-11 items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-zinc-50 pl-3.5 pr-1.5">
            <code className={`truncate font-mono text-sm ${salt ? "text-zinc-700" : "text-zinc-400"}`}>
              {salt ? shortenHex(salt, 10) : "Auto-generated on commit"}
            </code>
            <button
              type="button"
              onClick={() => setSalt(generateSalt())}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
              aria-label="Regenerate salt"
            >
              <RefreshCw className="size-4" aria-hidden="true" />
            </button>
          </div>
          <p className="text-xs text-zinc-500">Saved with your commitment. Required to reveal.</p>
        </div>

        {domain && !canBid && (
          <Notice tone="warn">
            Bidding is closed for this name ({domain.status === "reveal" ? "reveal phase" : "registered"}).
          </Notice>
        )}

        <Button type="submit" loading={submitting} disabled={!account || !canBid || !amountValid} className="w-full">
          {account ? "Commit bid" : "Connect wallet to bid"}
        </Button>
      </form>
    </Card>
  )
}
