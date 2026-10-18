#!/usr/bin/env bash
# Refresh refs/remotes/upstream/main right before check-commit-identity.sh. A stale ref makes upstream
# commits that a sync already merged into develop look like fork commits, and the check fails.
# Source: the `upstream` remote when it exists, else the URL daily-sync.sh adds as `upstream`.
# Exits non-zero when the fetch fails; callers then do not push or publish.
set -euo pipefail

readonly UPSTREAM_URL="https://github.com/stablyai/orca.git"

source="$UPSTREAM_URL"
if git remote get-url upstream >/dev/null 2>&1; then
  source="upstream"
fi
export GIT_TERMINAL_PROMPT=0
if ! git fetch -q --no-tags "$source" "+refs/heads/main:refs/remotes/upstream/main"; then
  echo "fetch upstream main: could not fetch main from ${source}" >&2
  exit 1
fi
echo "fetch upstream main: upstream/main is $(git rev-parse --short refs/remotes/upstream/main)"
