// Hidden Electron screenshot of the host-directory sidebar. Does not call show().
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../../..')
const outDir = process.env.OUT_DIR ?? '/tmp/orca-fork-verify'
const mainPath = path.join(root, 'out', 'main', 'index.js')

if (!existsSync(mainPath) || process.env.ORCA_FORK_VERIFY_REBUILD === '1') {
  console.log('building electron-vite --mode e2e')
  const build = spawnSync('npx', ['electron-vite', 'build', '--mode', 'e2e'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, VITE_EXPOSE_STORE: 'true' }
  })
  if (build.status !== 0) {
    process.exit(build.status ?? 1)
  }
}

const { _electron: electron } = await import('@stablyai/playwright-test')
const userDataDir = path.join(outDir, 'sidebar-user-data')
const homeDir = path.join(outDir, 'sidebar-home')
mkdirSync(userDataDir, { recursive: true })
mkdirSync(homeDir, { recursive: true })

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
env.ORCA_BACKGROUND_LAUNCH = '1'
env.ORCA_E2E_HEADLESS = '1'
env.ORCA_E2E_USER_DATA_DIR = userDataDir
env.ORCA_E2E_HOME_DIR = homeDir
env.HOME = homeDir
env.NODE_ENV = 'development'
env.VITE_EXPOSE_STORE = 'true'

const app = await electron.launch({
  args: [
    '--no-sandbox',
    '--disable-gpu',
    '--disable-gpu-compositing',
    '--disable-gpu-sandbox',
    '--disable-dev-shm-usage',
    '--in-process-gpu',
    root
  ],
  env,
  timeout: 120_000
})

try {
  const page = await app.firstWindow({ timeout: 120_000 })
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(1500)
  const skip = page.getByRole('button', { name: 'Skip' })
  if (await page.locator('[data-onboarding-overlay]').count()) {
    await page.keyboard.press('Escape')
    await skip.click({ timeout: 5000 }).catch(() => undefined)
    await page.waitForTimeout(500)
  }
  const seeded = await page.evaluate(() => {
    const testWindow = window
    const store = testWindow.__store
    if (!store) {
      return { ok: false, reason: 'store-not-exposed' }
    }
    const devbox = 'ssh:devbox'
    const mini = 'ssh:mini'
    const repos = [
      {
        id: 'project-devbox',
        path: '/srv/wt/project',
        displayName: 'project',
        badgeColor: '#737373',
        addedAt: 1,
        executionHostId: devbox
      },
      {
        id: 'work-devbox',
        path: '/srv/wt/work/api',
        displayName: 'api',
        badgeColor: '#737373',
        addedAt: 2,
        executionHostId: devbox
      },
      {
        id: 'oss-devbox',
        path: '/srv/wt/oss/api',
        displayName: 'api',
        badgeColor: '#737373',
        addedAt: 3,
        executionHostId: devbox
      },
      {
        id: 'project-mini',
        path: '/srv/wt/project',
        displayName: 'project',
        badgeColor: '#737373',
        addedAt: 4,
        executionHostId: mini
      }
    ]
    const work = (id, repoId, workspacePath, name, hostId, sidebarGroupId) => ({
      id,
      repoId,
      path: workspacePath,
      branch: 'refs/heads/main',
      head: 'abc',
      isBare: false,
      isMainWorktree: true,
      linkedIssue: null,
      linkedPR: null,
      linkedLinearIssue: null,
      isArchived: false,
      comment: '',
      isUnread: false,
      isPinned: false,
      displayName: name,
      sortOrder: 0,
      lastActivityAt: 0,
      hostId,
      ...(sidebarGroupId ? { sidebarGroupId } : {})
    })
    store.setState({
      groupBy: 'host-directory',
      workspaceHostScope: 'all',
      repos,
      projectGroups: [
        {
          id: 'grp-web',
          name: 'Services',
          parentPath: '/srv/wt',
          executionHostId: devbox,
          parentGroupId: null,
          createdFrom: 'manual',
          tabOrder: 0,
          isCollapsed: false,
          color: null,
          createdAt: 0,
          updatedAt: 0
        }
      ],
      worktreesByRepo: {
        'project-devbox': [work('wt-project', 'project-devbox', '/srv/wt/project', 'main', devbox)],
        'work-devbox': [
          work('wt-work', 'work-devbox', '/srv/wt/work/api', 'main', devbox, 'grp-web')
        ],
        'oss-devbox': [work('wt-oss', 'oss-devbox', '/srv/wt/oss/api', 'main', devbox, 'grp-web')],
        'project-mini': [work('wt-mini', 'project-mini', '/srv/wt/project', 'main', mini)]
      }
    })
    return { ok: true, groupBy: store.getState().groupBy }
  })
  await page.waitForTimeout(1000)
  const bodyText = await page.locator('body').innerText()
  const shot = path.join(outDir, 'host-directory-sidebar.png')
  await page.screenshot({ path: shot })
  writeFileSync(
    path.join(outDir, 'host-directory-sidebar.txt'),
    `seeded=${JSON.stringify(seeded)}\nscreenshot=${shot}\n\n${bodyText.slice(0, 4000)}\n`,
    'utf8'
  )
  console.log('screenshot', shot, 'seeded', JSON.stringify(seeded))
} finally {
  await app.close()
}
