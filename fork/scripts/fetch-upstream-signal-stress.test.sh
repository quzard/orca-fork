#!/bin/bash
# fetch-upstream-main.sh 在启动窗口里收到信号（git fetch 和看门狗刚起来）时的压力测试：每个信号跑很多遍，
# 每次都要在几秒内按 143/130/129 退出，事后不留下 fetch、它的子进程、看门狗或看门狗的 sleep。
# 次数用 ORCA_FETCH_STRESS_RUNS 调（每个信号的次数，默认 200）；ORCA_FETCH_STRESS_BASH 换被测的 bash
# （比如自己编译的 3.2）。不接触网络：fetch 是假的 git。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FETCH="${ROOT}/fork/scripts/verify/fetch-upstream-main.sh"
RUNS="${ORCA_FETCH_STRESS_RUNS:-200}"
BASH_BIN="${ORCA_FETCH_STRESS_BASH:-bash}"
# 每次允许的最长时间（秒）。旧代码卡住时要等到看门狗超时，所以超时设得比它长。
LIMIT=5
TIMEOUT=20
BASE="$(mktemp -d "${TMPDIR:-/tmp}/orca-fetch-stress.XXXXXX")"
FAILS=0
fail() {
  echo "FAIL: $*" >&2
  FAILS=$((FAILS + 1))
}

real_git="$(command -v git)"
# The fetch's child sleeps for a length unique to this test run, so a parallel run's is not counted.
helper="sleep $((100000 + $$))"
fake_bin="${BASE}/fake-bin"
mkdir -p "$fake_bin" "${BASE}/repo"
# 假的 git：fetch 时起一个子进程（模拟 git-remote-https）然后一直等；其他子命令交给真的 git。
cat >"${fake_bin}/git" <<FAKE
#!/bin/bash
for arg in "\$@"; do
  if [[ "\$arg" == fetch ]]; then
    ${helper} &
    wait
    exit 1
  fi
done
exec "${real_git}" "\$@"
FAKE
chmod +x "${fake_bin}/git"
(cd "${BASE}/repo" && GIT_CONFIG_GLOBAL=/dev/null git init -q)

now_ms() {
  perl -MTime::HiRes=time -e 'printf "%d\n", time * 1000'
}
# 这次运行留下的、还活着（不是僵尸）的进程：脚本的进程组（看门狗和它的 sleep），以及命令行里带着
# 脚本路径、假 git 或 fetch 子进程的进程（fetch 在自己的进程组里）。
leftovers() {
  # Patterns come in through the environment, so this awk does not match its own command line.
  ps -A -o pid=,pgid=,stat=,args= 2>/dev/null | G="$1" F="$FETCH" B="$fake_bin" S="$helper" awk '
    $3 ~ /^Z/ { next }
    $2 == ENVIRON["G"] || index($0, ENVIRON["F"]) || index($0, ENVIRON["B"]) || index($0, ENVIRON["S"]) { print }'
}
cleanup_leftovers() {
  local pid
  for pid in $(leftovers "$1" | awk '{ print $1 }'); do
    kill -KILL "$pid" 2>/dev/null || true
  done
}
trap 'rm -rf "$BASE"' EXIT

max_ms=0
slow=0
left=0
cd "${BASE}/repo"
for case in TERM:143 INT:130 HUP:129; do
  signal="${case%%:*}"
  want="${case##*:}"
  case_max=0
  run=1
  while [[ "$run" -le "$RUNS" ]]; do
    started="$(now_ms)"
    # 脚本自己当进程组组长（和 launchd 一样），后台运行也不会忽略 INT。
    set -m
    PATH="${fake_bin}:${PATH}" ORCA_UPSTREAM_FETCH_TIMEOUT="$TIMEOUT" \
      ORCA_UPSTREAM_FETCH_TEST_SIGNAL_AT_SPAWN="$signal" "$BASH_BIN" "$FETCH" >"${BASE}/out" 2>&1 &
    script_pid=$!
    set +m
    code=0
    wait "$script_pid" || code=$?
    elapsed=$(($(now_ms) - started))
    [[ "$elapsed" -gt "$case_max" ]] && case_max="$elapsed"
    if [[ "$code" -ne "$want" ]]; then
      fail "${signal} run ${run}: exit ${code}, want ${want}: $(cat "${BASE}/out")"
    fi
    if [[ "$elapsed" -gt $((LIMIT * 1000)) ]]; then
      slow=$((slow + 1))
      fail "${signal} run ${run}: took ${elapsed}ms"
    fi
    rest="$(leftovers "$script_pid")"
    if [[ -n "$rest" ]]; then
      left=$((left + 1))
      fail "${signal} run ${run}: left running:
${rest}"
      cleanup_leftovers "$script_pid"
    fi
    run=$((run + 1))
  done
  echo "${signal}: ${RUNS} runs, max ${case_max}ms"
  [[ "$case_max" -gt "$max_ms" ]] && max_ms="$case_max"
done

echo "fetch signal stress: $((RUNS * 3)) runs on $("$BASH_BIN" -c 'echo $BASH_VERSION'), max ${max_ms}ms, ${slow} slow, ${left} with leftovers"
if [[ "$FAILS" -gt 0 ]]; then
  echo "${FAILS} check(s) failed" >&2
  exit 1
fi
echo "fetch signal stress tests passed"
