import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store/index'
import { callRuntimeRpc } from '@/runtime/rpc/calls/runtime-rpc-call'
import { runtimeEnvironmentSupportsCapability } from '@/runtime/rpc/compatibility/runtime-capability-proof'
import { selectExecutionHostDisplayLabel } from '@/runtime/hosts/display/execution-host-display-label'
import { NETWORK_PORT_FORWARD_RUNTIME_CAPABILITY } from '../../../../../shared/remote-runtime/protocol/workspace-ports-runtime-capabilities'
import { toRuntimeExecutionHostId } from '../../../../../shared/execution-host/execution-host'
import { isLoopbackBrowserUrl } from '../../../../../shared/browser/navigation/loopback-browser-url'
import type { RuntimeClientTarget } from '../../../../../shared/remote-runtime/host-catalog/runtime-client-target'
import type {
  EmulatorStreamInfo,
  SimulatorDeviceRow
} from '@/components/emulator-pane/session/emulator-pane-types'
import { scrcpyDeviceIdFromStreamUrl } from '@/components/emulator-pane/streaming/emulator-scrcpy-stream-url'
import { formatSimulatorTabLabel } from '../tabs/simulator-tab-label'
import { emulatorRuntimeTarget } from './emulator-runtime-target'
import { hasRuntimeRpcErrorCode } from '../../../../../shared/remote-runtime/rpc/runtime-rpc-error-code'
import { createNonSecureContextUuid } from '../../../../../shared/identifiers/non-secure-context-uuid'

function serverLabel(environmentId: string): string {
  return selectExecutionHostDisplayLabel(
    useAppStore.getState(),
    toRuntimeExecutionHostId(environmentId)
  )
}

/** Android on a paired server streams over scrcpy, which has no port to forward here yet. */
function serverAndroidUnsupportedError(environmentId: string): Error {
  return new Error(
    translate(
      'auto.lib.simulator.runtime.emulatorRuntimeAttach.serverAndroid',
      "Android emulators on {{host}} aren't supported yet. Pick an iOS simulator.",
      { host: serverLabel(environmentId) }
    )
  )
}

async function assertServerStreamForwardable(environmentId: string): Promise<void> {
  const supported =
    window.api?.runtimeEnvironments?.portForwards !== undefined &&
    (await runtimeEnvironmentSupportsCapability(
      environmentId,
      NETWORK_PORT_FORWARD_RUNTIME_CAPABILITY
    ).catch(() => false))
  if (!supported) {
    throw new Error(
      translate(
        'auto.lib.simulator.runtime.emulatorRuntimeAttach.updateServer',
        "Couldn't show {{host}}'s simulator here. Update Orca on {{host}} and try again.",
        { host: serverLabel(environmentId) }
      )
    )
  }
}

type StreamSession = {
  session: string
  environmentId: string
  forwardIds: string[]
  deviceUdid?: string
}

/** Each server workspace's live stream: the forwards its latest attach opened, which close when it ends. */
const streamSessions = new Map<string, StreamSession>()
const latestAttach = new Map<string, number>()
let watchingForwards = false

export const EMULATOR_STREAM_LOST_EVENT = 'orca:emulator-stream-lost'

function endStreamSession(session: string): void {
  void window.api?.runtimeEnvironments?.portForwards?.endSession({ session }).catch(() => {})
}

/** A server disconnect closes every forward to it; the pane then shows Connect, not a frozen picture. */
function watchStreamForwards(): void {
  const api = window.api.runtimeEnvironments.portForwards
  if (watchingForwards || !api) {
    return
  }
  watchingForwards = true
  api.onChanged(({ environmentId, forwards }) => {
    const open = new Set(forwards.map((entry) => entry.id))
    for (const [worktreeId, live] of streamSessions) {
      if (live.environmentId === environmentId && !live.forwardIds.some((id) => open.has(id))) {
        releaseEmulatorStreamForwards(worktreeId)
        window.dispatchEvent(
          new CustomEvent(EMULATOR_STREAM_LOST_EVENT, { detail: { worktreeId } })
        )
      }
    }
  })
}

/** The server's helper URLs name its own loopback; each is rewritten to a forward of its port here,
 *  opened for this attach alone so it closes when the attach is replaced or ends. */
async function forwardServerStreamInfo(
  environmentId: string,
  worktreeId: string,
  info: EmulatorStreamInfo,
  attach: number
): Promise<EmulatorStreamInfo> {
  const api = window.api.runtimeEnvironments.portForwards!
  watchStreamForwards()
  const session = createNonSecureContextUuid()
  const forwardIds: string[] = []
  const forward = async (raw: string | undefined): Promise<string | undefined> => {
    // A ws: control URL names the same helper; read it as http to check its host.
    if (!raw || !isLoopbackBrowserUrl(raw.replace(/^ws/, 'http'))) {
      return undefined
    }
    const url = new URL(raw)
    const { entry } = await api.ensure({
      environmentId,
      remotePort: Number(url.port) || 80,
      label: formatSimulatorTabLabel(null),
      session
    })
    forwardIds.push(entry.id)
    url.hostname = '127.0.0.1'
    url.port = String(entry.localPort)
    return url.toString()
  }
  try {
    const [streamUrl, url, wsUrl] = await Promise.all([
      forward(info.streamUrl),
      forward(info.url),
      forward(info.wsUrl)
    ])
    // A newer attach of this workspace owns its stream; the pane discards this result.
    if (latestAttach.get(worktreeId) !== attach) {
      endStreamSession(session)
      return info
    }
    releaseEmulatorStreamForwards(worktreeId)
    streamSessions.set(worktreeId, {
      session,
      environmentId,
      forwardIds,
      deviceUdid: info.deviceUdid
    })
    return { ...info, streamUrl, url, wsUrl }
  } catch (error) {
    endStreamSession(session)
    throw error
  }
}

/** Closes the stream forwards of a server workspace's simulator once its session has ended. */
export function releaseEmulatorStreamForwards(worktreeId: string): void {
  const live = streamSessions.get(worktreeId)
  streamSessions.delete(worktreeId)
  if (live) {
    endStreamSession(live.session)
  }
}

/** Refuses a server's Android device before anything stops or boots: its picture can't reach here. */
export function assertEmulatorDeviceShownHere(
  target: RuntimeClientTarget,
  devices: readonly SimulatorDeviceRow[],
  device: string | undefined
): void {
  if (
    target.kind === 'environment' &&
    device &&
    devices.some((d) => d.backend === 'android' && (d.udid === device || d.name === device))
  ) {
    throw serverAndroidUnsupportedError(target.environmentId)
  }
}

/** `emulator.attach` on the host that owns the workspace, with stream URLs this desktop can dial. */
export async function attachEmulatorOnRuntime<TResult extends { info?: EmulatorStreamInfo }>(
  worktreeId: string,
  params: Record<string, unknown>,
  target: RuntimeClientTarget = emulatorRuntimeTarget(worktreeId)
): Promise<TResult> {
  if (target.kind === 'local') {
    return callRuntimeRpc<TResult>(target, 'emulator.attach', { ...params, worktree: worktreeId })
  }
  // Checked first, so a server that can't stream here never boots a simulator for this pane.
  await assertServerStreamForwardable(target.environmentId)
  const attach = (latestAttach.get(worktreeId) ?? 0) + 1
  latestAttach.set(worktreeId, attach)
  const result = await callRuntimeRpc<TResult>(target, 'emulator.attach', {
    ...params,
    backend: 'ios',
    worktree: worktreeId
  }).catch((error: unknown) => {
    // Switching devices stops the old one on the server first, so its stream is gone either way.
    if (params.device && params.device !== streamSessions.get(worktreeId)?.deviceUdid) {
      releaseEmulatorStreamForwards(worktreeId)
    }
    throw hasRuntimeRpcErrorCode(error, 'emulator_backend_unsupported')
      ? serverAndroidUnsupportedError(target.environmentId)
      : error
  })
  if (!result.info) {
    return result
  }
  if (scrcpyDeviceIdFromStreamUrl(result.info.streamUrl)) {
    // A server older than the backend filter handed back Android. It may be an agent's session, so
    // it is left running.
    releaseEmulatorStreamForwards(worktreeId)
    throw serverAndroidUnsupportedError(target.environmentId)
  }
  return {
    ...result,
    info: await forwardServerStreamInfo(target.environmentId, worktreeId, result.info, attach)
  }
}
