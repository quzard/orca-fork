// F046: a server document outside the clicked workspace, served by upstream's preview reader
// through the host's per-file grants once the fork registers its reader.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ callRuntimeEnvironment: vi.fn() }))

vi.mock('../../main/ipc/runtime-environments/runtime-environment-transport-routing', () => ({
  callRuntimeEnvironment: mocks.callRuntimeEnvironment
}))
vi.mock('../../main/ipc/runtime-environments/runtime-environment-registry-root', () => ({
  getRuntimeEnvironmentRegistryRoot: () => '/user-data'
}))

import { readDocPreviewFile } from '../../main/browser/doc-preview-file-reader'
import {
  authorizeDocPreviewDirectory,
  mintDocPreviewGrant,
  revokeAllDocPreviewGrants
} from '../../main/browser/doc-preview-grant-registry'
import { registerHostFileDocPreviewRead } from '../../shared/fork-hooks/host-file-doc-preview'
import { readGrantedHostDocPreview } from './host-file-doc-preview-read'

const PAGES = '/home/me/.answer-me-with-html/pages'

type HostFile = { content: string; isBinary?: boolean; mimeType?: string; tooLarge?: boolean }

const files: Record<string, HostFile> = {
  [`${PAGES}/report.html`]: { content: '<link rel="stylesheet" href="style.css">' },
  [`${PAGES}/style.css`]: { content: 'body { color: red }' },
  [`${PAGES}/chart.png`]: {
    content: Buffer.from([0x89, 0x50]).toString('base64'),
    isBinary: true,
    mimeType: 'image/png'
  },
  [`${PAGES}/huge.html`]: { content: '', tooLarge: true },
  '/home/me/.ssh/id_rsa': { content: 'PRIVATE KEY' }
}
// A link beside the document that lands in the user's credentials.
const symlinks: Record<string, string> = { [`${PAGES}/leak.css`]: '/home/me/.ssh/id_rsa' }

function hostResolve(pathText: string): unknown {
  const absolutePath = symlinks[pathText] ?? pathText
  const isDirectory = absolutePath === PAGES
  if (!isDirectory && !files[absolutePath]) {
    return { worktree: 'wt-1', relativePath: null, absolutePath, exists: false, isDirectory: false }
  }
  return {
    worktree: 'wt-1',
    relativePath: null,
    absolutePath,
    exists: true,
    isDirectory,
    ...(isDirectory
      ? {}
      : {
          openTarget: {
            kind: 'absolute-file',
            provider: 'local',
            absolutePath,
            grantId: `grant:${absolutePath}`
          }
        })
  }
}

function hostRead(grantId: string, absolutePath: string): unknown {
  const file = files[absolutePath]
  if (!file || grantId !== `grant:${absolutePath}`) {
    return { ok: false, error: { code: 'runtime_error', message: 'terminal_file_grant_mismatch' } }
  }
  if (file.tooLarge) {
    return { ok: false, error: { code: 'runtime_error', message: 'file_too_large' } }
  }
  const { content, isBinary = false, mimeType } = file
  return { ok: true, result: { content, isBinary, ...(mimeType ? { mimeType } : {}) } }
}

function outsideDocumentGrant(entryRelativePath = 'report.html') {
  return mintDocPreviewGrant({
    owner: {
      kind: 'runtime',
      environmentId: 'env-1',
      worktreeSelector: 'id:wt-1',
      worktreeRoot: '/srv/app'
    },
    requestBase: PAGES,
    root: PAGES,
    entryRelativePath,
    browserPageId: 'page-1'
  })
}

function hostCalls(method: string): unknown[] {
  return mocks.callRuntimeEnvironment.mock.calls
    .filter((call) => call[2] === method)
    .map((call) => call[3])
}

beforeEach(() => {
  revokeAllDocPreviewGrants()
  mocks.callRuntimeEnvironment.mockReset()
  mocks.callRuntimeEnvironment.mockImplementation(
    async (_root: string, _env: string, method: string, params: Record<string, string>) => {
      if (method === 'files.resolveTerminalPath') {
        return { ok: true, result: hostResolve(params.pathText) }
      }
      if (method === 'files.readTerminalArtifactPreview') {
        return hostRead(params.grantId, params.absolutePath)
      }
      return { ok: false, error: { code: 'method_not_found', message: method } }
    }
  )
})

describe('upstream reader without the fork reader', () => {
  it('keeps the outside-worktree 404 and asks the host nothing', async () => {
    const outcome = await readDocPreviewFile(outsideDocumentGrant(), 'report.html')

    expect(outcome).toMatchObject({ ok: false, status: 404 })
    expect(mocks.callRuntimeEnvironment).not.toHaveBeenCalled()
  })
})

describe('a server document outside the workspace', () => {
  beforeEach(() => {
    registerHostFileDocPreviewRead(readGrantedHostDocPreview)
  })

  it('reads the document through the grant the host mints for it', async () => {
    const outcome = await readDocPreviewFile(outsideDocumentGrant(), 'report.html')

    expect(outcome).toEqual({
      ok: true,
      bytes: Buffer.from(files[`${PAGES}/report.html`].content, 'utf8'),
      contentType: 'text/html; charset=utf-8'
    })
    expect(hostCalls('files.resolveTerminalPath')).toContainEqual({
      worktree: 'id:wt-1',
      pathText: `${PAGES}/report.html`
    })
    expect(hostCalls('files.readTerminalArtifactPreview')).toEqual([
      {
        worktree: 'id:wt-1',
        absolutePath: `${PAGES}/report.html`,
        grantId: `grant:${PAGES}/report.html`
      }
    ])
  })

  it('asks before reading files beside it, then reads each through its own grant', async () => {
    const grant = outsideDocumentGrant()

    expect(await readDocPreviewFile(grant, 'style.css')).toMatchObject({
      ok: false,
      status: 403,
      reason: 'authorization-required'
    })
    expect(mocks.callRuntimeEnvironment).not.toHaveBeenCalled()

    expect(authorizeDocPreviewDirectory(grant.id, 'style.css')).toBe(true)
    expect(await readDocPreviewFile(grant, 'style.css')).toEqual({
      ok: true,
      bytes: Buffer.from('body { color: red }', 'utf8'),
      contentType: 'text/css; charset=utf-8'
    })
    expect(await readDocPreviewFile(grant, 'chart.png')).toEqual({
      ok: true,
      bytes: Buffer.from([0x89, 0x50]),
      contentType: 'image/png'
    })
  })

  it('refuses a symlink beside the document that leads out of its folder', async () => {
    const grant = outsideDocumentGrant()
    authorizeDocPreviewDirectory(grant.id, 'leak.css')

    expect(await readDocPreviewFile(grant, 'leak.css')).toMatchObject({ ok: false, status: 404 })
    expect(hostCalls('files.readTerminalArtifactPreview')).toEqual([])
  })

  it('reports a document larger than one host reply as too large', async () => {
    expect(await readDocPreviewFile(outsideDocumentGrant('huge.html'), 'huge.html')).toMatchObject({
      ok: false,
      status: 413,
      reason: 'too-large'
    })
  })

  it('reports a document the host no longer has as missing', async () => {
    expect(await readDocPreviewFile(outsideDocumentGrant('gone.html'), 'gone.html')).toMatchObject({
      ok: false,
      status: 404,
      reason: 'unreadable'
    })
    expect(hostCalls('files.readTerminalArtifactPreview')).toEqual([])
  })
})
