/**
 * Settles once `present()` holds, re-checked on every store change, or after `timeoutMs`.
 * A paired server's chat tab reaches this window through its workspace stream, after the reveal replied.
 */
export function waitForStructuredSessionTab(
  present: () => boolean,
  subscribe: (listener: () => void) => () => void,
  timeoutMs: number
): Promise<void> {
  if (present()) {
    return Promise.resolve()
  }
  return new Promise<void>((resolve) => {
    let unsubscribe: (() => void) | null = null
    const finish = (): void => {
      clearTimeout(timer)
      unsubscribe?.()
      unsubscribe = null
      resolve()
    }
    const timer = setTimeout(finish, timeoutMs)
    unsubscribe = subscribe(() => {
      if (present()) {
        finish()
      }
    })
    // The tab may have landed between the first check and the subscription.
    if (present()) {
      finish()
    }
  })
}

type OpenTarget = { sessionId: string; worktreeId: string }

/** What the window shows: `key` changes with any newer selection; `showsTarget` when it is this chat. */
export type StructuredSessionOpenSelection = { key: string; showsTarget: boolean }

let latestDesktopOpen = 0

/**
 * The wait a paired server's revealed tab needs, and whether the open is still the user's latest choice.
 * Once the wait starts, a newer desktop open or any selection other than this chat supersedes it, so
 * its late tab never takes the selection, the focus or the workspace back. A local open never waits.
 */
export function createPairedRevealedTabWait(io: {
  paired: boolean
  hasTab: (target: OpenTarget) => boolean
  selection: (target: OpenTarget) => StructuredSessionOpenSelection
  subscribe: (listener: () => void) => () => void
  timeoutMs: number
}): { awaitTab: (target: OpenTarget) => Promise<void>; current: () => boolean } {
  const open = ++latestDesktopOpen
  let waited: { target: OpenTarget; key: string } | null = null
  return {
    awaitTab: (target) => {
      if (!io.paired) {
        return Promise.resolve()
      }
      waited = { target, key: io.selection(target).key }
      return waitForStructuredSessionTab(() => io.hasTab(target), io.subscribe, io.timeoutMs)
    },
    current: () => {
      if (!waited) {
        return true
      }
      const now = io.selection(waited.target)
      return open === latestDesktopOpen && (now.showsTarget || now.key === waited.key)
    }
  }
}
