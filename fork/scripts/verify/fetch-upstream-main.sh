#!/usr/bin/env bash
# Refresh refs/remotes/upstream/main right before check-commit-identity.sh. A stale ref makes upstream
# commits that a sync already merged into develop look like fork commits, and the check fails.
# Source: the `upstream` remote when it exists, else the URL daily-sync.sh adds as `upstream`.
# Exits non-zero when the fetch fails or takes longer than ORCA_UPSTREAM_FETCH_TIMEOUT seconds
# (default 600; a fetch on the Mac took about 6 minutes). On a timeout the fetch is killed. Callers
# treat any non-zero exit as a failed fetch and do not push or publish.
# Portable to macOS bash 3.2: no GNU `timeout`; a background watchdog kills the fetch instead, and
# git's low-speed limit also aborts a transfer that stalls.
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

# Own process group when job control is available, so the kill reaches git's helpers
# (git-remote-https, index-pack) too.
set -m 2>/dev/null || true
git -c http.lowSpeedLimit=1000 -c http.lowSpeedTime=120 \
  fetch -q --no-tags "$source" "+refs/heads/main:refs/remotes/upstream/main" &
fetch_pid=$!
set +m 2>/dev/null || true

marker="$(mktemp "${TMPDIR:-/tmp}/orca-fetch-timeout.XXXXXX")"
rm -f "$marker"
(
  # Sleep in 1s steps so the watchdog exits soon after the fetch does.
  waited=0
  while [[ "$waited" -lt "$timeout_s" ]]; do
    sleep 1
    kill -0 "$fetch_pid" 2>/dev/null || exit 0
    waited=$((waited + 1))
  done
  : >"$marker"
  kill -TERM -- "-${fetch_pid}" 2>/dev/null || kill -TERM "$fetch_pid" 2>/dev/null || true
  for _ in 1 2 3 4 5; do
    sleep 1
    kill -0 "$fetch_pid" 2>/dev/null || exit 0
  done
  kill -KILL -- "-${fetch_pid}" 2>/dev/null || kill -KILL "$fetch_pid" 2>/dev/null || true
) >/dev/null 2>&1 &
watchdog_pid=$!

status=0
wait "$fetch_pid" || status=$?
kill "$watchdog_pid" 2>/dev/null || true
wait "$watchdog_pid" 2>/dev/null || true

if [[ -e "$marker" ]]; then
  rm -f "$marker"
  echo "fetch upstream main: timed out after ${timeout_s}s fetching main from ${source}; fetch killed" >&2
  exit 124
fi
if [[ "$status" -ne 0 ]]; then
  echo "fetch upstream main: could not fetch main from ${source}" >&2
  exit 1
fi
echo "fetch upstream main: upstream/main is $(git rev-parse --short refs/remotes/upstream/main)"
