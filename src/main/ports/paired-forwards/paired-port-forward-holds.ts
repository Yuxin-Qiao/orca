// Forwards running sessions made for themselves (the Mobile Emulator's stream), by the sessions
// holding each: listed while held, never saved, closed once the last holder lets go.
const holdersById = new Map<string, Set<string>>()

/** `holder` keeps the forward; a forward nobody holds yet is held only when `create` is set, so a
 *  session never takes over a forward a person made. */
export function holdPairedPortForward(id: string, holder: string, create: boolean): void {
  const holders = holdersById.get(id)
  if (holders) {
    holders.add(holder)
  } else if (create) {
    holdersById.set(id, new Set([holder]))
  }
}

export function isHeldPairedPortForward(id: string): boolean {
  return holdersById.has(id)
}

/** A person's ensure or edit makes a held forward theirs; true when it was held. */
export function adoptHeldPairedPortForward(id: string): boolean {
  return holdersById.delete(id)
}

/** Drops `holder` from these forwards; returns the ones nobody holds now, for the caller to close. */
export function releasePairedPortForwardHolds(holder: string, ids: readonly string[]): string[] {
  return ids.filter((id) => {
    const holders = holdersById.get(id)
    if (!holders?.delete(holder) || holders.size > 0) {
      return false
    }
    holdersById.delete(id)
    return true
  })
}
