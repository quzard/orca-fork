import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
// oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: packaging.cjs exports these four fields and nothing else is read.
const packaging = require('./packaging.cjs') as {
  extraMacSignIgnore: string[]
  localSigningIdentity: string
  orcadTemplateTargets: (env?: NodeJS.ProcessEnv) => string[] | undefined
  templateTargetNames: (manifest: { targets?: Record<string, unknown> }) => string[]
}

describe('fork packaging', () => {
  it('uses the fixed local signing identity and narrows template targets only when asked', () => {
    expect(packaging.localSigningIdentity).toBe('Orca Local Signing')
    expect(packaging.extraMacSignIgnore.join('\n')).toContain('feature-wall')
    expect(packaging.orcadTemplateTargets({})).toBeUndefined()
    expect(packaging.orcadTemplateTargets({ ORCA_ORCAD_TEMPLATE_TARGETS: '  ' })).toBeUndefined()
    expect(
      packaging.orcadTemplateTargets({
        ORCA_ORCAD_TEMPLATE_TARGETS: 'darwin-arm64, linux-x64-glibc'
      })
    ).toEqual(['darwin-arm64', 'linux-x64-glibc'])
    expect(
      packaging.templateTargetNames({
        targets: { 'darwin-arm64': {}, 'linux-x64-glibc': {} }
      })
    ).toEqual(['darwin-arm64', 'linux-x64-glibc'])
  })

  it('is what the mac signer and the install script actually call', () => {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the test only reads mac.signIgnore from the builder config object.
    const builder = require('../../config/electron-builder.config.cjs') as {
      mac: { signIgnore: string[] }
    }
    expect(builder.mac.signIgnore).toEqual(expect.arrayContaining(packaging.extraMacSignIgnore))
    const installer = readFileSync(resolve('fork/scripts/install-mac-release.sh'), 'utf8')
    expect(installer).toContain("require('./src/fork/packaging.cjs').localSigningIdentity")
    expect(installer).toContain('pnpm install --frozen-lockfile --cpu=arm64')
    expect(installer).not.toContain('--cpu=current,x64,arm64')
    expect(installer).toContain('pinned-node-downloads.mjs darwin-arm64')
    expect(installer).not.toContain('darwin-arm64 darwin-x64')
    expect(installer).toContain('node config/scripts/build-mac-local.mjs dmg:arm64 zip:arm64')
    expect(installer).toContain('pnpm run build:release')
    expect(installer).toContain('pnpm build:orcad-prebuilds')
    expect(installer).toContain('build-orcad-prebuilds.mjs --print-slot')
    expect(installer).toContain('bash fork/scripts/build-orcad-linux-prebuilds.sh')
    expect(installer).toContain("TEMPLATE_TARGETS='darwin-arm64,linux-x64-glibc,linux-arm64-glibc'")
    expect(installer).toContain(
      'node config/scripts/build-orcad-template.mjs --targets "$TEMPLATE_TARGETS"'
    )
    expect(installer).toContain('export ORCA_ORCAD_TEMPLATE_TARGETS="$TEMPLATE_TARGETS"')
    expect(installer).not.toMatch(/ORCA_ORCAD_TEMPLATE_TARGETS=.*glibc217/)
    for (const target of [
      'linux-x64-glibc',
      'linux-arm64-glibc',
      'linux-x64-glibc217',
      'darwin-arm64'
    ]) {
      expect(installer).toContain(target)
    }
    expect(installer).toContain('ORCA_REQUIRE_ORCAD_TEMPLATE=1')
    expect(installer).toContain('ORCA_MAC_RELEASE=0')
    // The Linux orcad containers mount only the repo, so pnpm must not link deps from outside it.
    expect(installer).toContain('export ORCA_PNPM_GLOBAL_VIRTUAL_STORE=0')
    expect(installer.indexOf('export ORCA_PNPM_GLOBAL_VIRTUAL_STORE=0')).toBeLessThan(
      installer.indexOf('pnpm install --frozen-lockfile --cpu=arm64')
    )
    const localBuild = readFileSync(resolve('config/scripts/build-mac-local.mjs'), 'utf8')
    expect(localBuild).toContain('...builderArgs')
    expect(localBuild).toContain('process.argv.slice(2)')
    expect(installer).toContain('orcad-template/orcad-template.json')
    expect(installer).toContain('out/cli/skills-source-commit.js')
    expect(installer).not.toContain('generate:skill-bundle-manifest')
    expect(installer).not.toContain('--print-built-targets')
    expect(installer).not.toContain('dist/local-release')
    expect(installer).not.toContain('--publish')
    // --install-built was only for the deleted release-personal-orca.mjs.
    expect(installer).not.toContain('--install-built')
    expect(installer).not.toContain('ORCA_MAC_RELEASE=1')
    expect(installer).toContain('ORCA_BACKGROUND_LAUNCH=1')
    const push = readFileSync(resolve('fork/push_github.sh'), 'utf8')
    expect(push).toContain('/srv/wt/project')
    execFileSync('bash', ['-n', resolve('fork/scripts/install-mac-release.sh')])
  })

  it('builds linux orcad slots with the CI manylinux images', () => {
    const script = readFileSync(resolve('fork/scripts/build-orcad-linux-prebuilds.sh'), 'utf8')
    const workflow = readFileSync(resolve('.github/workflows/node-server-tests.yml'), 'utf8')
    const digests = [
      '407f771c51a2c3e83ebe5a7970b4289ead3a6db21d9b9c089168775cad11d328',
      'c22ffd129ac99a8a42d1f2c2f4e88a9089288dd9ee987a7092da1c7dc48f27a9',
      '6f74cabeac2432570aa4bfdb29f7c1f30313d4d6654d764c44e574b6ffdd4ed5'
    ]
    for (const digest of digests) {
      expect(script).toContain(digest)
      expect(workflow).toContain(digest)
    }
    expect(script).toContain('run_slot linux-x64-glibc linux/amd64')
    expect(script).toContain('run_slot linux-arm64-glibc linux/arm64')
    expect(script).toContain('run_slot linux-x64-glibc217 linux/amd64')
    expect(script).toContain('--slot="$ORCAD_SLOT"')
    expect(script).toContain('env -u LD_LIBRARY_PATH')
    expect(script).toContain("dnf --disablerepo='epel*' install -y git procps-ng unzip which xz")
    expect(script).toContain('/Applications/OrbStack.app/Contents/MacOS/xbin')
    expect(script).toContain('ORCA_NODE_RUNTIME_CACHE_DIR=/node-runtime-cache')
    expect(script).toContain('type=bind,source=')
    expect(script).toContain('find "$ORCA_NODE_RUNTIME_CACHE_DIR" -uid 0 -exec chown -h')
    expect(script).toContain('未找到 docker 可执行文件')
    expect(script).toContain('Docker 不可用')
    expect(script).not.toMatch(/^\s*pnpm\b/m)
    expect(script.indexOf('check_node_pty_in_repo\nrun_slot')).toBeGreaterThan(0)
    execFileSync('bash', ['-n', resolve('fork/scripts/build-orcad-linux-prebuilds.sh')])
  })

  it('rewrites a pinned Node path outside the repo into the cache mount', () => {
    const script = resolve('fork/scripts/build-orcad-linux-prebuilds.sh')
    const repoRoot = realpathSync(resolve('.'))
    const env = { ...process.env }
    delete env.ORCA_NODE_RUNTIME_CACHE_DIR
    const print = (args: string[], extra: NodeJS.ProcessEnv = {}) =>
      execFileSync('bash', [script, ...args], {
        encoding: 'utf8',
        env: { ...env, ...extra },
        stdio: ['ignore', 'pipe', 'pipe']
      }).trim()
    const outside = '/tmp/orca-fork-cache-outside'
    const dotdot = `${repoRoot}/../tmp/orca-fork-cache-x`
    const dotdotDir = resolve(repoRoot, '../tmp/orca-fork-cache-x')
    const doubled = '/tmp//orca-fork-cache-slash'
    const missingRuntime = '/tmp/orca-fork-cache-other/bin/node'
    try {
      mkdirSync(join(repoRoot, 'out/node-runtime-cache/node-v/bin'), { recursive: true })
      mkdirSync(join(outside, 'node-v24.21.0-linux-x64/bin'), { recursive: true })
      mkdirSync(join(dotdotDir, 'node-v/bin'), { recursive: true })
      mkdirSync('/tmp/orca-fork-cache-slash/node-v/bin', { recursive: true })
      expect(print(['--print-container-cache'])).toBe('/work/out/node-runtime-cache')
      expect(
        print(['--print-container-node', `${repoRoot}/out/node-runtime-cache/node-v/bin/node`])
      ).toBe('/work/out/node-runtime-cache/node-v/bin/node')
      expect(print(['--print-container-node', 'out/node-runtime-cache/node-v/bin/node'])).toBe(
        '/work/out/node-runtime-cache/node-v/bin/node'
      )
      expect(print(['--print-container-cache'], { ORCA_NODE_RUNTIME_CACHE_DIR: outside })).toBe(
        '/node-runtime-cache'
      )
      expect(
        print(['--print-container-node', `${outside}/node-v24.21.0-linux-x64/bin/node`], {
          ORCA_NODE_RUNTIME_CACHE_DIR: outside
        })
      ).toBe('/node-runtime-cache/node-v24.21.0-linux-x64/bin/node')
      // ../x 在字符串上以仓库为前缀，物理路径在仓库外，必须单独挂载。
      expect(print(['--print-container-cache'], { ORCA_NODE_RUNTIME_CACHE_DIR: dotdot })).toBe(
        '/node-runtime-cache'
      )
      expect(
        print(['--print-container-node', `${dotdot}/node-v/bin/node`], {
          ORCA_NODE_RUNTIME_CACHE_DIR: dotdot
        })
      ).toBe('/node-runtime-cache/node-v/bin/node')
      expect(
        print(['--print-container-cache'], {
          ORCA_NODE_RUNTIME_CACHE_DIR: '../tmp/orca-fork-cache-x'
        })
      ).toBe('/node-runtime-cache')
      // 重复斜杠收成同一物理目录后再判断在不在仓库里。
      expect(print(['--print-container-cache'], { ORCA_NODE_RUNTIME_CACHE_DIR: doubled })).toBe(
        '/node-runtime-cache'
      )
      expect(
        print(['--print-container-node', `${doubled}/node-v/bin/node`], {
          ORCA_NODE_RUNTIME_CACHE_DIR: doubled
        })
      ).toBe('/node-runtime-cache/node-v/bin/node')
      expect(
        print(['--print-container-node', '/tmp/orca-fork-cache-slash/node-v/bin/node'], {
          ORCA_NODE_RUNTIME_CACHE_DIR: doubled
        })
      ).toBe('/node-runtime-cache/node-v/bin/node')
      expect(
        print(['--print-container-cache'], {
          ORCA_NODE_RUNTIME_CACHE_DIR: `${repoRoot}/out/custom-node-cache`
        })
      ).toBe('/work/out/custom-node-cache')
      expect(existsSync(missingRuntime)).toBe(false)
      expect(() =>
        print(['--print-container-node', missingRuntime], {
          ORCA_NODE_RUNTIME_CACHE_DIR: '/tmp/orca-fork-cache-neither'
        })
      ).toThrow()
      expect(existsSync('/tmp/orca-fork-cache-other')).toBe(false)
      mkdirSync('/tmp/orca-fork-cache-other/bin', { recursive: true })
      expect(() =>
        print(['--print-container-node', missingRuntime], {
          ORCA_NODE_RUNTIME_CACHE_DIR: '/tmp/orca-fork-cache-neither'
        })
      ).toThrow(/outside the workspace and the runtime cache/)
    } finally {
      rmSync(join(repoRoot, 'out/custom-node-cache'), { recursive: true, force: true })
      rmSync(join(repoRoot, 'out/node-runtime-cache/node-v'), { recursive: true, force: true })
      rmSync(dotdotDir, { recursive: true, force: true })
      for (const dir of [
        outside,
        '/tmp/orca-fork-cache-slash',
        '/tmp/orca-fork-cache-other',
        '/tmp/orca-fork-cache-neither'
      ]) {
        rmSync(dir, { recursive: true, force: true })
      }
    }
  })

  it('refuses to compile when node-pty or its deps resolve outside the repo', () => {
    const repo = realpathSync(mkdtempSync(join(tmpdir(), 'orca-fork-pty-repo-')))
    const store = realpathSync(mkdtempSync(join(tmpdir(), 'orca-fork-pty-store-')))
    const pkg = (dir: string, name: string, deps: Record<string, string> = {}) => {
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, dependencies: deps }))
    }
    const check = () =>
      execFileSync(
        'bash',
        [join(repo, 'fork/scripts/build-orcad-linux-prebuilds.sh'), '--check-node-pty'],
        {
          encoding: 'utf8',
          env: { ...process.env, ORCA_NODE_RUNTIME_CACHE_DIR: join(repo, 'out/cache') },
          stdio: ['ignore', 'pipe', 'pipe']
        }
      )
    try {
      mkdirSync(join(repo, 'fork/scripts'), { recursive: true })
      mkdirSync(join(repo, 'config/scripts'), { recursive: true })
      copyFileSync(
        resolve('fork/scripts/build-orcad-linux-prebuilds.sh'),
        join(repo, 'fork/scripts/build-orcad-linux-prebuilds.sh')
      )
      expect(check).toThrow(/解析不到 node-pty/)
      // Global virtual store layout: node_modules/node-pty is a link into a store outside the repo.
      const linked = join(store, 'node_modules/node-pty')
      pkg(linked, 'node-pty', { 'node-addon-api': '^7.1.0' })
      pkg(join(store, 'node_modules/node-addon-api'), 'node-addon-api')
      mkdirSync(join(repo, 'node_modules'))
      symlinkSync(linked, join(repo, 'node_modules/node-pty'))
      expect(check).toThrow(/node-pty 不在仓库里[\s\S]*ORCA_PNPM_GLOBAL_VIRTUAL_STORE=0/)
      // Project-local layout, but a dependency still links out of the repo.
      rmSync(join(repo, 'node_modules/node-pty'))
      const local = join(repo, 'node_modules/.pnpm/node-pty/node_modules/node-pty')
      pkg(local, 'node-pty', { 'node-addon-api': '^7.1.0' })
      symlinkSync(local, join(repo, 'node_modules/node-pty'))
      symlinkSync(
        join(store, 'node_modules/node-addon-api'),
        join(repo, 'node_modules/.pnpm/node-pty/node_modules/node-addon-api')
      )
      expect(check).toThrow(/node-addon-api/)
      // A missing dependency is named as itself, not reported as a missing node-pty.
      rmSync(join(repo, 'node_modules/.pnpm/node-pty/node_modules/node-addon-api'))
      expect(check).toThrow(/解析不到 node-addon-api/)
      symlinkSync(
        join(store, 'node_modules/node-addon-api'),
        join(repo, 'node_modules/.pnpm/node-pty/node_modules/node-addon-api')
      )
      rmSync(join(repo, 'node_modules/.pnpm/node-pty/node_modules/node-addon-api'))
      pkg(join(repo, 'node_modules/.pnpm/node-pty/node_modules/node-addon-api'), 'node-addon-api')
      expect(check).not.toThrow()
    } finally {
      rmSync(repo, { recursive: true, force: true })
      rmSync(store, { recursive: true, force: true })
    }
  })

  it('separates a missing docker binary from a stopped daemon', () => {
    const script = resolve('fork/scripts/build-orcad-linux-prebuilds.sh')
    const home = mkdtempSync(join(tmpdir(), 'orca-fork-docker-home-'))
    const cache = join(home, 'cache')
    const env = { ...process.env, HOME: home, ORCA_NODE_RUNTIME_CACHE_DIR: cache }
    const hostDocker = [
      '/opt/homebrew/bin/docker',
      '/usr/local/bin/docker',
      '/Applications/OrbStack.app/Contents/MacOS/xbin/docker'
    ].some((candidate) => existsSync(candidate))
    try {
      // 本机这些路径上已有 docker 时，脚本会找到它，这条断言只在没有这些文件时成立。
      if (!hostDocker) {
        expect(() =>
          execFileSync('bash', [script], {
            encoding: 'utf8',
            env: { ...env, PATH: '/usr/bin:/bin' },
            stdio: ['ignore', 'pipe', 'pipe']
          })
        ).toThrow(/未找到 docker 可执行文件/)
      }
      const bin = join(home, 'bin')
      mkdirSync(bin)
      writeFileSync(
        join(bin, 'docker'),
        '#!/bin/sh\necho "Cannot connect to the Docker daemon" >&2\nexit 1\n'
      )
      chmodSync(join(bin, 'docker'), 0o755)
      expect(() =>
        execFileSync('bash', [script], {
          encoding: 'utf8',
          env: { ...env, PATH: `${bin}:/usr/bin:/bin` },
          stdio: ['ignore', 'pipe', 'pipe']
        })
      ).toThrow(/Docker 不可用[\s\S]*Cannot connect to the Docker daemon/)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('bundles fork registration into the orcad template entry', () => {
    const entry = readFileSync(resolve('src/main/orcad/orcad-entry.ts'), 'utf8')
    const main = readFileSync(resolve('src/main/orcad/main.ts'), 'utf8')
    const build = readFileSync(resolve('config/scripts/orcad-entry-build.mjs'), 'utf8')
    const register = readFileSync(resolve('src/fork/main/register-main.ts'), 'utf8')
    expect(entry).toContain('installForkOrcadHost(installOrcadHostAdapters)')
    expect(register).toMatch(/function installForkOrcadHost[^}]*registerForkMainModules\(\)/)
    expect(main).toContain("from './orcad-entry'")
    expect(build).toContain("export const ORCAD_ENTRY_POINT = 'src/main/orcad/main.ts'")
  })
})
