// 直连 SSH 的 HTML 预览：凭据目录不读，软链跳出目录不读，连上的 ssh2 把文件读回来。
import { writeFile } from 'node:fs/promises'
import { afterEach, describe, expect, it, vi } from 'vitest'

const getConnection = vi.hoisted(() => vi.fn())

vi.mock('../../main/ssh/targets/ssh-target-registry', () => ({
  getSshConnectionManager: () => ({ getConnection })
}))

import { readConnectedSshHtmlPreview } from './ssh-html-preview-read'

const PAGE = '/home/admin/.answer-me-with-html/pages/x.html'
const SYSTEM_SFTP_UNAVAILABLE = 'SFTP is not available when using system SSH transport'

function sftpOf(stats: { size: number; file: boolean }, resolved: string, bytes: Buffer) {
  const readFile = vi.fn((_path: string, callback: (error: null, data: Buffer) => void) => {
    callback(null, bytes)
  })
  return {
    end: vi.fn(),
    readFile,
    stat: (
      _path: string,
      callback: (error: null, stats: { size: number; isFile: () => boolean }) => void
    ) => callback(null, { size: stats.size, isFile: () => stats.file }),
    realpath: (_path: string, callback: (error: null, resolved: string) => void) =>
      callback(null, resolved)
  }
}

afterEach(() => {
  getConnection.mockReset()
})

describe('readConnectedSshHtmlPreview', () => {
  it('refuses a credential directory without opening the connection', async () => {
    await expect(
      readConnectedSshHtmlPreview('ssh-1', '/home/admin/.ssh/id_ed25519')
    ).resolves.toMatchObject({ ok: false, reason: 'unreadable' })
    expect(getConnection).not.toHaveBeenCalled()
  })

  it('returns null when the connection is not up', async () => {
    getConnection.mockReturnValue({ state: { status: 'disconnected' } })
    await expect(readConnectedSshHtmlPreview('ssh-1', PAGE)).resolves.toBeNull()
  })

  it('reads a regular file that stays inside its directory', async () => {
    const sftp = sftpOf({ size: 11, file: true }, PAGE, Buffer.from('<p>hi</p>'))
    getConnection.mockReturnValue({
      state: { status: 'connected' },
      sftp: () => Promise.resolve(sftp),
      downloadFile: vi.fn()
    })

    await expect(readConnectedSshHtmlPreview('ssh-1', PAGE)).resolves.toEqual({
      ok: true,
      bytes: Buffer.from('<p>hi</p>')
    })
    expect(sftp.end).toHaveBeenCalled()
  })

  it('refuses a symlink that leaves the file directory', async () => {
    const sftp = sftpOf({ size: 4, file: true }, '/etc/passwd', Buffer.from('nope'))
    getConnection.mockReturnValue({
      state: { status: 'connected' },
      sftp: () => Promise.resolve(sftp),
      downloadFile: vi.fn()
    })

    await expect(readConnectedSshHtmlPreview('ssh-1', PAGE)).resolves.toMatchObject({
      ok: false,
      reason: 'unreadable'
    })
    expect(sftp.readFile).not.toHaveBeenCalled()
  })

  it('refuses a file over the preview cap', async () => {
    const sftp = sftpOf({ size: 10 * 1024 * 1024 + 1, file: true }, PAGE, Buffer.alloc(0))
    getConnection.mockReturnValue({
      state: { status: 'connected' },
      sftp: () => Promise.resolve(sftp),
      downloadFile: vi.fn()
    })

    await expect(readConnectedSshHtmlPreview('ssh-1', PAGE)).resolves.toMatchObject({
      ok: false,
      reason: 'too-large'
    })
  })

  it('downloads through system SSH when SFTP is unavailable', async () => {
    const downloadFile = vi.fn(async (_remote: string, localPath: string) => {
      await writeFile(localPath, '<p>sys</p>')
    })
    getConnection.mockReturnValue({
      state: { status: 'connected' },
      sftp: () => Promise.reject(new Error(SYSTEM_SFTP_UNAVAILABLE)),
      downloadFile
    })

    await expect(readConnectedSshHtmlPreview('ssh-1', PAGE)).resolves.toEqual({
      ok: true,
      bytes: Buffer.from('<p>sys</p>')
    })
    expect(downloadFile).toHaveBeenCalledWith(PAGE, expect.stringMatching(/page$/))
  })
})
