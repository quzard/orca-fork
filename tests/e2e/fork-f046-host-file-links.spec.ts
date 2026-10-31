// Fork F046: links in a managed SSH host's terminal to files outside the clicked workspace open in that
// workspace with the host's bytes (editor, Markdown with images, in-app HTML preview) and never switch away.
// Needs ORCA_E2E_SSH_DOCKER=1 and ORCA_E2E_ORCAD_CONVERT_TEMPLATE (a template built for the Docker host).
import { rmSync, writeFileSync } from 'node:fs'
import { expect, test } from './helpers/orca-app'
import {
  launchManagedWorkspace,
  openTerminalTab,
  skipUnlessManagedDockerHost,
  withManagedHost
} from './helpers/orcad-managed-workspace'
import { quotePosixShell } from '../../src/shared/shell-argument-quoting'
import { toRuntimeExecutionHostId } from '../../src/shared/execution-host'
import { folderWorkspaceKey } from '../../src/shared/workspace-scope'
import {
  clickPrintedHostPath,
  expectEditorText,
  forkShot,
  readActiveWorkspace,
  readDesktopOpens,
  readDocPreviewGuest,
  readDocPreviewTabs,
  readOpenedFile,
  recordDesktopOpens,
  useEnglishUi
} from './fork-managed-host-links'

skipUnlessManagedDockerHost()
test.skip(process.platform === 'win32', 'The Docker SSH host uses POSIX tooling')

// A 48x48 checkerboard PNG: a loaded image proves the bytes arrived, and it shows in screenshots.
const CHECKERBOARD_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAIAAADYYG7QAAAAUElEQVR42u3XsQ0AIAgEQEZxBEZydEZxBCUx2lzy9XMdEJW5zZi1za2eAAICAgICaoJeDjvpAQICAgIC6oJseyAgICAgf5nzAwgICAjoK2gBvFTQpjZgKqQAAAAASUVORK5CYII='

test('host terminal links to files outside the workspace stay in the clicked workspace', async (// oxlint-disable-next-line no-empty-pattern -- Owns its app launch through a restart session.
{}, testInfo) => {
  test.setTimeout(10 * 60_000)
  const stamp = String(Date.now())
  const appPath = '/root/wt/app'
  const libPath = '/root/wt/lib'
  const files = {
    plain: '/root/notes/plain.txt',
    markdown: '/root/notes/doc.md',
    report: '/root/pages/report.html',
    site: '/root/pages/site.html',
    owned: `${libPath}/src/index.ts`,
    ownedPage: `${libPath}/page.html`,
    // Same path on this Mac and on the host, with different contents.
    same: `/tmp/orca-fork-e2e-same-${stamp}.txt`
  }
  writeFileSync(files.same, `MAC_SAME_${stamp}\n`)
  try {
    await withManagedHost(testInfo, async (fixture) => {
      const exec = fixture.host.exec!
      const write = (filePath: string, contents: string): string =>
        exec(
          `mkdir -p ${quotePosixShell(filePath.slice(0, filePath.lastIndexOf('/')))} && printf '%s' ${quotePosixShell(contents)} > ${quotePosixShell(filePath)}`
        )
      exec(
        `mkdir -p /root/wt && git clone --quiet ${quotePosixShell(fixture.host.remoteRepoPath)} ${appPath}`
      )
      write(files.plain, `SERVER_PLAIN_${stamp}\n`)
      write(files.markdown, `# Server notes ${stamp}\n\n![chart](img/chart.png)\n`)
      exec(
        `mkdir -p /root/notes/img && printf '%s' ${quotePosixShell(CHECKERBOARD_PNG)} | base64 -d > /root/notes/img/chart.png`
      )
      write(
        files.report,
        `<!doctype html><html><head><title>Report</title><style>h1{color:rgb(0, 128, 0)}</style></head>` +
          `<body><h1 id="title">Server report ${stamp}</h1></body></html>\n`
      )
      write(
        files.site,
        `<!doctype html><html><head><title>Site</title><link rel="stylesheet" href="style.css"></head>` +
          `<body><h1 id="title">Server site ${stamp}</h1></body></html>\n`
      )
      write('/root/pages/style.css', 'h1 { color: rgb(200, 30, 30); }\n')
      write(files.owned, `export const ownedByLib = 'LIB_OWNED_${stamp}'\n`)
      write(
        files.ownedPage,
        `<!doctype html><html><body><h1 id="title">Lib page ${stamp}</h1></body></html>\n`
      )
      write(files.same, `SERVER_SAME_${stamp}\n`)

      const { app, page, seeded, environmentId } = await launchManagedWorkspace(fixture, {
        repoPath: appPath,
        folderPath: libPath,
        beforeSeed: useEnglishUi
      })
      await recordDesktopOpens(app)
      const hostId = toRuntimeExecutionHostId(environmentId)
      const workspaceA = seeded.worktreeId
      const folderId = await page.evaluate(
        (folderPath) =>
          window.__store!.getState().folderWorkspaces.find((f) => f.folderPath === folderPath)?.id,
        libPath
      )
      expect(folderId, 'the folder workspace B converted onto the managed host').toBeTruthy()
      const workspaceB = folderWorkspaceKey(folderId!)
      const terminal = await openTerminalTab(page, workspaceA)
      const stayedInA = async (): Promise<void> => {
        await expect
          .poll(() => readActiveWorkspace(page), { timeout: 10_000 })
          .toEqual({ worktreeId: workspaceA, hostId })
      }

      await test.step('plain text outside every workspace opens in A with the host bytes', async () => {
        await clickPrintedHostPath(page, testInfo, terminal, files.plain)
        await expect
          .poll(() => readOpenedFile(page, files.plain), { timeout: 30_000 })
          .toMatchObject({ worktreeId: workspaceA, granted: true })
        await expectEditorText(page, `SERVER_PLAIN_${stamp}`)
        await stayedInA()
        await forkShot(page, testInfo, 'f046-plain-txt-in-A')
      })

      await test.step('a path that also exists on this Mac shows the host file', async () => {
        await clickPrintedHostPath(page, testInfo, terminal, files.same)
        await expect
          .poll(() => readOpenedFile(page, files.same), { timeout: 30_000 })
          .toMatchObject({ worktreeId: workspaceA, granted: true })
        await expectEditorText(page, `SERVER_SAME_${stamp}`)
        await expect(page.locator('.monaco-editor .view-lines:visible').first()).not.toContainText(
          `MAC_SAME_${stamp}`
        )
        await stayedInA()
        await forkShot(page, testInfo, 'f046-same-path-shows-server')
      })

      await test.step('Markdown outside the workspace renders with its relative image', async () => {
        await clickPrintedHostPath(page, testInfo, terminal, files.markdown)
        await expect
          .poll(() => readOpenedFile(page, files.markdown), { timeout: 30_000 })
          .toMatchObject({ worktreeId: workspaceA })
        const rendered = page.locator('.rich-markdown-editor:visible').first()
        await expect(rendered).toContainText(`Server notes ${stamp}`, { timeout: 30_000 })
        const image = rendered.locator('img').first()
        await expect
          .poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth), {
            timeout: 30_000,
            message: 'the image beside the Markdown file never loaded from the host'
          })
          .toBe(48)
        await stayedInA()
        await forkShot(page, testInfo, 'f046-markdown-image')
      })

      await test.step('self-contained HTML renders in the in-app preview in A', async () => {
        await clickPrintedHostPath(page, testInfo, terminal, files.report)
        await expect
          .poll(
            async () => (await readDocPreviewTabs(page, files.report)).map((t) => t.worktreeId),
            {
              timeout: 30_000
            }
          )
          .toEqual([workspaceA])
        await expect
          .poll(() => readDocPreviewGuest(page, `document.querySelector('#title')?.textContent`), {
            timeout: 60_000,
            message: 'the host HTML never rendered in the document preview'
          })
          .toBe(`Server report ${stamp}`)
        expect(
          await readDocPreviewGuest(
            page,
            `getComputedStyle(document.querySelector('#title')).color`
          )
        ).toBe('rgb(0, 128, 0)')
        expect(await readOpenedFile(page, files.report), 'no editor source tab').toBeNull()
        expect(await readDesktopOpens(app), 'no system browser or default app').toEqual([])
        await stayedInA()
        await forkShot(page, testInfo, 'f046-html-doc-preview')
      })

      await test.step('HTML with a relative stylesheet asks for its folder, then styles apply', async () => {
        await clickPrintedHostPath(page, testInfo, terminal, files.site)
        await expect
          .poll(async () => (await readDocPreviewTabs(page, files.site)).map((t) => t.worktreeId), {
            timeout: 30_000
          })
          .toEqual([workspaceA])
        await expect
          .poll(() => readDocPreviewGuest(page, `document.querySelector('#title')?.textContent`), {
            timeout: 60_000
          })
          .toBe(`Server site ${stamp}`)
        const prompt = page.getByText('This preview wants to read files in /root/pages.')
        await expect(prompt).toBeVisible({ timeout: 30_000 })
        await forkShot(page, testInfo, 'f046-html-folder-prompt')
        await page.getByRole('button', { name: 'Allow folder', exact: true }).click()
        await expect(prompt).toBeHidden()
        await expect
          .poll(
            () =>
              readDocPreviewGuest(page, `getComputedStyle(document.querySelector('#title')).color`),
            { timeout: 60_000, message: 'the stylesheet beside the HTML never applied' }
          )
          .toBe('rgb(200, 30, 30)')
        expect(await readDesktopOpens(app)).toEqual([])
        await stayedInA()
        await forkShot(page, testInfo, 'f046-html-css-applied')
      })

      await test.step("workspace B's file opens read-only in A without activating B", async () => {
        await clickPrintedHostPath(page, testInfo, terminal, files.owned)
        await expect
          .poll(() => readOpenedFile(page, files.owned), { timeout: 30_000 })
          .toMatchObject({ worktreeId: workspaceA, readOnly: true, granted: true })
        await expectEditorText(page, `LIB_OWNED_${stamp}`)
        await expect
          .poll(() => page.evaluate(() => window.__monacoEditorE2E?.filePath))
          .toBe(files.owned)
        await page.locator('.monaco-editor .view-lines:visible').first().click()
        await page.keyboard.type('EDIT_ATTEMPT')
        await expect(page.locator('.monaco-editor .view-lines:visible').first()).not.toContainText(
          'EDIT_ATTEMPT'
        )
        expect(await page.evaluate(() => window.__monacoEditorE2E?.snapshot().canUndo)).toBe(false)
        await stayedInA()
        expect((await readActiveWorkspace(page)).worktreeId).not.toBe(workspaceB)
        await forkShot(page, testInfo, 'f046-b-owned-read-only-in-A')
      })

      await test.step("workspace B's HTML previews in A without activating B", async () => {
        await clickPrintedHostPath(page, testInfo, terminal, files.ownedPage)
        await expect
          .poll(
            async () => (await readDocPreviewTabs(page, files.ownedPage)).map((t) => t.worktreeId),
            { timeout: 30_000 }
          )
          .toEqual([workspaceA])
        await expect
          .poll(() => readDocPreviewGuest(page, `document.querySelector('#title')?.textContent`), {
            timeout: 60_000
          })
          .toBe(`Lib page ${stamp}`)
        expect(await readDesktopOpens(app)).toEqual([])
        await stayedInA()
        await forkShot(page, testInfo, 'f046-b-owned-html-in-A')
      })
    })
  } finally {
    rmSync(files.same, { force: true })
  }
})
