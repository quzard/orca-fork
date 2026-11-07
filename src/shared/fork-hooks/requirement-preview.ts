// 预览钩子。未登记时协议、父级、导航和源码管理都保持上游行为。

type FolderParentApply = (args: {
  selector: string
  store: unknown
  child: { id: string; instanceId?: string | null; hostId?: string | null }
  target: unknown
}) => boolean

let allowFolderParent = false
let applyFolderParent: FolderParentApply | null = null
let protocolScheme: string | null = null
let openHeader: ((key: string) => boolean) | null = null
let historyIsEntry: ((entry: unknown) => entry is string) | null = null
let historyActivate: ((entry: string) => void) | null = null
let dismissOverview: (() => void) | null = null
let scmEntries:
  | (<T extends { path: string }>(worktreeId: string | null, entries: T[]) => T[])
  | null = null
let scmNote: ((worktreeId: string | null) => string | null) | null = null
let overviewLayer: (() => unknown) | null = null

export function registerFolderParentSetAllowed(): void {
  allowFolderParent = true
}

export function registerFolderParentSet(apply: FolderParentApply): void {
  allowFolderParent = true
  applyFolderParent = apply
}

export function allowFolderParentSet(selector: string): boolean {
  return allowFolderParent && selector.startsWith('folder:')
}

export function applyFolderParentLineage(args: {
  selector: string
  store: unknown
  child: { id: string; instanceId?: string | null; hostId?: string | null }
  target: unknown
}): boolean {
  return applyFolderParent?.(args) ?? false
}

export function registerRequirementPreviewProtocol(scheme: string | null): void {
  protocolScheme = scheme
}

export function requirementPreviewProtocolScheme(): string | null {
  return protocolScheme
}

export function registerRequirementHeaderOpen(open: (key: string) => boolean): void {
  openHeader = open
}

export function openRequirementHeader(key: string): boolean {
  return openHeader?.(key) ?? false
}

export function registerRequirementHistory(handlers: {
  isEntry: (entry: unknown) => entry is string
  activate: (entry: string) => void
  dismiss: () => void
}): void {
  historyIsEntry = handlers.isEntry
  historyActivate = handlers.activate
  dismissOverview = handlers.dismiss
}

export function requirementHistoryEntryIsLive(entry: unknown): boolean {
  return historyIsEntry?.(entry) ?? false
}

/** 命中需求概览条目时返回 true，调用方不要再把它当成工作区 id。 */
export function activateRequirementHistoryEntry(entry: unknown): boolean {
  if (!historyIsEntry?.(entry)) {
    return false
  }
  if (!historyActivate) {
    console.warn('requirement overview history has no activator')
    return true
  }
  historyActivate(entry)
  return true
}

export function dismissRequirementOverview(): void {
  dismissOverview?.()
}

export function registerRequirementScm(handlers: {
  project: <T extends { path: string }>(worktreeId: string | null, entries: T[]) => T[]
  note: (worktreeId: string | null) => string | null
}): void {
  scmEntries = handlers.project
  scmNote = handlers.note
}

export function projectRequirementScmEntries<T extends { path: string }>(
  worktreeId: string | null,
  entries: T[]
): T[] {
  return scmEntries?.(worktreeId, entries) ?? entries
}

export function requirementScmNote(worktreeId: string | null): string | null {
  return scmNote?.(worktreeId) ?? null
}

export function registerRequirementOverview(render: () => unknown): void {
  overviewLayer = render
}

export function requirementOverviewLayer(): unknown {
  return overviewLayer?.() ?? null
}

let stagePrefixes: (worktreeId: string | null) => readonly string[] = () => []

export function registerRequirementStagePrefixes(
  read: (worktreeId: string | null) => readonly string[]
): void {
  stagePrefixes = read
}

export function requirementStagePrefixes(worktreeId: string | null): readonly string[] {
  return stagePrefixes(worktreeId)
}

export function requirementStagePathBlocked(worktreeId: string | null, filePath: string): boolean {
  return requirementStagePrefixes(worktreeId).some(
    (prefix) => filePath === prefix || filePath.startsWith(`${prefix}/`)
  )
}
