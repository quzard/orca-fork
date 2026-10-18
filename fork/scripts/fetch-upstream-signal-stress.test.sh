#!/bin/bash
# fetch-upstream-main.sh 在启动窗口里收到信号（git fetch 和看门狗刚起来）时的压力测试：每个信号跑很多遍，
# 每次都要在几秒内按 143/130/129 退出，事后不留下 fetch、它的子进程、看门狗或看门狗的 sleep。
# 次数用 ORCA_FETCH_STRESS_RUNS 调（每个信号的次数，默认 200）；没有可用 ps 时的次数用
# ORCA_FETCH_STRESS_NO_PS_RUNS 调（每种垫片和没有 ps 的 PATH，每个信号，默认 20）；fetch 不理 TERM、
# 只能被 KILL 结束的次数用 ORCA_FETCH_STRESS_KILL_RUNS 调（每个信号，默认 3）；ORCA_FETCH_STRESS_BASH 换被测的 bash
# （比如自己编译的 3.2）。不接触网络：fetch 是假的 git。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FETCH="${ROOT}/fork/scripts/verify/fetch-upstream-main.sh"
RUNS="${ORCA_FETCH_STRESS_RUNS:-200}"
NO_PS_RUNS="${ORCA_FETCH_STRESS_NO_PS_RUNS:-20}"
KILL_RUNS="${ORCA_FETCH_STRESS_KILL_RUNS:-3}"
BASH_BIN="$(command -v "${ORCA_FETCH_STRESS_BASH:-bash}")"
# The test's own checks use this ps, never the one (or none) on the PATH the script gets.
PS_BIN="$(command -v ps)"
# 每次允许的最长时间（秒）。旧代码卡住时要等到看门狗超时，所以超时设得比它长。
LIMIT=5
TIMEOUT=20
# 一次运行最多等这么久就从外面 KILL 掉脚本的进程组，算失败，测试本身不会卡死。
HARD_CAP=$((TIMEOUT + 15))
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
# 不理 TERM 的 fetch：git 和它的子进程都忽略 TERM（忽略会被子进程继承），只有 KILL 能结束。
stubborn_bin="${BASE}/stubborn-bin"
mkdir -p "$stubborn_bin"
{
  echo '#!/bin/bash'
  echo "trap '' TERM"
  tail -n +2 "${fake_bin}/git"
} >"${stubborn_bin}/git"
chmod +x "${stubborn_bin}/git"
(cd "${BASE}/repo" && GIT_CONFIG_GLOBAL=/dev/null git init -q)

now_ms() {
  perl -MTime::HiRes=time -e 'printf "%d\n", time * 1000'
}
# 这次运行留下的、还活着（不是僵尸）的进程：脚本的进程组（看门狗和它的 sleep），以及命令行里带着
# 脚本路径、临时目录（假 git）或 fetch 子进程的进程（fetch 在自己的进程组里）。
leftovers() {
  # Patterns come in through the environment, so this awk does not match its own command line.
  "$PS_BIN" -A -o pid=,pgid=,stat=,args= 2>/dev/null | G="$1" F="$FETCH" B="$BASE" S="$helper" awk '
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
total=0
cd "${BASE}/repo"
# 用法: stress 名称 次数 被测脚本的PATH [最短毫秒 [最长毫秒]]。只改被测脚本的 PATH，测试自己用 PS_BIN。
stress() {
  local label="$1" runs="$2" script_path="$3" min_ms="${4:-0}" max_allowed="${5:-$((LIMIT * 1000))}"
  local case signal want case_max run started script_pid guard_pid code elapsed rest
  for case in TERM:143 INT:130 HUP:129; do
    signal="${case%%:*}"
    want="${case##*:}"
    case_max=0
    run=1
    while [[ "$run" -le "$runs" ]]; do
      started="$(now_ms)"
      # 脚本自己当进程组组长（和 launchd 一样），后台运行也不会忽略 INT。
      set -m
      PATH="$script_path" ORCA_UPSTREAM_FETCH_TIMEOUT="$TIMEOUT" \
        ORCA_UPSTREAM_FETCH_TEST_SIGNAL_AT_SPAWN="$signal" "$BASH_BIN" "$FETCH" >"${BASE}/out" 2>&1 &
      script_pid=$!
      set +m
      # One process, so stopping it leaves nothing behind.
      perl -e 'sleep shift; kill "KILL", -shift' "$HARD_CAP" "$script_pid" 2>/dev/null &
      guard_pid=$!
      code=0
      wait "$script_pid" || code=$?
      kill "$guard_pid" 2>/dev/null || true
      wait "$guard_pid" 2>/dev/null || true
      elapsed=$(($(now_ms) - started))
      [[ "$elapsed" -gt "$case_max" ]] && case_max="$elapsed"
      if [[ "$code" -ne "$want" ]]; then
        fail "${label} ${signal} run ${run}: exit ${code}, want ${want}: $(cat "${BASE}/out")"
      fi
      if [[ "$elapsed" -gt "$max_allowed" ]]; then
        slow=$((slow + 1))
        fail "${label} ${signal} run ${run}: took ${elapsed}ms, more than ${max_allowed}ms"
      elif [[ "$elapsed" -lt "$min_ms" ]]; then
        fail "${label} ${signal} run ${run}: took ${elapsed}ms, less than ${min_ms}ms"
      fi
      rest="$(leftovers "$script_pid")"
      if [[ -n "$rest" ]]; then
        left=$((left + 1))
        fail "${label} ${signal} run ${run}: left running:
${rest}"
        cleanup_leftovers "$script_pid"
      fi
      run=$((run + 1))
      total=$((total + 1))
    done
    echo "${label} ${signal}: ${runs} runs, max ${case_max}ms"
    if [[ "$case_max" -gt "$max_ms" ]]; then
      max_ms="$case_max"
    fi
  done
}

stress "ps" "$RUNS" "${fake_bin}:${PATH}"
# 没有可用的 ps（精简容器）：脚本只靠 kill -0 判断子进程还在不在，照样重发 TERM、3 秒后 KILL，不会一直等。
# 一个垫片让 ps 失败，一个让它成功但什么都不输出。
mkdir -p "${BASE}/ps-fails" "${BASE}/ps-empty"
printf '#!/bin/sh\nexit 1\n' >"${BASE}/ps-fails/ps"
printf '#!/bin/sh\nexit 0\n' >"${BASE}/ps-empty/ps"
chmod +x "${BASE}/ps-fails/ps" "${BASE}/ps-empty/ps"
stress "ps-fails" "$NO_PS_RUNS" "${BASE}/ps-fails:${fake_bin}:${PATH}"
stress "ps-empty" "$NO_PS_RUNS" "${BASE}/ps-empty:${fake_bin}:${PATH}"
# PATH 里根本没有 ps：只链接脚本要用的命令（git 是假的，它自己用 sleep）。
no_ps_bin="${BASE}/no-ps-bin"
mkdir -p "$no_ps_bin"
cp "${fake_bin}/git" "${no_ps_bin}/git"
for tool in awk mktemp rm sleep; do
  ln -s "$(command -v "$tool")" "${no_ps_bin}/${tool}"
done
if PATH="$no_ps_bin" "$BASH_BIN" -c 'command -v ps' >/dev/null 2>&1; then
  fail "the no-ps PATH still finds ps"
fi
stress "no-ps" "$NO_PS_RUNS" "$no_ps_bin"
# fetch 不理 TERM：stop_child 重发 TERM 3 秒后发 KILL。每次至少要 3 秒（证明走了 KILL 分支），最多 6 秒。
stress "kill" "$KILL_RUNS" "${stubborn_bin}:${PATH}" 2900 6000

echo "fetch signal stress: ${total} runs on $("$BASH_BIN" -c 'echo $BASH_VERSION'), max ${max_ms}ms, ${slow} slow, ${left} with leftovers"
if [[ "$FAILS" -gt 0 ]]; then
  echo "${FAILS} check(s) failed" >&2
  exit 1
fi
echo "fetch signal stress tests passed"
