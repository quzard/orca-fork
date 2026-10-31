// fork: 历史会话的扫描策略、目录标题和默认主机。未注册时保持上游。

import type { ExecutionHostScope } from '../execution-host'

export type AiVaultToolIndexPolicy = 'capped' | 'chunk'

export type AiVaultForkServicePolicy = {
  toolIndex: AiVaultToolIndexPolicy
  schemaOffset: number
}

let serviceHeapMiB: (() => number) | undefined
let servicePolicy: AiVaultForkServicePolicy | undefined
let toolIndexPolicy: AiVaultToolIndexPolicy = 'capped'
let schemaOffset = 0
let folderLabelHook: ((pathValue: string | null) => string | null) | undefined
let defaultHostScope: ExecutionHostScope | undefined

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

export function registerAiVaultDefaultHostScope(scope: ExecutionHostScope): void {
  defaultHostScope = scope
}

export function readAiVaultDefaultHostScope(): ExecutionHostScope | undefined {
  return defaultHostScope
}

export function resetAiVaultForkHooksForTests(): void {
  serviceHeapMiB = undefined
  servicePolicy = undefined
  toolIndexPolicy = 'capped'
  schemaOffset = 0
  folderLabelHook = undefined
  defaultHostScope = undefined
}
