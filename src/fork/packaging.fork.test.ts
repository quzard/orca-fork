import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
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
    const localBuild = readFileSync(resolve('config/scripts/build-mac-local.mjs'), 'utf8')
    expect(localBuild).toContain('...builderArgs')
    expect(localBuild).toContain('process.argv.slice(2)')
    expect(installer).toContain('orcad-template/orcad-template.json')
    expect(installer).toContain('out/cli/skills-source-commit.js')
    expect(installer).not.toContain('generate:skill-bundle-manifest')
    expect(installer).not.toContain('--print-built-targets')
    expect(installer).not.toContain('dist/local-release')
    expect(installer).not.toContain('--publish')
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
    expect(script).not.toMatch(/^\s*pnpm\b/m)
    execFileSync('bash', ['-n', resolve('fork/scripts/build-orcad-linux-prebuilds.sh')])
  })

  it('bundles fork registration into the orcad template entry', () => {
    const entry = readFileSync(resolve('src/main/orcad/orcad-entry.ts'), 'utf8')
    const main = readFileSync(resolve('src/main/orcad/main.ts'), 'utf8')
    const build = readFileSync(resolve('config/scripts/orcad-entry-build.mjs'), 'utf8')
    expect(entry).toContain('registerForkMainModules')
    expect(main).toContain("from './orcad-entry'")
    expect(build).toContain("export const ORCAD_ENTRY_POINT = 'src/main/orcad/main.ts'")
  })
})
