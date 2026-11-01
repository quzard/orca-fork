// F046: text outside every workspace that a terminal grant will not send opens in the editor, paged
// by absolute path. A log that only grew while it loads opens as it was; a rewrite is refused.
import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import type { OpenFile } from '@/store/slices/editor'
import { readRuntimeTerminalArtifactContent } from '@/runtime/runtime-terminal-artifact-read'
import { REMOTE_FILE_CHANGED_DURING_READ_MESSAGE } from '@/runtime/runtime-paged-file-read'
import {
  installRuntimeFileClientEnvironment,
  runtimeEnvironmentCall
} from '@/runtime/runtime-file-client-test-harness'
import { registerLargeHostFileReads } from './large-host-file-read'

installRuntimeFileClientEnvironment()

const LOG = '/var/log/train/run.log'
const LOG_BYTES = Buffer.from('epoch 1 loss 0.5\n'.repeat(60_000))
const PNG_PREVIEW = { content: 'iVBO', isBinary: true, isImage: true, mimeType: 'image/png' }

type Refusal = 'file_too_large' | 'terminal_file_grant_stale' | 'binary_file' | 'truncated'
type HostFile = { bytes: Buffer; fileId: string; mtime: number; refusal: Refusal }

let host = new Map<string, HostFile>()
let legacyHost = false
let readChunks = 0
/** Runs after each ranged read, so a test can change the file while it loads. */
let afterChunk: (file: HostFile, count: number) => void = () => {}

function ok(result: unknown): unknown {
  return { id: 'call', ok: true, result, _meta: { runtimeId: 'remote-runtime' } }
}

function fail(message: string, code = 'runtime_error'): unknown {
  return { id: 'call', ok: false, error: { code, message } }
}

function respond(method: string, params: unknown): unknown {
  const args: Partial<Record<'absolutePath' | 'path' | 'offset' | 'length', unknown>> =
    typeof params === 'object' && params !== null ? params : {}
  const path = String(args.absolutePath ?? args.path)
  const file = host.get(path)
  if (!file) {
    return fail(method, 'method_not_found')
  }
  if (method === 'files.readTerminalArtifact') {
    return file.refusal === 'truncated'
      ? ok({ worktree: 'wt-1', relativePath: path, content: 'x', truncated: true, byteLength: 1 })
      : fail(file.refusal)
  }
  if (method === 'files.readTerminalArtifactPreview') {
    return ok(PNG_PREVIEW)
  }
  if (legacyHost) {
    return fail(method, 'method_not_found')
  }
  if (method === 'files.hostFile.stat') {
    const { bytes, fileId, mtime } = file
    return ok({ size: bytes.length, isDirectory: false, mtime, ctime: mtime, fileId })
  }
  if (method === 'files.hostFile.readChunk') {
    const offset = Number(args.offset)
    const slice = file.bytes.subarray(offset, offset + Number(args.length))
    const reply = ok({
      contentBase64: slice.toString('base64'),
      bytesRead: slice.length,
      eof: offset + slice.length >= file.bytes.length
    })
    readChunks += 1
    afterChunk(file, readChunks)
    return reply
  }
  return fail(method, 'method_not_found')
}

function tab(filePath: string): OpenFile {
  return {
    id: `tab:${filePath}`,
    filePath,
    relativePath: filePath,
    worktreeId: 'wt-1',
    language: 'plaintext',
    isDirty: false,
    mode: 'edit'
  }
}

function read(absolutePath: string): ReturnType<typeof readRuntimeTerminalArtifactContent> {
  return readRuntimeTerminalArtifactContent({
    target: { kind: 'environment', environmentId: 'env-1' },
    worktreeId: 'wt-1',
    absolutePath,
    grantId: 'g-1'
  })
}

function methodsCalled(): string[] {
  return runtimeEnvironmentCall.mock.calls.map(([request]) => request.method)
}

beforeEach(() => {
  host = new Map([[LOG, { bytes: LOG_BYTES, fileId: '1:7', mtime: 1, refusal: 'file_too_large' }]])
  legacyHost = false
  readChunks = 0
  afterChunk = () => {}
  runtimeEnvironmentCall.mockImplementation(({ method, params }) =>
    Promise.resolve(respond(method, params))
  )
  useAppStore.setState({ openFiles: [tab(LOG)] })
})

describe('before the fork registers', () => {
  it('keeps the host refusal of a log past 512 KiB', async () => {
    await expect(read(LOG)).rejects.toThrow('file_too_large')
  })
})

describe('text a grant will not send', () => {
  beforeEach(() => {
    registerLargeHostFileReads()
  })

  it('opens a log past 512 KiB whole, as a read-only tab', async () => {
    await expect(read(LOG)).resolves.toEqual({
      content: LOG_BYTES.toString('utf8'),
      isBinary: false
    })
    expect(useAppStore.getState().openFiles[0]?.readOnly).toBe(true)
    expect(methodsCalled()).not.toContain('files.resolveTerminalPath')
  })

  it('opens a log that grows while it loads, as it was when the read began', async () => {
    afterChunk = (file, count) => {
      if (count === 2) {
        file.bytes = Buffer.concat([file.bytes, Buffer.from('epoch 2 loss 0.4\n')])
        file.mtime += 1
      }
    }

    await expect(read(LOG)).resolves.toMatchObject({ content: LOG_BYTES.toString('utf8') })
  })

  it('refuses a file rewritten in place, or replaced, while it loads', async () => {
    afterChunk = (file, count) => {
      if (count === 2) {
        file.bytes = Buffer.alloc(LOG_BYTES.length, 0x7a)
        file.mtime += 1
      }
    }
    await expect(read(LOG)).rejects.toThrow(REMOTE_FILE_CHANGED_DURING_READ_MESSAGE)

    readChunks = 0
    host.set(LOG, { bytes: LOG_BYTES, fileId: '1:7', mtime: 1, refusal: 'file_too_large' })
    afterChunk = (file, count) => {
      if (count === 2) {
        file.bytes = Buffer.concat([LOG_BYTES, Buffer.from('new file\n')])
        file.fileId = '1:8'
        file.mtime += 1
      }
    }
    await expect(read(LOG)).rejects.toThrow(REMOTE_FILE_CHANGED_DURING_READ_MESSAGE)
  })

  it('reads a log whose grant went stale, and a reply cut short, without renewing', async () => {
    const small = Buffer.from('tail -f me\n')
    host.set('/var/log/small.log', {
      bytes: small,
      fileId: '1:9',
      mtime: 1,
      refusal: 'terminal_file_grant_stale'
    })
    host.set('/var/log/latin1.log', {
      bytes: small,
      fileId: '1:10',
      mtime: 1,
      refusal: 'truncated'
    })

    await expect(read('/var/log/small.log')).resolves.toEqual({
      content: 'tail -f me\n',
      isBinary: false
    })
    await expect(read('/var/log/latin1.log')).resolves.toMatchObject({ content: 'tail -f me\n' })
    expect(methodsCalled()).not.toContain('files.resolveTerminalPath')
    // Small enough to save through the grant, so the tabs stay writable.
    expect(useAppStore.getState().openFiles[0]?.readOnly).toBeUndefined()
  })

  it('tells a large binary from its first bytes, without paging it', async () => {
    host.set('/data/model.safetensors', {
      bytes: Buffer.concat([Buffer.from([0x7b, 0, 0, 0]), Buffer.alloc(2 * 1024 * 1024, 1)]),
      fileId: '1:11',
      mtime: 1,
      refusal: 'file_too_large'
    })

    await expect(read('/data/model.safetensors')).resolves.toEqual({ content: '', isBinary: true })
    expect(readChunks).toBe(1)
  })

  it('keeps a host CSV past the paging threshold refused, as before', async () => {
    host.set('/data/results.csv', {
      bytes: Buffer.alloc(2 * 1024 * 1024, 0x61),
      fileId: '1:12',
      mtime: 1,
      refusal: 'file_too_large'
    })

    await expect(read('/data/results.csv')).rejects.toThrow('too large to open in the editor')
  })

  it('leaves binaries to upstream, and keeps the refusal on a host without these reads', async () => {
    host.set('/home/me/shot.png', {
      bytes: Buffer.alloc(8),
      fileId: '1:13',
      mtime: 1,
      refusal: 'binary_file'
    })
    await expect(read('/home/me/shot.png')).resolves.toEqual(PNG_PREVIEW)

    legacyHost = true
    await expect(read(LOG)).rejects.toThrow('file_too_large')
  })
})
