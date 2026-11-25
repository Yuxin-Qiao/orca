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

/** A session's forward: listed, never saved. */
export function isHeldPairedPortForward(id: string): boolean {
  return holdersById.has(id)
}

/** The forward is a person's now, or gone; true when it was a session's. */
export function dropPairedPortForwardHolds(id: string): boolean {
  return holdersById.delete(id)
}

/** The forwards `holder` holds. */
export function pairedPortForwardsHeldBy(holder: string): string[] {
  return [...holdersById].filter(([, holders]) => holders.has(holder)).map(([id]) => id)
}

/** `holder` lets go; true when nobody holds the forward now, so it should close. Run it in the
 *  forward's server queue, so it sees every join and adoption queued before it. */
export function letGoOfPairedPortForward(id: string, holder: string): boolean {
  const holders = holdersById.get(id)
  if (!holders?.delete(holder) || holders.size > 0) {
    return false
  }
  holdersById.delete(id)
  return true
}
