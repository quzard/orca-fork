// F046 host side: a document outside every workspace is read by absolute path with upstream's
// doc-preview checks, plus the fork's refusal of dot-named files below the document's folder.
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: { fromId: vi.fn(() => null) },
  webContents: { fromId: vi.fn(() => null) },
  ipcMain: { on: vi.fn(), removeListener: vi.fn() },
  app: { getPath: vi.fn(() => tmpdir()), isPackaged: false }
}))

import { RpcDispatcher } from '../../main/runtime/rpc/dispatcher'
import type { RpcResponse } from '../../main/runtime/rpc/core'
import { ALL_RPC_METHODS } from '../../main/runtime/rpc/methods'
import type { OrcaRuntimeService } from '../../main/runtime/orca-runtime'
import { HOST_FILE_DOC_PREVIEW_METHODS } from './host-file-doc-preview-methods'

// Past the 512 KiB a single reply carries.
const BUNDLE = `window.big = '${'x'.repeat(600 * 1024)}'`

let root = ''
let pages = ''

function dispatcher(executionHostId = 'local'): RpcDispatcher {
  const runtime: Pick<OrcaRuntimeService, 'getRuntimeId' | 'resolveRuntimeFileTarget'> = {
    getRuntimeId: () => 'runtime-1',
    resolveRuntimeFileTarget: vi.fn(async () => ({
      worktree: { id: 'wt-1', path: join(root, 'app'), repoId: 'repo-1' },
      executionHostId
    })) as never
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the dispatcher reads getRuntimeId; these methods only resolveRuntimeFileTarget.
  return new RpcDispatcher({
    runtime: runtime as OrcaRuntimeService,
    methods: HOST_FILE_DOC_PREVIEW_METHODS
  })
}

function read(
  targetName: string,
  overrides: Record<string, unknown> = {},
  method = 'files.hostDocPreview.read',
  executionHostId = 'local'
): Promise<RpcResponse> {
  return dispatcher(executionHostId).dispatch({
    id: 'req-1',
    authToken: 'tok',
    method,
    params: {
      worktree: 'id:wt-1',
      boundaryPath: pages,
      entryPath: join(pages, 'report.html'),
      implicitRootPath: null,
      authorizedRootPaths: [pages],
      targetPath: join(pages, targetName),
      ...overrides
    }
  })
}

function result(response: RpcResponse): Record<string, unknown> {
  if (!response.ok) {
    throw new Error(response.error.message)
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: expectations below read only these fields.
  return response.result as Record<string, unknown>
}

function errorMessage(response: RpcResponse): string | null {
  return response.ok ? null : response.error.message
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'orca-host-doc-'))
  pages = join(root, 'pages')
  mkdirSync(join(pages, 'fonts'), { recursive: true })
  mkdirSync(join(pages, '.git'))
  writeFileSync(join(pages, 'report.html'), '<link rel="stylesheet" href="style.css">')
  writeFileSync(join(pages, 'style.css'), 'h1 { color: red }')
  writeFileSync(join(pages, 'fonts', 'icons.woff2'), Buffer.from([0x77, 0x4f, 0x46, 0x32, 0, 1]))
  writeFileSync(join(pages, 'bundle.js'), BUNDLE)
  writeFileSync(join(pages, '.env'), 'TOKEN=secret')
  writeFileSync(join(pages, '.git', 'config'), '[remote] url = https://token@example.test')
  writeFileSync(join(root, 'secret.txt'), 'outside')
  symlinkSync(join(pages, '.env'), join(pages, 'notes.txt'))
  symlinkSync(join(root, 'secret.txt'), join(pages, 'leak.css'))
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('files.hostDocPreview', () => {
  it('is served by every host', () => {
    expect(ALL_RPC_METHODS.map((method) => method.name)).toEqual(
      expect.arrayContaining(['files.hostDocPreview.read', 'files.hostDocPreview.readChunk'])
    )
  })

  it('reads the document and the files of an authorized folder', async () => {
    expect(result(await read('report.html'))).toEqual({
      content: '<link rel="stylesheet" href="style.css">',
      isBinary: false
    })
    expect(result(await read('style.css'))).toEqual({
      content: 'h1 { color: red }',
      isBinary: false
    })
  })

  it('sends fonts as typed binary, which terminal grants refuse', async () => {
    expect(result(await read('fonts/icons.woff2'))).toEqual({
      content: Buffer.from([0x77, 0x4f, 0x46, 0x32, 0, 1]).toString('base64'),
      isBinary: true,
      mimeType: 'font/woff2'
    })
  })

  it('keeps upstream authority: only the entry until a folder is authorized', async () => {
    expect(errorMessage(await read('style.css', { authorizedRootPaths: [] }))).toBe(
      'doc_preview_path_unauthorized'
    )
    expect(result(await read('report.html', { authorizedRootPaths: [] })).isBinary).toBe(false)
  })

  it('refuses dot-named files, links to them, and links out of the folder', async () => {
    for (const name of ['.env', '.git/config', 'notes.txt', 'leak.css']) {
      expect(errorMessage(await read(name)), name).toBe('doc_preview_path_unauthorized')
    }
  })

  it('pages a file larger than one reply in ranges of one version', async () => {
    expect(errorMessage(await read('bundle.js'))).toBe('file_too_large')
    const chunk = result(
      await read('bundle.js', { offset: 0, length: 384 * 1024 }, 'files.hostDocPreview.readChunk')
    )
    expect(chunk).toMatchObject({
      bytesRead: 384 * 1024,
      eof: false,
      size: Buffer.byteLength(BUNDLE)
    })
    expect(typeof chunk.mtimeMs).toBe('number')
  })

  it('rejects relative paths and workspaces this host reaches over SSH', async () => {
    expect((await read('style.css', { targetPath: 'pages/style.css' })).ok).toBe(false)
    expect(
      errorMessage(await read('style.css', {}, 'files.hostDocPreview.read', 'ssh:target-1'))
    ).not.toBeNull()
  })
})
