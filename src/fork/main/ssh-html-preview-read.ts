// 直连 SSH 上、工作区外的 HTML。桌面按已有连接把文件读进 orca-preview。
// 未连接、系统 SSH 读失败、或路径落在凭据目录时返回 null / 拒绝，预览保持 404。
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isPathInsideOrEqual } from '../../shared/cross-platform-path'
import { quotePosixShell } from '../../shared/shell-argument-quoting'
import type { SshHtmlPreviewRead } from '../../shared/fork-hooks/terminal-html-preview'
import { getSshConnectionManager } from '../../main/ssh/targets/ssh-target-registry'

const HTML_PREVIEW_MAX_BYTES = 10 * 1024 * 1024
const CREDENTIAL_DIR_NAMES = ['.ssh', '.gnupg', '.orca', '.aws'] as const
const SYSTEM_SFTP_UNAVAILABLE = 'SFTP is not available when using system SSH transport'
const REMOTE_PROBE_TIMEOUT_MS = 15_000
const REMOTE_PROBE_MAX_CHARS = 8192

const UNREADABLE = 'Not found'

type SftpStats = { size: number; isFile: () => boolean }

type PreviewSftp = {
  end: () => void
  stat: (
    path: string,
    callback: (error: Error | null | undefined, stats: SftpStats) => void
  ) => void
  realpath: (
    path: string,
    callback: (error: Error | null | undefined, resolved: string) => void
  ) => void
  readFile: (
    path: string,
    callback: (error: Error | null | undefined, data: Buffer) => void
  ) => void
}

type PreviewChannel = {
  on(event: 'data', listener: (chunk: Buffer | string) => void): void
  on(event: 'exit', listener: (code: number | null) => void): void
  on(event: 'error', listener: (error: Error) => void): void
  on(event: 'close', listener: (code?: number | boolean) => void): void
}

type PreviewConnection = {
  state: { status: string }
  sftp: () => Promise<PreviewSftp>
  downloadFile: (remotePath: string, localPath: string) => Promise<void>
  exec: (command: string) => Promise<PreviewChannel>
}

type ResolvedPreview = { file: string; directory: string; size: number }

function sftpCall<T>(
  run: (callback: (error: Error | null | undefined, value: T) => void) => void
): Promise<T> {
  return new Promise((resolve, reject) => {
    run((error, value) => (error ? reject(error) : resolve(value)))
  })
}

function isCredentialPath(absolutePath: string): boolean {
  return absolutePath
    .split(/[\\/]/)
    .some((part) => CREDENTIAL_DIR_NAMES.some((name) => part === name))
}

function parentDirectory(absolutePath: string): string {
  const slash = Math.max(absolutePath.lastIndexOf('/'), absolutePath.lastIndexOf('\\'))
  return slash > 0 ? absolutePath.slice(0, slash) : ''
}

/** 文件和所在目录都先解析。父目录是软链时，用解析后的目录比较，避免家目录软链被当成越界。 */
function previewTargetAllowed(resolvedFile: string, resolvedDirectory: string): boolean {
  return (
    Boolean(resolvedDirectory) &&
    isPathInsideOrEqual(resolvedDirectory, resolvedFile) &&
    !isCredentialPath(resolvedFile) &&
    !isCredentialPath(resolvedDirectory)
  )
}

function remotePreviewProbe(absolutePath: string, directory: string): string {
  const file = quotePosixShell(absolutePath)
  const dir = quotePosixShell(directory)
  return [
    `f=$(realpath -e -- ${file}) || exit 1`,
    `d=$(realpath -e -- ${dir}) || exit 1`,
    `s=$(stat -c %s "$f" 2>/dev/null || stat -f %z "$f") || exit 1`,
    `printf '%s\\n%s\\n%s\\n' "$f" "$d" "$s"`
  ].join('\n')
}

function parseProbe(stdout: string): ResolvedPreview | null {
  const lines = stdout.replace(/\r/g, '').trim().split('\n')
  if (lines.length !== 3) {
    return null
  }
  const size = Number(lines[2]?.trim())
  const file = lines[0] ?? ''
  const directory = lines[1] ?? ''
  if (!file || !directory || !Number.isInteger(size) || size < 0) {
    return null
  }
  return { file, directory, size }
}

function readRemoteCommand(channel: PreviewChannel): Promise<string | null> {
  return new Promise((resolve) => {
    let stdout = ''
    let exitCode: number | null = null
    let settled = false
    const finish = (value: string | null): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => finish(null), REMOTE_PROBE_TIMEOUT_MS)
    channel.on('data', (chunk) => {
      stdout += typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      if (stdout.length > REMOTE_PROBE_MAX_CHARS) {
        finish(null)
      }
    })
    channel.on('exit', (code) => {
      exitCode = code
    })
    channel.on('error', () => finish(null))
    channel.on('close', (code) => {
      const numeric = typeof code === 'number' ? code : exitCode
      const failed = numeric !== null && numeric !== 0
      finish(failed || code === true ? null : stdout)
    })
  })
}

function tooLarge(): SshHtmlPreviewRead {
  return { ok: false, status: 413, reason: 'too-large', message: 'too large' }
}

function unreadable(): SshHtmlPreviewRead {
  return { ok: false, status: 404, reason: 'unreadable', message: UNREADABLE }
}

function connectedPreview(connectionId: string): PreviewConnection | null {
  const connection = getSshConnectionManager()?.getConnection(connectionId)
  if (!connection) {
    return null
  }
  // SAFETY: 连接对象就是 SshConnection。state 是私有的，这里只读状态和预览要的方法。
  const preview = connection as unknown as PreviewConnection
  return preview.state.status === 'connected' ? preview : null
}

async function readViaSftp(sftp: PreviewSftp, absolutePath: string): Promise<SshHtmlPreviewRead> {
  const stats = await sftpCall<SftpStats>((callback) => sftp.stat(absolutePath, callback))
  if (!stats.isFile()) {
    return unreadable()
  }
  if (stats.size > HTML_PREVIEW_MAX_BYTES) {
    return tooLarge()
  }
  const directory = parentDirectory(absolutePath)
  const resolved = await sftpCall<string>((callback) => sftp.realpath(absolutePath, callback))
  const resolvedDirectory = directory
    ? await sftpCall<string>((callback) => sftp.realpath(directory, callback))
    : ''
  // 软链跳出解析后的父目录，或落到凭据目录，不读。
  if (!previewTargetAllowed(resolved, resolvedDirectory)) {
    return unreadable()
  }
  const data = await sftpCall<Buffer>((callback) => sftp.readFile(resolved, callback))
  if (data.byteLength > HTML_PREVIEW_MAX_BYTES) {
    return tooLarge()
  }
  return { ok: true, bytes: data }
}

async function probeSystemSsh(
  connection: PreviewConnection,
  absolutePath: string
): Promise<ResolvedPreview | null> {
  const directory = parentDirectory(absolutePath)
  if (!directory) {
    return null
  }
  const stdout = await readRemoteCommand(
    await connection.exec(remotePreviewProbe(absolutePath, directory))
  )
  return stdout === null ? null : parseProbe(stdout)
}

async function readViaDownload(
  connection: PreviewConnection,
  absolutePath: string
): Promise<SshHtmlPreviewRead | null> {
  // 先解析再下载。名叫 x.html、指向凭据文件的软链不能先把内容拉下来。
  let probed: ResolvedPreview | null
  try {
    probed = await probeSystemSsh(connection, absolutePath)
  } catch {
    return null
  }
  if (!probed || !previewTargetAllowed(probed.file, probed.directory)) {
    return unreadable()
  }
  if (probed.size > HTML_PREVIEW_MAX_BYTES) {
    return tooLarge()
  }
  const directory = await mkdtemp(join(tmpdir(), 'orca-html-preview-'))
  const localPath = join(directory, 'page')
  try {
    await connection.downloadFile(probed.file, localPath)
    const fileStat = await stat(localPath)
    if (!fileStat.isFile() || fileStat.size > HTML_PREVIEW_MAX_BYTES) {
      return fileStat.isFile() ? tooLarge() : unreadable()
    }
    return { ok: true, bytes: await readFile(localPath) }
  } catch {
    return null
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

/** 登记给文档预览。连接不在或还没连上时返回 null，调用方按上游 404。 */
export async function readConnectedSshHtmlPreview(
  connectionId: string,
  absolutePath: string
): Promise<SshHtmlPreviewRead | null> {
  if (isCredentialPath(absolutePath)) {
    return unreadable()
  }
  const connection = connectedPreview(connectionId)
  if (!connection) {
    return null
  }
  try {
    const sftp = await connection.sftp()
    try {
      return await readViaSftp(sftp, absolutePath)
    } finally {
      sftp.end()
    }
  } catch (error) {
    if (error instanceof Error && error.message === SYSTEM_SFTP_UNAVAILABLE) {
      return readViaDownload(connection, absolutePath)
    }
    return null
  }
}
