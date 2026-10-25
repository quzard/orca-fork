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
import { registerTerminalFileLinkWorkspace } from '../../shared/fork-hooks/terminal-file-link-workspace'

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
  findWorkspaceFileRouteMock.mockReset()
  // 客户端目录里可能有 ~ 工作区。服务器没认领时也不能切过去。
  findWorkspaceFileRouteMock.mockReturnValue({
    worktreeId: 'folder:home',
    relativePath: '.demo-pages/x.html',
    executionHostId: 'runtime:env-1'
  })
  previewPlan.mockClear()
  openPreview.mockClear()
})

describe('a chat link whose host disowns the path', () => {
  it.each([
    ['html', HTML],
    ['text', TEXT]
  ] as const)(
    'opens a granted %s file read-only in the clicked workspace',
    async (_kind, filePath) => {
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
      const deps = chatDeps(filePath)

      expect(deps).not.toHaveProperty('terminalHandle')
      openDetectedFilePath(filePath, null, null, deps)
      await flushDoubleRaf()

      expect(runtimeEnvironmentCallMock).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'files.resolveTerminalPath',
          params: { worktree: 'id:wt-feat', pathText: filePath, crossWorkspace: true }
        })
      )
      const params = runtimeEnvironmentCallMock.mock.calls.at(-1)?.[0].params
      expect(params).not.toHaveProperty('terminal')
      expect(params).not.toHaveProperty('nativeChatContext')
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
          filePath,
          relativePath: filePath,
          worktreeId: 'wt-feat',
          runtimeEnvironmentId: 'env-1',
          readOnly: true,
          terminalArtifactGrantId: 'g-1'
        }),
        { forceContentReload: true }
      )
    }
  )

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
})
