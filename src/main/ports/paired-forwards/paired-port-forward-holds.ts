// Forwards running sessions made for themselves (the Mobile Emulator's stream), by the sessions
// holding each: listed while held, never saved, closed once the last holder lets go.
const holdersById = new Map<string, Set<string>>()

/** `holder` keeps the forward; a forward that isn't a session's is held only when `create` is set,
 *  so a session never takes over a forward a person made. */
export function holdPairedPortForward(id: string, holder: string, create: boolean): void {
  const holders = holdersById.get(id)
  if (holders) {
    holders.add(holder)
  } else if (create) {
    holdersById.set(id, new Set([holder]))
  }
}

/** A session's forward, including one its last holder let go that hasn't closed yet. */
export function isHeldPairedPortForward(id: string): boolean {
  return holdersById.has(id)
}

/** A let-go forward a session joined again before it closed. */
export function hasPairedPortForwardHolders(id: string): boolean {
  return (holdersById.get(id)?.size ?? 0) > 0
}

/** The forward is a person's now, or gone; true when it was a session's. */
export function dropPairedPortForwardHolds(id: string): boolean {
  return holdersById.delete(id)
}

/** Drops `holder` from these forwards; returns the ones nobody holds now, for the caller to close.
 *  They stay a session's until closed, so a session joining one meanwhile keeps it open. */
export function releasePairedPortForwardHolds(holder: string, ids: readonly string[]): string[] {
  return ids.filter((id) => {
    const holders = holdersById.get(id)
    return holders?.delete(holder) === true && holders.size === 0
  })
}
