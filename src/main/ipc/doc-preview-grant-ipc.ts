import { ipcMain } from 'electron'
import {
  buildDocPreviewUrl,
  DOC_PREVIEW_AUTHORIZE_DIRECTORY_CHANNEL,
  DOC_PREVIEW_LINK_CLICK_CHANNEL,
  DOC_PREVIEW_MINT_GRANT_CHANNEL,
  DOC_PREVIEW_REVOKE_GRANT_CHANNEL
} from '../../shared/doc-preview-scheme'
import { browserManager } from '../browser/browser-manager'
import { reportDocPreviewLinkClick } from '../browser/doc-preview-guest-policy'
import {
  authorizeDocPreviewDirectory,
  mintDocPreviewGrant,
  revokeDocPreviewGrant,
  type DocPreviewOwner
} from '../browser/doc-preview-grant-registry'
import { isTrustedBrowserRenderer } from './browser-renderer-trust'
import {
  forgetTerminalHtmlPreviewServe,
  noteTerminalHtmlPreviewServe
} from '../../shared/fork-hooks/terminal-html-preview'

export type DocPreviewGrantRequest = {
  owner: DocPreviewOwner
  /** Directory relative preview URLs resolve against. */
  requestBase: string
  /** Containing directory of the opened document, on the owning host. */
  root: string
  /** Opened document, relative to `requestBase`. */
  entryRelativePath: string
  /** Browser page the reader is opening the document in; main registers the guest under it. */
  browserPageId: string
  terminalArtifactGrantId?: string
  terminalArtifactAbsolutePath?: string
  sshPreview?: boolean
}

export type DocPreviewGrantResult = { grantId: string; url: string }

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string'
}

function isValidGrantRequest(request: DocPreviewGrantRequest): boolean {
  const artifactGrantId: unknown = request.terminalArtifactGrantId
  const artifactPath: unknown = request.terminalArtifactAbsolutePath
  // 渲染进程传来的字段运行时不一定是字符串。不是字符串就不铸授权。
  if (!isOptionalString(artifactGrantId) || !isOptionalString(artifactPath)) {
    return false
  }
  if (!request.requestBase.trim() || !request.root.trim() || !request.entryRelativePath.trim()) {
    return false
  }
  if (typeof request.browserPageId !== 'string' || !request.browserPageId.trim()) {
    return false
  }
  if (request.owner.kind === 'ssh') {
    return Boolean(request.owner.connectionId.trim())
  }
  return Boolean(
    request.owner.environmentId.trim() &&
    request.owner.worktreeSelector.trim() &&
    request.owner.worktreeRoot.trim()
  )
}

/** Grants retain existing read scopes: SSH uses the filesystem provider and runtime uses worktree-scoped files.read. */
export function registerDocPreviewGrantHandlers(): void {
  ipcMain.handle(
    DOC_PREVIEW_MINT_GRANT_CHANNEL,
    (event, request: DocPreviewGrantRequest): DocPreviewGrantResult => {
      // Granting filesystem-read authority requires a trusted renderer even if guests cannot currently invoke IPC.
      if (!isTrustedBrowserRenderer(event.sender)) {
        throw new Error('Untrusted document preview grant request')
      }
      if (!isValidGrantRequest(request)) {
        throw new Error('Invalid document preview grant request')
      }
      // A page ID cannot belong to both browser and document registries.
      if (browserManager.getGuestWebContentsId(request.browserPageId) !== null) {
        throw new Error('Document preview grant names a browsing page')
      }
      const grant = mintDocPreviewGrant({
        owner: request.owner,
        requestBase: request.requestBase,
        root: request.root,
        entryRelativePath: request.entryRelativePath,
        browserPageId: request.browserPageId
      })
      noteTerminalHtmlPreviewServe(grant.id, request)
      return {
        grantId: grant.id,
        url: buildDocPreviewUrl(grant.id, grant.entryRelativePath)
      }
    }
  )

  ipcMain.handle(DOC_PREVIEW_REVOKE_GRANT_CHANNEL, (event, grantId: string): boolean => {
    if (!isTrustedBrowserRenderer(event.sender)) {
      return false
    }
    forgetTerminalHtmlPreviewServe(grantId)
    return revokeDocPreviewGrant(grantId)
  })

  ipcMain.handle(
    DOC_PREVIEW_AUTHORIZE_DIRECTORY_CHANNEL,
    (event, grantId: unknown, relativePath: unknown): boolean =>
      isTrustedBrowserRenderer(event.sender) &&
      typeof grantId === 'string' &&
      typeof relativePath === 'string' &&
      authorizeDocPreviewDirectory(grantId, relativePath)
  )

  // Guest senders are untrusted; the policy checks a live bound grant and web URL.
  ipcMain.on(DOC_PREVIEW_LINK_CLICK_CHANNEL, (event, url: unknown) => {
    if (typeof url === 'string') {
      reportDocPreviewLinkClick(event.sender, url)
    }
  })
}
