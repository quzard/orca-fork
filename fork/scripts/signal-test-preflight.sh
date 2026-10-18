#!/bin/bash
# Sourced by the fork shell tests that send SIGINT to fetch-upstream-main.sh. A shell that starts
# with SIGINT ignored (a background job of a non-interactive shell, `cmd &` or `nohup cmd &`) passes
# that on to every child, and bash cannot trap or reset a signal ignored on entry, so each INT case
# would wait for a timeout and look like a broken script.
#
# Usage, before the test does any work: ensure_int_trappable NAME BASH_TO_TEST "$@"
# When INT is not trappable in BASH_TO_TEST, reruns the test once (same bash, same arguments) with
# INT set back to its default; perl can do that, bash cannot. Still not trappable: says why on
# stderr and exits 2.
ensure_int_trappable() {
  local name="$1" bash_bin="$2"
  shift 2
  if "$bash_bin" -c 'trap "exit 0" INT; kill -INT $$; exit 1' >/dev/null 2>&1; then
    return 0
  fi
  if [[ -z "${ORCA_TEST_INT_RESET:-}" ]] && command -v perl >/dev/null 2>&1; then
    echo "${name}: SIGINT is ignored in this shell; rerunning with it reset to the default" >&2
    ORCA_TEST_INT_RESET=1 exec perl -e '$SIG{INT} = "DEFAULT"; exec @ARGV or die "exec: $!\n"' \
      "$BASH" "$0" "$@"
  fi
  echo "${name}: SIGINT is ignored in this shell (started as a background job?) and could not be" \
    "reset, so the INT cases cannot run; run the test in the foreground" >&2
  exit 2
}
