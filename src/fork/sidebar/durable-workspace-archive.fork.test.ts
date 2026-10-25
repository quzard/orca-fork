import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  applyRegisteredDurableWorkspaceArchive,
  registerDurableWorkspaceArchive,
  registerDurableWorkspaceArchiveRelease,
  registerDurableWorkspaceMetaReactivate,
  releaseRegisteredDurableWorkspaceArchive,
  type DurableArchiveRow
} from '../../shared/fork-hooks/workspace-durable-archive'
import {
  DURABLE_WORKSPACE_ARCHIVE_STORAGE_KEY,
  forgetWorkspaceArchive,
  releaseDurableArchiveAtPath,
  releaseDurableArchiveForWorkspace,
  rememberWorkspaceArchive,
  stampWorkspaceArchive
} from './durable-workspace-archive'

const storage = new Map<string, string>()

function row(
  overrides: Partial<DurableArchiveRow> & Pick<DurableArchiveRow, 'id'>
): DurableArchiveRow {
  return {
    path: '/srv/wt/project/checkout',
    repoId: 'repo-1',
    hostId: 'local',
    isArchived: false,
    ...overrides
  }
}

describe('durable workspace archive', () => {
  beforeEach(() => {
    storage.clear()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value)
        }
      }
    })
    registerDurableWorkspaceArchive(undefined)
    registerDurableWorkspaceArchiveRelease(undefined)
    registerDurableWorkspaceMetaReactivate(undefined)
  })

  afterEach(() => {
    registerDurableWorkspaceArchive(undefined)
    registerDurableWorkspaceArchiveRelease(undefined)
    registerDurableWorkspaceMetaReactivate(undefined)
  })

  it('keeps an orphan checkout archived when a rescan uses another repo on the same host', () => {
    rememberWorkspaceArchive({
      id: 'stale::/srv/wt/project/checkout',
      path: '/srv/wt/project/checkout',
      repoId: 'stale',
      hostId: 'ssh:box',
      pathOnly: true
    })
    const scanned = [
      row({
        id: 'live::/srv/wt/project/checkout',
        repoId: 'live',
        hostId: 'ssh:box'
      })
    ]

    const archived = stampWorkspaceArchive(scanned)

    expect(archived[0]?.isArchived).toBe(true)
    expect(scanned[0]?.isArchived).toBe(false)
    expect(storage.get(DURABLE_WORKSPACE_ARCHIVE_STORAGE_KEY)).toContain('"pathOnly":true')
  })

  it('does not hide another host when both the path-only record and the row name a host', () => {
    rememberWorkspaceArchive({
      id: 'stale::/srv/wt/project/checkout',
      path: '/srv/wt/project/checkout',
      repoId: 'stale',
      hostId: 'ssh:box',
      pathOnly: true
    })

    const otherHost = stampWorkspaceArchive([
      row({
        id: 'live::/srv/wt/project/checkout',
        repoId: 'live',
        hostId: 'ssh:other'
      })
    ])

    expect(otherHost[0]?.isArchived).toBe(false)
  })

  it('still hides when the record or the row has no host', () => {
    rememberWorkspaceArchive({
      id: 'stale::/srv/wt/project/checkout',
      path: '/srv/wt/project/checkout',
      repoId: 'stale',
      pathOnly: true
    })
    const hostedRow = stampWorkspaceArchive([
      row({ id: 'live::/srv/wt/project/checkout', repoId: 'live', hostId: 'ssh:box' })
    ])
    expect(hostedRow[0]?.isArchived).toBe(true)

    storage.clear()
    rememberWorkspaceArchive({
      id: 'stale::/srv/wt/project/checkout',
      path: '/srv/wt/project/checkout',
      repoId: 'stale',
      hostId: 'ssh:box',
      pathOnly: true
    })
    const unhostedRow = stampWorkspaceArchive([
      row({ id: 'live::/srv/wt/project/checkout', repoId: 'live', hostId: undefined })
    ])
    expect(unhostedRow[0]?.isArchived).toBe(true)
  })

  it('clears a same-host path hide when a new or imported workspace lands on that path', () => {
    rememberWorkspaceArchive({
      id: 'stale::/srv/wt/project/checkout',
      path: '/srv/wt/project/checkout',
      repoId: 'stale',
      hostId: 'ssh:box',
      pathOnly: true
    })
    rememberWorkspaceArchive({
      id: 'other::/srv/wt/project/checkout',
      path: '/srv/wt/project/checkout',
      repoId: 'other',
      hostId: 'ssh:other',
      pathOnly: true
    })

    releaseDurableArchiveForWorkspace({
      worktree: {
        id: 'live::/srv/wt/project/checkout',
        path: '/srv/wt/project/checkout',
        repoId: 'live',
        hostId: 'ssh:box'
      }
    })

    const created = stampWorkspaceArchive([
      row({
        id: 'live::/srv/wt/project/checkout',
        repoId: 'live',
        hostId: 'ssh:box'
      })
    ])
    const otherHost = stampWorkspaceArchive([
      row({
        id: 'other::/srv/wt/project/checkout',
        repoId: 'other',
        hostId: 'ssh:other'
      })
    ])
    expect(created[0]?.isArchived).toBe(false)
    expect(otherHost[0]?.isArchived).toBe(true)

    releaseDurableArchiveAtPath({
      id: 'other::/srv/wt/project/checkout',
      path: '/srv/wt/project/checkout',
      repoId: 'other',
      hostId: 'ssh:other'
    })
    expect(
      stampWorkspaceArchive([
        row({
          id: 'other::/srv/wt/project/checkout',
          repoId: 'other',
          hostId: 'ssh:other'
        })
      ])[0]?.isArchived
    ).toBe(false)
  })

  it('clears a same-host path hide after the folder delete succeeds', () => {
    rememberWorkspaceArchive({
      id: 'repo-1::/srv/wt/project/checkout',
      path: '/srv/wt/project/checkout',
      repoId: 'repo-1',
      hostId: 'ssh:box',
      pathOnly: true
    })
    releaseDurableArchiveForWorkspace({
      worktree: {
        id: 'repo-1::/srv/wt/project/checkout',
        path: '/srv/wt/project/checkout',
        repoId: 'repo-1',
        hostId: 'ssh:box'
      }
    })
    expect(
      stampWorkspaceArchive([
        row({
          id: 'repo-1::/srv/wt/project/checkout',
          hostId: 'ssh:box'
        })
      ])[0]?.isArchived
    ).toBe(false)
  })

  it('does not clear a path hide until the renderer registers the release', () => {
    rememberWorkspaceArchive({
      id: 'repo-1::/srv/wt/project/checkout',
      path: '/srv/wt/project/checkout',
      repoId: 'repo-1',
      hostId: 'local',
      pathOnly: true
    })
    releaseRegisteredDurableWorkspaceArchive({
      worktree: {
        id: 'repo-1::/srv/wt/project/checkout',
        path: '/srv/wt/project/checkout',
        repoId: 'repo-1',
        hostId: 'local'
      }
    })
    expect(
      stampWorkspaceArchive([row({ id: 'repo-1::/srv/wt/project/checkout' })])[0]?.isArchived
    ).toBe(true)

    registerDurableWorkspaceArchiveRelease(releaseDurableArchiveForWorkspace)
    releaseRegisteredDurableWorkspaceArchive({
      worktree: {
        id: 'repo-1::/srv/wt/project/checkout',
        path: '/srv/wt/project/checkout',
        repoId: 'repo-1',
        hostId: 'local'
      }
    })
    expect(
      stampWorkspaceArchive([row({ id: 'repo-1::/srv/wt/project/checkout' })])[0]?.isArchived
    ).toBe(false)
  })

  it('does not hide another host when the removed row had an owner', () => {
    rememberWorkspaceArchive({
      id: 'repo-1::/srv/wt/project/checkout',
      path: '/srv/wt/project/checkout',
      repoId: 'repo-1',
      hostId: 'local',
      pathOnly: false
    })

    const otherHost = stampWorkspaceArchive([
      row({ id: 'repo-1::/srv/wt/project/checkout', hostId: 'ssh:other' })
    ])
    const sameHost = stampWorkspaceArchive([
      row({ id: 'repo-1::/srv/wt/project/checkout/', path: '/srv/wt/project/checkout/' })
    ])

    expect(otherHost[0]?.isArchived).toBe(false)
    expect(sameHost[0]?.isArchived).toBe(true)
  })

  it('matches a renamed checkout by identity key', () => {
    rememberWorkspaceArchive({
      id: 'repo-1::/old',
      path: '/old',
      repoId: 'repo-1',
      hostId: 'local',
      identityKey: 'wt2:local:abc',
      pathOnly: false
    })

    const archived = stampWorkspaceArchive([
      row({
        id: 'repo-1::/new',
        path: '/new',
        identity: { key: 'wt2:local:abc' }
      })
    ])

    expect(archived[0]?.isArchived).toBe(true)
  })

  it('drops the hide on restore so the next rescan shows the row', () => {
    const scanned = row({ id: 'repo-1::/srv/wt/project/checkout' })
    rememberWorkspaceArchive({
      id: scanned.id,
      path: scanned.path,
      repoId: scanned.repoId,
      hostId: scanned.hostId,
      pathOnly: true
    })
    expect(stampWorkspaceArchive([scanned])[0]?.isArchived).toBe(true)

    forgetWorkspaceArchive({ ...scanned, isArchived: true })

    expect(stampWorkspaceArchive([scanned])[0]?.isArchived).toBe(false)
  })

  it('leaves the list alone when the saved record is unreadable', () => {
    storage.set(DURABLE_WORKSPACE_ARCHIVE_STORAGE_KEY, '{')
    const scanned = [row({ id: 'repo-1::/srv/wt/project/checkout' })]

    expect(stampWorkspaceArchive(scanned)).toBe(scanned)
  })

  it('does nothing until the renderer registers the stamp', () => {
    rememberWorkspaceArchive({
      id: 'stale::/srv/wt/project/checkout',
      path: '/srv/wt/project/checkout',
      repoId: 'stale',
      pathOnly: true
    })
    const scanned = [row({ id: 'live::/srv/wt/project/checkout', repoId: 'live' })]

    expect(applyRegisteredDurableWorkspaceArchive(scanned)).toBe(scanned)

    registerDurableWorkspaceArchive(stampWorkspaceArchive)
    expect(applyRegisteredDurableWorkspaceArchive(scanned)[0]?.isArchived).toBe(true)
  })
})
