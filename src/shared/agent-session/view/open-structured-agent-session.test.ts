import { describe, expect, it } from 'vitest'
import {
  openStructuredAgentSession,
  type StructuredSessionOpenDeps,
  type StructuredSessionOpenTab
} from './open-structured-agent-session'

const target = { sessionId: 'session-1', worktreeId: 'folder:bot-home' }

/** A paired server: its tabs reach this window through a stream, after reveal and refresh answer. */
function pairedHost(): {
  deps: StructuredSessionOpenDeps
  deliver: () => void
} {
  let tabs: StructuredSessionOpenTab[] = []
  const waiters: (() => void)[] = []
  const deps: StructuredSessionOpenDeps = {
    locate: async () => ({ location: { kind: 'chat', ...target } }),
    tabs: () => tabs,
    refresh: async () => {},
    activate: () => true,
    reveal: async () => {
      // The host published the tab; this window sees it once the stream delivers it.
      setTimeout(deliver, 0)
      return target
    },
    awaitTab: () => new Promise<void>((resolve) => waiters.push(resolve))
  }
  const deliver = (): void => {
    tabs = [{ id: 'agent-session:session-1', sessionId: 'session-1' }]
    waiters.splice(0).forEach((resolve) => resolve())
  }
  return { deps, deliver }
}

describe('openStructuredAgentSession', () => {
  it('opens a revealed chat whose tab arrives after the reveal answered', async () => {
    const { deps } = pairedHost()
    const result = await openStructuredAgentSession(
      {
        kind: 'history',
        structuredSession: { ...target, workspaceId: target.worktreeId }
      },
      deps
    )
    expect(result).toMatchObject({
      kind: 'opened',
      tab: { sessionId: 'session-1' }
    })
  })

  it('still fails when the tab never arrives', async () => {
    const { deps } = pairedHost()
    const result = await openStructuredAgentSession(
      {
        kind: 'history',
        structuredSession: { ...target, workspaceId: target.worktreeId }
      },
      { ...deps, reveal: async () => target, awaitTab: async () => {} }
    )
    expect(result).toMatchObject({
      kind: 'failed',
      failure: {
        reason: 'unreachable',
        detail: 'The chat tab did not appear after it was revealed.'
      }
    })
  })
})
