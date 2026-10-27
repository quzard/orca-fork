// 地址栏从已打开的运行时文档预览，跳到工作区外的 HTML。
// 路由开着时记下和点击相同的 SSH 预览；关掉、禁用目标、runtime-ssh- 仍拒绝。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '@/store'
import { makeRepo, makeWorktree } from '@/components/worktree-jump-palette-test-fixtures'
import {
  commitWorkspaceDocAddressPreview,
  resolveWorkspaceDocAddressTarget
} from '@/lib/workspace-doc-address-input'
import { buildDocPreviewGrantRequest } from '@/lib/doc-preview-grants'
import { convertBrowserPageToWorkspaceDoc, getWorkspaceFilePreviewPlan } from '@/lib/file-preview'
import { routeWorkspaceDocAddressSubmission } from '@/components/browser-pane/navigate/workspace-doc-address-submission'
import { getDefaultSettings } from '../../shared/constants'
import { filesystemPathToFileUri } from '../../shared/file-uri-path'
import type { PublicKnownRuntimeEnvironment } from '../../shared/runtime-environments'
import {
  lookupTerminalHtmlPreview,
  rememberTerminalHtmlPreview,
  resetTerminalHtmlPreviewForTests
} from '../../shared/fork-hooks/terminal-html-preview'
import { installManagedSshAddressPreview } from './html-preview-address'
import type { BrowserLoadError } from '../../shared/browser-workspace-types'
import type { AppState } from '@/store/types'

const ENV = 'env-demo'
const HOST = `runtime:${ENV}` as const
const DEMO_SSH = 'demo-ssh'
const ROOT = '/home/demo/wt/demo-app'
const WORKTREE_ID = `repo-1::${ROOT}`
const INSIDE = `${ROOT}/docs/delivery.html`
const OUTSIDE = '/home/demo/.answer-me-with-html/pages/demo-notes-20260101.html'
const PAGES = '/home/demo/.answer-me-with-html/pages'

type Snapshot = Pick<
  AppState,
  | 'repos'
  | 'worktreesByRepo'
  | 'detectedWorktreesByRepo'
  | 'folderWorkspaces'
  | 'projectGroups'
  | 'activeWorktreeId'
  | 'activeWorkspaceExecutionHostId'
  | 'runtimeEnvironments'
  | 'settings'
  | 'browserTabsByWorktree'
  | 'browserPagesByWorkspace'
  | 'unifiedTabsByWorktree'
>

let snapshot: Snapshot | null = null

function managedEnvironment(targetId: string): PublicKnownRuntimeEnvironment {
  return {
    id: ENV,
    name: 'Demo',
    createdAt: 0,
    updatedAt: 0,
    lastUsedAt: null,
    runtimeId: null,
    connectionDependency: 'ssh-tunnel',
    endpoints: [
      {
        id: 'ws-demo',
        kind: 'websocket',
        label: 'WebSocket',
        endpoint: 'ws://127.0.0.1:2201'
      }
    ],
    preferredEndpointId: 'ws-demo',
    orcadDeployment: {
      kind: 'ssh',
      sshTargetId: targetId,
      sshTargetGeneration: 1,
      localPort: 2201,
      remotePort: 443
    }
  }
}

function seed(options?: {
  targetId?: string
  routingEnabled?: boolean
  disabledTargetIds?: string[]
  local?: boolean
}): void {
  const local = options?.local === true
  const targetId = options?.targetId ?? DEMO_SSH
  useAppStore.setState({
    repos: [
      {
        ...makeRepo(),
        path: ROOT,
        executionHostId: local ? 'local' : HOST
      }
    ],
    worktreesByRepo: {
      'repo-1': [
        makeWorktree(WORKTREE_ID, 'demo', {
          path: ROOT,
          hostId: local ? 'local' : HOST
        })
      ]
    },
    detectedWorktreesByRepo: {},
    folderWorkspaces: [],
    projectGroups: [],
    activeWorktreeId: WORKTREE_ID,
    activeWorkspaceExecutionHostId: local ? 'local' : HOST,
    runtimeEnvironments: local ? [] : [managedEnvironment(targetId)],
    settings: {
      ...getDefaultSettings('/home/demo'),
      browserSshWorkspaceRoutingEnabled: options?.routingEnabled !== false,
      browserSshWorkspaceRoutingDisabledTargetIds: options?.disabledTargetIds ?? []
    }
  })
}

beforeEach(() => {
  installManagedSshAddressPreview()
  resetTerminalHtmlPreviewForTests()
  const state = useAppStore.getState()
  snapshot = {
    repos: state.repos,
    worktreesByRepo: state.worktreesByRepo,
    detectedWorktreesByRepo: state.detectedWorktreesByRepo,
    folderWorkspaces: state.folderWorkspaces,
    projectGroups: state.projectGroups,
    activeWorktreeId: state.activeWorktreeId,
    activeWorkspaceExecutionHostId: state.activeWorkspaceExecutionHostId,
    runtimeEnvironments: state.runtimeEnvironments,
    settings: state.settings,
    browserTabsByWorktree: state.browserTabsByWorktree,
    browserPagesByWorkspace: state.browserPagesByWorkspace,
    unifiedTabsByWorktree: state.unifiedTabsByWorktree
  }
  seed()
})

afterEach(() => {
  resetTerminalHtmlPreviewForTests()
  if (snapshot) {
    useAppStore.setState(snapshot)
  }
})

describe('address bar navigation to outside-workspace HTML on managed SSH', () => {
  it('keeps an in-workspace HTML on the runtime doc preview', () => {
    const target = resolveWorkspaceDocAddressTarget(useAppStore.getState(), WORKTREE_ID, INSIDE)

    expect(target).toMatchObject({
      status: 'workspace-doc',
      docLocation: { worktreeId: WORKTREE_ID, filePath: INSIDE }
    })
    expect(lookupTerminalHtmlPreview(WORKTREE_ID, INSIDE)).toBeNull()
    expect(buildDocPreviewGrantRequest(useAppStore.getState(), WORKTREE_ID, INSIDE)?.owner).toEqual(
      {
        kind: 'runtime',
        environmentId: ENV,
        worktreeSelector: `id:${WORKTREE_ID}`,
        worktreeRoot: ROOT
      }
    )
  })

  it('re-routes an outside absolute path through the managed SSH preview instead of the paired refusal', () => {
    const before = getWorkspaceFilePreviewPlan(useAppStore.getState(), WORKTREE_ID, OUTSIDE)
    expect(before).toMatchObject({ status: 'unsupported', reason: 'outside-worktree' })

    const target = resolveWorkspaceDocAddressTarget(useAppStore.getState(), WORKTREE_ID, OUTSIDE)

    expect(target).toEqual({
      status: 'workspace-doc',
      docLocation: { kind: 'workspace-doc', worktreeId: WORKTREE_ID, filePath: OUTSIDE }
    })
    // 解析不能写记录，否则只是敲路径就会绕过后面的拒绝。
    expect(lookupTerminalHtmlPreview(WORKTREE_ID, OUTSIDE)).toBeNull()
    expect(getWorkspaceFilePreviewPlan(useAppStore.getState(), WORKTREE_ID, OUTSIDE)).toMatchObject(
      { status: 'unsupported', reason: 'outside-worktree' }
    )

    commitWorkspaceDocAddressPreview(useAppStore.getState(), target)
    const location = {
      owner: { kind: 'ssh' as const, connectionId: DEMO_SSH },
      requestBase: PAGES,
      root: PAGES,
      entryRelativePath: 'demo-notes-20260101.html',
      sshPreview: true as const
    }
    expect(lookupTerminalHtmlPreview(WORKTREE_ID, OUTSIDE)).toEqual(location)
    expect(buildDocPreviewGrantRequest(useAppStore.getState(), WORKTREE_ID, OUTSIDE)).toEqual(
      location
    )
    expect(getWorkspaceFilePreviewPlan(useAppStore.getState(), WORKTREE_ID, OUTSIDE)).toEqual({
      status: 'doc-preview'
    })
  })

  it('accepts a file URL typed into the address bar of the open doc preview', () => {
    const errors: BrowserLoadError[] = []
    const consumed = routeWorkspaceDocAddressSubmission({
      worktreeId: WORKTREE_ID,
      pageId: 'page-runtime-doc',
      value: ` ${filesystemPathToFileUri(OUTSIDE)} `,
      onLoadError: (error) => errors.push(error)
    })

    expect(consumed).toBe(true)
    expect(errors).toEqual([])
    expect(lookupTerminalHtmlPreview(WORKTREE_ID, OUTSIDE)?.owner).toEqual({
      kind: 'ssh',
      connectionId: DEMO_SSH
    })
    expect(lookupTerminalHtmlPreview(WORKTREE_ID, OUTSIDE)?.sshPreview).toBe(true)
  })

  it.each<{ routingEnabled: boolean; disabledTargetIds: string[] }>([
    { routingEnabled: false, disabledTargetIds: [] },
    { routingEnabled: true, disabledTargetIds: [DEMO_SSH] }
  ])('does not seed an SSH preview when the browser route is ineligible (%j)', (options) => {
    seed(options)
    const target = resolveWorkspaceDocAddressTarget(useAppStore.getState(), WORKTREE_ID, OUTSIDE)

    expect(target.status).toBe('unsupported')
    expect(lookupTerminalHtmlPreview(WORKTREE_ID, OUTSIDE)).toBeNull()
    expect(buildDocPreviewGrantRequest(useAppStore.getState(), WORKTREE_ID, OUTSIDE)).toBeNull()
  })

  it('leaves an ephemeral runtime-ssh target on the paired refusal', () => {
    seed({ targetId: 'runtime-ssh-orb' })
    const target = resolveWorkspaceDocAddressTarget(useAppStore.getState(), WORKTREE_ID, OUTSIDE)

    expect(target.status).toBe('unsupported')
    expect(lookupTerminalHtmlPreview(WORKTREE_ID, OUTSIDE)).toBeNull()
  })

  it('converts the open runtime doc preview when the address bar leaves the workspace', () => {
    const tab = useAppStore.getState().createBrowserTab(WORKTREE_ID, 'data:text/html,', {
      docLocation: { kind: 'workspace-doc', worktreeId: WORKTREE_ID, filePath: INSIDE },
      title: 'delivery.html',
      browserRuntimeEnvironmentId: null
    })
    const pageId = useAppStore.getState().browserPagesByWorkspace[tab.id]?.[0]?.id ?? ''
    const state = useAppStore.getState()
    const target = resolveWorkspaceDocAddressTarget(state, WORKTREE_ID, OUTSIDE)

    expect(target.status).toBe('workspace-doc')
    if (target.status !== 'workspace-doc') {
      return
    }
    commitWorkspaceDocAddressPreview(state, target)
    expect(convertBrowserPageToWorkspaceDoc(pageId, target.docLocation)).toBe('converted')

    const page = useAppStore.getState().browserPagesByWorkspace[tab.id]?.[0]
    expect(page?.docLocation).toEqual(target.docLocation)
    expect(page?.url ?? '').not.toMatch(/^file:/)
    expect(page?.browserRuntimeEnvironmentId).toBeNull()
    expect(
      buildDocPreviewGrantRequest(useAppStore.getState(), WORKTREE_ID, OUTSIDE)?.sshPreview
    ).toBe(true)
  })

  it.each<{ routingEnabled: boolean; disabledTargetIds: string[] }>([
    { routingEnabled: false, disabledTargetIds: [] },
    { routingEnabled: true, disabledTargetIds: [DEMO_SSH] }
  ])('forgets an address-bar preview when the route becomes ineligible (%j)', (options) => {
    const state = useAppStore.getState()
    const target = resolveWorkspaceDocAddressTarget(state, WORKTREE_ID, OUTSIDE)
    commitWorkspaceDocAddressPreview(state, target)
    expect(lookupTerminalHtmlPreview(WORKTREE_ID, OUTSIDE)?.sshPreview).toBe(true)

    useAppStore.setState({
      settings: {
        ...getDefaultSettings('/home/demo'),
        browserSshWorkspaceRoutingEnabled: options.routingEnabled,
        browserSshWorkspaceRoutingDisabledTargetIds: options.disabledTargetIds
      }
    })

    expect(lookupTerminalHtmlPreview(WORKTREE_ID, OUTSIDE)).toBeNull()
    expect(getWorkspaceFilePreviewPlan(useAppStore.getState(), WORKTREE_ID, OUTSIDE)).toMatchObject(
      { status: 'unsupported', reason: 'outside-worktree' }
    )
    expect(buildDocPreviewGrantRequest(useAppStore.getState(), WORKTREE_ID, OUTSIDE)).toBeNull()
  })

  it('does not keep honoring a remembered SSH preview after the route is disabled', () => {
    const location = {
      owner: { kind: 'ssh' as const, connectionId: DEMO_SSH },
      requestBase: PAGES,
      root: PAGES,
      entryRelativePath: 'demo-notes-20260101.html',
      sshPreview: true as const
    }
    rememberTerminalHtmlPreview(WORKTREE_ID, OUTSIDE, location)
    expect(getWorkspaceFilePreviewPlan(useAppStore.getState(), WORKTREE_ID, OUTSIDE)).toEqual({
      status: 'doc-preview'
    })

    useAppStore.setState({
      settings: {
        ...getDefaultSettings('/home/demo'),
        browserSshWorkspaceRoutingEnabled: false
      }
    })

    // 点击记下的记录还在，但计划不再按旧记录放行。
    expect(lookupTerminalHtmlPreview(WORKTREE_ID, OUTSIDE)).toEqual(location)
    expect(getWorkspaceFilePreviewPlan(useAppStore.getState(), WORKTREE_ID, OUTSIDE)).toMatchObject(
      { status: 'unsupported', reason: 'outside-worktree' }
    )
  })

  it('does not turn a local HTML path into a managed SSH preview', () => {
    seed({ local: true })
    const target = resolveWorkspaceDocAddressTarget(useAppStore.getState(), WORKTREE_ID, OUTSIDE)

    expect(target.status).not.toBe('workspace-doc')
    expect(lookupTerminalHtmlPreview(WORKTREE_ID, OUTSIDE)).toBeNull()
  })
})
