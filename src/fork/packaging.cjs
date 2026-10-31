/**
 * Fork packaging overrides. Upstream reads these and otherwise stays unchanged.
 * Release CI leaves ORCA_ORCAD_TEMPLATE_TARGETS unset, so the all-targets check stays.
 */

// Self-signed identity used on every Mac. Missing identity stops the install script.
const LOCAL_SIGNING_IDENTITY = 'Orca Local Signing'

// Static payloads the parent bundle already seals. Mach-O and native modules stay signed.
const MAC_STATIC_RESOURCE_SIGN_IGNORE = [
  '/ai-vault/',
  '/Contents/Resources/onboarding/feature-wall/[^/]+\\.(gif|png|webp|jpg|jpeg)$',
  '/Contents/Frameworks/Electron Framework\\.framework/(?:Versions/[^/]+/)?Resources/(?:[^/]+\\.lproj/locale\\.pak|(?:chrome_100_percent|chrome_200_percent|resources)\\.pak|icudtl\\.dat|v8_context_snapshot\\.(?:arm64|x64)\\.bin)$'
]

// The Mac client is Apple Silicon; the SSH hosts are x86_64 Linux, some on glibc 2.17.
// linux-x64-glibc217 is staged beside linux-x64-glibc when its prebuild exists, so it is not
// requested through ORCA_ORCAD_TEMPLATE_TARGETS (upstream adds staged compat slots itself).
const LOCAL_TEMPLATE_TARGETS = [
  'darwin-arm64',
  'linux-x64-glibc',
  'linux-arm64-glibc',
  'linux-x64-glibc217'
]

/** Comma-separated ORCA_ORCAD_TEMPLATE_TARGETS narrows upstream's packaged-template checks. */
function orcadTemplateTargets(env = process.env) {
  const raw = env.ORCA_ORCAD_TEMPLATE_TARGETS?.trim()
  if (!raw) {
    return undefined
  }
  const targets = raw
    .split(',')
    .map((target) => target.trim())
    .filter(Boolean)
  return targets.length > 0 ? targets : undefined
}

/** Throws unless an orcad template manifest lists every target this Mac package must carry. */
function assertLocalTemplateTargets(manifestPath) {
  const { readFileSync } = require('node:fs')
  const targets = JSON.parse(readFileSync(manifestPath, 'utf8')).targets ?? {}
  const missing = LOCAL_TEMPLATE_TARGETS.filter((name) => !Object.hasOwn(targets, name))
  if (missing.length > 0) {
    throw new Error(`orcad template ${manifestPath} is missing ${missing.join(', ')}`)
  }
}

module.exports = {
  LOCAL_TEMPLATE_TARGETS,
  assertLocalTemplateTargets,
  extraMacSignIgnore: MAC_STATIC_RESOURCE_SIGN_IGNORE,
  localSigningIdentity: LOCAL_SIGNING_IDENTITY,
  orcadTemplateTargets
}
