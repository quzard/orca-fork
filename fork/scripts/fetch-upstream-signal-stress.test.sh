#!/bin/bash
# fetch-upstream-main.sh 在启动窗口里收到信号（git fetch 和看门狗刚起来）时的压力测试：每个信号跑很多遍，
# 每次都要在几秒内按 143/130/129 退出，事后不留下 fetch、它的子进程、看门狗或看门狗的 sleep。
# 次数用 ORCA_FETCH_STRESS_RUNS 调（每个信号的次数，默认 200）；没有可用 ps 时的次数用
# ORCA_FETCH_STRESS_NO_PS_RUNS 调（每种垫片和没有 ps 的 PATH，每个信号，默认 20）；fetch 不理 TERM、
# 只能被 KILL 结束的次数用 ORCA_FETCH_STRESS_KILL_RUNS 调（每个信号，默认 3）；fetch 已经在跑时信号发给脚本
# 整个进程组（launchd 的做法）的次数用 ORCA_FETCH_STRESS_GROUP_RUNS 调（每个信号，默认 100）；
# ORCA_FETCH_STRESS_BASH 换被测的 bash（比如自己编译的 3.2）。不接触网络：fetch 是假的 git。
# A missing bash, ps, git, perl or awk fails the test with a message on stderr and exit 2.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FETCH="${ROOT}/fork/scripts/verify/fetch-upstream-main.sh"
RUNS="${ORCA_FETCH_STRESS_RUNS:-200}"
NO_PS_RUNS="${ORCA_FETCH_STRESS_NO_PS_RUNS:-20}"
KILL_RUNS="${ORCA_FETCH_STRESS_KILL_RUNS:-3}"
GROUP_RUNS="${ORCA_FETCH_STRESS_GROUP_RUNS:-100}"
# Prints the path of command $2 ($1 says what it is for, $3 names the variable that chose it, if
# any), or says on stderr that it is missing and fails, so a broken setup is never a silent pass.
need() {
  local found
  found="$(command -v "$2" 2>/dev/null)" || found=""
  if [[ -z "$found" || -d "$found" || ! -x "$found" ]]; then
    echo "fetch signal stress: cannot find ${1} '${2}'${3:+ (from ${3})}" >&2
    return 2
  fi
  printf '%s\n' "$found"
}
BASH_BIN="$(need "the bash to test" "${ORCA_FETCH_STRESS_BASH:-bash}" "${ORCA_FETCH_STRESS_BASH:+ORCA_FETCH_STRESS_BASH}")" || exit 2
if [[ -z "$("$BASH_BIN" -c 'echo "${BASH_VERSION:-}"' 2>/dev/null)" ]]; then
  echo "fetch signal stress: ${BASH_BIN} does not run as bash" >&2
  exit 2
fi
# The test's own checks use this ps, never the one (or none) on the PATH the script gets.
PS_BIN="$(need "ps (to look for leftover processes)" ps)" || exit 2
if [[ -z "$("$PS_BIN" -A -o pid= 2>/dev/null)" ]]; then
  echo "fetch signal stress: ${PS_BIN} -A -o pid= lists no processes" >&2
  exit 2
fi
real_git="$(need git git)" || exit 2
need perl perl >/dev/null || exit 2
need awk awk >/dev/null || exit 2
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

# The fetch's child sleeps for a length unique to this test run, so a parallel run's is not counted.
helper="sleep $((100000 + $$))"
fake_bin="${BASE}/fake-bin"
mkdir -p "$fake_bin" "${BASE}/repo"
# 假的 git：fetch 时起一个子进程（模拟 git-remote-https）然后一直等；其他子命令交给真的 git。
cat >"${fake_bin}/git" <<FAKE
#!/bin/bash
for arg in "\$@"; do
  if [[ "\$arg" == fetch ]]; then
    : >"${BASE}/fetch-started"
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
# Live (not zombie) processes in group $1.
group_size() {
  "$PS_BIN" -A -o pgid=,stat= 2>/dev/null | awk -v g="$1" '$1 == g && $2 !~ /^Z/ { n++ } END { print n + 0 }'
}
# 用法: stress 名称 次数 被测脚本的PATH [最短毫秒 [最长毫秒 [方式]]]。只改被测脚本的 PATH，测试自己用 PS_BIN。
# 方式 spawn（默认）：脚本在起 fetch 和看门狗的窗口里给自己发信号。方式 group：等 fetch 和看门狗都起来、
# 脚本在等 fetch 时，把信号发给脚本的整个进程组（launchd 停任务时就这样），看门狗也一起收到；计时从发信号算起。
stress() {
  local label="$1" runs="$2" script_path="$3" min_ms="${4:-0}" max_allowed="${5:-$((LIMIT * 1000))}"
  local how="${6:-spawn}"
  local case signal want case_max run started script_pid guard_pid code elapsed rest spawn_signal tries
  for case in TERM:143 INT:130 HUP:129; do
    signal="${case%%:*}"
    want="${case##*:}"
    case_max=0
    run=1
    while [[ "$run" -le "$runs" ]]; do
      started="$(now_ms)"
      spawn_signal="$signal"
      if [[ "$how" == group ]]; then
        spawn_signal=""
        rm -f "${BASE}/fetch-started"
      fi
      # 脚本自己当进程组组长（和 launchd 一样），后台运行也不会忽略 INT。
      set -m
      PATH="$script_path" ORCA_UPSTREAM_FETCH_TIMEOUT="$TIMEOUT" \
        ORCA_UPSTREAM_FETCH_TEST_SIGNAL_AT_SPAWN="$spawn_signal" "$BASH_BIN" "$FETCH" >"${BASE}/out" 2>&1 &
      script_pid=$!
      set +m
      # One process, so stopping it leaves nothing behind.
      perl -e 'sleep shift; kill "KILL", -shift' "$HARD_CAP" "$script_pid" 2>/dev/null &
      guard_pid=$!
      if [[ "$how" == group ]]; then
        # The fetch has started and the script's group holds the script and the watchdog.
        tries=0
        while [[ ! -e "${BASE}/fetch-started" || "$(group_size "$script_pid")" -lt 2 ]] && [[ "$tries" -lt 200 ]]; do
          sleep 0.05
          tries=$((tries + 1))
        done
        if [[ "$tries" -ge 200 ]]; then
          fail "${label} ${signal} run ${run}: fetch or watchdog did not start"
        fi
        started="$(now_ms)"
        kill "-${signal}" -- "-${script_pid}" 2>/dev/null || true
      fi
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
# PATH 里根本没有 ps：链接 PATH 里除 ps 以外的每个命令（同名的取 PATH 里靠前的那个，和查找命令时一样），
# git 换成假的。这样脚本以后多用一个命令，这个用例也照样能跑。
no_ps_bin="${BASE}/no-ps-bin"
mkdir -p "$no_ps_bin"
cp "${fake_bin}/git" "${no_ps_bin}/git"
IFS=: read -r -a path_dirs <<<"$PATH"
for dir in "${path_dirs[@]}"; do
  # Empty and relative entries depend on the current directory; skip them.
  [[ "$dir" == /* && -d "$dir" ]] || continue
  links=()
  for file in "$dir"/*; do
    name="${file##*/}"
    [[ "$name" != ps && -f "$file" && -x "$file" ]] || continue
    [[ -e "${no_ps_bin}/${name}" || -L "${no_ps_bin}/${name}" ]] && continue
    links[${#links[@]}]="$file"
  done
  # One ln per directory: a few thousand single ln calls would take seconds.
  if [[ "${#links[@]}" -gt 0 ]]; then
    ln -s "${links[@]}" "${no_ps_bin}/"
  fi
done
if PATH="$no_ps_bin" "$BASH_BIN" -c 'command -v ps' >/dev/null 2>&1; then
  fail "the no-ps PATH still finds ps"
fi
stress "no-ps" "$NO_PS_RUNS" "$no_ps_bin"
# fetch 不理 TERM：stop_child 重发 TERM 3 秒后发 KILL。每次至少要 3 秒（证明走了 KILL 分支），最多 8 秒
# （Mac 上要 4.5 到 4.85 秒）。
stress "kill" "$KILL_RUNS" "${stubborn_bin}:${PATH}" 2900 8000
# 信号发给脚本整个进程组，看门狗和脚本一起收到。看门狗恰好在信号打断脚本的 `wait` 时退出的话，bash
# 会悄悄回收它，旧代码之后再 `wait` 看门狗就一直等到 fetch 自己结束（fetch 已经没有看门狗管了），
# 这里就是 HARD_CAP 后被 KILL。
stress "group" "$GROUP_RUNS" "${fake_bin}:${PATH}" 0 "$((LIMIT * 1000))" group

echo "fetch signal stress: ${total} runs on $("$BASH_BIN" -c 'echo $BASH_VERSION'), max ${max_ms}ms, ${slow} slow, ${left} with leftovers"
if [[ "$FAILS" -gt 0 ]]; then
  echo "${FAILS} check(s) failed" >&2
  exit 1
fi
echo "fetch signal stress tests passed"
