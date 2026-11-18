import { totalmem } from 'node:os'

// 低于上游 384 MiB 的机器仍用 384；大内存按 1/4 抬高，并给系统留 2 GiB，上限 2 GiB。
const HEAP_FLOOR_MIB = 384
const HEAP_CAP_MIB = 2048
const HEAP_RESERVE_MIB = 2048
const BYTES_PER_MIB = 1024 * 1024

// 容器或 cgroup 限制比物理内存小时按限制算；constrainedMemory() 为 0 表示没有限制或未知。
export function aiVaultMemoryBytes(
  totalMemBytes = totalmem(),
  constrainedBytes = process.constrainedMemory()
): number {
  return Number.isFinite(constrainedBytes) && constrainedBytes > 0
    ? Math.min(totalMemBytes, constrainedBytes)
    : totalMemBytes
}

export function aiVaultServiceHeapMiB(totalMemBytes = aiVaultMemoryBytes()): number {
  const totalMiB = Math.floor(totalMemBytes / BYTES_PER_MIB)
  const quarter = Math.floor(totalMiB / 4)
  const reserved = totalMiB - HEAP_RESERVE_MIB
  return Math.min(HEAP_CAP_MIB, Math.max(HEAP_FLOOR_MIB, Math.min(quarter, reserved)))
}
