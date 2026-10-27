import type { DocPreviewExternalLink, DocPreviewFailure } from '../../shared/doc-preview-scheme'

export type DocPreviewGrantOwner =
  | { kind: 'ssh'; connectionId: string }
  | {
      kind: 'runtime'
      environmentId: string
      worktreeSelector: string
      worktreeRoot: string
    }

export type DocPreviewGrantRequest = {
  owner: DocPreviewGrantOwner
  /** Directory that relative preview URLs resolve against. */
  requestBase: string
  /** Initial filesystem authority; always the opened document's directory. */
  root: string
  entryRelativePath: string
  browserPageId: string
  /** 托管主机上、工作区外的只读授权。预览只读这一份绝对路径。 */
  terminalArtifactGrantId?: string
  terminalArtifactAbsolutePath?: string
  /** 直连 SSH、工作区外的 HTML。桌面按连接去读，不走一般的 ssh 文档预览。 */
  sshPreview?: boolean
}

export type DocPreviewApi = {
  docPreview: {
    mintGrant: (request: DocPreviewGrantRequest) => Promise<{ grantId: string; url: string }>
    revokeGrant: (grantId: string) => Promise<boolean>
    authorizeDirectory: (grantId: string, relativePath: string) => Promise<boolean>
    onExternalLink: (callback: (payload: DocPreviewExternalLink) => void) => () => void
    onLoadFailure: (callback: (payload: DocPreviewFailure) => void) => () => void
  }
}
