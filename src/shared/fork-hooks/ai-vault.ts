// fork: 面板插槽，以及分组、堆内存和索引策略。未注册时保持上游。

import type { ExecutionHostScope } from '../execution-host'

export type AiVaultToolIndexPolicy = 'capped' | 'chunk'

export type AiVaultForkServicePolicy = {
  toolIndex: AiVaultToolIndexPolicy
  schemaOffset: number
}

type ListGroup = {
  key: string
  label: string | null
  sessions: { executionHostId: string }[]
}

const AI_VAULT_PANEL_SLOT_IDS = ['header-actions', 'below-header', 'list-footer'] as const
export type AiVaultPanelSlotId = (typeof AI_VAULT_PANEL_SLOT_IDS)[number]

type SlotRender = () => unknown

const panelSlots = new Map<AiVaultPanelSlotId, SlotRender>()
let serviceHeapMiB: (() => number) | undefined
let servicePolicy: AiVaultForkServicePolicy | undefined
let toolIndexPolicy: AiVaultToolIndexPolicy = 'capped'
let schemaOffset = 0
let folderLabelHook: ((pathValue: string | null) => string | null) | undefined
let groupPartition: ((groups: readonly ListGroup[]) => readonly ListGroup[]) | undefined
let collapseNewGroups = false
let collapseAll: (() => void) | undefined
let defaultHostScope: ExecutionHostScope | undefined
let wrapGroupLabels = false
let groupSessionCounts: ReadonlyMap<string, number> | undefined
let hostMenuDecoration:
  | (<T extends { id: string; label: string; secondary?: boolean }>(
      options: readonly T[],
      context: VaultHostMenuContext
    ) => T[])
  | undefined

export type VaultHostMenuContext = {
  historyHostIds: readonly string[]
  activeHostId: string | null
  connectedSshTargetIds: readonly string[]
}

export function registerAiVaultPanelSlot(id: AiVaultPanelSlotId, render: SlotRender): void {
  panelSlots.set(id, render)
}

export function getAiVaultPanelSlot(id: AiVaultPanelSlotId): SlotRender | undefined {
  return panelSlots.get(id)
}

export function registerAiVaultServiceHeap(resolve: () => number): void {
  serviceHeapMiB = resolve
}

export function readAiVaultServiceHeapMiB(fallback: number): number {
  return serviceHeapMiB ? serviceHeapMiB() : fallback
}

export function setAiVaultForkServicePolicy(next: AiVaultForkServicePolicy | undefined): void {
  servicePolicy = next
}

/** Scanner service init field. Unregistered, nothing is added and the service runs upstream. */
export function aiVaultForkServiceInit(): { fork?: AiVaultForkServicePolicy } {
  return servicePolicy ? { fork: servicePolicy } : {}
}

export function registerAiVaultToolIndexPolicy(next: AiVaultToolIndexPolicy): void {
  toolIndexPolicy = next
}

export function readAiVaultToolIndexPolicy(): AiVaultToolIndexPolicy {
  return toolIndexPolicy
}

export function registerAiVaultSearchSchemaOffset(offset: number): void {
  schemaOffset = offset
}

export function aiVaultSearchSchemaVersion(base: number): number {
  return base + schemaOffset
}

export function registerAiVaultFolderLabel(
  next: (pathValue: string | null) => string | null
): void {
  folderLabelHook = next
}

export function readAiVaultFolderLabel(pathValue: string | null): string | null {
  return folderLabelHook ? folderLabelHook(pathValue) : null
}

export function registerAiVaultGroupPartition(
  next: (groups: readonly ListGroup[]) => readonly ListGroup[]
): void {
  groupPartition = next
}

export function applyAiVaultListGroups<Session extends { executionHostId: string }>(
  groups: readonly { key: string; label: string | null; sessions: Session[] }[]
): readonly { key: string; label: string | null; sessions: Session[] }[] {
  if (!groupPartition) {
    return groups
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the partition only rewrites key, label, and the same session objects.
  return groupPartition(groups) as readonly {
    key: string
    label: string | null
    sessions: Session[]
  }[]
}

export function registerAiVaultCollapseNewGroups(enabled: boolean): void {
  collapseNewGroups = enabled
}

export function shouldCollapseNewAiVaultGroups(): boolean {
  return collapseNewGroups
}

export function setAiVaultCollapseAllHandler(handler: (() => void) | undefined): void {
  collapseAll = handler
}

export function requestAiVaultCollapseAll(): void {
  collapseAll?.()
}

export function registerAiVaultDefaultHostScope(scope: ExecutionHostScope): void {
  defaultHostScope = scope
}

export function readAiVaultDefaultHostScope(): ExecutionHostScope | undefined {
  return defaultHostScope
}

export function registerAiVaultWrapGroupLabels(enabled: boolean): void {
  wrapGroupLabels = enabled
}

export function aiVaultGroupLabelsWrap(): boolean {
  return wrapGroupLabels
}

export function publishAiVaultGroupSessionCounts(
  counts: ReadonlyMap<string, number> | undefined
): void {
  groupSessionCounts = counts
}

export function readAiVaultGroupSessionCount(key: string): number | undefined {
  return groupSessionCounts?.get(key)
}

export function registerVaultHostMenuDecoration(
  next: <T extends { id: string; label: string; secondary?: boolean }>(
    options: readonly T[],
    context: VaultHostMenuContext
  ) => T[]
): void {
  hostMenuDecoration = next
}

export function decorateVaultHostMenu<T extends { id: string; label: string; secondary?: boolean }>(
  options: readonly T[],
  context: VaultHostMenuContext
): readonly T[] {
  return hostMenuDecoration?.(options, context) ?? options
}

export function resetAiVaultForkHooksForTests(): void {
  panelSlots.clear()
  serviceHeapMiB = undefined
  servicePolicy = undefined
  toolIndexPolicy = 'capped'
  schemaOffset = 0
  folderLabelHook = undefined
  groupPartition = undefined
  collapseNewGroups = false
  collapseAll = undefined
  defaultHostScope = undefined
  wrapGroupLabels = false
  groupSessionCounts = undefined
  hostMenuDecoration = undefined
}
