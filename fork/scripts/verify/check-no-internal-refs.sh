#!/usr/bin/env bash
# Fail when fork-owned files contain employer or internal identifiers.
# Patterns: ORCA_INTERNAL_REF_PATTERNS (newline-separated), else
# fork/scripts/verify/internal-ref-patterns.local (gitignored); with neither it exits 2.
# Patterns are fixed strings, matched case-insensitively. Uses rg when installed, else grep
# over the files git would not ignore (tracked plus untracked, like rg's default).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"

local_patterns="$ROOT/fork/scripts/verify/internal-ref-patterns.local"
patterns=()

add_pattern() {
  local line="$1"
  line="${line#"${line%%[![:space:]]*}"}"
  line="${line%"${line##*[![:space:]]}"}"
  [[ -z "$line" || "$line" == \#* ]] && return 0
  patterns+=("$line")
}

if [[ -n "${ORCA_INTERNAL_REF_PATTERNS:-}" ]]; then
  while IFS= read -r line; do
    add_pattern "$line"
  done <<<"$ORCA_INTERNAL_REF_PATTERNS"
elif [[ -f "$local_patterns" ]]; then
  while IFS= read -r line; do
    add_pattern "$line"
  done <"$local_patterns"
else
  echo 'no identifier patterns configured: set ORCA_INTERNAL_REF_PATTERNS or create fork/scripts/verify/internal-ref-patterns.local' >&2
  exit 2
fi

if [[ ${#patterns[@]} -eq 0 ]]; then
  echo 'no identifier patterns configured' >&2
  exit 2
fi

candidates=(
  src/fork
  src/shared/fork-hooks
  docs/fork
  fork/scripts
  FORK-CHANGES.md
  docs/reference
  push_github.sh
)
scan=()
for path in "${candidates[@]}"; do
  if [[ -e "$path" ]]; then
    scan+=("$path")
  fi
done
while IFS= read -r path; do
  [[ -n "$path" ]] && scan+=("$path")
done < <(git ls-files -z '*.fork.test.ts' | tr '\0' '\n')

args=()
for pattern in "${patterns[@]}"; do
  args+=(-e "$pattern")
done

scan_with_grep() {
  local files=() path
  while IFS= read -r -d '' path; do
    case "$path" in
      */check-no-internal-refs.sh | check-no-internal-refs.sh | *.local) continue ;;
    esac
    [[ -f "$path" ]] && files+=("$path")
  done < <(git ls-files -z --cached --others --exclude-standard -- "${scan[@]}")
  if [[ ${#files[@]} -eq 0 ]]; then
    return 1
  fi
  grep -I -n -i -F -H "${args[@]}" -- "${files[@]}"
}

scanner=rg
set +e
if command -v rg >/dev/null 2>&1; then
  matches="$(
    rg -n -i -F "${args[@]}" \
      --glob '!check-no-internal-refs.sh' \
      --glob '!internal-ref-patterns.local' \
      --glob '!*.local' \
      "${scan[@]}"
  )"
  status=$?
else
  scanner=grep
  matches="$(scan_with_grep)"
  status=$?
fi
set -e

if [[ "$status" -eq 0 ]]; then
  printf '%s\n' "$matches" >&2
  echo 'fork-owned files contain internal identifiers' >&2
  exit 1
fi
if [[ "$status" -ne 1 ]]; then
  echo "identifier scan failed (${scanner} exit $status)" >&2
  exit "$status"
fi
echo 'no internal identifiers in fork-owned files'
