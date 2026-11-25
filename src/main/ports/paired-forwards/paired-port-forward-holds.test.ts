import { createServer, type Server } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import type { PairedRuntimeConnection } from '../../../shared/remote-runtime/pairing/paired-runtime-connection'
import {
  closeAllPairedPortForwards,
  configurePairedPortForwards,
  ensurePairedPortForward,
  listPairedPortForwards
} from './paired-port-forwards'
import { releasePairedPortForwards } from './paired-port-forward-release'

const connection: PairedRuntimeConnection = {
  endpoint: 'ws://127.0.0.1:9',
  hostPublicKeyB64: 'server-key',
  credential: { kind: 'token', deviceToken: 'device-token' }
}

async function freePort(): Promise<number> {
  const server: Server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  await new Promise<void>((resolve) => server.close(() => resolve()))
  if (!address || typeof address === 'string') {
    throw new Error('no port')
  }
  return address.port
}

function configure(saved: Map<string, unknown>): void {
  configurePairedPortForwards({
    resolveConnection: async () => connection,
    onChanged: () => {},
    saved: {
      all: () => Object.fromEntries(saved),
      set: (id, record) => (record ? saved.set(id, record) : saved.delete(id))
    }
  })
}

describe('held paired port forwards', () => {
  afterEach(async () => {
    await closeAllPairedPortForwards()
  })

  it('stay off the server port number, unsaved, and open until their last holder lets go', async () => {
    const saved = new Map<string, unknown>()
    configure(saved)
    // Free here, so only the held rule keeps the forward off the number local simulators start on.
    const remotePort = await freePort()

    const first = await ensurePairedPortForward({ environmentId: 'env-1', remotePort, heldBy: 'a' })
    const shared = await ensurePairedPortForward({
      environmentId: 'env-1',
      remotePort,
      heldBy: 'b'
    })
    expect(first.entry.localPort).not.toBe(remotePort)
    expect(shared).toEqual({ entry: first.entry, created: false })
    expect(saved.has('env-1')).toBe(false)

    await releasePairedPortForwards({ heldBy: 'a' })
    expect(listPairedPortForwards('env-1')).toEqual([first.entry])
    await releasePairedPortForwards({ heldBy: 'b' })
    expect(listPairedPortForwards('env-1')).toEqual([])
  })

  it('stays open for a session that joins it while its last holder lets go', async () => {
    configure(new Map())
    const remotePort = await freePort()
    const first = await ensurePairedPortForward({ environmentId: 'env-1', remotePort, heldBy: 'a' })

    // The join queues first; the release lands while the join is still resolving the server.
    const joined = ensurePairedPortForward({ environmentId: 'env-1', remotePort, heldBy: 'b' })
    const released = releasePairedPortForwards({ heldBy: 'a' })
    await Promise.all([joined, released])

    expect(listPairedPortForwards('env-1')).toEqual([first.entry])
  })

  it('becomes a saved forward once a person ensures it, and then outlives its holder', async () => {
    const saved = new Map<string, unknown>()
    configure(saved)
    const remotePort = await freePort()

    const held = await ensurePairedPortForward({ environmentId: 'env-1', remotePort, heldBy: 'a' })
    // The person's ensure queues first; the session lets go while it is still resolving the server.
    await Promise.all([
      ensurePairedPortForward({ environmentId: 'env-1', remotePort }),
      releasePairedPortForwards({ heldBy: 'a' })
    ])

    expect(listPairedPortForwards('env-1')).toEqual([held.entry])
    expect(saved.get('env-1')).toMatchObject({
      forwards: [{ localPort: held.entry.localPort, remotePort }]
    })
  })
})
