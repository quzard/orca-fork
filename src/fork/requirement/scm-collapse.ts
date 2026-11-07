// 父仓库状态里，成员工作区整棵收起。不生成可暂存路径，也不保留子模块标记。

export type ScmEntry = { path: string; submodule?: unknown }

export type CollapsedScm<T extends ScmEntry> = {
  kept: T[]
  collapsedRoots: string[]
}

function normalize(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/\/+$/, '')
}

export function isNestedWorktreePath(path: string, roots: readonly string[]): boolean {
  const normalized = normalize(path)
  return roots.some((root) => {
    const member = normalize(root)
    return member.length > 0 && (normalized === member || normalized.startsWith(`${member}/`))
  })
}

export function collapseNestedWorktreeEntries<T extends ScmEntry>(
  entries: readonly T[],
  roots: readonly string[]
): CollapsedScm<T> {
  const collapsedRoots: string[] = []
  const kept: T[] = []
  for (const entry of entries) {
    if (isNestedWorktreePath(entry.path, roots)) {
      const root = roots.find((candidate) => isNestedWorktreePath(entry.path, [candidate]))
      if (root && !collapsedRoots.includes(normalize(root))) {
        collapsedRoots.push(normalize(root))
      }
      continue
    }
    kept.push(entry)
  }
  return { kept, collapsedRoots }
}

export function pathsOutsideNestedWorktrees(
  paths: readonly string[],
  roots: readonly string[]
): string[] {
  return paths.filter((path) => !isNestedWorktreePath(path, roots))
}
