import { useAppStore } from '@/store/index'
import { selectFrontTab } from '@/store/slices/tabs/active-tab-selection'
import type { RuntimeClientTarget } from '../../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import {
  createPairedRevealedTabWait,
  type StructuredSessionOpenSelection
} from './wait-for-structured-session-tab'

// Matches the open's other host round-trips; past it the open reports that the tab never appeared.
const PAIRED_REVEALED_TAB_WAIT_MS = 5_000

type OpenTarget = { sessionId: string; worktreeId: string }

function frontSelection(target: OpenTarget): StructuredSessionOpenSelection {
  const state = useAppStore.getState()
  const front = selectFrontTab(state)
  const workspace = state.activeWorkspaceKey ?? state.activeWorktreeId
  return {
    key: [state.activeView, workspace, state.activeWorkspaceExecutionHostId, front?.id].join('\0'),
    showsTarget:
      front?.contentType === 'agent-session' &&
      front.entityId === target.sessionId &&
      front.worktreeId === target.worktreeId
  }
}

/** One desktop open's wait for a paired server's revealed tab, bound to this window's store. */
export function pairedRevealedTabWait(
  owner: RuntimeClientTarget,
  tabs: (target: OpenTarget, owner: RuntimeClientTarget) => readonly { sessionId: string }[]
): ReturnType<typeof createPairedRevealedTabWait> {
  return createPairedRevealedTabWait({
    paired: owner.kind === 'environment',
    hasTab: (target) => tabs(target, owner).some((row) => row.sessionId === target.sessionId),
    selection: frontSelection,
    subscribe: (listener) => useAppStore.subscribe(listener),
    timeoutMs: PAIRED_REVEALED_TAB_WAIT_MS
  })
}
