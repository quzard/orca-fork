#!/usr/bin/env bash
# Refresh refs/remotes/upstream/main right before check-commit-identity.sh. A stale ref makes upstream
# commits that a sync already merged into develop look like fork commits, and the check fails.
# Source: the `upstream` remote when it exists, else the URL daily-sync.sh adds as `upstream`.
# Exits non-zero when the fetch fails or takes longer than ORCA_UPSTREAM_FETCH_TIMEOUT seconds
# (default 600; a fetch on the Mac took about 6 minutes). On a timeout the fetch is killed. Callers
# treat any non-zero exit as a failed fetch and do not push or publish.
# Portable to macOS bash 3.2: no GNU `timeout`; a background watchdog kills the fetch instead, and
# git's low-speed limit also aborts a transfer that stalls.
# The fetch runs in its own process group (`set -m` job control; macOS has no `setsid` command), so
# when launchd stops the job (unload, logout, shutdown) and signals this script's group, the fetch
# and its helpers (git-remote-https, index-pack) are not in it. TERM, INT and HUP are trapped: the
# trap stops the watchdog, then the fetch's whole group (TERM, repeated, then KILL after 3s), and
# exits 143, 130 or 129. The EXIT trap does the same cleanup on every other exit; each step runs
# once. Cleanup waits for a child only once it is gone, so it takes a few seconds at most.
# While the fetch and the watchdog are being started their pids are not known yet, so a signal then
# is only recorded; it is acted on as soon as both pids are set.
set -euo pipefail

readonly UPSTREAM_URL="https://github.com/stablyai/orca.git"
timeout_s="${ORCA_UPSTREAM_FETCH_TIMEOUT:-600}"
if [[ ! "$timeout_s" =~ ^[1-9][0-9]*$ ]]; then
  echo "fetch upstream main: ORCA_UPSTREAM_FETCH_TIMEOUT must be a positive number of seconds" >&2
  exit 1
fi

source="$UPSTREAM_URL"
if git remote get-url upstream >/dev/null 2>&1; then
  source="upstream"
fi
export GIT_TERMINAL_PROMPT=0

fetch_pid=""
watchdog_pid=""
marker=""
fetch_group=0

# True while pid $2 (kind `pid`) or a process of group $2 (kind `group`) is running. Zombies do not
# count: a child that has exited stays one until it is waited for, and `kill -0` still finds it.
# Without a working `ps` (slim containers) only `kill -0` decides, so a zombie counts as running:
# stop_child then KILLs it after 3s and its `wait` returns at once.
running() {
  if [[ "$1" == group ]]; then
    kill -0 -- "-${2}" 2>/dev/null || return 1
  else
    kill -0 "$2" 2>/dev/null || return 1
  fi
  local listing verdict
  listing="$(ps -A -o pid=,pgid=,stat= 2>/dev/null)" || return 0
  [[ -n "$listing" ]] || return 0
  verdict="$(printf '%s\n' "$listing" | awk -v kind="$1" -v id="$2" '
    $3 !~ /^Z/ && ((kind == "group" && $2 == id) || (kind == "pid" && $1 == id)) { found = 1 }
    END { print (found ? "running" : "gone") }' 2>/dev/null)" || return 0
  [[ "$verdict" != gone ]]
}

send() {
  if [[ "$2" == group ]]; then
    kill "-${1}" -- "-${3}" 2>/dev/null || true
  else
    kill "-${1}" "$3" 2>/dev/null || true
  fi
}

# Stops a child of this script and reaps it, in at most about 3.5s. TERM is sent again on every
# check: a child that is still starting runs this script's trap handler until it resets its own
# traps, and bash drops a signal caught in that moment, so one TERM can be lost. After 3s it gets
# KILL, which cannot be lost; only then does `wait` run, so it never blocks for long.
stop_child() {
  local kind="$1" pid="$2" tries=0
  while running "$kind" "$pid" && [[ "$tries" -lt 30 ]]; do
    send TERM "$kind" "$pid"
    sleep 0.1
    tries=$((tries + 1))
  done
  if running "$kind" "$pid"; then
    send KILL "$kind" "$pid"
    tries=0
    while running "$kind" "$pid" && [[ "$tries" -lt 5 ]]; do
      sleep 0.1
      tries=$((tries + 1))
    done
  fi
  wait "$pid" 2>/dev/null || true
}

# Idempotent: clears each pid before acting on it, so the signal trap and the EXIT trap after it
# never kill or wait twice. Without job control the fetch shares this script's group, so only the
# fetch itself is stopped.
cleanup_fetch() {
  local pid="$watchdog_pid"
  watchdog_pid=""
  if [[ -n "$pid" ]]; then
    stop_child pid "$pid"
  fi
  pid="$fetch_pid"
  fetch_pid=""
  if [[ -n "$pid" ]]; then
    if [[ "$fetch_group" == 1 ]]; then
      stop_child group "$pid"
    else
      stop_child pid "$pid"
    fi
  fi
  if [[ -n "$marker" ]]; then
    rm -f "$marker"
  fi
}

on_signal() {
  trap '' TERM INT HUP
  cleanup_fetch
  trap - EXIT
  echo "fetch upstream main: stopped by a signal; fetch killed" >&2
  exit "$1"
}

# A signal between `cmd &` and `pid=$!` would run the trap with no pid to kill. Until both pids are
# set the traps only record the signal; the real traps then act on a recorded one.
pending_signal=""
trap cleanup_fetch EXIT
trap 'pending_signal=143' TERM
trap 'pending_signal=130' INT
trap 'pending_signal=129' HUP

# Own process group when job control is available, so a kill reaches git's helpers
# (git-remote-https, index-pack) too.
if set -m 2>/dev/null; then
  fetch_group=1
fi
git -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=120 \
  fetch -q --no-tags "$source" "+refs/heads/main:refs/remotes/upstream/main" &
# Test only: signals this script inside the window above (check-commit-identity.test.sh).
if [[ -n "${ORCA_UPSTREAM_FETCH_TEST_SIGNAL_AT_SPAWN:-}" ]]; then
  kill "-${ORCA_UPSTREAM_FETCH_TEST_SIGNAL_AT_SPAWN}" "$$"
fi
fetch_pid=$!
set +m 2>/dev/null || true
# A group only exists when the job really became its leader.
if [[ "$fetch_group" == 1 ]] && ! kill -0 -- "-${fetch_pid}" 2>/dev/null; then
  if kill -0 "$fetch_pid" 2>/dev/null; then
    fetch_group=0
  fi
fi

marker="$(mktemp "${TMPDIR:-/tmp}/orca-fetch-timeout.XXXXXX")"
rm -f "$marker"
(
  # Sleeps in the background so a TERM from cleanup_fetch also ends the current sleep, and no stray
  # `sleep` outlives the script. The trap only records the stop and ends the sleep; the loop exits.
  stop=0
  nap_pid=""
  trap 'stop=1; [[ -n "$nap_pid" ]] && kill "$nap_pid" 2>/dev/null' TERM
  trap - EXIT INT HUP
  # False once the watchdog is told to stop.
  nap() {
    sleep 1 &
    nap_pid=$!
    # A TERM between the two lines above found no sleep to end.
    if [[ "$stop" == 1 ]]; then
      kill "$nap_pid" 2>/dev/null || true
    fi
    wait "$nap_pid" 2>/dev/null || true
    # A TERM ends `wait` before the killed sleep is reaped; reap it.
    wait "$nap_pid" 2>/dev/null || true
    nap_pid=""
    [[ "$stop" == 0 ]]
  }
  # Sleep in 1s steps so the watchdog exits soon after the fetch does.
  waited=0
  while [[ "$waited" -lt "$timeout_s" ]]; do
    nap || exit 0
    kill -0 "$fetch_pid" 2>/dev/null || exit 0
    waited=$((waited + 1))
  done
  : >"$marker"
  kill -TERM -- "-${fetch_pid}" 2>/dev/null || kill -TERM "$fetch_pid" 2>/dev/null || true
  for _ in 1 2 3 4 5; do
    nap || exit 0
    kill -0 "$fetch_pid" 2>/dev/null || exit 0
  done
  kill -KILL -- "-${fetch_pid}" 2>/dev/null || kill -KILL "$fetch_pid" 2>/dev/null || true
) >/dev/null 2>&1 &
watchdog_pid=$!

trap 'on_signal 143' TERM
trap 'on_signal 130' INT
trap 'on_signal 129' HUP
if [[ -n "$pending_signal" ]]; then
  on_signal "$pending_signal"
fi

status=0
wait "$fetch_pid" || status=$?
timed_out=0
if [[ -e "$marker" ]]; then
  timed_out=1
fi
# Stops the watchdog and any helper the fetch left behind; the EXIT trap then has nothing to do.
cleanup_fetch

if [[ "$timed_out" == 1 ]]; then
  echo "fetch upstream main: timed out after ${timeout_s}s fetching main from ${source}; fetch killed" >&2
  exit 124
fi
if [[ "$status" -ne 0 ]]; then
  echo "fetch upstream main: could not fetch main from ${source}" >&2
  exit 1
fi
echo "fetch upstream main: upstream/main is $(git rev-parse --short refs/remotes/upstream/main)"
