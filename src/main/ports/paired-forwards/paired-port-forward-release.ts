import { letGoOfPairedPortForward, pairedPortForwardsHeldBy } from './paired-port-forward-holds'
import { removePairedPortForward } from './paired-port-forwards'

/** `heldBy` lets go of its forwards on every server, except `keep`; the ones nobody holds close. */
export async function releasePairedPortForwards(args: {
  heldBy: string
  keep?: readonly string[]
}): Promise<void> {
  const ids = pairedPortForwardsHeldBy(args.heldBy).filter((id) => !args.keep?.includes(id))
  await Promise.all(
    ids.map((id) => removePairedPortForward(id, () => letGoOfPairedPortForward(id, args.heldBy)))
  )
}
