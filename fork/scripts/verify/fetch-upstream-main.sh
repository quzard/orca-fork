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
# trap stops the watchdog, TERMs the fetch's whole group, waits up to 3s, KILLs what is left, and
# exits 143, 130 or 129. The EXIT trap does the same cleanup on every other exit; each step runs once.
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

# True while any process of the fetch's group is alive (git can exit before its helpers do). Without
# job control the fetch shares this script's group, so only the fetch itself is checked.
fetch_alive() {
  if [[ "$fetch_group" == 1 ]]; then
    kill -0 -- "-${1}" 2>/dev/null
  else
    kill -0 "$1" 2>/dev/null
  fi
}

signal_fetch() {
  if [[ "$fetch_group" == 1 ]]; then
    kill "-${1}" -- "-${2}" 2>/dev/null || true
  else
    kill "-${1}" "$2" 2>/dev/null || true
  fi
}

# Idempotent: clears each pid before acting on it, so the signal trap and the EXIT trap after it
# never kill or wait twice.
cleanup_fetch() {
  local pid="$watchdog_pid"
  watchdog_pid=""
  if [[ -n "$pid" ]]; then
    kill "$pid" 2>/dev/null || true
    wait "$pid" 2>/dev/null || true
  fi
  pid="$fetch_pid"
  fetch_pid=""
  if [[ -n "$pid" ]]; then
    if fetch_alive "$pid"; then
      signal_fetch TERM "$pid"
      local tries=0
      while fetch_alive "$pid" && [[ "$tries" -lt 12 ]]; do
        sleep 0.25
        tries=$((tries + 1))
      done
      if fetch_alive "$pid"; then
        signal_fetch KILL "$pid"
      fi
    fi
    wait "$pid" 2>/dev/null || true
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

# Set before the fetch starts, so a signal that arrives right after the spawn is not lost.
trap cleanup_fetch EXIT
trap 'on_signal 143' TERM
trap 'on_signal 130' INT
trap 'on_signal 129' HUP

# Own process group when job control is available, so a kill reaches git's helpers
# (git-remote-https, index-pack) too.
if set -m 2>/dev/null; then
  fetch_group=1
fi
git -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=120 \
  fetch -q --no-tags "$source" "+refs/heads/main:refs/remotes/upstream/main" &
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
  # `sleep` outlives the script.
  nap_pid=""
  trap '[[ -n "$nap_pid" ]] && kill "$nap_pid" 2>/dev/null; exit 0' TERM
  trap - EXIT INT HUP
  nap() {
    sleep 1 &
    nap_pid=$!
    wait "$nap_pid" 2>/dev/null || true
    nap_pid=""
  }
  # Sleep in 1s steps so the watchdog exits soon after the fetch does.
  waited=0
  while [[ "$waited" -lt "$timeout_s" ]]; do
    nap
    kill -0 "$fetch_pid" 2>/dev/null || exit 0
    waited=$((waited + 1))
  done
  : >"$marker"
  kill -TERM -- "-${fetch_pid}" 2>/dev/null || kill -TERM "$fetch_pid" 2>/dev/null || true
  for _ in 1 2 3 4 5; do
    nap
    kill -0 "$fetch_pid" 2>/dev/null || exit 0
  done
  kill -KILL -- "-${fetch_pid}" 2>/dev/null || kill -KILL "$fetch_pid" 2>/dev/null || true
) >/dev/null 2>&1 &
watchdog_pid=$!

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
