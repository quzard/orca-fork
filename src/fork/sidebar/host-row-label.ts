// 主机标题已经写出主机名时，工作区行上的 hostContextLabel 会再写一遍。
// 只在要求保留单主机标题时清掉 item 行；其他行、空标签、未要求保留时都保持原样。

type HostLabeledRow = { type: string; hostContextLabel?: string }

export function omitRepeatedHostLabel<T extends HostLabeledRow>(
  rows: readonly T[],
  retainSingleHostHeader: boolean
): readonly T[] {
  if (!retainSingleHostHeader) {
    return rows
  }
  return rows.map((row) =>
    row.type === 'item' && row.hostContextLabel ? { ...row, hostContextLabel: undefined } : row
  )
}
