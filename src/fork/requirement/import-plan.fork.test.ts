import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { discoverLinkedMembers } from './discover-members'
import { applyRequirementPlan, planRequirementImport, type ImportWorkspace } from './import-plan'

function git(cwd: string, args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'ignore' })
}

function commitRepo(path: string): void {
  mkdirSync(path, { recursive: true })
  git(path, ['init', '-b', 'main'])
  git(path, ['config', 'user.email', 'fixture@example.com'])
  git(path, ['config', 'user.name', 'Fixture'])
  writeFileSync(join(path, 'README.md'), 'fixture\n')
  git(path, ['add', 'README.md'])
  git(path, ['commit', '-m', 'init'])
}

describe('requirement import', () => {
  it('maps linked worktrees onto one project per git common dir and stays idempotent', async () => {
    const root = mkdtempSync(join(tmpdir(), 'orca-req-'))
    try {
      const catalog = join(root, 'mains', 'catalog')
      const billing = join(root, 'mains', 'billing')
      const parent = join(root, 'requirement-alpha')
      commitRepo(catalog)
      commitRepo(billing)
      commitRepo(parent)
      mkdirSync(join(parent, 'docs'), { recursive: true })
      writeFileSync(join(parent, 'docs', 'overview.md'), 'overview\n')
      writeFileSync(join(parent, '.gitmodules'), '# not a submodule pointer to manage\n')
      git(parent, ['add', 'docs/overview.md', '.gitmodules'])
      git(parent, ['commit', '-m', 'docs'])
      git(catalog, ['worktree', 'add', '-b', 'member', join(parent, 'catalog')])
      git(catalog, ['worktree', 'add', '-b', 'extra', join(parent, 'catalog-extra')])
      git(billing, ['worktree', 'add', '-b', 'member', join(parent, 'root')])
      const discovered = await discoverLinkedMembers(parent, {
        readDir: async (path) => {
          const { readdirSync } = await import('node:fs')
          return readdirSync(path, { withFileTypes: true }).map((entry) => ({
            name: entry.name,
            isDirectory: entry.isDirectory()
          }))
        },
        readFile: async (path) => {
          const { readFileSync } = await import('node:fs')
          try {
            return readFileSync(path, 'utf8')
          } catch {
            return null
          }
        }
      })
      expect(discovered.members.map((member) => member.name).sort()).toEqual([
        'catalog',
        'catalog-extra',
        'root'
      ])
      expect(discovered.skipped.some((entry) => entry.path.endsWith('.gitmodules'))).toBe(false)
      const catalogCommon = discovered.members.find(
        (member) => member.name === 'catalog'
      )?.gitCommonDir
      const billingCommon = discovered.members.find(
        (member) => member.name === 'root'
      )?.gitCommonDir
      expect(catalogCommon).toBeTruthy()
      expect(billingCommon).not.toBe(catalogCommon)
      const parentWorkspace: ImportWorkspace = {
        id: 'folder:parent',
        hostId: 'local',
        path: parent,
        projectId: 'group-1',
        visible: true,
        lineageParentId: null
      }
      const workspaces: ImportWorkspace[] = [
        parentWorkspace,
        {
          id: 'wt-catalog',
          hostId: 'local',
          path: join(parent, 'catalog'),
          projectId: 'project-catalog',
          visible: true,
          lineageParentId: null
        },
        {
          id: 'wt-root',
          hostId: 'local',
          path: join(parent, 'root'),
          projectId: null,
          visible: false,
          lineageParentId: 'folder:other'
        }
      ]
      const first = planRequirementImport({
        hostId: 'local',
        parentPath: parent,
        parentWorkspaceId: parentWorkspace.id,
        discovered: discovered.members,
        projects: [{ id: 'project-catalog', hostId: 'local', gitCommonDir: catalogCommon! }],
        workspaces
      })
      expect(first.ok).toBe(true)
      expect(first.actions).toContainEqual({
        op: 'reuse-project',
        projectId: 'project-catalog',
        gitCommonDir: catalogCommon
      })
      expect(first.actions.filter((action) => action.op === 'create-project')).toEqual([
        {
          op: 'create-project',
          gitCommonDir: billingCommon,
          projectPath: expect.stringContaining('billing')
        }
      ])
      expect(first.actions).toContainEqual({
        op: 'lineage-conflict',
        workspaceId: 'wt-root',
        parentId: 'folder:parent',
        existingParentId: 'folder:other'
      })
      const links: string[] = []
      const applied = await applyRequirementPlan(first, {
        linkLineage: async (workspaceId) => {
          links.push(workspaceId)
          const row = workspaces.find((workspace) => workspace.id === workspaceId)
          if (row) {
            row.lineageParentId = 'folder:parent'
          }
        },
        adopt: async (workspaceId) => {
          const row = workspaces.find((workspace) => workspace.id === workspaceId)
          if (row) {
            row.visible = true
          }
        }
      })
      expect(links).not.toContain('wt-root')
      expect(applied.skipped.some((entry) => entry.reason === 'lineage-conflict')).toBe(true)
      const second = planRequirementImport({
        hostId: 'local',
        parentPath: parent,
        parentWorkspaceId: parentWorkspace.id,
        discovered: discovered.members,
        projects: [
          { id: 'project-catalog', hostId: 'local', gitCommonDir: catalogCommon! },
          { id: 'project-billing', hostId: 'local', gitCommonDir: billingCommon! }
        ],
        workspaces
      })
      expect(
        second.actions.some(
          (action) => action.op === 'link-lineage' && action.workspaceId === 'wt-catalog'
        )
      ).toBe(false)
      expect(second.actions.some((action) => action.op === 'create-project')).toBe(false)
      const missingParent = planRequirementImport({
        hostId: 'local',
        parentPath: parent,
        parentWorkspaceId: null,
        discovered: discovered.members,
        projects: [],
        workspaces
      })
      expect(missingParent).toEqual({ ok: false, error: 'parent-missing', actions: [] })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
