import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { i18n } from '@/i18n/i18n'
import {
  forkMenuLabel,
  registerWorktreeContextMenuLabels,
  type WorktreeContextMenuLabelCounts
} from '../../shared/fork-hooks/worktree-context-menu-labels'
import { installForkLocaleOverlays } from '../i18n/locale-overlay'
import {
  forkWorktreeContextMenuLabels,
  registerForkWorktreeContextMenuLabels
} from './context-menu-labels'

// Upstream's own expressions from use-worktree-context-menu-model.tsx, copied verbatim.
function upstreamLabels({
  isMultiContext,
  sleepCount,
  deleteCount
}: WorktreeContextMenuLabelCounts) {
  return {
    sleepLabel:
      isMultiContext && sleepCount > 0
        ? `Sleep ${sleepCount} Workspace${sleepCount === 1 ? '' : 's'}`
        : 'Sleep',
    deleteLabel:
      isMultiContext && deleteCount > 0
        ? `Delete ${deleteCount} Workspace${deleteCount === 1 ? '' : 's'}`
        : 'Delete Selected'
  }
}

// The two calls upstream's model makes, one per label.
function menuLabels(
  counts: WorktreeContextMenuLabelCounts,
  upstream: ReturnType<typeof upstreamLabels>
) {
  return {
    sleepLabel: forkMenuLabel(
      'sleep',
      counts.isMultiContext,
      counts.sleepCount,
      upstream.sleepLabel
    ),
    deleteLabel: forkMenuLabel(
      'delete',
      counts.isMultiContext,
      counts.deleteCount,
      upstream.deleteLabel
    )
  }
}

const cases: WorktreeContextMenuLabelCounts[] = []
for (const isMultiContext of [false, true]) {
  for (const sleepCount of [0, 1, 2, 5]) {
    for (const deleteCount of [0, 1, 3]) {
      cases.push({ isMultiContext, sleepCount, deleteCount })
    }
  }
}

describe('workspace context menu Sleep and Delete labels', () => {
  beforeAll(() => {
    installForkLocaleOverlays(i18n)
  })
  afterEach(async () => {
    registerWorktreeContextMenuLabels(undefined)
    await i18n.changeLanguage('en')
  })
  afterAll(async () => {
    await i18n.changeLanguage('en')
  })

  it('unregistered, returns exactly the upstream labels it was given', async () => {
    await i18n.changeLanguage('zh')
    for (const counts of cases) {
      const upstream = upstreamLabels(counts)
      expect(menuLabels(counts, upstream)).toEqual(upstream)
    }
  })

  it('in English, matches upstream for singular, plural and the no-count labels', async () => {
    await i18n.changeLanguage('en')
    for (const counts of cases) {
      expect(forkWorktreeContextMenuLabels(counts)).toEqual(upstreamLabels(counts))
    }
    expect(
      forkWorktreeContextMenuLabels({ isMultiContext: true, sleepCount: 1, deleteCount: 2 })
    ).toEqual({
      sleepLabel: 'Sleep 1 Workspace',
      deleteLabel: 'Delete 2 Workspaces'
    })
  })

  it('in Chinese, translates every label', async () => {
    registerForkWorktreeContextMenuLabels()
    await i18n.changeLanguage('zh')
    const labels = (counts: WorktreeContextMenuLabelCounts) =>
      menuLabels(counts, upstreamLabels(counts))
    expect(labels({ isMultiContext: false, sleepCount: 3, deleteCount: 3 })).toEqual({
      sleepLabel: '休眠',
      deleteLabel: '删除所选'
    })
    expect(labels({ isMultiContext: true, sleepCount: 1, deleteCount: 1 })).toEqual({
      sleepLabel: '休眠 1 个工作区',
      deleteLabel: '删除 1 个工作区'
    })
    expect(labels({ isMultiContext: true, sleepCount: 4, deleteCount: 0 })).toEqual({
      sleepLabel: '休眠 4 个工作区',
      deleteLabel: '删除所选'
    })
  })

  it('upstream passes its own English through one fork call per label', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'src/renderer/src/components/sidebar/use-worktree-context-menu-model.tsx'
      ),
      'utf8'
    )
    expect(source.match(/forkMenuLabel\(/g)).toHaveLength(2)
    expect(source).toContain(
      "deleteLabel: forkMenuLabel('delete', isMultiContext, batchDeleteWorktrees.length, deleteLabel)"
    )
    expect(source).toContain(
      "sleepLabel: forkMenuLabel('sleep', isMultiContext, sleepableWorktrees.length, sleepLabel)"
    )
    const labels = readFileSync(
      join(process.cwd(), 'src/renderer/src/components/sidebar/workspace-batch-action-labels.ts'),
      'utf8'
    )
    expect(labels).toContain("'Sleep 1 Workspace'")
    expect(labels).toContain("'Sleep {{count}} Workspaces'")
    expect(labels).toContain("'Sleep'")
    expect(labels).toContain("'Delete 1 Workspace'")
    expect(labels).toContain("'Delete {{count}} Workspaces'")
    expect(labels).toContain("'Delete Selected'")
  })
})
