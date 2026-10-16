// Shared checks for the personal macOS release. No process-host import, so tests can load this file.

function personalReleaseBranch(env = process.env) {
  const branch = env.ORCA_FORK_RELEASE_BRANCH?.trim()
  return branch ? branch : undefined
}

const PERSONAL_RELEASE_BRANCH = personalReleaseBranch()
const PERSONAL_ORCAD_TEMPLATE_TARGETS = 'darwin-arm64,linux-x64-glibc'

module.exports = {
  PERSONAL_RELEASE_BRANCH,
  PERSONAL_ORCAD_TEMPLATE_TARGETS
}
