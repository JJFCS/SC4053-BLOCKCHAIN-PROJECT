import { useState, type FormEvent } from "react"
import { Send } from "lucide-react"
import { Button, Card, Field, Notice } from "./primitives"
import { getFriendlyError, shortenHex, type PaymentPreview } from "./handlers"

export function PaymentSection({
  account,
  sending,
  lastPayment,
  onPreview,
  onSend,
}: {
  account: string | null
  sending: boolean
  lastPayment: { name: string; amount: string; resolvedAddress: string; txHash: string } | null
  onPreview: (params: { name: string; amount: string }) => Promise<PaymentPreview>
  onSend: (preview: PaymentPreview) => Promise<void>
}) {
  const [name, setName] = useState("")
  const [amount, setAmount] = useState("")
  const [preview, setPreview] = useState<PaymentPreview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const valid = name.trim().length > 0 && Number(amount) > 0

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!account || !valid || previewing || sending) return

    if (preview) {
      // A failed or cancelled payment requires a fresh recipient preview.
      setPreview(null)
      await onSend(preview)
      return
    }

    setPreviewing(true)
    try {
      setPreview(await onPreview({ name, amount }))
    } catch (error) {
      alert(getFriendlyError(error))
    } finally {
      setPreviewing(false)
    }
  }

  return (
    <Card
      title="Send ETH to a .ntu name"
      icon={<Send className="size-4" />}
      description="Pay anyone by name. The registry resolves it to their wallet address."
    >
      <form onSubmit={(event) => { void handleSubmit(event) }} className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
          <Field
            id="pay-name"
            label="Recipient"
            placeholder="alice"
            value={name}
            onChange={(e) => { setName(e.target.value); setPreview(null) }}
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
            step="any"
            placeholder="0.05"
            value={amount}
            onChange={(e) => { setAmount(e.target.value); setPreview(null) }}
            suffix="ETH"
          />
        </div>
        {preview && (
          <Notice tone="warn">
            <div className="space-y-2">
              <p className="font-semibold">Confirm the recipient before sending</p>
              <p>Name: <span className="font-mono">{preview.name}.ntu</span></p>
              <p>Recipient: <span className="break-all font-mono">{preview.resolvedAddress}</span></p>
              <p>Amount: <span className="font-mono">{preview.amount} ETH</span></p>
              <p>Network: {preview.chainId === "31337" ? "Hardhat Local" : preview.chainId === "11155111" ? "Sepolia" : `Chain ${preview.chainId}`} (chain {preview.chainId})</p>
            </div>
          </Notice>
        )}
        <Button type="submit" loading={previewing || sending} disabled={!account || !valid || previewing || sending} className="w-full sm:w-auto sm:self-end">
          {!account ? "Connect wallet to send" : preview ? "Confirm and send" : "Review recipient"}
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
