/**
 * Preview packaging identity. electron-builder reads this only when
 * ORCA_REQUIREMENT_PREVIEW=1, so a normal Orca build keeps its bundle id.
 */

const PREVIEW_APP_ID = 'com.quzard.orca.requirement-preview'
const PREVIEW_PRODUCT_NAME = 'Orca Requirement Preview'
const PREVIEW_PROTOCOL = 'orca-requirement-preview'
const PREVIEW_PROTOCOL_NAME = 'Orca Requirement Preview'

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
    viteOutDir: 'out-requirement-preview',
    main: './out-requirement-preview/main/index.js',
    macArtifactName: 'orca-requirement-preview-macos-${arch}.${ext}'
  }
}

module.exports = {
  PREVIEW_APP_ID,
  PREVIEW_PRODUCT_NAME,
  PREVIEW_PROTOCOL,
  PREVIEW_PROTOCOL_NAME,
  readPreviewPackaging
}
