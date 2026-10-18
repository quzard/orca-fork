#!/bin/bash
# check-commit-identity.sh 在临时仓库里的表现：基线之前的提交不查；基线之后作者、提交者、合并提交不对都失败；
# 缺 upstream/main、缺基线文件、基线无效或不是祖先都失败。不接触网络。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
GUARD="${ROOT}/fork/scripts/verify/check-commit-identity.sh"
BASE="$(mktemp -d "${TMPDIR:-/tmp}/orca-identity-test.XXXXXX")"
trap 'rm -rf "$BASE"' EXIT
FAILS=0
GOOD_NAME="quzard"
GOOD_EMAIL="30899719+quzard@users.noreply.github.com"
BASELINE_PATH="fork/scripts/verify/identity-baseline"

export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1

fail() {
  echo "FAIL: $*" >&2
  FAILS=$((FAILS + 1))
}

# 用法: commit_as AUTHOR_NAME AUTHOR_EMAIL COMMITTER_NAME COMMITTER_EMAIL MESSAGE
commit_as() {
  GIT_AUTHOR_NAME="$1" GIT_AUTHOR_EMAIL="$2" GIT_COMMITTER_NAME="$3" GIT_COMMITTER_EMAIL="$4" \
    git commit -q --allow-empty -m "$5"
}

good_commit() {
  commit_as "$GOOD_NAME" "$GOOD_EMAIL" "$GOOD_NAME" "$GOOD_EMAIL" "$1"
}

# 用一个合规提交写入基线文件。内容原样写入（可以是无效内容）。
write_baseline() {
  mkdir -p "$(dirname "$BASELINE_PATH")"
  printf '# baseline\n%s\n' "$1" >"$BASELINE_PATH"
  git add "$BASELINE_PATH"
  good_commit "baseline $1"
}

# 新仓库：一个上游提交（谁写的都行），upstream/main 指向它；不写基线。
bare_repo() {
  local dir="${BASE}/$1"
  mkdir -p "$dir"
  cd "$dir"
  git init -q -b main
  commit_as "Upstream Dev" "dev@example.com" "Upstream Dev" "dev@example.com" "upstream"
  git update-ref refs/remotes/upstream/main HEAD
}

# 新仓库，基线就是上游提交。
new_repo() {
  bare_repo "$1"
  write_baseline "$(git rev-parse HEAD)"
}

expect_pass() {
  local name="$1" out
  if ! out="$(bash "$GUARD" ${2:+"$2"} 2>&1)"; then
    fail "${name}: expected pass, got: ${out}"
  fi
}

# 用法: expect_fail NAME TEXT [REF]
expect_fail() {
  local name="$1" text="$2" out
  if out="$(bash "$GUARD" ${3:+"$3"} 2>&1)"; then
    fail "${name}: expected failure, got: ${out}"
    return
  fi
  if [[ "$out" != *"$text"* ]]; then
    fail "${name}: output lacks '${text}': ${out}"
  fi
}

new_repo good
good_commit "fork one"
good_commit "fork two"
expect_pass "all commits by the fork identity"

# 基线之前的 Cursor Agent 提交（已公开、无法改写）不查。
bare_repo pre-baseline
commit_as "Cursor Agent" "cursoragent@cursor.com" "Cursor Agent" "cursoragent@cursor.com" "old public commit"
old="$(git rev-parse HEAD)"
write_baseline "$old"
good_commit "fork after baseline"
expect_pass "pre-baseline commit ignored"
# 同一个仓库，基线之后再来一个坏作者：失败，只列这一个。
commit_as "Cursor Agent" "cursoragent@cursor.com" "$GOOD_NAME" "$GOOD_EMAIL" "new bad commit"
sha="$(git rev-parse HEAD)"
expect_fail "post-baseline bad author" "$sha"
if out="$(bash "$GUARD" 2>&1)"; [[ "$out" == *"$old"* ]]; then
  fail "pre-baseline commit was listed: ${out}"
fi

new_repo bad-author
good_commit "fork one"
commit_as "Someone" "someone@example.com" "$GOOD_NAME" "$GOOD_EMAIL" "bad author"
sha="$(git rev-parse HEAD)"
expect_fail "bad author" "$sha"
expect_fail "bad author lists the identity" "author: Someone <someone@example.com>"

new_repo bad-committer
commit_as "$GOOD_NAME" "$GOOD_EMAIL" "$GOOD_NAME" "other@example.com" "bad committer"
sha="$(git rev-parse HEAD)"
good_commit "later good commit"
expect_fail "bad committer" "$sha"

new_repo near-miss
commit_as "Quzard" "$GOOD_EMAIL" "$GOOD_NAME" "$GOOD_EMAIL" "name case differs"
expect_fail "exact name match" "$(git rev-parse HEAD)"

new_repo bad-merge
good_commit "fork one"
git checkout -q -b side
good_commit "side"
git checkout -q main
good_commit "fork two"
GIT_AUTHOR_NAME=Someone GIT_AUTHOR_EMAIL=someone@example.com \
  GIT_COMMITTER_NAME=Someone GIT_COMMITTER_EMAIL=someone@example.com \
  git merge -q --no-ff --no-edit side
expect_fail "bad merge commit" "$(git rev-parse HEAD)"
expect_pass "explicit ref before the merge" "$(git rev-parse HEAD^1)"

new_repo upstream-merge
good_commit "fork one"
# 合并上游：上游自己的提交在 upstream/main 里，不检查；合并提交本身要检查。
git checkout -q -b up upstream/main
commit_as "Upstream Dev" "dev@example.com" "Upstream Dev" "dev@example.com" "upstream two"
git update-ref refs/remotes/upstream/main HEAD
git checkout -q main
GIT_AUTHOR_NAME="$GOOD_NAME" GIT_AUTHOR_EMAIL="$GOOD_EMAIL" \
  GIT_COMMITTER_NAME="$GOOD_NAME" GIT_COMMITTER_EMAIL="$GOOD_EMAIL" \
  git merge -q --no-ff --no-edit up
expect_pass "upstream commits are not checked"

new_repo missing-upstream
good_commit "fork one"
git update-ref -d refs/remotes/upstream/main
git branch -q upstream/main HEAD~1
expect_fail "missing upstream/main" "upstream/main is missing"

new_repo bad-ref
expect_fail "unknown ref" "cannot resolve" no-such-ref

bare_repo missing-baseline
good_commit "fork one"
expect_fail "missing baseline file" "identity-baseline is missing"

bare_repo invalid-baseline
write_baseline "not-a-sha"
expect_fail "invalid baseline" "exactly one full commit SHA"

bare_repo two-baselines
mkdir -p "$(dirname "$BASELINE_PATH")"
printf '%s\n%s\n' "$(git rev-parse HEAD)" "$(git rev-parse HEAD)" >"$BASELINE_PATH"
git add "$BASELINE_PATH" && good_commit "two shas"
expect_fail "two baseline lines" "exactly one full commit SHA"

bare_repo short-baseline
write_baseline "$(git rev-parse --short HEAD)"
expect_fail "short baseline sha" "exactly one full commit SHA"

bare_repo unknown-baseline
write_baseline "0123456789abcdef0123456789abcdef01234567"
expect_fail "baseline not in the repo" "is not in this repository"

bare_repo not-ancestor
git checkout -q -b side
good_commit "side only"
side="$(git rev-parse HEAD)"
git checkout -q main
write_baseline "$side"
expect_fail "baseline not an ancestor" "is not an ancestor"

# 基线从被检查的引用里读：工作区改了不算。
new_repo worktree-edit
commit_as "Someone" "someone@example.com" "$GOOD_NAME" "$GOOD_EMAIL" "bad author"
printf '%s\n' "$(git rev-parse HEAD)" >"$BASELINE_PATH"
expect_fail "working-tree baseline edit ignored" "not by"

if [[ "$FAILS" -ne 0 ]]; then
  echo "${FAILS} check(s) failed" >&2
  exit 1
fi
echo "check-commit-identity tests passed"
