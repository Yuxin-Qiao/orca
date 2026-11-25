import { afterEach, describe, expect, it, vi } from 'vitest'
import { waitForStructuredSessionTab } from './wait-for-structured-session-tab'

function store(): {
  subscribe: (listener: () => void) => () => void
  emit: () => void
  size: () => number
} {
  const listeners = new Set<() => void>()
  return {
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    emit: () => listeners.forEach((listener) => listener()),
    size: () => listeners.size
  }
}

describe('waitForStructuredSessionTab', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('settles when a store change brings the tab, and stops listening', async () => {
    const changes = store()
    let present = false
    const waiting = waitForStructuredSessionTab(() => present, changes.subscribe, 5_000)
    present = true
    changes.emit()
    await waiting
    expect(changes.size()).toBe(0)
  })

  it('settles at the timeout when the tab never arrives', async () => {
    vi.useFakeTimers()
    const changes = store()
    let settled = false
    const waiting = waitForStructuredSessionTab(() => false, changes.subscribe, 5_000).then(() => {
      settled = true
    })
    changes.emit()
    await Promise.resolve()
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(5_000)
    await waiting
    expect(settled).toBe(true)
    expect(changes.size()).toBe(0)
  })
})
