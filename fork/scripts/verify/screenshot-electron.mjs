// 后台启动 Electron，截第一扇窗口。不调用 show()。
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../../..')
const outDir = process.env.OUT_DIR ?? '/tmp/orca-fork-verify'
const mainPath = path.join(root, 'out', 'main', 'index.js')

if (!existsSync(mainPath) || process.env.ORCA_FORK_VERIFY_REBUILD === '1') {
  if (process.env.ORCA_FORK_VERIFY_SKIP_BUILD === '1' && existsSync(mainPath)) {
    console.log('reusing', mainPath)
  } else {
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
}

const { _electron: electron } = await import('@stablyai/playwright-test')
const userDataDir = path.join(outDir, 'user-data')
const homeDir = path.join(outDir, 'home')
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
  await page.waitForTimeout(2_000)
  const shot = path.join(outDir, 'fork-base-window.png')
  await page.screenshot({ path: shot })
  const title = await page.title()
  writeFileSync(
    path.join(outDir, 'fork-base-window.txt'),
    `title=${title}\nurl=${page.url()}\nscreenshot=${shot}\n`,
    'utf8'
  )
  console.log('screenshot', shot, 'title', title)
} finally {
  await app.close()
}
