// Fork e2e support for clicking host-terminal links on a managed SSH host and observing where they open.
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import type { ElectronApplication, Page, TestInfo } from '@stablyai/playwright-test'
import { expect } from './helpers/orca-app'
import { selectTerminalTab, waitForPane } from './helpers/orcad-managed-workspace'
import { openTerminalWorkspaceRootLink } from './helpers/terminal-workspace-root-link'

/** Writes to ORCA_E2E_FORK_SHOTS_DIR when set (for a person to look at), else the test's output dir. */
export async function forkShot(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const directory = process.env.ORCA_E2E_FORK_SHOTS_DIR
  if (directory) {
    mkdirSync(directory, { recursive: true })
  }
  await page.screenshot({
    path: directory ? path.join(directory, `${name}.png`) : testInfo.outputPath(`${name}.png`)
  })
}

/** English UI for the selectors below, whatever language this desktop runs in. */
export async function switchUiToEnglish(page: Page): Promise<void> {
  await page.evaluate(() => window.__store!.getState().updateSettings({ uiLanguage: 'en' }))
}

/** Records, and swallows, every system-browser or default-app open from the desktop main process. */
export async function recordDesktopOpens(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ shell }) => {
    const opened: string[] = []
    Reflect.set(globalThis, '__forkDesktopOpens', opened)
    shell.openExternal = async (url: string) => {
      opened.push(url)
    }
    shell.openPath = async (target: string) => {
      opened.push(target)
      return ''
    }
  })
}

export function readDesktopOpens(app: ElectronApplication): Promise<string[]> {
  return app.evaluate(() => {
    const opened: unknown = Reflect.get(globalThis, '__forkDesktopOpens')
    return Array.isArray(opened) ? opened.map(String) : []
  })
}

/** Prints `filePath` in the terminal tab and Cmd/Ctrl-clicks it, as a user opens a link. */
export async function clickPrintedHostPath(
  page: Page,
  testInfo: TestInfo,
  terminalTabId: string,
  filePath: string
): Promise<void> {
  await selectTerminalTab(page, terminalTabId)
  await waitForPane(page, terminalTabId)
  await openTerminalWorkspaceRootLink(page, testInfo, filePath, 'open')
}

export type ActiveWorkspace = { worktreeId: string | null; hostId: string | null }

export function readActiveWorkspace(page: Page): Promise<ActiveWorkspace> {
  return page.evaluate(() => {
    const state = window.__store!.getState()
    return {
      worktreeId: state.activeWorktreeId ?? null,
      hostId: state.activeWorkspaceExecutionHostId ?? null
    }
  })
}

export type OpenedFile = {
  worktreeId: string
  readOnly: boolean
  granted: boolean
  runtimeEnvironmentId: string | null
}

export function readOpenedFile(page: Page, filePath: string): Promise<OpenedFile | null> {
  return page.evaluate((target) => {
    const file = window.__store!.getState().openFiles.find((entry) => entry.filePath === target)
    return file
      ? {
          worktreeId: file.worktreeId,
          readOnly: file.readOnly === true,
          granted: Boolean(file.terminalArtifactGrantId),
          runtimeEnvironmentId: file.runtimeEnvironmentId ?? null
        }
      : null
  }, filePath)
}

export type DocPreviewTab = { worktreeId: string; workspaceId: string; url: string }

/** Every browser tab, in any workspace, whose document preview shows `filePath`. */
export function readDocPreviewTabs(page: Page, filePath: string): Promise<DocPreviewTab[]> {
  return page.evaluate((target) => {
    const state = window.__store!.getState()
    const tabs: { worktreeId: string; workspaceId: string; url: string }[] = []
    for (const [worktreeId, workspaces] of Object.entries(state.browserTabsByWorktree)) {
      for (const workspace of workspaces) {
        if (workspace.docLocation?.filePath === target) {
          tabs.push({ worktreeId, workspaceId: workspace.id, url: workspace.url })
        }
      }
    }
    return tabs
  }, filePath)
}

/** Text the visible Monaco editor renders, read from its DOM. */
export async function expectEditorText(page: Page, text: string): Promise<void> {
  await expect(page.locator('.monaco-editor .view-lines:visible').first()).toContainText(text, {
    timeout: 30_000
  })
}

/** Evaluates `expression` inside the visible document preview guest; null until it is ready. */
export function readDocPreviewGuest(page: Page, expression: string): Promise<unknown> {
  return page.evaluate(async (code) => {
    const guests = [
      ...document.querySelectorAll<HTMLElement>('webview[src^="orca-preview://"]')
    ].filter((guest) => guest.getBoundingClientRect().width > 0)
    const guest = guests.at(-1) as
      | (HTMLElement & { executeJavaScript?: (source: string) => Promise<unknown> })
      | undefined
    if (!guest?.executeJavaScript) {
      return null
    }
    try {
      return await guest.executeJavaScript(code)
    } catch {
      return null
    }
  }, expression)
}
