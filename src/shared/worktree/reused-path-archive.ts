import type { WorktreeMeta } from './meta-types'

// 同一 repo+path 的元数据会合并。新建会换 instanceId，但旧的 isArchived 还在，
// 新行就会留在已移除里。发现扫描补 instanceId、以及给消失的父级轮换血统，都不走这里。
export function withoutReusedWorktreeArchive<T extends Partial<WorktreeMeta>>(
  updates: T
): T & { isArchived: false } {
  return { ...updates, isArchived: false }
}
