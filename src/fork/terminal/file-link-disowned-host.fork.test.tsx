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
import { HostFileRefusal } from '@/components/terminal-pane/terminal-host-workspace-file'
import {
  htmlPreviewDespiteHostFileRefusal,
  sshRoutedHtmlPreviewRecovery
} from './html-preview-open'

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
const { storeState, statMock, openFileMock, runtimeEnvironmentCallMock, createBrowserTabMock } =
  doubles

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
  Reflect.deleteProperty(storeState, 'runtimeEnvironments')
})

const CHINESE_HTML =
  '/home/admin/.answer-me-with-html/pages/Connector-接入框架设计评审-20261026-030126.html'

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
    statMock.mockRejectedValueOnce(new Error('ENOENT: no such file'))
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
    expect(onOpenFailure).toHaveBeenCalledWith({
      verdict: 'unverifiable',
      error: new Error(`${HTML} is outside every workspace on its host`)
    })
  })

  it('reads managed SSH html through the deployment target instead of an artifact grant', async () => {
    deployOverSsh('new_sls')
    grantedFile(CHINESE_HTML)

    openDetectedFilePath(CHINESE_HTML, null, null, chatDeps(CHINESE_HTML))
    await flushDoubleRaf()

    expectBlankDocPreview(CHINESE_HTML)
    expect(openFileMock).not.toHaveBeenCalled()
    expect(lookupTerminalHtmlPreview('wt-feat', CHINESE_HTML)).toEqual({
      owner: { kind: 'ssh', connectionId: 'new_sls' },
      requestBase: '/home/admin/.answer-me-with-html/pages',
      root: '/home/admin/.answer-me-with-html/pages',
      entryRelativePath: 'Connector-接入框架设计评审-20261026-030126.html',
      sshPreview: true
    })
  })

  it('opens managed SSH html when the host refuses a local grant', async () => {
    deployOverSsh('new_sls')
    statMock.mockRejectedValueOnce(new Error('ENOENT: no such file'))
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
      connectionId: 'new_sls'
    })
  })

  it('keeps a host refusal for html inside the clicked worktree', () => {
    deployOverSsh('new_sls')
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
  it('points the local page back at the document and leaves an unremembered path alone', () => {
    rememberTerminalHtmlPreview('wt-feat', CHINESE_HTML, {
      owner: { kind: 'ssh', connectionId: 'new_sls' },
      requestBase: '/home/admin/.answer-me-with-html/pages',
      root: '/home/admin/.answer-me-with-html/pages',
      entryRelativePath: 'Connector-接入框架设计评审-20261026-030126.html',
      sshPreview: true
    })
    const pages = {
      'browser-1': [
        {
          id: 'page-path',
          url: CHINESE_HTML,
          browserRuntimeEnvironmentId: null
        },
        {
          id: 'page-file',
          url: `file://${CHINESE_HTML}`,
          browserRuntimeEnvironmentId: null
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
          url: '/home/admin/.answer-me-with-html/pages/other.html',
          browserRuntimeEnvironmentId: null
        }
      ]
    }

    expect(
      sshRoutedHtmlPreviewRecovery({
        browserTabsByWorktree: {
          'wt-feat': [{ id: 'browser-1' }, { id: 'browser-2' }]
        },
        browserPagesByWorkspace: pages
      })
    ).toEqual({ pageId: 'page-path', worktreeId: 'wt-feat', filePath: CHINESE_HTML })
  })
})
