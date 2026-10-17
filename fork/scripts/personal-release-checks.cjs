// Shared checks for the personal macOS release. No process-host import, so tests can load this file.

function personalReleaseBranch(env = process.env) {
  const branch = env.ORCA_FORK_RELEASE_BRANCH?.trim()
  return branch ? branch : undefined
}

const PERSONAL_RELEASE_BRANCH = personalReleaseBranch()

module.exports = {
  PERSONAL_RELEASE_BRANCH
}
