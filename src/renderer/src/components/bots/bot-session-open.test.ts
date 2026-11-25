import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  admit: vi.fn(),
  fetchFolderWorkspaces: vi.fn(),
  activate: vi.fn(),
  unavailable: vi.fn(),
  callBotRpc: vi.fn()
}))

vi.mock('@/lib/workspace/activation/worktree-activation', () => ({
  activateAndRevealFolderWorkspaceWithOutcome: mocks.admit
}))
vi.mock('@/lib/agent-session/open/activate-ai-vault-structured-session', () => ({
  activateAiVaultStructuredSession: mocks.activate
}))
vi.mock('@/lib/agent-session/open/chat-open-failure-toast', () => ({
  showChatOpenUnavailable: mocks.unavailable
}))
vi.mock('@/lib/agent-session/open/bot-link-item-target', () => ({ targetBotChatLatest: vi.fn() }))
vi.mock('@/lib/focused-chat-workers', () => ({ selectFocusedChatTab: vi.fn() }))
vi.mock('@/components/native-chat/composer/focus/native-chat-composer-focus-intent', () => ({
  requestNativeChatComposerFocus: vi.fn()
}))
vi.mock('@/lib/bot-hosts', () => ({
  botTarget: (bot: { hostId: string }) =>
    bot.hostId === 'local'
      ? { kind: 'local' }
      : { kind: 'environment', environmentId: bot.hostId.replace('runtime:', '') },
  callBotRpc: mocks.callBotRpc
}))
vi.mock('@/runtime/rpc/targets/runtime-client-target', () => ({
  runtimeTargetEnvironmentId: (target: { kind: string; environmentId?: string }) =>
    target.kind === 'environment' ? target.environmentId : null
}))
vi.mock('@/store', () => ({
  useAppStore: { getState: () => ({ fetchFolderWorkspaces: mocks.fetchFolderWorkspaces }) }
}))

import { openBotChatTab } from './bot-session-open'

const opened = { opened: {} }
const missing = { refused: { reason: 'workspace-missing', failureNotified: false } }
const blocked = { refused: { reason: 'path-blocked', failureNotified: true } }

const serverBot = { folderWorkspaceId: 'home-1', hostId: 'runtime:env-1' } as const

describe('openBotChatTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.activate.mockResolvedValue(true)
  })

  it('opens a server bot Home before the chat, on the bot’s host', async () => {
    mocks.admit.mockReturnValue(opened)
    await expect(openBotChatTab(serverBot, 'chat-1')).resolves.toBe(true)
    expect(mocks.admit).toHaveBeenCalledWith('home-1', {
      executionHostId: 'runtime:env-1',
      revealInSidebar: false
    })
    expect(mocks.activate).toHaveBeenCalledWith(
      { structuredSession: { sessionId: 'chat-1', workspaceId: 'folder:home-1' } },
      undefined,
      { kind: 'environment', environmentId: 'env-1' },
      expect.any(Function)
    )
  })

  it('offers Retry when the Home list failed, and Retry opens the same chat once it loads', async () => {
    mocks.admit.mockReturnValue(missing)
    mocks.fetchFolderWorkspaces.mockRejectedValueOnce(new Error('list failed'))
    await expect(openBotChatTab(serverBot, 'chat-1')).resolves.toBe(false)
    // The chat open never ran against a Home that is not here.
    expect(mocks.activate).not.toHaveBeenCalled()
    expect(mocks.unavailable).toHaveBeenCalledTimes(1)
    const { retry, detail } = mocks.unavailable.mock.calls[0][0]
    expect(detail).toBe("The bot's home did not open on this computer.")

    // The server's folder list answers now; Retry loads the Home, then opens the same chat.
    mocks.fetchFolderWorkspaces.mockImplementationOnce(async () => {
      mocks.admit.mockReturnValue(opened)
    })
    retry()
    await vi.waitFor(() => expect(mocks.activate).toHaveBeenCalledTimes(1))
    expect(mocks.activate.mock.calls[0][0]).toEqual({
      structuredSession: { sessionId: 'chat-1', workspaceId: 'folder:home-1' }
    })
    // Recovery never starts or resets a chat on the host.
    expect(mocks.callBotRpc).not.toHaveBeenCalled()
  })

  it('a failed chat open’s Retry repeats the Home step too', async () => {
    mocks.admit.mockReturnValue(opened)
    await openBotChatTab(serverBot, 'chat-1')
    const retry: unknown = mocks.activate.mock.calls[0][3]
    mocks.admit.mockClear()
    expect(retry).toBeTypeOf('function')
    if (typeof retry === 'function') {
      await retry()
    }
    expect(mocks.admit).toHaveBeenCalledTimes(1)
    expect(mocks.activate).toHaveBeenCalledTimes(2)
    expect(mocks.activate.mock.calls[1][0]).toEqual(mocks.activate.mock.calls[0][0])
  })

  it('stops without a second notice when the Home refusal already explained itself', async () => {
    mocks.admit.mockReturnValue(blocked)
    await expect(openBotChatTab(serverBot, 'chat-1')).resolves.toBe(false)
    expect(mocks.unavailable).not.toHaveBeenCalled()
    expect(mocks.activate).not.toHaveBeenCalled()
  })

  it('opens a bot on this computer without a Home step', async () => {
    const localBot = { ...serverBot, hostId: 'local' } as const
    await openBotChatTab(localBot, 'chat-1')
    expect(mocks.admit).not.toHaveBeenCalled()
    expect(mocks.activate).toHaveBeenCalledTimes(1)
  })
})
