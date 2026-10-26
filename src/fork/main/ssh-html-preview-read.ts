// 直连 SSH 上、工作区外的 HTML。桌面按已有连接把文件读进 orca-preview。
// 未连接、系统 SSH 读失败、或路径落在凭据目录时返回 null / 拒绝，预览保持 404。
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isPathInsideOrEqual } from '../../shared/cross-platform-path'
import type { SshHtmlPreviewRead } from '../../shared/fork-hooks/terminal-html-preview'
import { getSshConnectionManager } from '../../main/ssh/targets/ssh-target-registry'

const HTML_PREVIEW_MAX_BYTES = 10 * 1024 * 1024
const CREDENTIAL_DIR_NAMES = ['.ssh', '.gnupg', '.orca', '.aws'] as const
const SYSTEM_SFTP_UNAVAILABLE = 'SFTP is not available when using system SSH transport'

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

type PreviewConnection = {
  state: { status: string }
  sftp: () => Promise<PreviewSftp>
  downloadFile: (remotePath: string, localPath: string) => Promise<void>
}

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
  // SAFETY: 连接对象就是 SshConnection。state 是私有的，这里只读状态和预览要的三个方法。
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
  const resolved = await sftpCall<string>((callback) => sftp.realpath(absolutePath, callback))
  const slash = Math.max(absolutePath.lastIndexOf('/'), absolutePath.lastIndexOf('\\'))
  const directory = absolutePath.slice(0, slash)
  // 软链跳出文件所在目录，或落到凭据目录，不读。
  if (!directory || !isPathInsideOrEqual(directory, resolved) || isCredentialPath(resolved)) {
    return unreadable()
  }
  const data = await sftpCall<Buffer>((callback) => sftp.readFile(resolved, callback))
  if (data.byteLength > HTML_PREVIEW_MAX_BYTES) {
    return tooLarge()
  }
  return { ok: true, bytes: data }
}

async function readViaDownload(
  connection: PreviewConnection,
  absolutePath: string
): Promise<SshHtmlPreviewRead | null> {
  const directory = await mkdtemp(join(tmpdir(), 'orca-html-preview-'))
  const localPath = join(directory, 'page')
  try {
    await connection.downloadFile(absolutePath, localPath)
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
