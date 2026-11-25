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
