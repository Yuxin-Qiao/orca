import { createServer, type Server } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import type { PairedRuntimeConnection } from '../../../shared/remote-runtime/pairing/paired-runtime-connection'
import {
  closeAllPairedPortForwards,
  configurePairedPortForwards,
  ensurePairedPortForward
} from './paired-port-forwards'

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

describe('ephemeral paired port forwards', () => {
  afterEach(async () => {
    await closeAllPairedPortForwards()
  })

  it('never takes the server port number here and is saved only once a person adopts it', async () => {
    const saved = new Map<string, unknown>()
    configurePairedPortForwards({
      resolveConnection: async () => connection,
      onChanged: () => {},
      saved: {
        all: () => Object.fromEntries(saved),
        set: (id, record) => (record ? saved.set(id, record) : saved.delete(id))
      }
    })
    // Free here, so only the ephemeral rule keeps the forward off it: serve-sim kills its port's listener.
    const remotePort = await freePort()

    const session = await ensurePairedPortForward({
      environmentId: 'env-1',
      remotePort,
      ephemeral: true
    })
    expect(session.created).toBe(true)
    expect(session.entry.localPort).not.toBe(remotePort)
    expect(saved.has('env-1')).toBe(false)

    const adopted = await ensurePairedPortForward({ environmentId: 'env-1', remotePort })
    expect(adopted).toEqual({ entry: session.entry, created: false })
    expect(saved.get('env-1')).toMatchObject({
      forwards: [{ localPort: session.entry.localPort, remotePort }]
    })
  })
})
