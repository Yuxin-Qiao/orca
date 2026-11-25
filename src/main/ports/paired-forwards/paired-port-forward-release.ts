import { releasePairedPortForwardHolds } from './paired-port-forward-holds'
import { listPairedPortForwards, removePairedPortForward } from './paired-port-forwards'

/** `heldBy` lets go of its forwards on the server, except `keep`; the ones nobody holds now close. */
export async function releasePairedPortForwards(args: {
  environmentId: string
  heldBy: string
  keep?: readonly string[]
}): Promise<void> {
  const ids = listPairedPortForwards(args.environmentId)
    .map((entry) => entry.id)
    .filter((id) => !args.keep?.includes(id))
  await Promise.all(releasePairedPortForwardHolds(args.heldBy, ids).map(removePairedPortForward))
}
