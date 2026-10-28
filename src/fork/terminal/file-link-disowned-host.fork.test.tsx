// 对话链接不带 terminalHandle。宿主不认领路径时，授权则在当前工作区只读打开；exists:false 则拒绝。
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'
import { openDetectedFilePath } from '@/components/terminal-pane/terminal-link-handlers'
import { createTerminalLinkTestDoubles } from '@/components/terminal-pane/terminal-link-handlers-test-fixtures'
import {
  flushDoubleRaf,
  installTerminalLinkTestEnvironment
} from '@/components/terminal-pane/terminal-link-handlers-test-harness'
import { nativeChatFileOpenDeps } from '@/components/native-chat/native-chat-link-target-actions'
import type * as FilePreview from '@/lib/file-preview'
import {
  registerTerminalFileLinkWorkspace,
  resetTerminalFileLinkWorkspaceForTests
} from '../../shared/fork-hooks/terminal-file-link-workspace'
import {
  lookupTerminalHtmlPreview,
  rememberTerminalHtmlPreview,
  resetTerminalHtmlPreviewForTests
} from '../../shared/fork-hooks/terminal-html-preview'
import { ORCA_BROWSER_BLANK_URL } from '../../shared/constants'
import { filesystemPathToFileUri } from '../../shared/file-uri-path'
import { HostFileRefusal } from '@/components/terminal-pane/host-file-refusal'
import { htmlPreviewDespiteHostFileRefusal } from './html-preview-open'
import {
  seedUnrememberedSshHtml,
  sshRoutedHtmlPreviewInputsChanged,
  sshRoutedHtmlPreviewRecoveries
} from './html-preview-reclaim'

const openPreview = vi.hoisted(() => vi.fn())
// 上游预览计划是四个参数。0 参的 mock 展开调用时过不了 web 工程的类型检查。
const previewPlan = vi.hoisted(() =>
  vi.fn((_state: unknown, _worktreeId: string, _filePath: string, _clientLocal = false) => ({
    status: 'doc-preview' as const
  }))
)

vi.mock('@/lib/file-preview', async () => {
  const actual = await vi.importActual<typeof FilePreview>('@/lib/file-preview')
  return {
    ...actual,
    getWorkspaceFilePreviewPlan: (...args: Parameters<typeof actual.getWorkspaceFilePreviewPlan>) =>
      previewPlan(...args),
    openFileInBrowserTab: (...args: Parameters<typeof actual.openFileInBrowserTab>) =>
      openPreview(...args)
  }
})

const findWorkspaceFileRouteMock = vi.hoisted(() => vi.fn())
const doubles = createTerminalLinkTestDoubles()
const {
  storeState,
  openFileMock,
  openFilePathMock,
  runtimeEnvironmentCallMock,
  createBrowserTabMock
} = doubles

registerTerminalFileLinkWorkspace({
  rememberSshStay: () => {},
  lookupStay: () => false
})

vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => storeState
  }
}))

vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealWorkspace: vi.fn(),
  activateAndRevealWorktree: vi.fn()
}))

vi.mock('@/lib/connection-context', () => ({
  getConnectionId: vi.fn(() => null)
}))

vi.mock('@/lib/runtime-workspace-file-route', () => ({
  findWorkspaceFileRoute: findWorkspaceFileRouteMock
}))

vi.mock('@/components/terminal-pane/terminal-remote-file-download-open', () => ({
  downloadAndOpenRemoteTerminalFile: vi.fn()
}))

installTerminalLinkTestEnvironment(doubles)

const HTML = '/srv/notes/demo-pages/x.html'
const TEXT = '/srv/notes/demo-pages/notes.txt'
const clicked = {
  worktreeId: 'wt-feat',
  worktreePath: '/srv/wt/demo-app/feature',
  runtimeEnvironmentId: 'env-1',
  sourceTabId: 'chat-1'
}

function hostAnswers(result: unknown): void {
  runtimeEnvironmentCallMock.mockResolvedValueOnce({
    id: 'rpc-1',
    ok: true,
    result,
    _meta: { runtimeId: 'remote-runtime' }
  })
}

function chatDeps(absolutePath: string, onOpenFailure = vi.fn()) {
  const deps = nativeChatFileOpenDeps({ absolutePath, line: null, column: null }, clicked)
  return { ...deps, onOpenFailure }
}

beforeEach(() => {
  resetTerminalHtmlPreviewForTests()
  findWorkspaceFileRouteMock.mockReset()
  // 客户端目录里可能有 ~ 工作区。服务器没认领时也不能切过去。
  findWorkspaceFileRouteMock.mockReturnValue({
    worktreeId: 'folder:home',
    relativePath: '.demo-pages/x.html',
    executionHostId: 'runtime:env-1'
  })
  previewPlan.mockClear()
  openPreview.mockClear()
  storeState.worktreesByRepo = {}
  storeState.settings = undefined
  Reflect.deleteProperty(storeState, 'runtimeEnvironments')
})

const DEMO_SSH = 'demo-ssh'
const DEMO_PAGES = '/home/demo/.answer-me-with-html/pages'
const CHINESE_HTML = `${DEMO_PAGES}/演示-报告-20260101-000000.html`
const CHINESE_HTML_2 = `${DEMO_PAGES}/演示-附录-20260101-000001.html`

function sshPreviewLocation(filePath: string) {
  return {
    owner: { kind: 'ssh' as const, connectionId: DEMO_SSH },
    requestBase: DEMO_PAGES,
    root: DEMO_PAGES,
    entryRelativePath: filePath.slice(DEMO_PAGES.length + 1),
    sshPreview: true as const
  }
}

function deployOverSsh(targetId: string): void {
  Object.assign(storeState, {
    runtimeEnvironments: [
      {
        id: 'env-1',
        orcadDeployment: {
          kind: 'ssh',
          sshTargetId: targetId,
          sshTargetGeneration: 1,
          localPort: 2201,
          remotePort: 443
        }
      }
    ]
  })
}

function expectBlankDocPreview(filePath: string): void {
  expect(createBrowserTabMock).toHaveBeenCalledWith(clicked.worktreeId, ORCA_BROWSER_BLANK_URL, {
    docLocation: { kind: 'workspace-doc', worktreeId: 'wt-feat', filePath },
    title: filePath.split('/').pop(),
    activate: true,
    browserRuntimeEnvironmentId: null
  })
  const urls = createBrowserTabMock.mock.calls.map((call) => call[1])
  expect(urls).not.toContain(filePath)
  expect(urls.some((url) => typeof url === 'string' && url.startsWith('file:'))).toBe(false)
}

function grantedFile(filePath: string): void {
  hostAnswers({
    worktree: 'wt-feat',
    relativePath: null,
    absolutePath: filePath,
    exists: true,
    isDirectory: false,
    openTarget: {
      kind: 'absolute-file',
      provider: 'local',
      absolutePath: filePath,
      grantId: 'g-1',
      readOnly: true
    }
  })
}

describe('a chat link whose host disowns the path', () => {
  it('opens a granted html file in the clicked workspace browser', async () => {
    grantedFile(HTML)
    const deps = chatDeps(HTML)

    expect(deps).not.toHaveProperty('terminalHandle')
    openDetectedFilePath(HTML, null, null, deps)
    await flushDoubleRaf()

    expect(runtimeEnvironmentCallMock).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'files.resolveTerminalPath',
        params: { worktree: 'id:wt-feat', pathText: HTML, crossWorkspace: true }
      })
    )
    const params = runtimeEnvironmentCallMock.mock.calls.at(-1)?.[0].params
    expect(params).not.toHaveProperty('terminal')
    expect(params).not.toHaveProperty('nativeChatContext')
    expect(activateAndRevealWorkspace).not.toHaveBeenCalledWith('folder:home', expect.anything())
    expect(activateAndRevealWorkspace).toHaveBeenCalledWith('wt-feat', {
      providesInitialSurface: true
    })
    expect(openPreview).not.toHaveBeenCalled()
    expect(previewPlan).not.toHaveBeenCalled()
    expect(openFileMock).not.toHaveBeenCalled()
    expect(createBrowserTabMock).toHaveBeenCalledWith(clicked.worktreeId, ORCA_BROWSER_BLANK_URL, {
      docLocation: { kind: 'workspace-doc', worktreeId: 'wt-feat', filePath: HTML },
      title: 'x.html',
      activate: true,
      browserRuntimeEnvironmentId: null
    })
    expect(lookupTerminalHtmlPreview('wt-feat', HTML)).toMatchObject({
      terminalArtifactGrantId: 'g-1',
      terminalArtifactAbsolutePath: HTML,
      entryRelativePath: 'x.html',
      owner: {
        kind: 'runtime',
        environmentId: 'env-1',
        worktreeSelector: 'id:wt-feat'
      }
    })
  })

  it('opens a granted html file in the editor when the preview cannot be built', async () => {
    resetTerminalFileLinkWorkspaceForTests()
    try {
      grantedFile(HTML)
      openDetectedFilePath(HTML, null, null, chatDeps(HTML))
      await flushDoubleRaf()

      expect(createBrowserTabMock).not.toHaveBeenCalled()
      expect(openPreview).not.toHaveBeenCalled()
      expect(previewPlan).not.toHaveBeenCalled()
      expect(openFileMock).toHaveBeenCalledWith(
        expect.objectContaining({
          filePath: HTML,
          relativePath: HTML,
          worktreeId: 'wt-feat',
          runtimeEnvironmentId: 'env-1',
          readOnly: true,
          terminalArtifactGrantId: 'g-1'
        }),
        { forceContentReload: true }
      )
    } finally {
      registerTerminalFileLinkWorkspace({
        rememberSshStay: () => {},
        lookupStay: () => false
      })
    }
  })

  it('opens a granted text file read-only in the clicked workspace', async () => {
    grantedFile(TEXT)
    const deps = chatDeps(TEXT)

    expect(deps).not.toHaveProperty('terminalHandle')
    openDetectedFilePath(TEXT, null, null, deps)
    await flushDoubleRaf()

    expect(activateAndRevealWorkspace).not.toHaveBeenCalledWith('folder:home', expect.anything())
    expect(activateAndRevealWorkspace).toHaveBeenCalledWith('wt-feat', {
      providesInitialSurface: true,
      executionHostId: 'runtime:env-1'
    })
    expect(openPreview).not.toHaveBeenCalled()
    expect(createBrowserTabMock).not.toHaveBeenCalled()
    expect(previewPlan).not.toHaveBeenCalled()
    expect(openFileMock).toHaveBeenCalledWith(
      expect.objectContaining({
        filePath: TEXT,
        relativePath: TEXT,
        worktreeId: 'wt-feat',
        runtimeEnvironmentId: 'env-1',
        readOnly: true,
        terminalArtifactGrantId: 'g-1'
      }),
      { forceContentReload: true }
    )
  })

  it('refuses exists:false from the host instead of opening a browser or the home workspace', async () => {
    // 宿主已经回答 exists:false，不再先打本机 stat。留下的 mockRejectedValueOnce 会漏到后面的用例。
    hostAnswers({
      worktree: 'wt-feat',
      relativePath: null,
      absolutePath: HTML,
      exists: false,
      isDirectory: false
    })
    const onOpenFailure = vi.fn()

    openDetectedFilePath(HTML, null, null, chatDeps(HTML, onOpenFailure))
    await flushDoubleRaf()

    expect(openFileMock).not.toHaveBeenCalled()
    expect(openPreview).not.toHaveBeenCalled()
    expect(createBrowserTabMock).not.toHaveBeenCalled()
    expect(activateAndRevealWorkspace).not.toHaveBeenCalled()
    // 上游把 exists:false 记成主机上找不到，不再当成「每个工作区之外」。
    expect(onOpenFailure).toHaveBeenCalledWith({
      verdict: 'missing',
      error: new HostFileRefusal(`File not found on its host: ${HTML}`)
    })
  })

  it('reads managed SSH html through the deployment target instead of an artifact grant', async () => {
    deployOverSsh(DEMO_SSH)
    grantedFile(CHINESE_HTML)

    openDetectedFilePath(CHINESE_HTML, null, null, chatDeps(CHINESE_HTML))
    await flushDoubleRaf()

    expectBlankDocPreview(CHINESE_HTML)
    expect(openFileMock).not.toHaveBeenCalled()
    expect(lookupTerminalHtmlPreview('wt-feat', CHINESE_HTML)).toEqual(
      sshPreviewLocation(CHINESE_HTML)
    )
  })

  it('opens managed SSH html when the host refuses a local grant', async () => {
    deployOverSsh(DEMO_SSH)
    // 拒绝来自主机授权，不依赖本机 stat 失败。
    hostAnswers({
      worktree: 'wt-feat',
      relativePath: null,
      absolutePath: CHINESE_HTML,
      exists: false,
      isDirectory: false
    })
    const onOpenFailure = vi.fn()

    openDetectedFilePath(CHINESE_HTML, null, null, chatDeps(CHINESE_HTML, onOpenFailure))
    await flushDoubleRaf()

    expect(onOpenFailure).not.toHaveBeenCalled()
    expect(openFileMock).not.toHaveBeenCalled()
    expectBlankDocPreview(CHINESE_HTML)
    expect(lookupTerminalHtmlPreview('wt-feat', CHINESE_HTML)?.owner).toEqual({
      kind: 'ssh',
      connectionId: DEMO_SSH
    })
  })

  it('keeps a host refusal for html inside the clicked worktree', () => {
    deployOverSsh(DEMO_SSH)
    const fileContext = {
      target: { kind: 'environment' as const, environmentId: 'env-1' },
      worktreeId: 'wt-feat',
      worktreePath: '/srv/wt/demo-app/feature',
      sourceHostResolved: true
    }
    expect(
      htmlPreviewDespiteHostFileRefusal(
        new HostFileRefusal('missing'),
        fileContext,
        '/srv/wt/demo-app/feature/report.html'
      )
    ).toBeNull()
    expect(
      htmlPreviewDespiteHostFileRefusal(new HostFileRefusal('outside'), fileContext, CHINESE_HTML)
    ).toEqual({ isDirectory: false, escapesWorktree: true })
  })

  it('opens managed SSH html inside the worktree as a runtime doc preview', async () => {
    deployOverSsh(DEMO_SSH)
    const filePath = `${clicked.worktreePath}/docs/演示-说明.html`
    hostAnswers({ size: 1, isDirectory: false, mtime: 1 })

    openDetectedFilePath(filePath, null, null, chatDeps(filePath))
    await flushDoubleRaf()

    expectBlankDocPreview(filePath)
    expect(lookupTerminalHtmlPreview('wt-feat', filePath)).toMatchObject({
      owner: {
        kind: 'runtime',
        environmentId: 'env-1',
        worktreeSelector: 'id:wt-feat',
        worktreeRoot: clicked.worktreePath
      },
      requestBase: clicked.worktreePath,
      entryRelativePath: 'docs/演示-说明.html'
    })
    expect(lookupTerminalHtmlPreview('wt-feat', filePath)?.sshPreview).toBeUndefined()
  })

  it('opens html as doc preview when the click looks local but the workspace is SSH-routed', async () => {
    deployOverSsh(DEMO_SSH)
    const root = '/home/demo/wt/demo-app'
    const filePath = `${root}/docs/演示-说明.html`
    storeState.worktreesByRepo = {
      'repo-demo': [
        {
          id: 'wt-feat',
          path: root,
          repoId: 'repo-demo',
          hostId: 'runtime:env-1'
        }
      ]
    }

    openDetectedFilePath(filePath, null, null, {
      worktreeId: 'wt-feat',
      worktreePath: root,
      runtimeEnvironmentId: null,
      sourceTabId: 'chat-1'
    })
    await flushDoubleRaf()

    expectBlankDocPreview(filePath)
    expect(lookupTerminalHtmlPreview('wt-feat', filePath)?.owner).toEqual({
      kind: 'runtime',
      environmentId: 'env-1',
      worktreeSelector: 'id:wt-feat',
      worktreeRoot: root
    })
    expect(openFilePathMock).not.toHaveBeenCalled()
  })

  it('opens outside managed SSH html read-only on the runtime when preview cannot be built', async () => {
    resetTerminalFileLinkWorkspaceForTests()
    try {
      deployOverSsh(DEMO_SSH)
      const root = '/home/demo/wt/demo-app'
      storeState.worktreesByRepo = {
        'repo-demo': [
          {
            id: 'wt-feat',
            path: root,
            repoId: 'repo-demo',
            hostId: 'runtime:env-1'
          }
        ]
      }

      openDetectedFilePath(CHINESE_HTML, null, null, {
        worktreeId: 'wt-feat',
        worktreePath: root,
        runtimeEnvironmentId: null,
        sourceTabId: 'chat-1'
      })
      await flushDoubleRaf()

      expect(createBrowserTabMock).not.toHaveBeenCalled()
      expect(openFilePathMock).not.toHaveBeenCalled()
      expect(openFileMock).toHaveBeenCalledWith(
        expect.objectContaining({
          filePath: CHINESE_HTML,
          relativePath: CHINESE_HTML,
          worktreeId: 'wt-feat',
          runtimeEnvironmentId: 'env-1',
          readOnly: true,
          language: 'html',
          mode: 'edit'
        }),
        { forceContentReload: true }
      )
      expect(openFileMock.mock.calls.at(-1)?.[0]).not.toHaveProperty('externalSshTargetId')
      expect(openFileMock.mock.calls.at(-1)?.[0]).not.toHaveProperty('terminalArtifactGrantId')
      expect(activateAndRevealWorkspace).toHaveBeenCalledWith('wt-feat', {
        providesInitialSurface: true,
        executionHostId: 'runtime:env-1'
      })
    } finally {
      registerTerminalFileLinkWorkspace({
        rememberSshStay: () => {},
        lookupStay: () => false
      })
    }
  })

  it('keeps an ephemeral runtime SSH target on the artifact grant', async () => {
    deployOverSsh('runtime-ssh-orb')
    grantedFile(HTML)

    openDetectedFilePath(HTML, null, null, chatDeps(HTML))
    await flushDoubleRaf()

    expect(lookupTerminalHtmlPreview('wt-feat', HTML)).toMatchObject({
      terminalArtifactGrantId: 'g-1',
      terminalArtifactAbsolutePath: HTML
    })
    expect(lookupTerminalHtmlPreview('wt-feat', HTML)?.sshPreview).toBeUndefined()
  })
})

describe('a bare path that replaced a remembered html preview', () => {
  function rememberedPages() {
    rememberTerminalHtmlPreview('wt-feat', CHINESE_HTML, sshPreviewLocation(CHINESE_HTML))
    rememberTerminalHtmlPreview('wt-feat', CHINESE_HTML_2, sshPreviewLocation(CHINESE_HTML_2))
    rememberTerminalHtmlPreview('wt-feat', HTML, {
      owner: {
        kind: 'runtime',
        environmentId: 'env-1',
        worktreeSelector: 'id:wt-feat',
        worktreeRoot: '/srv/notes/demo-pages'
      },
      requestBase: '/srv/notes/demo-pages',
      root: '/srv/notes/demo-pages',
      entryRelativePath: 'x.html',
      terminalArtifactGrantId: 'g-1',
      terminalArtifactAbsolutePath: HTML
    })
    rememberTerminalHtmlPreview('wt-feat', `${DEMO_PAGES}/notes.html`, {
      owner: { kind: 'ssh', connectionId: DEMO_SSH },
      requestBase: DEMO_PAGES,
      root: DEMO_PAGES,
      entryRelativePath: 'notes.html'
    })
    return {
      browserTabsByWorktree: {
        'wt-feat': [{ id: 'browser-1' }, { id: 'browser-2' }]
      },
      browserPagesByWorkspace: {
        'browser-1': [
          {
            id: 'page-path',
            url: CHINESE_HTML,
            browserRuntimeEnvironmentId: null
          },
          {
            id: 'page-path-2',
            url: CHINESE_HTML_2,
            browserRuntimeEnvironmentId: null
          },
          {
            id: 'page-file',
            url: `file://${CHINESE_HTML}`,
            browserRuntimeEnvironmentId: null
          },
          {
            id: 'page-file-encoded',
            url: filesystemPathToFileUri(CHINESE_HTML_2)
          },
          {
            id: 'page-doc',
            url: ORCA_BROWSER_BLANK_URL,
            docLocation: { kind: 'workspace-doc' },
            browserRuntimeEnvironmentId: null
          }
        ],
        'browser-2': [
          {
            id: 'page-other',
            url: `${DEMO_PAGES}/other.html`,
            browserRuntimeEnvironmentId: null
          },
          {
            id: 'page-artifact',
            url: HTML,
            browserRuntimeEnvironmentId: null
          },
          {
            id: 'page-ssh-flag-off',
            url: `${DEMO_PAGES}/notes.html`,
            browserRuntimeEnvironmentId: null
          }
        ]
      }
    }
  }

  it('returns ssh preview bare paths and file urls, including percent-encoded names', () => {
    expect(sshRoutedHtmlPreviewRecoveries(rememberedPages())).toEqual([
      { pageId: 'page-path', worktreeId: 'wt-feat', filePath: CHINESE_HTML },
      { pageId: 'page-path-2', worktreeId: 'wt-feat', filePath: CHINESE_HTML_2 },
      { pageId: 'page-file', worktreeId: 'wt-feat', filePath: CHINESE_HTML },
      { pageId: 'page-file-encoded', worktreeId: 'wt-feat', filePath: CHINESE_HTML_2 }
    ])
  })

  it('skips an already recovered page so a later bare path is still returned', () => {
    expect(sshRoutedHtmlPreviewRecoveries(rememberedPages(), new Set(['page-path']))).toEqual([
      { pageId: 'page-path-2', worktreeId: 'wt-feat', filePath: CHINESE_HTML_2 },
      { pageId: 'page-file', worktreeId: 'wt-feat', filePath: CHINESE_HTML },
      { pageId: 'page-file-encoded', worktreeId: 'wt-feat', filePath: CHINESE_HTML_2 }
    ])
  })

  it('leaves a local file url alone when the SSH browser route is off', () => {
    deployOverSsh(DEMO_SSH)
    const root = '/home/demo/wt/demo-app'
    const localFile = '/home/demo/local-notes/演示-本地.html'
    storeState.worktreesByRepo = {
      'repo-demo': [
        {
          id: 'wt-feat',
          path: root,
          repoId: 'repo-demo',
          hostId: 'runtime:env-1'
        }
      ]
    }
    storeState.settings = {
      browserSshWorkspaceRoutingEnabled: false
    } as unknown as NonNullable<typeof storeState.settings>
    rememberTerminalHtmlPreview('wt-feat', CHINESE_HTML, sshPreviewLocation(CHINESE_HTML))
    const pages = {
      browserTabsByWorktree: { 'wt-feat': [{ id: 'browser-1' }] },
      browserPagesByWorkspace: {
        'browser-1': [
          { id: 'pasted-local', url: `file://${localFile}` },
          {
            id: 'remembered-remote',
            url: `file://${CHINESE_HTML}`,
            browserRuntimeEnvironmentId: null
          }
        ]
      }
    }

    seedUnrememberedSshHtml(pages)

    expect(lookupTerminalHtmlPreview('wt-feat', localFile)).toBeNull()
    expect(sshRoutedHtmlPreviewRecoveries(pages)).toEqual([])
  })

  it('rescans only when browser pages or tabs change identity', () => {
    const pages = rememberedPages()
    expect(sshRoutedHtmlPreviewInputsChanged(pages, pages)).toBe(false)
    expect(
      sshRoutedHtmlPreviewInputsChanged(pages, {
        ...pages,
        browserPagesByWorkspace: { ...pages.browserPagesByWorkspace }
      })
    ).toBe(true)
    expect(
      sshRoutedHtmlPreviewInputsChanged(pages, {
        ...pages,
        browserTabsByWorktree: { ...pages.browserTabsByWorktree }
      })
    ).toBe(true)
  })
})
