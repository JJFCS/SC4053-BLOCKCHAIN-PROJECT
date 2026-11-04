import {
    useState,
  } from "react"

  import {
    CheckCircle2,
    Link2,
  } from "lucide-react"

  import {
    type DomainInfo,
  } from "./handlers"

  interface ResolutionSectionProps {
    domain: DomainInfo | null
    account: string | null
    updating: boolean
    lastUpdateTxHash: string | null
    onUpdate: (
      name: string,
      target: string
    ) => void
  }

  /*
    The outer component uses a key to recreate the editor
    when the selected domain or its resolution address changes.

    This means we don't need an effect that calls setTarget().
  */

  export function ResolutionSection(
    props: ResolutionSectionProps
  ) {
    const key =
      props.domain
        ? `${props.domain.name}:${props.domain.resolutionAddress ?? ""}`
        : "no-domain"

    return (
      <ResolutionEditor
        key={key}
        {...props}
      />
    )
  }

  function ResolutionEditor({
    domain,
    account,
    updating,
    lastUpdateTxHash,
    onUpdate,
  }: ResolutionSectionProps) {
    const [
      target,
      setTarget,
    ] = useState(
      () =>
        domain?.resolutionAddress ??
        ""
    )

    if (
      !domain ||
      domain.status !==
        "registered"
    ) {
      return (
        <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-zinc-100">
              <Link2 className="size-5 text-zinc-500" />
            </div>

            <div>
              <h2 className="font-semibold text-zinc-900">
                Resolution
              </h2>

              <p className="mt-1 text-sm text-zinc-500">
                Search for a registered domain to view or update its resolution address.
              </p>
            </div>
          </div>
        </section>
      )
    }

    const isOwner =
      Boolean(
        account &&
        domain.owner &&
        account.toLowerCase() ===
          domain.owner.toLowerCase()
      )

    const handleSubmit =
      () => {
        if (
          !isOwner ||
          !target.trim()
        ) {
          return
        }

        onUpdate(
          domain.name,
          target.trim()
        )
      }

    return (
      <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-[#0047AB]">
            <Link2 className="size-5" />
          </div>

          <div>
            <h2 className="font-semibold text-zinc-900">
              Resolution
            </h2>

            <p className="mt-1 text-sm text-zinc-500">
              Control the Ethereum address that{" "}
              <span className="font-mono">
                {domain.name}.ntu
              </span>{" "}
              resolves to.
            </p>
          </div>
        </div>

        <div className="mt-6">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Current resolution
          </p>

          <p className="mt-2 break-all rounded-xl bg-zinc-50 p-3 font-mono text-xs text-zinc-800">
            {domain.resolutionAddress ??
              "No resolution address"}
          </p>
        </div>

        {isOwner ? (
          <div className="mt-5">
            <label
              htmlFor="resolution-target"
              className="mb-1.5 block text-sm font-medium text-zinc-700"
            >
              New Ethereum address
            </label>

            <input
              id="resolution-target"
              type="text"
              value={target}
              disabled={
                updating
              }
              onChange={(event) =>
                setTarget(
                  event.target.value
                )
              }
              placeholder="0x..."
              className="h-11 w-full rounded-xl border border-zinc-200 px-3.5 font-mono text-sm outline-none transition focus:border-[#0047AB] disabled:opacity-50"
            />

            <button
              type="button"
              disabled={
                updating ||
                !target.trim()
              }
              onClick={
                handleSubmit
              }
              className="mt-3 inline-flex h-11 items-center justify-center rounded-xl bg-[#0047AB] px-5 text-sm font-semibold text-white transition hover:bg-[#003a8c] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {updating
                ? "Updating…"
                : "Update resolution"}
            </button>
          </div>
        ) : (
          <p className="mt-5 rounded-xl bg-zinc-50 p-4 text-sm text-zinc-600">
            Only the domain owner can change this resolution address.
          </p>
        )}

        {lastUpdateTxHash && (
          <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
              <CheckCircle2 className="size-4" />
              Resolution updated
            </div>

            <p className="mt-2 break-all font-mono text-xs text-emerald-800">
              {lastUpdateTxHash}
            </p>
          </div>
        )}
      </section>
    )
  }