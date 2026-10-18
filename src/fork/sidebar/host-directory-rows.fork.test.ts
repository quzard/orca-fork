import { describe, expect, it } from 'vitest'
import { normalizeExecutionHostId, type ExecutionHostId } from '../../shared/execution-host'
import type { FolderWorkspace } from '../../shared/folder-workspace-types'
import type { ProjectGroup } from '../../shared/project-group-types'
import type { Repo } from '../../shared/repo-types'
import type { Worktree } from '../../shared/worktree/types'
import { getDefaultUIState } from '../../shared/constants'
import { hydrateSidebarGroupBy } from '../../shared/fork-hooks/sidebar-group-mode'
import { normalizeGroupBy } from '../../main/persistence/applying-settings/ui-selection-normalization'
import {
  projectGroupDeleteKeepsFolderWorkspaces,
  resolveDeleteProjectGroupRemoveContainedProjects
} from '../../shared/fork-hooks/project-group-delete'
import { applyProjectGroupDeleteCascade } from '../../renderer/src/store/project-groups/project-group-removal-state'
import { buildRows } from '../../renderer/src/components/sidebar/worktree-list/grouping/build-rows.test-fixture'
import { addHostSectionRows } from '../../shared/sidebar-list/host-section-rows'
import type { WorktreeGroupBy } from '../../shared/sidebar-list/row-types'
import { registerForkModules } from '../register'
import { installHostDirectoryRowPlan } from './install-row-plan'
import { workspaceGroupDropBlocked, workspaceGroupInsertionIndex } from './workspace-group-drop'
import {
  confirmSettingsProjectRemoval,
  settingsBulkSnapshot,
  toggleAllSettingsProjects,
  toggleSettingsProject
} from './settings-project-bulk'
import { HOST_DIRECTORY_GROUP_BY, hostDirectorySectionKey } from './section-keys'
import { registerForkRendererModules } from '../register-renderer'
import {
  hiddenWorktreeMatchesQuery,
  hiddenWorktreeSearchMinimum
} from '../../shared/fork-hooks/sidebar-chrome'

registerForkModules()
registerForkRendererModules()
installHostDirectoryRowPlan()

function hostId(value: string): ExecutionHostId {
  const id = normalizeExecutionHostId(value)
  if (!id) {
    throw new Error(`Unusable host id: ${value}`)
  }
  return id
}

const DEVBOX = hostId('ssh:devbox')
const MINI = hostId('ssh:mini')

function repo(id: string, path: string, name: string, hostId?: ExecutionHostId): Repo {
  return {
    id,
    path,
    displayName: name,
    badgeColor: '#737373',
    addedAt: 0,
    ...(hostId ? { executionHostId: hostId } : {})
  }
}

function workspace(
  id: string,
  repoId: string,
  path: string,
  name: string,
  hostId?: ExecutionHostId,
  extra: Partial<Worktree> = {}
): Worktree {
  return {
    id,
    repoId,
    path,
    branch: 'refs/heads/main',
    head: 'abc',
    isBare: false,
    isMainWorktree: false,
    linkedIssue: null,
    linkedPR: null,
    linkedLinearIssue: null,
    isArchived: false,
    comment: '',
    isUnread: false,
    isPinned: false,
    displayName: name,
    sortOrder: 0,
    lastActivityAt: 0,
    ...(hostId ? { hostId } : {}),
    ...extra
  }
}

function projectGroup(
  id: string,
  name: string,
  hostId: ExecutionHostId,
  tabOrder = 0
): ProjectGroup {
  return {
    id,
    name,
    parentPath: '/srv/wt',
    executionHostId: hostId,
    parentGroupId: null,
    createdFrom: 'manual',
    tabOrder,
    isCollapsed: false,
    color: null,
    createdAt: 0,
    updatedAt: 0
  }
}

function hostDirectoryRows(args: {
  worktrees: Worktree[]
  repos: Repo[]
  groups?: ProjectGroup[]
  folders?: FolderWorkspace[]
  placeholders?: string[]
  pending?: { creationId: string; repoId: string }[]
  sortBy?: 'name' | 'smart' | 'recent' | 'manual' | 'repo'
}) {
  const repoMap = new Map(args.repos.map((entry) => [entry.id, entry]))
  return buildRows(
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: host-directory is a registered mode id, not one of the built-in literals.
    HOST_DIRECTORY_GROUP_BY as WorktreeGroupBy,
    args.worktrees,
    repoMap,
    null,
    new Set(),
    undefined,
    undefined,
    undefined,
    {},
    new Map(args.worktrees.map((entry) => [entry.id, entry])),
    false,
    undefined,
    args.groups ?? [],
    new Set(args.placeholders ?? []),
    new Map(),
    new Map(),
    args.pending ?? [],
    undefined,
    args.folders ?? [],
    undefined,
    'local',
    'single-location',
    [],
    args.sortBy
  )
}

describe('host-directory sidebar rows', () => {
  it('uses host-directory as the default group mode', () => {
    expect(getDefaultUIState().groupBy).toBe(HOST_DIRECTORY_GROUP_BY)
  })

  it('reads a saved project grouping as host-directory', () => {
    expect(normalizeGroupBy('repo')).toBe(HOST_DIRECTORY_GROUP_BY)
    expect(hydrateSidebarGroupBy('repo')).toBe(HOST_DIRECTORY_GROUP_BY)
    expect(hydrateSidebarGroupBy('parent')).toBe(HOST_DIRECTORY_GROUP_BY)
    expect(normalizeGroupBy('none')).toBe('none')
    expect(normalizeGroupBy('pr-status')).toBe('pr-status')
    expect(normalizeGroupBy('workspace-status')).toBe('workspace-status')
  })

  it('keeps the same directory on two hosts in separate sections', () => {
    const repos = [
      repo('api-devbox', '/srv/wt/project', 'project', DEVBOX),
      repo('api-mini', '/srv/wt/project', 'project', MINI)
    ]
    const rows = hostDirectoryRows({
      repos,
      worktrees: [
        workspace('wt-devbox', 'api-devbox', '/srv/wt/project', 'main', DEVBOX),
        workspace('wt-mini', 'api-mini', '/srv/wt/project', 'main', MINI)
      ]
    })
    const items = rows.filter((row) => row.type === 'item')
    expect(items.map((row) => (row.type === 'item' ? row.sectionKey : ''))).toEqual([
      hostDirectorySectionKey(DEVBOX, null),
      hostDirectorySectionKey(MINI, null)
    ])
    expect(items.map((row) => (row.type === 'item' ? row.directoryLabel : ''))).toEqual([
      'project',
      'project'
    ])
    expect(rows.some((row) => row.type === 'header' && row.repo)).toBe(false)
  })

  it('disambiguates two directories with the same name on one host', () => {
    const repos = [
      repo('work', '/srv/wt/work/api', 'api', DEVBOX),
      repo('oss', '/srv/wt/oss/api', 'api', DEVBOX)
    ]
    const rows = hostDirectoryRows({
      repos,
      worktrees: [
        workspace('wt-work', 'work', '/srv/wt/work/api', 'main', DEVBOX),
        workspace('wt-oss', 'oss', '/srv/wt/oss/api', 'main', DEVBOX)
      ]
    })
    // 两个工作区显示名都是 api。上游用主机限定 id 打破平局，wt-oss 排在 wt-work 前面。
    expect(rows.filter((row) => row.type === 'item').map((row) => row.directoryLabel)).toEqual([
      'oss/api',
      'work/api'
    ])
  })

  it('strips a group parent directory from a checkout that lives outside the repo path', () => {
    const rows = hostDirectoryRows({
      repos: [repo('api', '/elsewhere/api', 'api', DEVBOX)],
      groups: [{ ...projectGroup('grp-api', 'Services', DEVBOX), parentPath: '/srv/wt/group' }],
      worktrees: [
        workspace('wt-api', 'api', '/srv/wt/group/checkout', 'main', DEVBOX, {
          sidebarGroupId: 'grp-api'
        })
      ]
    })
    expect(rows.find((row) => row.type === 'item')?.directoryLabel).toBe('checkout')
  })

  it('keeps a disambiguated name when the repo is inside the group parent', () => {
    const rows = hostDirectoryRows({
      repos: [
        repo('work', '/srv/wt/group/work/api', 'api', DEVBOX),
        repo('oss', '/srv/wt/group/oss/api', 'api', DEVBOX)
      ],
      groups: [{ ...projectGroup('grp-api', 'Services', DEVBOX), parentPath: '/srv/wt/group' }],
      worktrees: [
        workspace('wt-work', 'work', '/srv/wt/group/work/api', 'main', DEVBOX, {
          sidebarGroupId: 'grp-api'
        }),
        workspace('wt-oss', 'oss', '/srv/wt/group/oss/api', 'main', DEVBOX, {
          sidebarGroupId: 'grp-api'
        })
      ]
    })
    // 同名时按主机限定 id 排序，目录标签本身仍是消歧后的 work/api 与 oss/api。
    expect(rows.filter((row) => row.type === 'item').map((row) => row.directoryLabel)).toEqual([
      'oss/api',
      'work/api'
    ])
  })

  it('does not strip the parent when the group holds two checkouts or a pending create', () => {
    const repos = [repo('api', '/elsewhere/api', 'api', DEVBOX)]
    const groups = [{ ...projectGroup('grp-api', 'Services', DEVBOX), parentPath: '/srv/wt/group' }]
    const paired = hostDirectoryRows({
      repos,
      groups,
      worktrees: [
        workspace('wt-one', 'api', '/srv/wt/group/one', 'one', DEVBOX, {
          sidebarGroupId: 'grp-api'
        }),
        workspace('wt-two', 'api', '/srv/wt/group/two', 'two', DEVBOX, {
          sidebarGroupId: 'grp-api'
        })
      ]
    })
    expect(paired.filter((row) => row.type === 'item').map((row) => row.directoryLabel)).toEqual([
      'api',
      'api'
    ])
    const pending = hostDirectoryRows({
      repos,
      groups,
      pending: [{ creationId: 'create-1', repoId: 'api' }],
      worktrees: [
        workspace('wt-api', 'api', '/srv/wt/group/checkout', 'main', DEVBOX, {
          sidebarGroupId: 'grp-api'
        })
      ]
    })
    expect(pending.find((row) => row.type === 'item')?.directoryLabel).toBe('api')
  })

  it('nests a group under its host and keeps an empty group', () => {
    const rows = hostDirectoryRows({
      repos: [repo('web', '/srv/wt/web', 'web', DEVBOX)],
      groups: [
        projectGroup('grp-web', 'Services', DEVBOX),
        projectGroup('grp-empty', 'Empty', DEVBOX, 1)
      ],
      worktrees: [
        workspace('wt-web', 'web', '/srv/wt/web', 'main', DEVBOX, { sidebarGroupId: 'grp-web' })
      ]
    })
    const headers = rows.filter((row) => row.type === 'header')
    expect(headers.map((row) => (row.type === 'header' ? row.label : ''))).toEqual([
      'Services',
      'Empty'
    ])
    expect(headers.every((row) => row.type === 'header' && row.hostId === DEVBOX)).toBe(true)
    const item = rows.find((row) => row.type === 'item')
    expect(item && item.type === 'item' ? item.sectionKey : '').toBe(
      hostDirectorySectionKey(DEVBOX, 'grp-web')
    )
  })

  it('ignores a project group that lives on another host', () => {
    const rows = hostDirectoryRows({
      repos: [repo('web', '/srv/wt/web', 'web', DEVBOX)],
      groups: [projectGroup('grp-mini', 'Remote', MINI)],
      worktrees: [workspace('wt-web', 'web', '/srv/wt/web', 'main', DEVBOX)]
    })
    const item = rows.find((row) => row.type === 'item')
    expect(item && item.type === 'item' ? item.sectionKey : '').toBe(
      hostDirectorySectionKey(DEVBOX, null)
    )
  })

  it('sorts by name inside a section and leaves smart order alone', () => {
    const repos = [repo('web', '/srv/wt/web', 'web', DEVBOX)]
    const worktrees = [
      workspace('b', 'web', '/srv/wt/web-b', 'zeta', DEVBOX, { lastActivityAt: 1 }),
      workspace('a', 'web', '/srv/wt/web-a', 'alpha', DEVBOX, { lastActivityAt: 9 })
    ]
    expect(
      hostDirectoryRows({ repos, worktrees, sortBy: 'name' })
        .filter((row) => row.type === 'item')
        .map((row) => (row.type === 'item' ? row.worktree.displayName : ''))
    ).toEqual(['alpha', 'zeta'])
    expect(
      hostDirectoryRows({ repos, worktrees, sortBy: 'smart' })
        .filter((row) => row.type === 'item')
        .map((row) => (row.type === 'item' ? row.worktree.id : ''))
    ).toEqual(['b', 'a'])
  })

  it('emits a pinned section and a create header for an empty project', () => {
    const repos = [
      repo('web', '/srv/wt/web', 'web', DEVBOX),
      repo('empty', '/srv/wt/empty', 'empty', DEVBOX)
    ]
    const rows = hostDirectoryRows({
      repos,
      placeholders: ['empty'],
      worktrees: [workspace('wt-web', 'web', '/srv/wt/web', 'main', DEVBOX, { isPinned: true })]
    })
    expect(rows.some((row) => row.type === 'header' && row.key === 'pinned')).toBe(true)
    expect(rows.some((row) => row.type === 'header' && row.repo?.id === 'empty')).toBe(true)
  })

  it('still emits repo headers for the built-in project mode', () => {
    const entry = repo('web', '/srv/wt/web', 'web')
    const rows = buildRows(
      'repo',
      [workspace('wt-web', 'web', '/srv/wt/web', 'main')],
      new Map([[entry.id, entry]]),
      null,
      new Set()
    )
    expect(rows.some((row) => row.type === 'header' && row.repo?.id === 'web')).toBe(true)
  })

  it('keeps a host header when only one host is visible', () => {
    const entry = repo('web', '/srv/wt/web', 'web', DEVBOX)
    const rows = hostDirectoryRows({
      repos: [entry],
      worktrees: [workspace('wt-web', 'web', '/srv/wt/web', 'main', DEVBOX)]
    })
    const sectioned = addHostSectionRows({
      rows,
      hostOptions: [
        { id: DEVBOX, kind: 'ssh', label: 'devbox', detail: 'devbox', health: 'available' }
      ],
      workspaceHostScope: 'all',
      defaultHostId: 'local',
      preferProjectGrouping: true,
      retainSingleHostHeader: true
    })
    expect(sectioned.some((row) => row.type === 'host-header' && row.hostId === DEVBOX)).toBe(true)
    const plain = addHostSectionRows({
      rows,
      hostOptions: [
        { id: DEVBOX, kind: 'ssh', label: 'devbox', detail: 'devbox', health: 'available' }
      ],
      workspaceHostScope: 'all',
      defaultHostId: 'local',
      preferProjectGrouping: true
    })
    expect(plain.some((row) => row.type === 'host-header')).toBe(false)
  })
})

describe('project group delete ungroups', () => {
  it('forces ungroup while the option is checked and keeps folder workspaces', () => {
    expect(resolveDeleteProjectGroupRemoveContainedProjects(true)).toBe(false)
    expect(projectGroupDeleteKeepsFolderWorkspaces()).toBe(true)
    const folder: FolderWorkspace = {
      id: 'folder-1',
      projectGroupId: 'grp-web',
      name: 'notes',
      folderPath: '/srv/wt/notes',
      executionHostId: DEVBOX,
      linkedTask: null,
      comment: '',
      isArchived: false,
      isUnread: false,
      isPinned: false,
      sortOrder: 0,
      lastActivityAt: 0,
      createdAt: 0,
      updatedAt: 0
    }
    const next = applyProjectGroupDeleteCascade(
      {
        projectGroups: [projectGroup('grp-web', 'Services', DEVBOX)],
        folderWorkspaces: [folder],
        repos: [{ ...repo('web', '/srv/wt/web', 'web', DEVBOX), projectGroupId: 'grp-web' }]
      },
      'grp-web',
      DEVBOX
    )
    expect(next.folderWorkspaces.map((entry) => entry.id)).toEqual(['folder-1'])
    expect(next.repos[0]?.projectGroupId).toBeNull()
    expect(next.projectGroups).toEqual([])
  })
})

describe('settings bulk selection', () => {
  it('arms removal on the first click and clears the selection when toggling', () => {
    toggleSettingsProject('repo-web')
    expect(settingsBulkSnapshot().selected.has('repo-web')).toBe(true)
    void confirmSettingsProjectRemoval(['repo-web'])
    expect(settingsBulkSnapshot().armed).toBe(true)
    toggleAllSettingsProjects(['repo-web'])
    expect(settingsBulkSnapshot().armed).toBe(false)
    expect(settingsBulkSnapshot().selected.size).toBe(0)
  })
})

describe('hidden workspace search', () => {
  it('shows the search from the first archived workspace and matches the branch', () => {
    expect(hiddenWorktreeSearchMinimum()).toBe(1)
    expect(
      hiddenWorktreeMatchesQuery(
        { displayName: 'main', path: '/srv/wt/project', branch: 'topic' },
        'topic'
      )
    ).toBe(true)
    expect(
      hiddenWorktreeMatchesQuery(
        { displayName: 'other', path: '/srv/wt/other', branch: 'main' },
        'topic'
      )
    ).toBe(false)
  })
})

describe('workspace group drop', () => {
  it('blocks a drop onto another host', () => {
    expect(workspaceGroupDropBlocked(DEVBOX, MINI)).toBe(true)
    expect(workspaceGroupDropBlocked(DEVBOX, DEVBOX)).toBe(false)
  })

  it('inserts before the card whose midpoint is below the pointer', () => {
    const rects = [
      { top: 0, bottom: 20, groupIndex: 0 },
      { top: 20, bottom: 40, groupIndex: 1 }
    ]
    expect(workspaceGroupInsertionIndex(rects, 9, 2)).toBe(0)
    expect(workspaceGroupInsertionIndex(rects, 25, 2)).toBe(1)
    expect(workspaceGroupInsertionIndex(rects, 48, 2)).toBe(2)
  })
})
