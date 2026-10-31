#!/bin/bash
# check-commit-identity.sh 在临时仓库里的表现：下限（脚本里写死的 FLOOR）之前的提交不查；之后作者、提交者、
# 合并提交不对都失败；缺 upstream/main、下限不在仓库里或不是祖先都失败；任何提交写的“基线”文件都不能
# 让坏提交被跳过。临时仓库里没有真正的下限提交，所以测试用的是把 FLOOR 换成临时提交的脚本副本。不接触网络。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# The signal cases send INT and HUP; a run started with either ignored (`&`, nohup) reruns itself
# with both reset.
# shellcheck source=fork/scripts/signal-test-preflight.sh
. "${ROOT}/fork/scripts/signal-test-preflight.sh"
ensure_test_signals_trappable "check-commit-identity tests" bash "$@"
REAL_GUARD="${ROOT}/fork/scripts/verify/check-commit-identity.sh"
BASE="$(mktemp -d "${TMPDIR:-/tmp}/orca-identity-test.XXXXXX")"
trap 'rm -rf "$BASE"' EXIT
FAILS=0
GOOD_NAME="quzard"
GOOD_EMAIL="30899719+quzard@users.noreply.github.com"
REAL_FLOOR="8fd7c96acc934cb25e41b5da17f1743e88219bbe"
GUARD=""

export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1

fail() {
  echo "FAIL: $*" >&2
  FAILS=$((FAILS + 1))
}

# 真脚本的下限固定是这个 SHA，而且只出现在一行 readonly 里，不从任何文件读。
if ! grep -qx "readonly FLOOR=\"${REAL_FLOOR}\"" "$REAL_GUARD"; then
  fail "check-commit-identity.sh does not pin FLOOR to ${REAL_FLOOR}"
fi
if grep -q 'identity-baseline' "$REAL_GUARD" || grep -Eq 'git (show|cat-file)' "$REAL_GUARD"; then
  fail "check-commit-identity.sh still reads a baseline from the tree"
fi
if [[ -e "${ROOT}/fork/scripts/verify/identity-baseline" ]]; then
  fail "fork/scripts/verify/identity-baseline should be gone"
fi

# 用法: use_floor SHA —— 之后的 expect_* 用下限换成 SHA 的脚本副本。
use_floor() {
  GUARD="${BASE}/guard-$1.sh"
  sed "s/^readonly FLOOR=.*/readonly FLOOR=\"$1\"/" "$REAL_GUARD" >"$GUARD"
}

# 用法: commit_as AUTHOR_NAME AUTHOR_EMAIL COMMITTER_NAME COMMITTER_EMAIL MESSAGE
commit_as() {
  GIT_AUTHOR_NAME="$1" GIT_AUTHOR_EMAIL="$2" GIT_COMMITTER_NAME="$3" GIT_COMMITTER_EMAIL="$4" \
    git commit -q --allow-empty -m "$5"
}

good_commit() {
  commit_as "$GOOD_NAME" "$GOOD_EMAIL" "$GOOD_NAME" "$GOOD_EMAIL" "$1"
}

# 新仓库：一个上游提交（谁写的都行），upstream/main 指向它。
bare_repo() {
  local dir="${BASE}/$1"
  mkdir -p "$dir"
  cd "$dir"
  git init -q -b main
  commit_as "Upstream Dev" "dev@example.com" "Upstream Dev" "dev@example.com" "upstream"
  git update-ref refs/remotes/upstream/main HEAD
}

# 新仓库，下限就是上游提交。
new_repo() {
  bare_repo "$1"
  use_floor "$(git rev-parse HEAD)"
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

# 下限之前的 Cursor Agent 提交（已公开、无法改写）不查。
bare_repo pre-floor
commit_as "Cursor Agent" "cursoragent@cursor.com" "Cursor Agent" "cursoragent@cursor.com" "old public commit"
old="$(git rev-parse HEAD)"
use_floor "$old"
good_commit "fork after floor"
expect_pass "pre-floor commit ignored"
# 同一个仓库，下限之后再来一个坏作者：失败，只列这一个。
commit_as "Cursor Agent" "cursoragent@cursor.com" "$GOOD_NAME" "$GOOD_EMAIL" "new bad commit"
sha="$(git rev-parse HEAD)"
expect_fail "post-floor bad author" "$sha"
if out="$(bash "$GUARD" 2>&1)"; [[ "$out" == *"$old"* ]]; then
  fail "pre-floor commit was listed: ${out}"
fi

# 评审复现的绕过：坏提交之后，一个合规提交把“基线”文件挪到坏提交上。旧脚本从 REF 的树里读基线，
# 于是跳过了坏提交；现在下限写死在脚本里，任何文件都不算数，坏提交照样被查出来。
for baseline_path in fork/scripts/verify/identity-baseline fork/scripts/verify/identity-floor; do
  new_repo "bypass-$(basename "$baseline_path")"
  good_commit "fork one"
  commit_as "Someone" "someone@example.com" "Someone" "someone@example.com" "bad commit"
  bad_sha="$(git rev-parse HEAD)"
  mkdir -p "$(dirname "$baseline_path")"
  printf '%s\n' "$bad_sha" >"$baseline_path"
  git add "$baseline_path"
  good_commit "move the baseline past the bad commit"
  expect_fail "a moved ${baseline_path} cannot skip a bad commit" "$bad_sha"
done
# 同样的绕过放在被检查的引用里改脚本以外的地方（工作区）也不算。
new_repo worktree-edit
commit_as "Someone" "someone@example.com" "$GOOD_NAME" "$GOOD_EMAIL" "bad author"
mkdir -p fork/scripts/verify
printf '%s\n' "$(git rev-parse HEAD)" >fork/scripts/verify/identity-baseline
expect_fail "working-tree baseline edit ignored" "not by"

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

# 合并进来的分支上有坏提交：也要查出来。
new_repo bad-merged-branch
good_commit "fork one"
git checkout -q -b side
commit_as "Someone" "someone@example.com" "Someone" "someone@example.com" "bad side commit"
side_bad="$(git rev-parse HEAD)"
git checkout -q main
GIT_AUTHOR_NAME="$GOOD_NAME" GIT_AUTHOR_EMAIL="$GOOD_EMAIL" \
  GIT_COMMITTER_NAME="$GOOD_NAME" GIT_COMMITTER_EMAIL="$GOOD_EMAIL" \
  git merge -q --no-ff --no-edit side
expect_fail "bad commit on a merged branch" "$side_bad"

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

# GitHub 网页 / gh pr merge 的合并提交：作者 quzard、提交者 GitHub <noreply@github.com>、两个父提交，放行。
new_repo github-merge
good_commit "fork one"
git checkout -q -b side
good_commit "side"
git checkout -q main
good_commit "fork two"
GIT_AUTHOR_NAME="$GOOD_NAME" GIT_AUTHOR_EMAIL="$GOOD_EMAIL" \
  GIT_COMMITTER_NAME=GitHub GIT_COMMITTER_EMAIL=noreply@github.com \
  git merge -q --no-ff --no-edit side
expect_pass "GitHub merge committer on a quzard merge"
# 同样的提交者，但不是合并提交：失败。
commit_as "$GOOD_NAME" "$GOOD_EMAIL" "GitHub" "noreply@github.com" "GitHub non-merge"
expect_fail "GitHub committer on a non-merge commit" "$(git rev-parse HEAD)"

new_repo github-merge-bad-author
good_commit "fork one"
git checkout -q -b side
good_commit "side"
git checkout -q main
good_commit "fork two"
GIT_AUTHOR_NAME="Cursor Agent" GIT_AUTHOR_EMAIL=cursoragent@cursor.com \
  GIT_COMMITTER_NAME=GitHub GIT_COMMITTER_EMAIL=noreply@github.com \
  git merge -q --no-ff --no-edit side
expect_fail "GitHub merge with a non-quzard author" "$(git rev-parse HEAD)"

new_repo github-merge-other-noreply
good_commit "fork one"
git checkout -q -b side
good_commit "side"
git checkout -q main
good_commit "fork two"
GIT_AUTHOR_NAME="$GOOD_NAME" GIT_AUTHOR_EMAIL="$GOOD_EMAIL" \
  GIT_COMMITTER_NAME=GitHub GIT_COMMITTER_EMAIL=web-flow@users.noreply.github.com \
  git merge -q --no-ff --no-edit side
expect_fail "other GitHub noreply committer" "$(git rev-parse HEAD)"

new_repo missing-upstream
good_commit "fork one"
git update-ref -d refs/remotes/upstream/main
git branch -q upstream/main HEAD~1
expect_fail "missing upstream/main" "upstream/main is missing"

new_repo bad-ref
expect_fail "unknown ref" "cannot resolve" no-such-ref

bare_repo unknown-floor
use_floor "0123456789abcdef0123456789abcdef01234567"
expect_fail "floor not in the repo" "is not in this repository"

# 真脚本在没有真正下限提交的仓库里失败，不会退回到“全查”或“全不查”。
bare_repo real-floor-missing
GUARD="$REAL_GUARD"
expect_fail "real floor missing from the repo" "floor ${REAL_FLOOR} is not in this repository"

bare_repo not-ancestor
git checkout -q -b side
good_commit "side only"
side="$(git rev-parse HEAD)"
git checkout -q main
use_floor "$side"
expect_fail "floor not an ancestor" "is not an ancestor"

# fetch-upstream-main.sh：从 upstream 远端拉 main 到 refs/remotes/upstream/main（含非快进）；拉不到时失败。
FETCH="${ROOT}/fork/scripts/verify/fetch-upstream-main.sh"
mkdir -p "${BASE}/up-src" && cd "${BASE}/up-src"
git init -q -b main
commit_as "Upstream Dev" "dev@example.com" "Upstream Dev" "dev@example.com" "upstream one"
new_repo fetch
git remote add upstream "${BASE}/up-src"
stale="$(git rev-parse refs/remotes/upstream/main)"
if ! bash "$FETCH" >/dev/null 2>&1; then
  fail "fetch from the upstream remote failed"
elif [[ "$(git rev-parse refs/remotes/upstream/main)" != "$(git -C "${BASE}/up-src" rev-parse main)" ]]; then
  fail "upstream/main not refreshed (still ${stale})"
fi
(cd "${BASE}/up-src" &&
  GIT_AUTHOR_NAME=U GIT_AUTHOR_EMAIL=u@example.com GIT_COMMITTER_NAME=U GIT_COMMITTER_EMAIL=u@example.com \
    git commit -q --amend --allow-empty -m "rewritten upstream")
if ! bash "$FETCH" >/dev/null 2>&1 ||
  [[ "$(git rev-parse refs/remotes/upstream/main)" != "$(git -C "${BASE}/up-src" rev-parse main)" ]]; then
  fail "a rewritten upstream main was not fetched"
fi
git remote set-url upstream "${BASE}/no-such-repo"
if bash "$FETCH" >/dev/null 2>&1; then
  fail "fetch from a missing upstream should fail"
fi

# 拉取卡住：假的 git 在 fetch 时一直不返回。超时（这里 2 秒）后杀掉 fetch，非零退出，upstream/main 不变。
# 其他 git 子命令交给真的 git。
real_git="$(command -v git)"
fake_bin="${BASE}/fake-bin"
mkdir -p "$fake_bin"
cat >"${fake_bin}/git" <<FAKE
#!/bin/bash
for arg in "\$@"; do
  if [[ "\$arg" == fetch ]]; then
    echo "\$\$" >"${BASE}/hung-fetch.pid"
    exec sleep 300
  fi
done
exec "${real_git}" "\$@"
FAKE
chmod +x "${fake_bin}/git"
git remote set-url upstream "${BASE}/up-src"
before="$(git rev-parse refs/remotes/upstream/main)"
started=$SECONDS
code=0
out="$(PATH="${fake_bin}:${PATH}" ORCA_UPSTREAM_FETCH_TIMEOUT=2 bash "$FETCH" 2>&1)" || code=$?
elapsed=$((SECONDS - started))
if [[ "$code" -eq 0 ]]; then
  fail "a hanging fetch should fail: ${out}"
elif [[ "$out" != *"timed out after 2s"* ]]; then
  fail "a hanging fetch should report the timeout: ${out}"
fi
if [[ "$elapsed" -gt 20 ]]; then
  fail "a hanging fetch was not stopped near the timeout (${elapsed}s)"
fi
if [[ ! -s "${BASE}/hung-fetch.pid" ]]; then
  fail "the fake fetch never ran"
elif kill -0 "$(cat "${BASE}/hung-fetch.pid")" 2>/dev/null; then
  fail "the hanging fetch is still running after the timeout"
  kill "$(cat "${BASE}/hung-fetch.pid")" 2>/dev/null || true
fi
if [[ "$(git rev-parse refs/remotes/upstream/main)" != "$before" ]]; then
  fail "a timed-out fetch changed upstream/main"
fi
# 不理会 TERM 的拉取：宽限 5 秒后用 KILL 结束。
cat >"${fake_bin}/git" <<FAKE
#!/bin/bash
for arg in "\$@"; do
  if [[ "\$arg" == fetch ]]; then
    trap '' TERM
    echo "\$\$" >"${BASE}/stubborn-fetch.pid"
    exec sleep 300
  fi
done
exec "${real_git}" "\$@"
FAKE
code=0
out="$(PATH="${fake_bin}:${PATH}" ORCA_UPSTREAM_FETCH_TIMEOUT=1 bash "$FETCH" 2>&1)" || code=$?
if [[ "$code" -eq 0 || "$out" != *"timed out"* ]]; then
  fail "a fetch that ignores TERM should still time out: ${out}"
elif kill -0 "$(cat "${BASE}/stubborn-fetch.pid")" 2>/dev/null; then
  fail "a fetch that ignores TERM is still running"
  kill -KILL "$(cat "${BASE}/stubborn-fetch.pid")" 2>/dev/null || true
fi
# 脚本被信号停止（launchd 卸载、注销、关机）：fetch 在自己的进程组里，launchd 杀脚本的进程组时碰不到它。
# 脚本捕获 TERM/INT/HUP，杀掉 fetch 的整个进程组（包括它的子进程）和看门狗，再按惯例退出（143/130/129）。
# 假的 git 在 fetch 时起一个子进程（模拟 git-remote-https）然后一直等。僵尸进程（容器里没人回收）算已退出。
proc_alive() {
  local state
  state="$(ps -o stat= -p "$1" 2>/dev/null || true)"
  [[ -n "$state" && "$state" != Z* ]]
}
# 进程组里还有活着（不是僵尸）的进程。
group_alive() {
  ps -A -o pgid=,stat= 2>/dev/null | awk -v g="$1" '$1 == g && $2 !~ /^Z/ { found = 1 } END { exit !found }'
}
write_signal_fake() {
  local ignore_term="$1"
  cat >"${fake_bin}/git" <<FAKE
#!/bin/bash
for arg in "\$@"; do
  if [[ "\$arg" == fetch ]]; then
    ${ignore_term}
    sleep 300 &
    echo "\$!" >"${BASE}/sig-helper.pid"
    echo "\$\$" >"${BASE}/sig-fetch.pid"
    wait
    exit 1
  fi
done
exec "${real_git}" "\$@"
FAKE
  chmod +x "${fake_bin}/git"
}
# 用法: signal_case 名称 信号 期望退出码 to-pid|to-group [ignore-term]
signal_case() {
  local name="$1" signal="$2" want="$3" target="$4" ignore="${5:-}"
  local trap_line=""
  [[ "$ignore" == ignore-term ]] && trap_line="trap '' TERM"
  write_signal_fake "$trap_line"
  rm -f "${BASE}/sig-fetch.pid" "${BASE}/sig-helper.pid"
  # 脚本自己当进程组组长（和 launchd 一样），后台运行也不会忽略 INT。
  set -m
  PATH="${fake_bin}:${PATH}" ORCA_UPSTREAM_FETCH_TIMEOUT=120 bash "$FETCH" >"${BASE}/sig.out" 2>&1 &
  local script_pid=$!
  set +m
  local tries=0
  while [[ ! -s "${BASE}/sig-fetch.pid" || ! -s "${BASE}/sig-helper.pid" ]] && [[ "$tries" -lt 100 ]]; do
    sleep 0.1
    tries=$((tries + 1))
  done
  if [[ ! -s "${BASE}/sig-fetch.pid" ]]; then
    fail "${name}: the fake fetch never started"
    kill -KILL -- "-${script_pid}" 2>/dev/null || true
    return
  fi
  local git_pid helper_pid
  git_pid="$(cat "${BASE}/sig-fetch.pid")"
  helper_pid="$(cat "${BASE}/sig-helper.pid")"
  if [[ "$target" == to-group ]]; then
    kill "-${signal}" -- "-${script_pid}"
  else
    kill "-${signal}" "$script_pid"
  fi
  local started=$SECONDS code=0
  wait "$script_pid" || code=$?
  if [[ "$code" -ne "$want" ]]; then
    fail "${name}: exit ${code}, want ${want}: $(cat "${BASE}/sig.out")"
  fi
  if [[ $((SECONDS - started)) -gt 15 ]]; then
    fail "${name}: the script took $((SECONDS - started))s to stop"
  fi
  if proc_alive "$git_pid"; then
    fail "${name}: the fake git is still running"
    kill -KILL "$git_pid" 2>/dev/null || true
  fi
  if proc_alive "$helper_pid"; then
    fail "${name}: the fetch's child helper is still running"
    kill -KILL "$helper_pid" 2>/dev/null || true
  fi
  if group_alive "$script_pid"; then
    fail "${name}: the watchdog (script's group) is still running"
    kill -KILL -- "-${script_pid}" 2>/dev/null || true
  fi
  if [[ "$(git rev-parse refs/remotes/upstream/main)" != "$before" ]]; then
    fail "${name}: a stopped fetch changed upstream/main"
  fi
}
before="$(git rev-parse refs/remotes/upstream/main)"
signal_case "TERM to the script's group (launchd)" TERM 143 to-group
signal_case "TERM to the script" TERM 143 to-pid
signal_case "INT to the script" INT 130 to-pid
signal_case "HUP to the script" HUP 129 to-pid
signal_case "TERM with a fetch that ignores TERM" TERM 143 to-pid ignore-term
# 信号落在 `git fetch ... &` 和 `fetch_pid=$!` 之间：脚本只记下信号，拿到 pid 后立即杀掉 fetch 的进程组，
# 不会留下一个没人管的 fetch。测试用环境变量让脚本在这个窗口里给自己发信号。
spawn_signal_case() {
  local signal="$1" want="$2"
  write_signal_fake ""
  rm -f "${BASE}/sig-fetch.pid" "${BASE}/sig-helper.pid"
  local code=0 started=$SECONDS
  PATH="${fake_bin}:${PATH}" ORCA_UPSTREAM_FETCH_TIMEOUT=120 \
    ORCA_UPSTREAM_FETCH_TEST_SIGNAL_AT_SPAWN="$signal" bash "$FETCH" >"${BASE}/sig.out" 2>&1 || code=$?
  if [[ "$code" -ne "$want" ]]; then
    fail "${signal} at spawn: exit ${code}, want ${want}: $(cat "${BASE}/sig.out")"
  fi
  if [[ $((SECONDS - started)) -gt 15 ]]; then
    fail "${signal} at spawn: the script took $((SECONDS - started))s to stop"
  fi
  # A fetch the trap missed keeps running and writes its pids; give it time to show up.
  sleep 1
  local pid
  for pid in "$(cat "${BASE}/sig-fetch.pid" 2>/dev/null)" "$(cat "${BASE}/sig-helper.pid" 2>/dev/null)"; do
    if [[ -n "$pid" ]] && proc_alive "$pid"; then
      fail "${signal} at spawn: the fetch (pid ${pid}) outlived the script"
      kill -KILL "$pid" 2>/dev/null || true
    fi
  done
}
spawn_signal_case TERM 143
spawn_signal_case INT 130
spawn_signal_case HUP 129
if grep -Eq '^[^#]*setsid' "$FETCH"; then
  fail "fetch-upstream-main.sh should not rely on setsid (macOS has none)"
fi
# 默认超时是 600 秒，可以用环境变量改；不是正整数就直接失败，不去拉。
if ! grep -q 'ORCA_UPSTREAM_FETCH_TIMEOUT:-600' "$FETCH"; then
  fail "the default fetch timeout should be 600s"
fi
if out="$(ORCA_UPSTREAM_FETCH_TIMEOUT=abc bash "$FETCH" 2>&1)"; then
  fail "a bad timeout value should fail: ${out}"
fi
# 正常的拉取在超时内完成，照常成功。
if ! out="$(ORCA_UPSTREAM_FETCH_TIMEOUT=30 bash "$FETCH" 2>&1)"; then
  fail "a quick fetch under a timeout should pass: ${out}"
fi
# 调用方把超时当成拉取失败：push_github.sh 在 set -e 下直接调用（失败即停止），mac-auto-update.sh 不发布。
if ! grep -q 'if ! (cd "$REPO" && bash fork/scripts/verify/fetch-upstream-main.sh)' "${ROOT}/fork/scripts/mac-auto-update.sh"; then
  fail "mac-auto-update.sh should stop publishing when the fetch fails"
fi

if [[ "$FAILS" -ne 0 ]]; then
  echo "${FAILS} check(s) failed" >&2
  exit 1
fi
echo "check-commit-identity tests passed"
