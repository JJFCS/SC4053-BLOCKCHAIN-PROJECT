import {
  Eye,
  CheckCircle2,
  Clock,
  Download,
  Upload,
} from "lucide-react"

import {
  Button,
  Card,
  Notice,
} from "./primitives"

import {
  shortenHex,
  type Commitment,
  type DomainInfo,
} from "./handlers"

export function RevealSection({
  commitments,
  domain,
  revealingHash,
  onReveal,
  onDownloadBackup,
  onImportBackup,
}: {
  commitments: Commitment[]
  domain: DomainInfo | null
  revealingHash: string | null
  onReveal: (commitment: Commitment) => void
  onDownloadBackup: () => void
  onImportBackup: (file: File) => void
}) {
  return (
    <Card
      title="Reveal bids"
      step="Step 2"
      icon={<Eye className="size-4" />}
      description="Saved commitments from this browser. Reveal during the reveal phase."
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          className="h-10 flex-1"
          disabled={commitments.length === 0}
          onClick={onDownloadBackup}
        >
          <Download className="mr-2 size-4" />
          Download backup
        </Button>

        <label className="flex-1">
          <input
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(event) => {
              const file =
                event.target.files?.[0]

              if (file) {
                onImportBackup(file)
              }

              // Allows the same backup file
              // to be selected again later.
              event.target.value = ""
            }}
          />

          <span className="flex h-10 cursor-pointer items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50">
            <Upload className="mr-2 size-4" />
            Import backup
          </span>
        </label>
      </div>

      {commitments.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-200 px-4 py-10 text-center">
          <Clock
            className="size-5 text-zinc-400"
            aria-hidden="true"
          />

          <p className="text-sm text-zinc-600">
            No saved commitments yet.
          </p>

          <p className="text-xs text-zinc-400">
            Commit a bid or import a backup file.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {commitments.map((c) => {
            const inReveal =
              domain?.name === c.name &&
              domain.status === "reveal"

            return (
              <li
                key={c.hash}
                className="rounded-xl border border-zinc-200 bg-zinc-50 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-sm font-semibold text-zinc-900">
                    {c.name}
                    <span className="text-[#0047AB]">
                      .ntu
                    </span>
                  </p>

                  <CommitmentBadge
                    revealed={c.revealed}
                    ready={inReveal}
                  />
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <dt className="text-zinc-500">
                    Bid
                  </dt>

                  <dd className="text-right font-mono text-zinc-800">
                    {c.amount} ETH
                  </dd>

                  <dt className="text-zinc-500">
                    Commitment
                  </dt>

                  <dd className="text-right font-mono text-zinc-800">
                    {shortenHex(
                      c.hash,
                      6
                    )}
                  </dd>

                  <dt className="text-zinc-500">
                    Salt
                  </dt>

                  <dd className="text-right font-mono text-zinc-800">
                    {shortenHex(
                      c.salt,
                      6
                    )}
                  </dd>

                  <dt className="text-zinc-500">
                    Committed
                  </dt>

                  <dd className="text-right font-mono text-zinc-800">
                    {new Date(
                      c.createdAt
                    ).toLocaleTimeString()}
                  </dd>
                </dl>

                {!c.revealed && (
                  <Button
                    variant={
                      inReveal
                        ? "primary"
                        : "secondary"
                    }
                    className="mt-4 h-10 w-full"
                    disabled={!inReveal}
                    loading={
                      revealingHash ===
                      c.hash
                    }
                    onClick={() =>
                      onReveal(c)
                    }
                  >
                    {inReveal
                      ? "Reveal bid"
                      : "Available in reveal phase"}
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <div className="mt-4">
        <Notice>
          Keep your salt safe. The backup file contains information required to reveal your bid.
        </Notice>
      </div>
    </Card>
  )
}

function CommitmentBadge({
  revealed,
  ready,
}: {
  revealed: boolean
  ready: boolean
}) {
  if (revealed) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs text-[#0047AB]">
        <CheckCircle2
          className="size-3"
          aria-hidden="true"
        />
        Revealed
      </span>
    )
  }

  if (ready) {
    return (
      <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs text-amber-700">
        Ready to reveal
      </span>
    )
  }

  return (
    <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-xs text-violet-700">
      Committed
    </span>
  )
}