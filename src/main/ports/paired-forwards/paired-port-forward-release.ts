import { releasePairedPortForwardHolds } from './paired-port-forward-holds'
import { listPairedPortForwards, removePairedPortForward } from './paired-port-forwards'

/** `heldBy` lets go of its forwards on every server, except `keep`; the ones nobody holds when their
 *  turn in the server's queue comes close. */
export async function releasePairedPortForwards(args: {
  heldBy: string
  keep?: readonly string[]
}): Promise<void> {
  const ids = listPairedPortForwards()
    .map((entry) => entry.id)
    .filter((id) => !args.keep?.includes(id))
  await Promise.all(
    releasePairedPortForwardHolds(args.heldBy, ids).map((id) => removePairedPortForward(id, true))
  )
}
