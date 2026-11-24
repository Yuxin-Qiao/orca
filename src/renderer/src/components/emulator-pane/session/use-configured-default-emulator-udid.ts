import { useAppStore } from '@/store/index'
import { runtimeEnvironmentIdUnlessTwin } from '@/lib/workspace/ownership/resolve-owner'
import { getEmulatorOpeningMode } from '../../../../../shared/emulator/emulator-opening-preferences'

/** The device Settings opens by default. It names one of this desktop's simulators, so a paired
 *  server's workspace has none here; that server applies its own setting. */
export function useConfiguredDefaultEmulatorUdid(worktreeId: string): string | null {
  const udid = useAppStore((state) =>
    state.settings && getEmulatorOpeningMode(state.settings) === 'specific'
      ? (state.settings.mobileEmulatorDefaultDeviceUdid ?? null)
      : null
  )
  // Read at render, not in the selector, so other store updates don't resolve the owner again.
  return udid !== null &&
    runtimeEnvironmentIdUnlessTwin(useAppStore.getState(), worktreeId) === null
    ? udid
    : null
}
