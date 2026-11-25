import { describe, expect, it } from 'vitest'
import type { EmulatorBridge } from '../../emulator/emulator-bridge'
import type { EmulatorSessionInfo } from '../../emulator/emulator-types'
import type { RuntimeEmulatorCommandHost } from './runtime-emulator-commands'
import { RuntimeEmulatorAttach } from './runtime-emulator-attach'

const agentAndroid: EmulatorSessionInfo = {
  deviceUdid: 'emulator-5554',
  streamUrl: 'scrcpy://emulator-5554',
  backend: 'android'
}

/** A workspace whose agent attached an Android emulator, whose stream may have exited since. */
function agentWorkspace(reusable: boolean) {
  const stopped: string[] = []
  const bridge = {
    getActiveForWorktree: () => agentAndroid,
    getReusableActiveForWorktree: async () => (reusable ? agentAndroid : null),
    listAllDevices: async () => [
      { id: 'IOS-1', name: 'iPhone', backend: 'ios', state: 'booted', isAvailable: true },
      { id: 'emulator-5554', name: 'Pixel', backend: 'android', state: 'booted', isAvailable: true }
    ],
    stopActiveForSwitch: async (worktreeId: string) => void stopped.push(worktreeId),
    acquireHelperForDevice: async () => {
      throw new Error('no device should start')
    }
  } as unknown as EmulatorBridge
  const host = {
    getSettings: () => ({}),
    resolveEmulatorWorkspaceId: async (selector: string) => selector
  } as unknown as RuntimeEmulatorCommandHost
  const attach = new RuntimeEmulatorAttach(
    host,
    () => bridge,
    () => {}
  )
  return { attach, stopped }
}

describe('a backend-limited emulator attach', () => {
  it.each([true, false])(
    "never switches away another backend's session (stream live: %s)",
    async (reusable) => {
      const { attach, stopped } = agentWorkspace(reusable)

      await expect(
        attach.attach({ worktree: 'wt', backend: 'ios', userInitiated: true })
      ).rejects.toMatchObject({ code: 'emulator_backend_unsupported' })
      await expect(
        attach.attach({ worktree: 'wt', backend: 'ios', device: 'emulator-5554' })
      ).rejects.toMatchObject({ code: 'emulator_backend_unsupported' })
      expect(stopped).toEqual([])
    }
  )
})
