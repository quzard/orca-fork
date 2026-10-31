// Fork F047: on a managed SSH host, the source-control "Workspace repos" scope lists the workspace's root
// repository and a `git worktree add` checkout in a direct child folder, served by that host's orcad.
// Needs ORCA_E2E_SSH_DOCKER=1 and ORCA_E2E_ORCAD_CONVERT_TEMPLATE (a template built for the Docker host).
import { expect, test } from './helpers/orca-app'
import {
  launchManagedWorkspace,
  skipUnlessManagedDockerHost,
  withManagedHost
} from './helpers/orcad-managed-workspace'
import { quotePosixShell } from '../../src/shared/shell-argument-quoting'
import { forkShot, switchUiToEnglish } from './fork-managed-host-links'

skipUnlessManagedDockerHost()
test.skip(process.platform === 'win32', 'The Docker SSH host uses POSIX tooling')

test('workspace repos on a managed host list the root and a worktree-add checkout', async (// oxlint-disable-next-line no-empty-pattern -- Owns its app launch through a restart session.
{}, testInfo) => {
  test.setTimeout(10 * 60_000)
  const appPath = '/root/wt/app'
  await withManagedHost(testInfo, async (fixture) => {
    const exec = fixture.host.exec!
    exec(
      [
        `mkdir -p /root/wt/lib && git clone --quiet ${quotePosixShell(fixture.host.remoteRepoPath)} ${appPath}`,
        // Another repository's linked worktree, checked out in a direct child of the workspace root.
        'mkdir -p /root/src/backend && cd /root/src/backend && git init --quiet -b main',
        'printf "server\\n" > server.txt && git add server.txt && git commit --quiet -m backend',
        `git worktree add --quiet ${appPath}/backend -b feature-backend`,
        `printf 'pending\\n' > ${appPath}/backend/pending.txt`,
        // A second-level checkout is out of scope: discovery looks one level down only.
        `mkdir -p ${appPath}/svc && git -C /root/src/backend worktree add --quiet ${appPath}/svc/api -b deep-api`
      ].join(' && ')
    )
    expect(exec(`cat ${appPath}/backend/.git`)).toContain(
      'gitdir: /root/src/backend/.git/worktrees'
    )

    const { page } = await launchManagedWorkspace(fixture, {
      repoPath: appPath,
      folderPath: '/root/wt/lib',
      beforeSeed: switchUiToEnglish
    })
    await page.evaluate(() => {
      const state = window.__store!.getState()
      state.setRightSidebarTab('explorer')
      state.setRightSidebarOpen(true)
    })
    await page.getByRole('button', { name: /Source Control/ }).click()
    const workspaceScope = page.getByTestId('source-control-scope-workspace')
    await expect(workspaceScope).toBeEnabled({ timeout: 60_000 })
    await workspaceScope.click()
    await expect(workspaceScope).toHaveAttribute('aria-pressed', 'true')

    const repos = page.getByTestId('source-control-repo')
    const root = repos.and(page.locator('[data-repository-path="."]'))
    const backend = repos.and(page.locator('[data-repository-path="backend"]'))
    await expect(root).toBeVisible({ timeout: 60_000 })
    await expect(root).toContainText('This workspace')
    await expect(backend).toBeVisible({ timeout: 60_000 })
    await expect(backend).toContainText('feature-backend')
    // The checkout has an untracked file, so its section counts it and opens on its own.
    await expect(backend).toContainText('pending.txt', { timeout: 60_000 })
    await expect(repos.and(page.locator('[data-repository-path="svc/api"]'))).toHaveCount(0)
    await expect(repos).toHaveCount(2)
    await forkShot(page, testInfo, 'f047-workspace-repos-managed-host')
  })
})
