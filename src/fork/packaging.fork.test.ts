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
    expect(installer).toContain('node src/fork/packaging.cjs --print-built-targets')
    expect(installer).not.toContain('generate:skill-bundle-manifest')
    expect(installer).toContain('ORCA_BACKGROUND_LAUNCH=1')
    const push = readFileSync(resolve('fork/push_github.sh'), 'utf8')
    expect(push).toContain('/srv/wt/project')
    execFileSync('bash', ['-n', resolve('fork/scripts/install-mac-release.sh')])
  })
})
