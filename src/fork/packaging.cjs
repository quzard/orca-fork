/**
 * Fork packaging overrides. Upstream reads these and otherwise stays unchanged.
 * Release CI leaves ORCA_ORCAD_TEMPLATE_TARGETS unset, so the all-targets check stays.
 */

// Self-signed identity used on every Mac. Missing identity stops the install script.
const LOCAL_SIGNING_IDENTITY = 'Orca Local Signing'

// Static payloads the parent bundle already seals. Mach-O and native modules stay signed.
const MAC_STATIC_RESOURCE_SIGN_IGNORE = [
  '/Contents/Resources/onboarding/feature-wall/[^/]+\\.(gif|png|webp|jpg|jpeg)$',
  '/Contents/Frameworks/Electron Framework\\.framework/(?:Versions/[^/]+/)?Resources/(?:[^/]+\\.lproj/locale\\.pak|(?:chrome_100_percent|chrome_200_percent|resources)\\.pak|icudtl\\.dat|v8_context_snapshot\\.(?:arm64|x64)\\.bin)$'
]

/** Comma-separated ORCA_ORCAD_TEMPLATE_TARGETS narrows the local template check. */
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

function templateTargetNames(manifest) {
  const targets = manifest?.targets
  if (!targets || typeof targets !== 'object' || Array.isArray(targets)) {
    throw new Error('orcad template manifest is missing targets')
  }
  return Object.keys(targets)
}

module.exports = {
  extraMacSignIgnore: MAC_STATIC_RESOURCE_SIGN_IGNORE,
  localSigningIdentity: LOCAL_SIGNING_IDENTITY,
  orcadTemplateTargets,
  templateTargetNames
}

if (require.main === module && process.argv.includes('--print-built-targets')) {
  const { readFileSync } = require('node:fs')
  const manifest = JSON.parse(readFileSync('out/orcad-template/orcad-template.json', 'utf8'))
  process.stdout.write(templateTargetNames(manifest).join(','))
}
