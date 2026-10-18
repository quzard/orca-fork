#!/usr/bin/env bash
# Fail unless every fork commit after the identity baseline carries the fork's public identity.
# Usage: check-commit-identity.sh [REF]   (default HEAD)
# Checks each commit in `git rev-list REF ^upstream/main ^BASELINE`, merges included: author and
# committer must both be exactly `quzard <30899719+quzard@users.noreply.github.com>`.
# BASELINE is the one SHA in fork/scripts/verify/identity-baseline, read from REF's own tree, so a
# working-tree edit cannot change what a pushed ref is checked against. It fails when upstream/main
# is missing, when the baseline file is missing or invalid, or when the baseline is not an ancestor
# of REF. Callers fetch upstream main first: a stale upstream/main makes newly merged upstream
# commits look like fork commits.
set -euo pipefail

readonly EXPECTED_NAME="quzard"
readonly EXPECTED_EMAIL="30899719+quzard@users.noreply.github.com"
readonly UPSTREAM_REF="refs/remotes/upstream/main"
readonly BASELINE_PATH="fork/scripts/verify/identity-baseline"

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
if ! baseline_file="$(git show "${ref}:${BASELINE_PATH}" 2>/dev/null)"; then
  fail "${BASELINE_PATH} is missing from ${ref}"
fi
baseline_lines=()
while IFS= read -r line; do
  line="${line%%#*}"
  line="${line//[[:space:]]/}"
  [[ -n "$line" ]] && baseline_lines+=("$line")
done <<<"$baseline_file"
if [[ ${#baseline_lines[@]} -ne 1 || ! "${baseline_lines[0]}" =~ ^[0-9a-f]{40}$ ]]; then
  fail "${BASELINE_PATH} must hold exactly one full commit SHA"
fi
baseline="${baseline_lines[0]}"
if ! git rev-parse --verify --quiet "${baseline}^{commit}" >/dev/null; then
  fail "baseline ${baseline} is not in this repository"
fi
if ! git merge-base --is-ancestor "$baseline" "$ref"; then
  fail "baseline ${baseline} is not an ancestor of ${ref}"
fi

expected="${EXPECTED_NAME} <${EXPECTED_EMAIL}>"
bad=()
while IFS=$'\t' read -r sha author committer; do
  if [[ "$author" != "$expected" || "$committer" != "$expected" ]]; then
    bad+=("${sha} author: ${author} committer: ${committer}")
  fi
done < <(git log --no-mailmap --format=$'%H\t%an <%ae>\t%cn <%ce>' "$ref" "^${UPSTREAM_REF}" "^${baseline}" --)

if [[ ${#bad[@]} -gt 0 ]]; then
  echo "commit identity check: ${#bad[@]} commit(s) after ${baseline:0:10} not by ${expected}:" >&2
  printf '  %s\n' "${bad[@]}" >&2
  exit 1
fi
echo "commit identity check: every commit in ${ref} after upstream/main and ${baseline:0:10} is by ${expected}"
