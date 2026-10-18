#!/usr/bin/env bash
# Fail unless every fork commit carries the fork's public identity.
# Usage: check-commit-identity.sh [REF]   (default HEAD)
# Checks each commit in `git rev-list REF ^upstream/main`, merges included: author and committer
# must both be exactly `quzard <30899719+quzard@users.noreply.github.com>`. Without an
# upstream/main ref it fails: there is no other base to measure the fork's commits from.
set -euo pipefail

readonly EXPECTED_NAME="quzard"
readonly EXPECTED_EMAIL="30899719+quzard@users.noreply.github.com"
readonly UPSTREAM_REF="refs/remotes/upstream/main"

ref="${1:-HEAD}"

if ! git rev-parse --verify --quiet "${UPSTREAM_REF}^{commit}" >/dev/null; then
  echo "commit identity check: ${UPSTREAM_REF#refs/remotes/} is missing; fetch upstream main first" >&2
  exit 1
fi
if ! git rev-parse --verify --quiet "${ref}^{commit}" >/dev/null; then
  echo "commit identity check: cannot resolve ${ref}" >&2
  exit 1
fi

expected="${EXPECTED_NAME} <${EXPECTED_EMAIL}>"
bad=()
while IFS=$'\t' read -r sha author committer; do
  if [[ "$author" != "$expected" || "$committer" != "$expected" ]]; then
    bad+=("${sha} author: ${author} committer: ${committer}")
  fi
done < <(git log --no-mailmap --format=$'%H\t%an <%ae>\t%cn <%ce>' "$ref" "^${UPSTREAM_REF}" --)

if [[ ${#bad[@]} -gt 0 ]]; then
  echo "commit identity check: ${#bad[@]} commit(s) not by ${expected}:" >&2
  printf '  %s\n' "${bad[@]}" >&2
  exit 1
fi
echo "commit identity check: every commit in ${ref} ^upstream/main is by ${expected}"
