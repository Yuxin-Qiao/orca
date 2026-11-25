import { activateAiVaultStructuredSession } from '@/lib/agent-session/open/activate-ai-vault-structured-session'
import { targetBotChatLatest } from '@/lib/agent-session/open/bot-link-item-target'
import { botTarget, callBotRpc } from '@/lib/bot-hosts'
import { activateAndRevealFolderWorkspaceWithOutcome } from '@/lib/workspace/activation/worktree-activation'
import { showChatOpenUnavailable } from '@/lib/agent-session/open/chat-open-failure-toast'
import { runtimeTargetEnvironmentId } from '@/runtime/rpc/targets/runtime-client-target'
import {
  LOCAL_EXECUTION_HOST_ID,
  type ExecutionHostId
} from '../../../../shared/execution-host/execution-host'
import { selectFocusedChatTab } from '@/lib/focused-chat-workers'
import { useAppStore } from '@/store'
import { requestNativeChatComposerFocus } from '@/components/native-chat/composer/focus/native-chat-composer-focus-intent'
import type { Bot } from '../../../../shared/bot-types'
import { folderWorkspaceKey } from '../../../../shared/workspace/identity/workspace-scope'

/** Raw cause for the open toast's details, like the open path's own causes. */
const HOME_DID_NOT_OPEN = "The bot's home did not open on this computer."

function admitHome(bot: Bot): ReturnType<typeof activateAndRevealFolderWorkspaceWithOutcome> {
  return activateAndRevealFolderWorkspaceWithOutcome(bot.folderWorkspaceId, {
    executionHostId: bot.hostId,
    // Bots are not rows of the workspace list, so there is nothing there to reveal.
    revealInSidebar: false
  })
}

/** A server bot's chat tabs reach this window only through its home's workspace stream, so the
 *  home opens here first, as a Slack link's does. This computer's bots publish their tabs directly.
 *  `notified`: the refusal already told the user why (a blocked folder path). */
async function admitServerBotHome(bot: Bot): Promise<'opened' | 'refused' | 'notified'> {
  // The catalog stamps each bot with the host that listed it; the wire schema only knows this one.
  const hostId: ExecutionHostId = bot.hostId
  if (hostId === LOCAL_EXECUTION_HOST_ID) {
    return 'opened'
  }
  let outcome = admitHome(bot)
  if ('refused' in outcome && outcome.refused.reason === 'workspace-missing') {
    // The home must be in the catalog before it can open; a failed read leaves it refused.
    try {
      await useAppStore
        .getState()
        .fetchFolderWorkspaces({ runtimeEnvironmentId: runtimeTargetEnvironmentId(botTarget(bot)) })
    } catch {
      /* Reported below as a home that did not open, with Retry. */
    }
    outcome = admitHome(bot)
  }
  return 'opened' in outcome ? 'opened' : outcome.refused.failureNotified ? 'notified' : 'refused'
}

/** Opens one of the bot's chats as a focused tab, on the host that runs the bot. Retry repeats both
 *  steps for this same chat, so a home that failed to load gets another try and nothing starts anew. */
export async function openBotChatTab(bot: Bot, sessionId: string): Promise<boolean> {
  const retry = (): Promise<boolean> => openBotChatTab(bot, sessionId)
  const home = await admitServerBotHome(bot)
  if (home !== 'opened') {
    if (home === 'refused') {
      showChatOpenUnavailable({
        detail: HOME_DID_NOT_OPEN,
        retry: () => void retry().catch(() => {})
      })
    }
    return false
  }
  return activateAiVaultStructuredSession(
    { structuredSession: { sessionId, workspaceId: folderWorkspaceKey(bot.folderWorkspaceId) } },
    undefined,
    botTarget(bot),
    retry
  )
}

/** Opening a chat without a tab reveals it, which marks its thread seen; activating its open tab here
 *  doesn't, so this says so. An older host has no such method and keeps the thread new. */
async function markSeen(bot: Bot, sessionIds: string[]): Promise<void> {
  if (sessionIds.length > 0) {
    await callBotRpc(bot, 'bots.chats.seen', { sessionIds }).catch(() => undefined)
  }
}

/** The chat's tab when it is the one on screen, where activating it again would change nothing. */
function shownChatTab(bot: Bot, sessionId: string): { id: string } | null {
  const state = useAppStore.getState()
  const workspaceId = folderWorkspaceKey(bot.folderWorkspaceId)
  if (state.activeView !== 'terminal' || state.activeWorktreeId !== workspaceId) {
    return null
  }
  const tab = selectFocusedChatTab(state, workspaceId)
  return tab?.entityId === sessionId ? tab : null
}

/** Opens one of the bot's chats as a focused tab; a thread's or a run's gets its tab here. The chat
 *  already on screen goes to its newest output, its composer focused with the usual glow. */
export function openBotSession(bot: Bot, sessionId: string): void {
  const shown = shownChatTab(bot, sessionId)
  if (shown) {
    targetBotChatLatest(sessionId)
    requestNativeChatComposerFocus(shown.id, { revealDraft: true })
    return
  }
  void openBotChatTab(bot, sessionId).then((opened) =>
    opened ? markSeen(bot, [sessionId]) : undefined
  )
}
