#!/usr/bin/env bash
# Fail unless every fork commit after the identity floor carries the fork's public identity.
# Usage: check-commit-identity.sh [REF]   (default HEAD)
# Checks each commit in `git rev-list REF ^upstream/main ^FLOOR`, merges included: author and
# committer must both be exactly `quzard <30899719+quzard@users.noreply.github.com>`.
# FLOOR is fixed in this script, not read from any file: a commit cannot move it to skip itself or
# an earlier bad commit. Commits reachable from it are public on develop and were reviewed when
# the check was added; 20 of them are by Cursor Agent <cursoragent@cursor.com> (2026-10-16/17) and
# cannot be rewritten. Never change FLOOR.
# It fails when upstream/main is missing, when FLOOR is not in the repository, or when FLOOR is
# not an ancestor of REF. Callers fetch upstream main first: a stale upstream/main makes newly
# merged upstream commits look like fork commits.
set -euo pipefail

readonly EXPECTED_NAME="quzard"
readonly EXPECTED_EMAIL="30899719+quzard@users.noreply.github.com"
readonly UPSTREAM_REF="refs/remotes/upstream/main"
readonly FLOOR="8fd7c96acc934cb25e41b5da17f1743e88219bbe"

ref="${1:-HEAD}"

fail() {
  echo "commit identity check: $*" >&2
  exit 1
}

if ! git rev-parse --verify --quiet "${UPSTREAM_REF}^{commit}" >/dev/null; then
  fail "${UPSTREAM_REF#refs/remotes/} is missing; fetch upstream main first"
fi
if ! git rev-parse --verify --quiet "${ref}^{commit}" >/dev/null; then
  fail "cannot resolve ${ref}"
fi
if ! git rev-parse --verify --quiet "${FLOOR}^{commit}" >/dev/null; then
  fail "floor ${FLOOR} is not in this repository"
fi
if ! git merge-base --is-ancestor "$FLOOR" "$ref"; then
  fail "floor ${FLOOR} is not an ancestor of ${ref}"
fi

expected="${EXPECTED_NAME} <${EXPECTED_EMAIL}>"
bad=()
while IFS=$'\t' read -r sha author committer; do
  if [[ "$author" != "$expected" || "$committer" != "$expected" ]]; then
    bad+=("${sha} author: ${author} committer: ${committer}")
  fi
done < <(git log --no-mailmap --format=$'%H\t%an <%ae>\t%cn <%ce>' "$ref" "^${UPSTREAM_REF}" "^${FLOOR}" --)

if [[ ${#bad[@]} -gt 0 ]]; then
  echo "commit identity check: ${#bad[@]} commit(s) after ${FLOOR:0:10} not by ${expected}:" >&2
  printf '  %s\n' "${bad[@]}" >&2
  exit 1
fi
echo "commit identity check: every commit in ${ref} after upstream/main and ${FLOOR:0:10} is by ${expected}"
