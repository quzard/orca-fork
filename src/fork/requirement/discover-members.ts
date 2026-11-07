// 一次性发现父目录里的链接工作区。不监听目录，也不读子模块指针。
import { basename, isAbsolute, resolve } from 'node:path'

export type ListedEntry = { name: string; isDirectory: boolean }

export type DiscoveryIo = {
  readDir: (path: string) => Promise<ListedEntry[]>
  readFile: (path: string) => Promise<string | null>
}

export type DiscoveredCheckout = {
  path: string
  name: string
  kind: 'linked-worktree' | 'nested-clone' | 'gitlink'
  gitCommonDir: string | null
}

export type DiscoveryResult = {
  parentGitCommonDir: string | null
  members: DiscoveredCheckout[]
  skipped: { path: string; reason: 'not-linked-worktree' | 'parent-repo' | 'unreadable' }[]
}

function gitdirFromFile(text: string): string | null {
  const line = text.split(/\r?\n/).find((entry) => entry.startsWith('gitdir:'))
  if (!line) {
    return null
  }
  const value = line.slice('gitdir:'.length).trim()
  return value.length > 0 ? value : null
}

async function commonDirOf(gitDir: string, io: DiscoveryIo): Promise<string | null> {
  const pointer = await io.readFile(resolve(gitDir, 'commondir'))
  if (!pointer?.trim()) {
    return null
  }
  return resolve(gitDir, pointer.trim())
}

async function inspectGit(
  path: string,
  io: DiscoveryIo
): Promise<DiscoveredCheckout | { reason: 'unreadable' }> {
  const dotGit = resolve(path, '.git')
  const listing = await io.readDir(dotGit).catch(() => null)
  if (listing) {
    return { path, name: basename(path), kind: 'nested-clone', gitCommonDir: dotGit }
  }
  const text = await io.readFile(dotGit)
  if (text == null) {
    return { reason: 'unreadable' }
  }
  const gitdir = gitdirFromFile(text)
  if (!gitdir) {
    return { reason: 'unreadable' }
  }
  const absoluteGitDir = isAbsolute(gitdir) ? gitdir : resolve(path, gitdir)
  const common = await commonDirOf(absoluteGitDir, io)
  const linked = absoluteGitDir.includes('/worktrees/')
  return {
    path,
    name: basename(path),
    kind: linked ? 'linked-worktree' : 'gitlink',
    gitCommonDir: common
  }
}

export async function readGitCommonDir(path: string, io: DiscoveryIo): Promise<string | null> {
  const found = await inspectGit(path, io)
  return 'kind' in found ? found.gitCommonDir : null
}

export async function discoverLinkedMembers(
  parentPath: string,
  io: DiscoveryIo
): Promise<DiscoveryResult> {
  const parent = await inspectGit(parentPath, io)
  const parentGitCommonDir = 'kind' in parent ? parent.gitCommonDir : null
  const members: DiscoveredCheckout[] = []
  const skipped: DiscoveryResult['skipped'] = []
  const names = await io.readDir(parentPath).catch(() => [])
  for (const entry of [...names].sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name === '.git' || !entry.isDirectory) {
      continue
    }
    const path = resolve(parentPath, entry.name)
    const found = await inspectGit(path, io)
    if ('reason' in found) {
      const gitText = await io.readFile(resolve(path, '.git'))
      const gitDir = await io.readDir(resolve(path, '.git')).catch(() => null)
      if (gitText == null && !gitDir) {
        continue
      }
      skipped.push({ path, reason: 'unreadable' })
      continue
    }
    if (found.kind !== 'linked-worktree') {
      skipped.push({ path, reason: 'not-linked-worktree' })
      continue
    }
    if (
      found.gitCommonDir &&
      parentGitCommonDir &&
      resolve(found.gitCommonDir) === resolve(parentGitCommonDir)
    ) {
      skipped.push({ path, reason: 'parent-repo' })
      continue
    }
    members.push(found)
  }
  return { parentGitCommonDir, members, skipped }
}
