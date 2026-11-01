// F046: a host file outside every workspace past a terminal grant's one reply opens in the editor,
// read in ranges by absolute path; a log that keeps growing loads as it was when the read began.
import { describe, expect, it } from 'vitest'
import { readRuntimeTerminalArtifactContent } from '@/runtime/runtime-terminal-artifact-read'
import { REMOTE_FILE_CHANGED_DURING_READ_MESSAGE } from '@/runtime/runtime-paged-file-read'
import {
  installRuntimeFileClientEnvironment,
  runtimeEnvironmentCall
} from '@/runtime/runtime-file-client-test-harness'
import { registerLargeHostFileReads } from './large-host-file-read'

installRuntimeFileClientEnvironment()

const LOG = '/var/log/train/run.log'
const PNG = '/home/me/shots/full.png'
const ZIP = '/home/me/dist/bundle.zip'
const LOG_BYTES = Buffer.from('epoch 1 loss 0.5\n'.repeat(60_000))
const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  Buffer.alloc(4 * 1024 * 1024, 7)
])

type HostFile = { bytes: Buffer; sizeAfterRead?: number }

function ok(result: unknown): unknown {
  return { id: 'call', ok: true, result, _meta: { runtimeId: 'remote-runtime' } }
}

function fail(message: string, code = 'runtime_error'): unknown {
  return { id: 'call', ok: false, error: { code, message } }
}

/** A host with grants that refuse anything past one reply, and, unless `legacy`, the fork's reads. */
function serveHost(files: Record<string, HostFile>, legacy = false): void {
  const stats = new Map<string, number>()
  runtimeEnvironmentCall.mockImplementation(({ method, params }) => {
    const args: Partial<Record<'absolutePath' | 'path' | 'offset' | 'length', unknown>> =
      typeof params === 'object' && params !== null ? params : {}
    const path = String(args.absolutePath ?? args.path)
    const file = files[path]
    if (method === 'files.readTerminalArtifact') {
      return Promise.resolve(fail(path.endsWith('.log') ? 'file_too_large' : 'binary_file'))
    }
    if (method === 'files.readTerminalArtifactPreview') {
      return Promise.resolve(fail(path.endsWith('.zip') ? 'binary_file' : 'file_too_large'))
    }
    if (legacy) {
      return Promise.resolve(fail(method, 'method_not_found'))
    }
    if (method === 'files.hostFile.stat') {
      const seen = stats.get(path) ?? 0
      stats.set(path, seen + 1)
      const size = seen > 0 ? (file.sizeAfterRead ?? file.bytes.length) : file.bytes.length
      return Promise.resolve(ok({ size, isDirectory: false, mtime: seen, ctime: seen }))
    }
    if (method === 'files.hostFile.readChunk') {
      const offset = Number(args.offset)
      const slice = file.bytes.subarray(offset, offset + Number(args.length))
      return Promise.resolve(
        ok({ contentBase64: slice.toString('base64'), bytesRead: slice.length, eof: false })
      )
    }
    return Promise.resolve(fail(method, 'method_not_found'))
  })
}

function read(absolutePath: string): ReturnType<typeof readRuntimeTerminalArtifactContent> {
  return readRuntimeTerminalArtifactContent({
    target: { kind: 'environment', environmentId: 'env-1' },
    worktreeId: 'wt-1',
    absolutePath,
    grantId: 'g-1'
  })
}

describe('before the fork registers', () => {
  it('keeps the host refusal of a log past 512 KiB', async () => {
    serveHost({ [LOG]: { bytes: LOG_BYTES } })

    await expect(read(LOG)).rejects.toThrow('file_too_large')
  })
})

describe('a large file outside every workspace', () => {
  it('opens a log past 512 KiB, read in ranges by absolute path', async () => {
    registerLargeHostFileReads()
    serveHost({ [LOG]: { bytes: LOG_BYTES } })

    await expect(read(LOG)).resolves.toEqual({
      content: LOG_BYTES.toString('utf8'),
      isBinary: false
    })
    const chunks = runtimeEnvironmentCall.mock.calls
      .map(([request]) => request)
      .filter((request) => request.method === 'files.hostFile.readChunk')
    expect(chunks.length).toBe(Math.ceil(LOG_BYTES.length / (384 * 1024)))
    expect(chunks[0].params).toEqual({
      worktree: 'id:wt-1',
      path: LOG,
      offset: 0,
      length: 384 * 1024
    })
  })

  it('opens a log that grows while it loads, as it was when the read began', async () => {
    registerLargeHostFileReads()
    serveHost({ [LOG]: { bytes: LOG_BYTES, sizeAfterRead: LOG_BYTES.length + 4096 } })

    await expect(read(LOG)).resolves.toMatchObject({ content: LOG_BYTES.toString('utf8') })
  })

  it('refuses a file cut short while it loads', async () => {
    registerLargeHostFileReads()
    serveHost({ [LOG]: { bytes: LOG_BYTES, sizeAfterRead: 10 } })

    await expect(read(LOG)).rejects.toThrow(REMOTE_FILE_CHANGED_DURING_READ_MESSAGE)
  })

  it('previews an image past one reply as base64', async () => {
    registerLargeHostFileReads()
    serveHost({ [PNG]: { bytes: PNG_BYTES } })

    await expect(read(PNG)).resolves.toEqual({
      content: PNG_BYTES.toString('base64'),
      isBinary: true,
      isImage: true,
      mimeType: 'image/png'
    })
  })

  it('leaves binaries without a preview, and hosts without these reads, to upstream', async () => {
    registerLargeHostFileReads()
    serveHost({ [ZIP]: { bytes: Buffer.alloc(8) } })
    await expect(read(ZIP)).rejects.toThrow('binary_file')

    serveHost({ [LOG]: { bytes: LOG_BYTES } }, true)
    await expect(read(LOG)).rejects.toThrow('file_too_large')
  })
})
