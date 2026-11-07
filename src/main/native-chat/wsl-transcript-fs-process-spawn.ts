import { fork, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { isRequirementPreviewBuild } from '../../fork/requirement-preview/build-flag'
import { resolveRuntimeOutputEntry } from '../../fork/requirement-preview/output-root'
import { join } from 'node:path'
import {
  pickAllowedEnv,
  RUNTIME_ENV_ALLOWLIST
} from '../ai-vault/scan-service/session-scanner-service-env'

const PROCESS_ENTRY_FILENAME = 'wsl-transcript-fs-process-entry.js'

// Use the runtime allowlist: inherited NODE_OPTIONS may halt/inject child code, and shell secrets are unnecessary.
export function wslTranscriptFsProcessForkEnv(
  baseEnv: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): NodeJS.ProcessEnv {
  const env = pickAllowedEnv(RUNTIME_ENV_ALLOWLIST, baseEnv, platform)
  env.ELECTRON_RUN_AS_NODE = '1'
  return env
}

export function resolveWslTranscriptFsProcessEntryPath(
  moduleDir: string,
  resourcesPath: string | undefined = process.resourcesPath,
  pathExists: (path: string) => boolean = existsSync
): string {
  // Probe out/main and chunks; scanner Node children lack resourcesPath and need unpacked __dirname paths.
  const toUnpackedDir = (dir: string): string =>
    dir.replace(/([\\/])app\.asar(?=([\\/]|$))/, '$1app.asar.unpacked')
  for (const baseDir of [moduleDir, join(moduleDir, '..')].map(toUnpackedDir)) {
    const candidate = join(baseDir, PROCESS_ENTRY_FILENAME)
    if (pathExists(candidate)) {
      return candidate
    }
  }
  if (resourcesPath) {
    const packaged = resolveRuntimeOutputEntry({
      basePath: join(resourcesPath, 'app.asar.unpacked'),
      segments: ['main', PROCESS_ENTRY_FILENAME],
      exists: pathExists
    })
    if (pathExists(packaged) || isRequirementPreviewBuild()) {
      return packaged
    }
  }
  return resolveRuntimeOutputEntry({
    basePath: process.cwd(),
    segments: ['main', PROCESS_ENTRY_FILENAME],
    exists: pathExists
  })
}

export function forkWslTranscriptFsProcess(): ChildProcess {
  const entryPath = resolveWslTranscriptFsProcessEntryPath(__dirname)
  if (!existsSync(entryPath)) {
    throw new Error(`WSL transcript filesystem process entry not found: ${entryPath}`)
  }
  return fork(entryPath, [], {
    env: wslTranscriptFsProcessForkEnv(),
    execArgv: [],
    serialization: 'advanced',
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    ...(process.platform === 'win32' ? { windowsHide: true } : {})
  })
}
