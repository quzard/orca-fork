#!/bin/bash
# check-no-internal-refs.sh 在临时仓库里：从上游文件改名而来的 fork 文件也要扫描；扫描后接着跑身份检查。
# 不接触网络。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BASE="$(mktemp -d "${TMPDIR:-/tmp}/orca-refs-test.XXXXXX")"
trap 'rm -rf "$BASE"' EXIT
FAILS=0
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
export GIT_AUTHOR_NAME=quzard GIT_AUTHOR_EMAIL=30899719+quzard@users.noreply.github.com
export GIT_COMMITTER_NAME=quzard GIT_COMMITTER_EMAIL=30899719+quzard@users.noreply.github.com
export ORCA_INTERNAL_REF_PATTERNS="secret-host-name"

fail() {
  echo "FAIL: $*" >&2
  FAILS=$((FAILS + 1))
}

repo="${BASE}/repo"
mkdir -p "$repo/src/main" "$repo/src/cli" "$repo/fork/scripts/verify"
cd "$repo"
git init -q -b main
seq 1 40 | sed 's/^/export const line = /' >src/main/upstream-file.ts
echo "export const FORK_SKILLS_SOURCE_COMMIT = 'pending'" >src/cli/skills-source-commit.ts
git add . && git commit -q -m upstream
base="$(git rev-parse HEAD)"
git update-ref refs/remotes/upstream/main "$base"
printf '%s\n' "$base" >fork/scripts/verify/identity-baseline
printf "export const FORK_SKILLS_SOURCE_COMMIT = '%s'\n" "$base" >src/cli/skills-source-commit.ts
cp "${ROOT}/fork/scripts/verify/check-no-internal-refs.sh" "${ROOT}/fork/scripts/verify/check-commit-identity.sh" fork/scripts/verify/
# 改名后多一行内部标识；相似度够高，git diff 默认会把它当改名而不是新增。
git mv src/main/upstream-file.ts src/main/fork-file.ts
echo "// secret-host-name" >>src/main/fork-file.ts
git add . && git commit -q -m "fork: rename with an identifier"

if out="$(bash fork/scripts/verify/check-no-internal-refs.sh 2>&1)"; then
  fail "renamed fork file was not scanned: ${out}"
elif [[ "$out" != *"src/main/fork-file.ts"* ]]; then
  fail "scan did not name the renamed file: ${out}"
fi

sed -i.bak '/secret-host-name/d' src/main/fork-file.ts && rm -f src/main/fork-file.ts.bak
git commit -q -am "fork: drop the identifier"
if ! out="$(bash fork/scripts/verify/check-no-internal-refs.sh 2>&1)"; then
  fail "clean tree should pass: ${out}"
elif [[ "$out" != *"commit identity check: every commit"* ]]; then
  fail "identity check did not run after the scan: ${out}"
fi

GIT_AUTHOR_EMAIL=someone@example.com git commit -q --allow-empty -m "wrong author"
if out="$(bash fork/scripts/verify/check-no-internal-refs.sh 2>&1)"; then
  fail "a commit by another identity should fail the scan: ${out}"
fi

if [[ "$FAILS" -ne 0 ]]; then
  echo "${FAILS} check(s) failed" >&2
  exit 1
fi
echo "check-no-internal-refs tests passed"
