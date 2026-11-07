import {
  REQUIREMENT_PREVIEW_ENV,
  REQUIREMENT_PREVIEW_SSH_ENV,
  REQUIREMENT_PREVIEW_USER_DATA_ENV
} from '../../../fork/requirement-preview/profile'

export function stripInheritedBuildModeEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  // Orca inherits its own build mode; leaking it changes user next/Vitest behavior. Explicit spawn env and rc files still win.
  const next = { ...env }
  delete next.NODE_ENV
  delete next[REQUIREMENT_PREVIEW_ENV]
  delete next[REQUIREMENT_PREVIEW_USER_DATA_ENV]
  delete next[REQUIREMENT_PREVIEW_SSH_ENV]
  return next
}
