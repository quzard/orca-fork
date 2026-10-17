#!/usr/bin/env node
import { runProcess } from '@orca/process-host'
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { PERSONAL_RELEASE_BRANCH } from './personal-release-checks.cjs'

const ROOT = resolve(import.meta.dirname, '../..')
const MAC_APP = '/Applications/Orca.app'
const LOCAL_CLI = join(MAC_APP, 'Contents/Resources/bin/orca')
const BUILT_APP = join(ROOT, 'dist/mac-arm64/Orca.app')
const INSTALLER = join(ROOT, 'fork/scripts/install-mac-release.sh')
const HOST_SCRIPT = join(ROOT, 'fork/scripts/personal-orca-host.py')
const RELEASE_ROOT = join(homedir(), 'Library/Logs/OrcaReleases')
const CHECK_FLAG = '--check'
const HELP_FLAG = '--help'
const TIMEOUT_MS = 90_000
const POLL_MS = 1000
const BACKUP_PREFIX = '.orca-previous.'
const ENV = {
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('ORCA_'))),
  ORCA_BACKGROUND_LAUNCH: '1'
}
const HELP = `用法：node fork/scripts/release-personal-orca.mjs [--check]
发布本机 Orca（自用版）；--check 仅检查任务与版本，不构建、不重启。
需要 macOS ARM64、Node 24、已安装依赖。
其它机器不随本入口发布：它们用官方 SSH 主机和 Orca 受管服务器，由客户端自行安装与更新。
请在 Orca 外部终端运行；存活终端或 Agent 会阻止更新。
代码须已提交。入口先推送，再检查上游；尚未同步时停止，按 FORK-CHANGES.md 复核后重跑。
`

let report
let reportPath
let interrupted
let recovering = false

async function execute(program, args, options = {}) {
  if (interrupted && !recovering) {
    throw new Error(`收到 ${interrupted}，停止发布`)
  }
  const { inherit = false, ...extra } = options
  const result = await runProcess({
    program,
    args,
    cwd: ROOT,
    env: ENV,
    timeoutMs: TIMEOUT_MS,
    maxOutputBytes: 8 * 1024 * 1024,
    ...(inherit ? { stdio: 'inherit', timeoutMs: null } : {}),
    ...extra
  })
  if (result.code !== 0 || result.outputTruncated) {
    throw new Error(
      `${program} 失败 (${result.code ?? 'unverifiable'})${result.stderr ? `: ${result.stderr.trim()}` : ''}`
    )
  }
  return result.stdout.trim()
}

async function localHostAction(action, release, version) {
  // The host script reads this machine's runtime. A failed read is not "zero tasks".
  const args = ['local', action, ...[release, version].filter(Boolean)]
  const source = await readFile(HOST_SCRIPT, 'utf8')
  const output = await execute('python3', ['-', ...args], { input: source })
  return JSON.parse(output)
}

async function checkLocal() {
  const value = await localHostAction('check')
  if (!value.idle) {
    throw new Error(
      '有存活终端、运行中的 Agent 或 unverifiable 任务；请先结束对应任务并关闭终端标签，再发布。'
    )
  }
  return value
}

async function saveReport() {
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 })
}

async function localStatus() {
  const response = JSON.parse(await execute(LOCAL_CLI, ['status', '--json']))
  if (!response.ok) {
    throw new Error('无法读取本机 runtime 状态')
  }
  return response.result
}

async function waitLocal(version) {
  const deadline = Date.now() + TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      const status = await localStatus()
      if (status.runtime.state === 'ready' && status.runtime.appVersion === version) {
        return status
      }
    } catch {
      // A brief miss while the app is starting is not evidence the process exited.
    }
    await delay(POLL_MS)
  }
  throw new Error('本机新版未按时 ready；保留旧应用备份')
}

async function quitLocal() {
  const processes = await execute('ps', ['-axo', 'pid=,comm='])
  const row = processes
    .split('\n')
    .find((line) => line.trim().endsWith(`${MAC_APP}/Contents/MacOS/Orca`))
  if (!row) {
    return
  }
  const pid = Number(row.trim().split(/\s+/)[0])
  process.kill(pid, 'SIGTERM')
  const deadline = Date.now() + TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0)
    } catch (error) {
      if (error.code === 'ESRCH') {
        return
      }
      throw error
    }
    await delay(POLL_MS)
  }
  throw new Error('Orca 尚未退出，可能有未确认的关闭提示；未强制结束进程，请正常退出后重跑。')
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 1 && args[0] === HELP_FLAG) {
    console.log(HELP)
    return
  }
  if (args.length > 1 || (args.length && args[0] !== CHECK_FLAG)) {
    throw new Error(HELP)
  }
  if (
    process.platform !== 'darwin' ||
    process.arch !== 'arm64' ||
    process.versions.node.split('.')[0] !== '24'
  ) {
    throw new Error('此自用发布入口需要 macOS ARM64 和 Node 24')
  }
  const before = await checkLocal()
  if (args[0] === CHECK_FLAG) {
    console.log(JSON.stringify(before))
    return
  }
  if (await execute('git', ['status', '--porcelain'])) {
    throw new Error('请先提交工作区改动，再发布')
  }
  const branch = await execute('git', ['branch', '--show-current'])
  if (!PERSONAL_RELEASE_BRANCH || branch !== PERSONAL_RELEASE_BRANCH) {
    throw new Error('Set ORCA_FORK_RELEASE_BRANCH to the branch this personal release publishes')
  }
  // Does not commit or merge. Upstream changes still go through the fork checklist.
  await execute('git', ['push', 'origin', `HEAD:${PERSONAL_RELEASE_BRANCH}`], { inherit: true })
  await execute('git', ['fetch', 'upstream', 'main'], { inherit: true })
  const included = await runProcess({
    program: 'git',
    args: ['merge-base', '--is-ancestor', 'upstream/main', 'HEAD'],
    cwd: ROOT,
    env: ENV
  })
  if (included.code !== 0) {
    throw new Error('尚未包含最新 upstream/main；按 FORK-CHANGES.md 同步、复核并推送后重跑')
  }
  const commit = await execute('git', ['rev-parse', 'HEAD'])
  const release = `${commit.slice(0, 12)}-${Date.now()}`
  const directory = join(RELEASE_ROOT, release)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  reportPath = join(directory, 'release.json')
  report = { release, commit, before, phase: 'building' }
  await saveReport()
  let localBackup
  let localStopped = false
  try {
    console.log(`开始构建 ${commit.slice(0, 12)}；发布记录：${reportPath}`)
    await execute('pnpm', ['install', '--frozen-lockfile'], { inherit: true })
    await execute('pnpm', ['verify:bundled-skill-guides'], { inherit: true })
    await execute('pnpm', ['verify:skill-bundle-manifest'], { inherit: true })
    await execute('bash', [INSTALLER, '--build-only'], { inherit: true })
    const version = await execute('/usr/libexec/PlistBuddy', [
      '-c',
      'Print CFBundleShortVersionString',
      join(BUILT_APP, 'Contents/Info.plist')
    ])
    report.version = version
    await saveReport()

    // Tasks can start during the build. Any dirty path, including the skill manifest, blocks install.
    const head = await execute('git', ['rev-parse', 'HEAD'])
    const dirty = await execute('git', ['status', '--porcelain'])
    if (dirty.length > 0 || head !== commit) {
      throw new Error('构建期间源码发生变化，未安装')
    }
    await checkLocal()
    localStopped = true
    await quitLocal()
    report.phase = 'installing'
    await saveReport()
    const previousBackups = new Set(await readdir(dirname(MAC_APP)))
    try {
      await execute('bash', [INSTALLER, '--install-built', version], { inherit: true })
    } finally {
      // open or the ready check can fail after the installer has already swapped the app.
      for (const entry of await readdir(dirname(MAC_APP))) {
        if (!entry.startsWith(BACKUP_PREFIX) || previousBackups.has(entry)) {
          continue
        }
        const app = await lstat(join(dirname(MAC_APP), entry, 'Orca.app')).catch(() => null)
        if (app?.isDirectory()) {
          localBackup = entry
        }
      }
      report.localBackup = localBackup
      await saveReport()
    }
    await waitLocal(version)
    report.phase = 'verified'
    await saveReport()
    // Cleanup runs only after acceptance. A cleanup failure does not roll back that install.
    await execute('bash', [INSTALLER, '--cleanup-verified-backups', version], { inherit: true })
    await saveReport()
    console.log(`本机已安装并验收 ${version}\n发布记录：${reportPath}`)
  } catch (error) {
    recovering = true
    if (report.phase !== 'verified') {
      report.phase = 'failed'
      report.error = error.message
      // Roll back only the app this batch replaced. A failed rollback keeps the backup.
      if (localBackup) {
        try {
          const backup = join(dirname(MAC_APP), localBackup, 'Orca.app')
          if (!(await lstat(backup)).isDirectory()) {
            throw new Error('本机备份无效，保留当前应用')
          }
          const installedVersion = await execute('/usr/libexec/PlistBuddy', [
            '-c',
            'Print CFBundleShortVersionString',
            join(MAC_APP, 'Contents/Info.plist')
          ])
          if (installedVersion !== report.version) {
            throw new Error('本机应用已变更，保留当前安装和备份')
          }
          await quitLocal()
          const failed = join(dirname(MAC_APP), `.orca-failed-${release}.app`)
          await rename(MAC_APP, failed)
          try {
            await rename(backup, MAC_APP)
          } catch (restoreError) {
            await rename(failed, MAC_APP)
            throw restoreError
          }
        } catch (rollbackError) {
          report.localRollbackError = rollbackError.message
        }
      }
      if (localStopped) {
        try {
          await execute('open', ['-gj', '--env', 'ORCA_BACKGROUND_LAUNCH=1', MAC_APP])
        } catch (openError) {
          report.localOpenError = openError.message
        }
      }
    }
    await saveReport()
    throw error
  }
}

try {
  await mkdir(RELEASE_ROOT, { recursive: true })
  const lock = join(RELEASE_ROOT, 'publishing.lock')
  // Reuse macOS shlock, including stale-PID recovery. Do not invent a lock protocol.
  try {
    await execute('/usr/bin/shlock', ['-f', lock, '-p', String(process.pid)])
  } catch {
    throw new Error(`已有发布进程持锁，或日志目录不可写：${lock}`)
  }
  // Do not kill a child mid-rename. Finish the current step, then roll back.
  const stop = (signal) => {
    interrupted = signal
    console.warn(`收到 ${signal}；等待当前步骤结束后停止发布并处理回退。`)
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  try {
    await main()
  } finally {
    await rm(lock)
    process.off('SIGINT', stop)
    process.off('SIGTERM', stop)
  }
} catch (error) {
  console.error(`发布停止：${error.message}${reportPath ? `\n记录：${String(reportPath)}` : ''}`)
  process.exitCode = 1
}
