/**
 * Preview packaging identity. electron-builder reads this only when
 * ORCA_REQUIREMENT_PREVIEW=1, so a normal Orca build keeps its bundle id.
 */
const { existsSync, readFileSync } = require('node:fs')
const { join } = require('node:path')

const PREVIEW_APP_ID = 'com.quzard.orca.requirement-preview'
const PREVIEW_PRODUCT_NAME = 'Orca Requirement Preview'
const PREVIEW_PROTOCOL = 'orca-requirement-preview'
const PREVIEW_PROTOCOL_NAME = 'Orca Requirement Preview'

const PREVIEW_OUTPUT_ROOT = 'out-requirement-preview'

function readPreviewPackaging(env = process.env) {
  if (env.ORCA_REQUIREMENT_PREVIEW !== '1') {
    return null
  }
  return {
    appId: PREVIEW_APP_ID,
    productName: PREVIEW_PRODUCT_NAME,
    protocolName: PREVIEW_PROTOCOL_NAME,
    scheme: PREVIEW_PROTOCOL,
    outputDir: 'dist-requirement-preview',
    viteOutDir: PREVIEW_OUTPUT_ROOT,
    main: `./${PREVIEW_OUTPUT_ROOT}/main/index.js`,
    macArtifactName: 'orca-requirement-preview-macos-${arch}.${ext}'
  }
}

function rewritePreviewOutputPath(value) {
  if (typeof value !== 'string') {
    return value
  }
  return value.replace(/(^|[^A-Za-z0-9_])out\//g, `$1${PREVIEW_OUTPUT_ROOT}/`)
}

/** Point unpack globs at the preview tree and drop the daily out/ tree from the package. */
const PREVIEW_REQUIRED_ENTRIES = [
  'requirement-preview-build.json',
  'main/index.js',
  'main/daemon-entry.js',
  'cli/index.js',
  'package.json'
]

function assertPreviewInputTree(root, fs = { existsSync, readFileSync }) {
  const preview = join(root, PREVIEW_OUTPUT_ROOT)
  const missing = PREVIEW_REQUIRED_ENTRIES.filter(
    (relative) => !fs.existsSync(join(preview, relative))
  )
  const dailyNote = fs.existsSync(join(root, 'out', 'main', 'index.js'))
    ? ' Daily out/main/index.js is present and will not be used.'
    : ''
  if (missing.length > 0) {
    throw new Error(`Requirement preview tree is incomplete (${missing.join(', ')}).${dailyNote}`)
  }
  const marker = JSON.parse(
    fs.readFileSync(join(preview, 'requirement-preview-build.json'), 'utf8')
  )
  if (marker.preview !== true) {
    throw new Error('Requirement preview marker is not preview:true.')
  }
}

function applyPreviewOutputTree(config) {
  if (Array.isArray(config.asarUnpack)) {
    config.asarUnpack = config.asarUnpack.map(rewritePreviewOutputPath)
  }
  if (Array.isArray(config.files)) {
    config.files = [...config.files.map(rewritePreviewOutputPath), '!out/**']
  }
  return config
}

module.exports = {
  PREVIEW_APP_ID,
  PREVIEW_OUTPUT_ROOT,
  PREVIEW_PRODUCT_NAME,
  PREVIEW_PROTOCOL,
  PREVIEW_PROTOCOL_NAME,
  applyPreviewOutputTree,
  assertPreviewInputTree,
  readPreviewPackaging,
  rewritePreviewOutputPath
}
