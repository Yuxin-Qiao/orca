import { activateAiVaultStructuredSession } from '@/lib/agent-session/open/activate-ai-vault-structured-session'
import { targetBotChatLatest } from '@/lib/agent-session/open/bot-link-item-target'
import { botTarget, callBotRpc } from '@/lib/bot-hosts'
import { openBotHome } from '@/lib/bot-catalog'
import { runtimeTargetEnvironmentId } from '@/runtime/rpc/targets/runtime-client-target'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host/execution-host'
import { selectFocusedChatTab } from '@/lib/focused-chat-workers'
import { useAppStore } from '@/store'
import { requestNativeChatComposerFocus } from '@/components/native-chat/composer/focus/native-chat-composer-focus-intent'
import type { Bot } from '../../../../shared/bot-types'
import { folderWorkspaceKey } from '../../../../shared/workspace/identity/workspace-scope'

/** A server bot's chat tabs reach this window only through its home's workspace stream, so the
 *  home opens here first, as a Slack link's does. This computer's bots publish their tabs directly. */
async function openServerBotHome(bot: Bot): Promise<void> {
  if (bot.hostId === LOCAL_EXECUTION_HOST_ID || openBotHome(bot)) {
    return
  }
  // The home must be in the catalog before it can open.
  await useAppStore
    .getState()
    .fetchFolderWorkspaces({ runtimeEnvironmentId: runtimeTargetEnvironmentId(botTarget(bot)) })
  openBotHome(bot)
}

/** Opens one of the bot's chats as a focused tab, on the host that runs the bot. */
export async function openBotChatTab(bot: Bot, sessionId: string): Promise<boolean> {
  await openServerBotHome(bot)
  return activateAiVaultStructuredSession(
    { structuredSession: { sessionId, workspaceId: folderWorkspaceKey(bot.folderWorkspaceId) } },
    undefined,
    botTarget(bot)
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
