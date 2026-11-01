// F046: which files a page outside every workspace may read without asking. Paths are the host's,
// so the flavor follows the path, not this process.
import { posix, win32 } from 'node:path'
import { isWindowsAbsolutePathLike } from '../../shared/cross-platform-path'

const HOME_PARENTS = new Set(['home', 'Users'])

function flavorOf(path: string): typeof posix | typeof win32 {
  return isWindowsAbsolutePathLike(path) ? win32 : posix
}

/** The filesystem root, a top-level folder (`/tmp`, `/root`) or a user's home: too wide to open silently. */
export function isBroadDocumentFolder(folder: string): boolean {
  const flavor = flavorOf(folder)
  const segments = folder
    .slice(flavor.parse(folder).root.length)
    .split(flavor.sep)
    .filter((segment) => segment.length > 0)
  return segments.length <= 1 || (segments.length === 2 && HOME_PARENTS.has(segments[0]))
}

/** Whether `path` sits in or is a dot-named entry below `root` (`.env`, `.ssh/`, `.git/`), or outside it. */
export function isHiddenBelow(root: string, path: string): boolean {
  const flavor = flavorOf(root)
  return flavor
    .relative(root, path)
    .split(flavor.sep)
    .some((segment) => segment.startsWith('.'))
}
