// F046: a server document outside the clicked workspace, served by upstream's preview reader once the
// fork registers its reader: by absolute path on hosts with files.hostDocPreview.*, else through the
// host's per-file terminal grants. The document's own folder opens without a prompt unless it is wide.
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
import { DOC_PREVIEW_FILE_CHANGED_MESSAGE } from '../../shared/doc-preview-file-access'
import {
  openHostFileDocFolder,
  registerHostFileDocFolderAccess,
  registerHostFileDocPreviewRead
} from '../../shared/fork-hooks/host-file-doc-preview'
import { openOwnDocumentFolder, readGrantedHostDocPreview } from './host-file-doc-preview-read'
import { isBroadDocumentFolder } from './host-file-doc-preview-paths'

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
  [`${PAGES}/.env`]: { content: 'TOKEN=secret' },
  '/home/me/report.html': { content: '<link rel="stylesheet" href="style.css">' },
  '/home/me/style.css': { content: 'body { color: blue }' },
  '/home/me/.ssh/id_rsa': { content: 'PRIVATE KEY' }
}
// Links beside the document: one out to the user's credentials, one to a dot-named file beside it.
const symlinks: Record<string, string> = {
  [`${PAGES}/leak.css`]: '/home/me/.ssh/id_rsa',
  [`${PAGES}/notes.txt`]: `${PAGES}/.env`
}

function hostResolve(pathText: string): unknown {
  const absolutePath = symlinks[pathText] ?? pathText
  const isDirectory = absolutePath === PAGES || absolutePath === '/home/me'
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

function failure(message: string, code = 'runtime_error'): unknown {
  return { ok: false, error: { code, message } }
}

function hostRead(grantId: string, absolutePath: string): unknown {
  const file = files[absolutePath]
  if (!file || grantId !== `grant:${absolutePath}`) {
    return failure('terminal_file_grant_mismatch')
  }
  if (file.tooLarge) {
    return failure('file_too_large')
  }
  const { content, isBinary = false, mimeType } = file
  return { ok: true, result: { content, isBinary, ...(mimeType ? { mimeType } : {}) } }
}

/** files.hostDocPreview.read as the host answers it: canonical, and nothing dot-named below the folder. */
function hostPathRead(params: Record<string, unknown>): unknown {
  const requested = String(params.targetPath)
  const target = symlinks[requested] ?? requested
  const file = files[target]
  if (!file) {
    return failure(`ENOENT: no such file or directory, realpath '${requested}'`)
  }
  const below = target.slice(String(params.boundaryPath).length + 1)
  if (!target.startsWith(`${String(params.boundaryPath)}/`) || /(^|\/)\./.test(below)) {
    return failure('doc_preview_path_unauthorized')
  }
  if (file.tooLarge) {
    return failure('file_too_large')
  }
  const { content, isBinary = false, mimeType } = file
  return { ok: true, result: { content, isBinary, ...(mimeType ? { mimeType } : {}) } }
}

function outsideDocumentGrant(entryPath = `${PAGES}/report.html`) {
  const folder = entryPath.slice(0, entryPath.lastIndexOf('/'))
  const grant = mintDocPreviewGrant({
    owner: {
      kind: 'runtime',
      environmentId: 'env-1',
      worktreeSelector: 'id:wt-1',
      worktreeRoot: '/srv/app'
    },
    requestBase: folder,
    root: folder,
    entryRelativePath: entryPath.slice(folder.length + 1),
    browserPageId: 'page-1'
  })
  // What the mint IPC does right after minting.
  openHostFileDocFolder(grant.id)
  return grant
}

function hostCalls(method: string): unknown[] {
  return mocks.callRuntimeEnvironment.mock.calls
    .filter((call) => call[2] === method)
    .map((call) => call[3])
}

function serveHost(hostPathMethods: boolean): void {
  mocks.callRuntimeEnvironment.mockImplementation(
    async (_root: string, _env: string, method: string, params: Record<string, string>) => {
      if (method === 'files.resolveTerminalPath') {
        return { ok: true, result: hostResolve(params.pathText) }
      }
      if (method === 'files.readTerminalArtifactPreview') {
        return hostRead(params.grantId, params.absolutePath)
      }
      if (hostPathMethods && method === 'files.hostDocPreview.read') {
        return hostPathRead(params)
      }
      return failure(method, 'method_not_found')
    }
  )
}

beforeEach(() => {
  revokeAllDocPreviewGrants()
  mocks.callRuntimeEnvironment.mockReset()
  serveHost(true)
})

describe('upstream reader without the fork', () => {
  it('keeps the outside-worktree 404, the entry-only grant, and asks the host nothing', async () => {
    const grant = outsideDocumentGrant()

    expect(await readDocPreviewFile(grant, 'report.html')).toMatchObject({ ok: false, status: 404 })
    expect(await readDocPreviewFile(grant, 'style.css')).toMatchObject({
      reason: 'authorization-required'
    })
    expect(mocks.callRuntimeEnvironment).not.toHaveBeenCalled()
  })
})

describe('a server document outside the workspace', () => {
  beforeEach(() => {
    registerHostFileDocPreviewRead(readGrantedHostDocPreview)
    registerHostFileDocFolderAccess(openOwnDocumentFolder)
  })

  it('reads the page and the files beside it by absolute path, without asking', async () => {
    const grant = outsideDocumentGrant()

    expect(await readDocPreviewFile(grant, 'report.html')).toEqual({
      ok: true,
      bytes: Buffer.from(files[`${PAGES}/report.html`].content, 'utf8'),
      contentType: 'text/html; charset=utf-8'
    })
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
    expect(hostCalls('files.hostDocPreview.read')).toContainEqual({
      worktree: 'id:wt-1',
      boundaryPath: PAGES,
      entryPath: `${PAGES}/report.html`,
      implicitRootPath: null,
      authorizedRootPaths: [PAGES],
      targetPath: `${PAGES}/style.css`
    })
    expect(hostCalls('files.resolveTerminalPath')).toEqual([])
  })

  it('still asks before a page in a home folder reads beside it', async () => {
    const grant = outsideDocumentGrant('/home/me/report.html')

    expect(await readDocPreviewFile(grant, 'style.css')).toMatchObject({
      status: 403,
      reason: 'authorization-required'
    })
    expect(authorizeDocPreviewDirectory(grant.id, 'style.css')).toBe(true)
    expect(await readDocPreviewFile(grant, 'style.css')).toMatchObject({ ok: true })
    // Allowing the folder still leaves what it hides out of reach.
    expect(await readDocPreviewFile(grant, '.ssh/id_rsa')).toMatchObject({
      status: 404,
      reason: 'unreadable'
    })
  })

  it('reads a dot-named file, or a link out of the folder, as absent rather than asking', async () => {
    const grant = outsideDocumentGrant()

    for (const name of ['.env', 'notes.txt', 'leak.css']) {
      expect(await readDocPreviewFile(grant, name), name).toMatchObject({
        ok: false,
        status: 404,
        reason: 'unreadable',
        message: 'Not found'
      })
    }
  })

  it('pages a file larger than one reply, and refuses one rewritten mid-read', async () => {
    const body = Buffer.alloc(900 * 1024, 0x61)
    let mtimeMs = 1
    mocks.callRuntimeEnvironment.mockImplementation(
      async (_root: string, _env: string, method: string, params: Record<string, number>) => {
        if (method === 'files.hostDocPreview.read') {
          return failure('file_too_large')
        }
        const bytes = body.subarray(params.offset, params.offset + params.length)
        const chunk = { contentBase64: bytes.toString('base64'), size: body.length, ctimeMs: 1 }
        return { ok: true, result: { ...chunk, bytesRead: bytes.length, mtimeMs } }
      }
    )
    const grant = outsideDocumentGrant(`${PAGES}/huge.html`)

    expect(await readDocPreviewFile(grant, 'huge.html')).toEqual({
      ok: true,
      bytes: body,
      contentType: 'text/html; charset=utf-8'
    })
    expect(hostCalls('files.hostDocPreview.readChunk')).toHaveLength(3)

    mocks.callRuntimeEnvironment.mockImplementation(
      async (_root: string, _env: string, method: string, params: Record<string, number>) => {
        if (method === 'files.hostDocPreview.read') {
          return failure('file_too_large')
        }
        const bytes = body.subarray(params.offset, params.offset + params.length)
        const chunk = { contentBase64: bytes.toString('base64'), size: body.length, ctimeMs: 1 }
        return { ok: true, result: { ...chunk, bytesRead: bytes.length, mtimeMs: mtimeMs++ } }
      }
    )
    expect(await readDocPreviewFile(grant, 'huge.html')).toMatchObject({
      status: 404,
      message: DOC_PREVIEW_FILE_CHANGED_MESSAGE
    })
  })

  describe('on a host without files.hostDocPreview.*', () => {
    beforeEach(() => {
      serveHost(false)
    })

    it('reads each file through the grant the host mints for it', async () => {
      const grant = outsideDocumentGrant()

      expect(await readDocPreviewFile(grant, 'style.css')).toEqual({
        ok: true,
        bytes: Buffer.from('body { color: red }', 'utf8'),
        contentType: 'text/css; charset=utf-8'
      })
      expect(hostCalls('files.readTerminalArtifactPreview')).toEqual([
        {
          worktree: 'id:wt-1',
          absolutePath: `${PAGES}/style.css`,
          grantId: `grant:${PAGES}/style.css`
        }
      ])
    })

    it('refuses dot-named files and links out of the folder before reading them', async () => {
      const grant = outsideDocumentGrant()

      for (const name of ['.env', 'notes.txt', 'leak.css']) {
        expect(await readDocPreviewFile(grant, name), name).toMatchObject({ status: 404 })
      }
      expect(hostCalls('files.readTerminalArtifactPreview')).toEqual([])
    })

    it('reports a file past one reply as too large, and a missing one as missing', async () => {
      expect(
        await readDocPreviewFile(outsideDocumentGrant(`${PAGES}/huge.html`), 'huge.html')
      ).toMatchObject({ status: 413, reason: 'too-large' })
      expect(
        await readDocPreviewFile(outsideDocumentGrant(`${PAGES}/gone.html`), 'gone.html')
      ).toMatchObject({ status: 404, reason: 'unreadable' })
    })
  })
})

describe('isBroadDocumentFolder', () => {
  it.each([
    ['/', true],
    ['/tmp', true],
    ['/root', true],
    ['/home/me', true],
    ['/Users/me', true],
    ['C:\\', true],
    ['C:\\Users\\me', true],
    ['/home/me/pages', false],
    ['/tmp/run-1', false],
    ['/srv/reports', false],
    ['C:\\Users\\me\\pages', false]
  ])('%s → %s', (folder, broad) => {
    expect(isBroadDocumentFolder(folder)).toBe(broad)
  })
})
