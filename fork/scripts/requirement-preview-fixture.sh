#!/bin/sh
# Disposable local git fixture for the requirement preview. Generic names only.
set -eu
root=$(mktemp -d "${TMPDIR:-/tmp}/orca-requirement-preview.XXXXXX")
catalog="$root/mains/catalog"
billing="$root/mains/billing"
parent="$root/requirement-alpha"
setup() {
  mkdir -p "$1"
  git -C "$1" init -b main >/dev/null
  git -C "$1" config user.email fixture@example.com
  git -C "$1" config user.name Fixture
  printf 'fixture\n' > "$1/README.md"
  git -C "$1" add README.md
  git -C "$1" commit -m init >/dev/null
}
setup "$catalog"
setup "$billing"
setup "$parent"
mkdir -p "$parent/docs"
printf 'overview\n' > "$parent/docs/overview.md"
printf '# fixture only\n' > "$parent/.gitmodules"
git -C "$parent" add docs/overview.md .gitmodules
git -C "$parent" commit -m docs >/dev/null
git -C "$catalog" worktree add -b member "$parent/catalog" >/dev/null
git -C "$billing" worktree add -b member "$parent/root" >/dev/null
printf '%s\n' "$parent"
