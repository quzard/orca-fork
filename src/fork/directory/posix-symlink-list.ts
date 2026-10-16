// ls -1Ap does not add a slash to a directory symlink. Follow with `[ -d ]`.
// Strip one existing slash first so a real directory is not listed as `name//`.
// A dangling link fails `[ -d ]` and stays a file.
export const POSIX_SYMLINK_DIRECTORY_LIST_TAIL = [
  'pwd && { set --; while IFS= read -r entry; do',
  'entry="${entry%/}"',
  'if [ -d "./$entry" ]; then set -- "$@" "$entry/"; else set -- "$@" "$entry"; fi',
  'done <<LIST',
  '$(command ls -1Ap)',
  'LIST',
  '[ "$#" -eq 0 ] || printf "%s\\n" "$@"; }'
].join('\n')
