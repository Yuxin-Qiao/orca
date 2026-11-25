// Forwards one running session made for itself (one Mobile Emulator attach): each has that session as
// its only owner, is listed while open, is never saved or shared, and closes when the session ends.
const sessionByForwardId = new Map<string, string>()
// An ensure still queued when its session ends must not open a forward afterwards.
const endedSessions = new Set<string>()
// Only an ensure in flight can name an ended session, so the most recent ones suffice.
const MAX_ENDED_SESSIONS = 256

/** The session that owns the forward; undefined for a person's forward. */
export function pairedPortForwardSession(id: string): string | undefined {
  return sessionByForwardId.get(id)
}

/** The forward of `remotePort` that `session` owns, or a person's when `session` is undefined. */
export function forwardsPortFor(
  entry: { id: string; remotePort: number },
  remotePort: number,
  session: string | undefined
): boolean {
  return entry.remotePort === remotePort && sessionByForwardId.get(entry.id) === session
}

/** Gives a new forward to `session`; false when the session already ended, so the caller closes it. */
export function ownPairedPortForward(id: string, session: string): boolean {
  if (endedSessions.has(session)) {
    return false
  }
  sessionByForwardId.set(id, session)
  return true
}

/** The forward is a person's now, or gone. */
export function dropPairedPortForwardSession(id: string): void {
  sessionByForwardId.delete(id)
}

/** Ends `session`: it opens nothing more, and returns the forwards it owns for the caller to close. */
export function endPairedPortForwardSession(session: string): string[] {
  endedSessions.add(session)
  if (endedSessions.size > MAX_ENDED_SESSIONS) {
    endedSessions.delete(endedSessions.values().next().value!)
  }
  return [...sessionByForwardId].filter(([, owner]) => owner === session).map(([id]) => id)
}
