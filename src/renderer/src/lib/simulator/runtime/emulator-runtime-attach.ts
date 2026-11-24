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

/** The server's helper URLs name its own loopback; each is rewritten to a forward of its port here. */
async function forwardServerStreamInfo(
  environmentId: string,
  info: EmulatorStreamInfo
): Promise<EmulatorStreamInfo> {
  if (scrcpyDeviceIdFromStreamUrl(info.streamUrl)) {
    throw serverAndroidUnsupportedError(environmentId)
  }
  const forward = async (raw: string | undefined): Promise<string | undefined> => {
    // A ws: control URL names the same helper; read it as http to check its host.
    if (!raw || !isLoopbackBrowserUrl(raw.replace(/^ws/, 'http'))) {
      return undefined
    }
    const url = new URL(raw)
    const { entry } = await window.api.runtimeEnvironments.portForwards!.ensure({
      environmentId,
      remotePort: Number(url.port) || 80,
      label: formatSimulatorTabLabel(null),
      persist: false
    })
    url.hostname = '127.0.0.1'
    url.port = String(entry.localPort)
    return url.toString()
  }
  const [streamUrl, url, wsUrl] = await Promise.all([
    forward(info.streamUrl),
    forward(info.url),
    forward(info.wsUrl)
  ])
  return { ...info, streamUrl, url, wsUrl }
}

/** `emulator.attach` on the host that owns the workspace, with stream URLs this desktop can dial. */
export async function attachEmulatorOnRuntime<TResult extends { info?: EmulatorStreamInfo }>(
  worktreeId: string,
  params: { device?: string } & Record<string, unknown>,
  target: RuntimeClientTarget = emulatorRuntimeTarget(worktreeId),
  /** The pane's device list, so a server's Android device is refused before it boots. */
  devices: readonly SimulatorDeviceRow[] = []
): Promise<TResult> {
  if (target.kind === 'local') {
    return callRuntimeRpc<TResult>(target, 'emulator.attach', { ...params, worktree: worktreeId })
  }
  const { device } = params
  if (
    device &&
    devices.some((d) => d.backend === 'android' && (d.udid === device || d.name === device))
  ) {
    throw serverAndroidUnsupportedError(target.environmentId)
  }
  // Checked first, so a server that can't stream here never boots a simulator for this pane.
  await assertServerStreamForwardable(target.environmentId)
  const result = await callRuntimeRpc<TResult>(target, 'emulator.attach', {
    ...params,
    worktree: worktreeId
  })
  return result.info
    ? { ...result, info: await forwardServerStreamInfo(target.environmentId, result.info) }
    : result
}
