// 文档预览读取顶到行数上限。工作区外 HTML 的字节从这里读，加载器只负责调用。
// 没有预览记录时返回 null，调用方继续走上游。
import type { RuntimeFilePreviewResult } from '../../shared/runtime-file-contracts'
import type { DocPreviewFileFailureReason } from '../../shared/doc-preview-scheme'
import { callRuntimeEnvironment } from '../../main/ipc/runtime-environments/runtime-environment-transport-routing'
import { getRuntimeEnvironmentRegistryRoot } from '../../main/ipc/runtime-environments/runtime-environment-registry-root'
import type { DocPreviewGrant } from '../../main/browser/doc-preview-grant-registry'
import {
  readSshHtmlPreview,
  terminalHtmlPreviewServe
} from '../../shared/fork-hooks/terminal-html-preview'

const READ_TIMEOUT_MS = 15_000
const TRUNCATED_PREVIEW_MESSAGE = 'This document is too large for the server to send in full.'
const RUNTIME_TOO_LARGE_ERROR = 'file_too_large'

type ReadOutcome =
  | { ok: true; bytes: Buffer; contentType: string }
  | { ok: false; status: number; reason: DocPreviewFileFailureReason; message: string }

function notFound(message = 'Not found'): ReadOutcome {
  return { ok: false, status: 404, reason: 'unreadable', message }
}

function samePreviewPath(left: string, right: string): boolean {
  const normalize = (value: string): string => value.replace(/\\/g, '/').replace(/\/+$/, '')
  return normalize(left) === normalize(right)
}

function toOutcome(
  source: { content: string; isBinary: boolean; mimeType?: string; truncated?: boolean },
  contentType: string
): ReadOutcome {
  if (source.truncated) {
    return { ok: false, status: 413, reason: 'too-large', message: TRUNCATED_PREVIEW_MESSAGE }
  }
  if (!source.isBinary) {
    return { ok: true, bytes: Buffer.from(source.content, 'utf8'), contentType }
  }
  if (source.content) {
    return { ok: true, bytes: Buffer.from(source.content, 'base64'), contentType }
  }
  return source.mimeType
    ? { ok: true, bytes: Buffer.alloc(0), contentType }
    : {
        ok: false,
        status: 415,
        reason: 'unsupported-asset',
        message: 'This workspace cannot send this file type to a preview.'
      }
}

export async function readForkTerminalHtmlPreview(
  grant: DocPreviewGrant,
  absolutePath: string,
  contentType: string
): Promise<ReadOutcome | null> {
  const served = terminalHtmlPreviewServe(grant.id)
  if (served?.kind === 'artifact') {
    if (grant.owner.kind !== 'runtime' || !samePreviewPath(absolutePath, served.absolutePath)) {
      return notFound()
    }
    try {
      const response = await callRuntimeEnvironment(
        getRuntimeEnvironmentRegistryRoot(),
        grant.owner.environmentId,
        'files.readTerminalArtifactPreview',
        {
          worktree: grant.owner.worktreeSelector,
          grantId: served.grantId,
          absolutePath: served.absolutePath
        },
        READ_TIMEOUT_MS
      )
      if (!response.ok) {
        throw new Error(response.error.message)
      }
      const preview = response.result as RuntimeFilePreviewResult
      return toOutcome(
        {
          content: preview.content,
          isBinary: preview.isBinary,
          ...(preview.mimeType ? { mimeType: preview.mimeType } : {}),
          ...(preview.truncated ? { truncated: true } : {})
        },
        contentType
      )
    } catch (error) {
      return error instanceof Error && error.message === RUNTIME_TOO_LARGE_ERROR
        ? { ok: false, status: 413, reason: 'too-large', message: TRUNCATED_PREVIEW_MESSAGE }
        : notFound(error instanceof Error ? error.message : undefined)
    }
  }
  if (served?.kind === 'ssh' && grant.owner.kind === 'ssh') {
    const read = await readSshHtmlPreview(grant.owner.connectionId, absolutePath)
    if (read?.ok) {
      return { ok: true, bytes: read.bytes, contentType }
    }
    if (read && !read.ok) {
      return read.reason === 'too-large'
        ? { ok: false, status: 413, reason: 'too-large', message: TRUNCATED_PREVIEW_MESSAGE }
        : notFound(read.message)
    }
  }
  return null
}
