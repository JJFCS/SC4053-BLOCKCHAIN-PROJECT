import { useState, type FormEvent } from "react"
import { Send } from "lucide-react"
import { Button, Card, Field, Notice } from "./primitives"
import { sanitizeLabel, shortenHex } from "./handlers"

export function PaymentSection({
  account,
  sending,
  lastPayment,
  onSend,
}: {
  account: string | null
  sending: boolean
  lastPayment: { name: string; amount: string; resolvedAddress: string; txHash: string } | null
  onSend: (params: { name: string; amount: string }) => void
}) {
  const [name, setName] = useState("")
  const [amount, setAmount] = useState("")
  const valid = name.length > 0 && Number(amount) > 0

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (valid) onSend({ name, amount })
  }

  return (
    <Card
      title="Send ETH to a .ntu name"
      icon={<Send className="size-4" />}
      description="Pay anyone by name. The registry resolves it to their wallet address."
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
          <Field
            id="pay-name"
            label="Recipient"
            placeholder="alice"
            value={name}
            onChange={(e) => setName(sanitizeLabel(e.target.value))}
            suffix=".ntu"
            autoComplete="off"
            spellCheck={false}
          />
          <Field
            id="pay-amount"
            label="Amount"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.0001"
            placeholder="0.05"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            suffix="ETH"
          />
        </div>
        <Button type="submit" loading={sending} disabled={!account || !valid} className="w-full sm:w-auto sm:self-end">
          {account ? "Send payment" : "Connect wallet to send"}
        </Button>
        {lastPayment && (
          <Notice tone="success">
            Sent <span className="font-mono">{lastPayment.amount} ETH</span> to{" "}
            <span className="font-mono">{lastPayment.name}.ntu</span> (
            <span className="font-mono">{shortenHex(lastPayment.resolvedAddress)}</span>). Tx{" "}
            <span className="font-mono">{shortenHex(lastPayment.txHash, 6)}</span>
          </Notice>
        )}
      </form>
    </Card>
  )
}
