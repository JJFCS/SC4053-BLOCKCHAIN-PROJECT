import {
    useEffect,
    useState,
    type FormEvent,
  } from "react"
  
  import {
    CheckCircle2,
    Link,
    Wallet,
  } from "lucide-react"
  
  import {
    isAddress,
  } from "ethers"
  
  import {
    Button,
    Card,
    Field,
    Notice,
  } from "./primitives"
  
  import {
    shortenHex,
    type DomainInfo,
  } from "./handlers"
  
  export function ResolutionSection({
    domain,
    account,
    updating,
    lastUpdateTxHash,
    onUpdate,
  }: {
    domain: DomainInfo | null
  
    account: string | null
  
    updating: boolean
  
    lastUpdateTxHash: string | null
  
    onUpdate: (
      name: string,
      target: string
    ) => void
  }) {
    const [
      target,
      setTarget,
    ] = useState("")
  
    /*
      Whenever the searched domain changes,
      populate the input with its current
      resolution address.
    */
    useEffect(() => {
      if (
        domain?.resolutionAddress
      ) {
        setTarget(
          domain.resolutionAddress
        )
      } else {
        setTarget("")
      }
    }, [
      domain?.name,
      domain?.resolutionAddress,
    ])
  
    /*
      Resolution management only makes sense
      once a domain has been finalized.
    */
    if (
      !domain ||
      domain.status !==
        "registered"
    ) {
      return (
        <Card
          title="Resolution address"
          icon={
            <Link className="size-4" />
          }
          description="Domain owners can choose which Ethereum address their .ntu name resolves to."
        >
          <div className="rounded-xl border border-dashed border-zinc-200 px-4 py-8 text-center">
            <p className="text-sm text-zinc-600">
              Search for a registered .ntu domain to manage its resolution address.
            </p>
          </div>
        </Card>
      )
    }
  
    const owner =
      domain.owner
  
    const isOwner =
      !!account &&
      !!owner &&
      account.toLowerCase() ===
        owner.toLowerCase()
  
    const validAddress =
      isAddress(
        target
      )
  
    const unchanged =
      !!domain.resolutionAddress &&
      target.toLowerCase() ===
        domain.resolutionAddress.toLowerCase()
  
    const canSubmit =
      isOwner &&
      validAddress &&
      !unchanged
  
    const handleSubmit =
      (
        event:
          FormEvent
      ) => {
        event.preventDefault()
  
        if (
          !canSubmit
        ) {
          return
        }
  
        onUpdate(
          domain.name,
          target
        )
      }
  
    return (
      <Card
        title="Resolution address"
        icon={
          <Link className="size-4" />
        }
        description="Choose the Ethereum address that this .ntu name resolves to."
      >
        <div className="mb-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Domain
            </p>
  
            <p className="mt-1 font-mono text-sm font-semibold text-zinc-900">
              {domain.name}
              <span className="text-[#0047AB]">
                .ntu
              </span>
            </p>
          </div>
  
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Owner
            </p>
  
            <p className="mt-1 font-mono text-sm font-semibold text-zinc-900">
              {owner
                ? shortenHex(
                    owner,
                    6
                  )
                : "—"}
            </p>
          </div>
        </div>
  
        {domain.resolutionAddress && (
          <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-[#0047AB]">
              Currently resolves to
            </p>
  
            <p className="mt-1 break-all font-mono text-sm font-semibold text-zinc-900">
              {
                domain.resolutionAddress
              }
            </p>
          </div>
        )}
  
        {!account && (
          <div className="mb-4">
            <Notice tone="warn">
              Connect the owner wallet to change this domain's resolution address.
            </Notice>
          </div>
        )}
  
        {account &&
          !isOwner && (
            <div className="mb-4">
              <Notice tone="warn">
                This wallet does not own{" "}
                <span className="font-mono">
                  {domain.name}.ntu
                </span>
                . Only the domain owner can change its resolution address.
              </Notice>
            </div>
          )}
  
        {isOwner && (
          <div className="mb-4">
            <Notice tone="success">
              <Wallet className="mr-1 inline size-4" />
              Connected as the owner of{" "}
              <span className="font-mono">
                {domain.name}.ntu
              </span>
              .
            </Notice>
          </div>
        )}
  
        <form
          onSubmit={
            handleSubmit
          }
          className="flex flex-col gap-4"
        >
          <Field
            id="resolution-address"
            label="Resolution address"
            placeholder="0x..."
            value={
              target
            }
            onChange={(
              event
            ) =>
              setTarget(
                event.target.value.trim()
              )
            }
            disabled={
              !isOwner
            }
            autoComplete="off"
            spellCheck={
              false
            }
            hint={
              target &&
              !validAddress
                ? "Enter a valid Ethereum address."
                : unchanged
                  ? "This is already the current resolution address."
                  : "Payments to this .ntu name will be sent to this address."
            }
          />
  
          <Button
            type="submit"
            className="w-full sm:w-auto sm:self-end"
            loading={
              updating
            }
            disabled={
              !canSubmit
            }
          >
            <Link className="size-4" />
  
            Update resolution address
          </Button>
        </form>
  
        {lastUpdateTxHash && (
          <div className="mt-4">
            <Notice tone="success">
              <CheckCircle2 className="mr-1 inline size-4" />
              Resolution address updated successfully. Tx{" "}
              <span className="font-mono">
                {shortenHex(
                  lastUpdateTxHash,
                  6
                )}
              </span>
            </Notice>
          </div>
        )}
  
        <div className="mt-4">
          <Notice>
            Updating the resolution address does not transfer ownership of the domain. The owner remains the same; only the address used for .ntu resolution and payments changes.
          </Notice>
        </div>
      </Card>
    )
  }