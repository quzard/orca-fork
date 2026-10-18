// fork: 运行时导入把选中路径解析成 git 工作区根。未登记时保持扫描路径。

let resolvePath: ((repoPath: string) => string) | undefined

export function registerImportedWorktreePath(next: (repoPath: string) => string): void {
  resolvePath = next
}

function resolveImportedWorktreePath(repoPath: string): string | undefined {
  return resolvePath?.(repoPath)
}

export function resetImportedWorktreePathForTests(): void {
  resolvePath = undefined
}

export function stampImportedWorktreePath<T extends { path: string; status: string }>(
  project: T
): T & { worktreePath?: string } {
  if (project.status === 'failed') {
    return project
  }
  const worktreePath = resolveImportedWorktreePath(project.path)
  return worktreePath ? { ...project, worktreePath } : project
}
