// host-directory 要的两件事：目录标题用自己的 hostId，以及只看见一台主机时仍保留主机标题。
// 上游 addHostSectionRows 只调用一次 forkHostSectionRows；没登记时这里不会运行。
import {
  ALL_EXECUTION_HOSTS_SCOPE,
  getRepoExecutionHostId,
  type ExecutionHostId,
  type ExecutionHostScope
} from '../../shared/execution-host'
import type { Repo } from '../../shared/repo-types'
import type { HostSectionOption, HostSectionRow } from '../../shared/sidebar-list/host-section-rows'
import type { Row } from '../../shared/sidebar-list/row-types'

// 哨兵主机只用来骗过上游「只有一台主机就不要标题」的提前返回，结果里会删掉。
const SENTINEL_HOST_ID = 'ssh:fork-retained-host-section'
const SENTINEL_ROW_KEY = 'fork-retained-host-section-sentinel'

type HeaderRow = Extract<Row, { type: 'header' }>

type RetainArgs = {
  retainSingleHostHeader?: boolean
  rows: readonly Row[]
  hostOptions: readonly HostSectionOption[]
  preferProjectGrouping?: boolean
  workspaceHostScope: ExecutionHostScope
  visibleWorkspaceHostIds?: readonly ExecutionHostId[] | null
  defaultHostId: ExecutionHostId
  localHostLabel: string
}

/** 目录标题在上游只认仓库上的主机。自带 hostId 且和仓库不一致时，换成一个只带这个主机的仓库，输出时再换回原行。 */
function headerUsingOwnHost(
  row: Row,
  defaultHostId: ExecutionHostId,
  originals: Map<Row, Row>
): Row {
  if (
    row.type !== 'header' ||
    !row.hostId ||
    upstreamHeaderHost(row, defaultHostId) === row.hostId
  ) {
    return row
  }
  const copy: HeaderRow = {
    ...row,
    repo: repoForHost(row.hostId, row.key)
  }
  originals.set(copy, row)
  return copy
}

function upstreamHeaderHost(
  row: HeaderRow,
  defaultHostId: ExecutionHostId
): ExecutionHostId | null {
  if (!row.repo) {
    return null
  }
  if (row.repo.connectionId || row.repo.executionHostId) {
    return getRepoExecutionHostId(row.repo)
  }
  return defaultHostId
}

function repoForHost(hostId: ExecutionHostId, key: string): Repo {
  return {
    id: `${SENTINEL_ROW_KEY}:${key}`,
    path: '',
    displayName: '',
    badgeColor: '',
    addedAt: 0,
    executionHostId: hostId
  }
}

function sentinelHeader(): HeaderRow {
  return {
    type: 'header',
    key: SENTINEL_ROW_KEY,
    count: 0,
    icon: { kind: 'all' },
    repo: repoForHost(SENTINEL_HOST_ID, SENTINEL_ROW_KEY)
  }
}

function sentinelOption(): HostSectionOption {
  return {
    id: SENTINEL_HOST_ID,
    kind: 'ssh',
    label: SENTINEL_ROW_KEY,
    detail: SENTINEL_ROW_KEY,
    health: 'available'
  }
}

function finishHostSections(
  produced: readonly HostSectionRow[],
  originalRows: readonly Row[],
  originals: ReadonlyMap<Row, Row>
): HostSectionRow[] {
  // 没有主机标题，说明上游提前返回了（里面还夹着哨兵）。调用方要看到自己传入的行。
  if (!produced.some((row) => row.type === 'host-header')) {
    return [...originalRows]
  }
  const kept: HostSectionRow[] = []
  let skippingSentinel = false
  for (const row of produced) {
    if (row.type === 'host-header' && row.hostId === SENTINEL_HOST_ID) {
      skippingSentinel = true
      continue
    }
    if (skippingSentinel) {
      if (row.type !== 'host-header') {
        continue
      }
      skippingSentinel = false
    }
    if (row.type === 'host-header') {
      kept.push(row)
      continue
    }
    kept.push(originals.get(row) ?? row)
  }
  return kept
}

export function retainSingleHostSectionRows<A extends { retainSingleHostHeader?: boolean }, R>(
  args: A,
  build: (args: A) => R
): R {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: 只有 addHostSectionRows 会把整份参数传进来。
  const source = args as A & RetainArgs
  const originals = new Map<Row, Row>()
  // 哨兵放在最前面，避免它把后面还没归组的标题吸进假主机。
  const rows = [
    sentinelHeader(),
    ...source.rows.map((row) => headerUsingOwnHost(row, source.defaultHostId, originals))
  ]
  const hostOptions = source.hostOptions.some((host) => host.id === SENTINEL_HOST_ID)
    ? source.hostOptions
    : [...source.hostOptions, sentinelOption()]
  // preferProjectGrouping 和可见主机只决定要不要提前返回，不参与分组。改掉它们，单主机也会走出标题。
  const adjusted = {
    ...source,
    rows,
    hostOptions,
    preferProjectGrouping: false,
    workspaceHostScope: ALL_EXECUTION_HOSTS_SCOPE,
    visibleWorkspaceHostIds: undefined
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: 仍是同一次调用的参数，只改了提前返回用的字段和行。
  const produced = build(adjusted as A) as HostSectionRow[]
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: produced 就是这次 build 的行，与 R 是同一个结果。
  return finishHostSections(produced, source.rows, originals) as R
}
