#!/bin/bash
# Sourced by the fork shell tests that send SIGINT and SIGHUP to fetch-upstream-main.sh. A shell
# can start with these ignored: a background job of a non-interactive shell (`cmd &`) ignores INT
# (and QUIT), and `nohup cmd` ignores HUP, so `nohup cmd &` ignores both. Children inherit that,
# and bash cannot trap or reset a signal ignored on entry, so each INT or HUP case would wait for a
# timeout and look like a broken script.
#
# Usage, before the test does any work: ensure_test_signals_trappable NAME BASH_TO_TEST "$@"
# When INT or HUP is not trappable in BASH_TO_TEST, reruns the test once (same bash, same
# arguments) with both set back to their default; perl can do that (bash 3.2 and 5.2 alike), bash
# cannot. Still not trappable: says which on stderr and exits 2.
_signal_test_ignored() {
  local bash_bin="$1" sig ignored=""
  for sig in INT HUP; do
    "$bash_bin" -c "trap 'exit 0' $sig; kill -$sig \$\$; exit 1" >/dev/null 2>&1 ||
      ignored="${ignored:+$ignored and }SIG$sig"
  done
  printf '%s' "$ignored"
}
ensure_test_signals_trappable() {
  local name="$1" bash_bin="$2" ignored
  shift 2
  ignored="$(_signal_test_ignored "$bash_bin")"
  [[ -z "$ignored" ]] && return 0
  if [[ -z "${ORCA_TEST_SIGNAL_RESET:-}" ]] && command -v perl >/dev/null 2>&1; then
    echo "${name}: ${ignored} ignored in this shell; rerunning with INT and HUP reset to the default" >&2
    ORCA_TEST_SIGNAL_RESET=1 exec perl -e '$SIG{INT} = $SIG{HUP} = "DEFAULT"; exec @ARGV or die "exec: $!\n"' \
      "$BASH" "$0" "$@"
  fi
  echo "${name}: ${ignored} ignored in this shell (started with \`&\` or nohup?) and could not be" \
    "reset, so those cases cannot run; run the test in the foreground without nohup" >&2
  exit 2
}
