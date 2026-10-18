#!/bin/bash
# 用假 gh 走一遍桥接发布：顺序、默认旧仓库、dry-run、令牌不外泄、前置检查失败。不接触网络。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BRIDGE="${ROOT}/fork/scripts/publish-bridge-release.sh"
TAG="v1.4.229-local.1730000000000.0123456789ab"
ZIP="Orca-1.4.229-local.1730000000000.0123456789ab-arm64-mac.zip"
SECRET="ghp_faketoken1234567890"
BASE="$(mktemp -d "${TMPDIR:-/tmp}/orca-bridge-test.XXXXXX")"
FAILS=0
CASE=""
OUT=""
ERR=""
CODE=0

trap 'rm -rf "$BASE"' EXIT

mkdir -p "${BASE}/bin"
cat >"${BASE}/bin/gh" <<'GH'
#!/bin/bash
set -euo pipefail
STATE="${FAKE_STATE:?}"
repo=""
args=("$@")
for ((i = 0; i < ${#args[@]}; i++)); do
  if [[ "${args[$i]}" == --repo ]]; then
    repo="${args[$((i + 1))]}"
  fi
done
case "$1 ${2:-}" in
  "release view")
    if [[ "$repo" == quzard/orca-fork ]]; then
      printf '%s\n' "${FAKE_SOURCE_STATE:-false true}"
      exit 0
    fi
    [[ -f "${STATE}/created" ]] || { echo "release not found" >&2; exit 1; }
    if [[ " $* " == *" assets "* ]]; then
      cat "${STATE}/uploaded"
    else
      cat "${STATE}/draft"
    fi
    ;;
  "repo view") echo main ;;
  "release download")
    dir=""
    for ((i = 0; i < ${#args[@]}; i++)); do
      [[ "${args[$i]}" == --dir ]] && dir="${args[$((i + 1))]}"
    done
    zip="${FAKE_ZIP:?}"
    printf 'zip' >"${dir}/${zip}"
    printf 'map' >"${dir}/${zip}.blockmap"
    printf 'dmg' >"${dir}/orca-macos-arm64.dmg"
    printf 'map' >"${dir}/orca-macos-arm64.dmg.blockmap"
    listed="${FAKE_YML_FILE:-$zip}"
    printf 'version: 1.4.229\nfiles:\n  - url: %s\n    sha512: abc\n    size: 3\npath: %s\nsha512: abc\n' \
      "$listed" "$listed" >"${dir}/latest-mac.yml"
    ;;
  "release create")
    if [[ -n "${FAKE_TOKEN_ERROR:-}" ]]; then
      echo "HTTP 401: Bad credentials (token ${FAKE_TOKEN_ERROR})" >&2
      exit 1
    fi
    echo "create $*" >>"${STATE}/trace"
    echo true >"${STATE}/draft"
    : >"${STATE}/uploaded"
    touch "${STATE}/created"
    ;;
  "release upload")
    file="${args[${#args[@]} - 1]}"
    echo "upload ${file##*/}" >>"${STATE}/trace"
    echo "${file##*/}" >>"${STATE}/uploaded"
    ;;
  "release edit")
    echo "edit $*" >>"${STATE}/trace"
    echo false >"${STATE}/draft"
    ;;
  "api "*)
    if [[ "$(cat "${STATE}/draft" 2>/dev/null)" == false ]]; then
      echo "${FAKE_TAG:?}"
    else
      echo v0.0.1-older
    fi
    ;;
  *)
    echo "unexpected gh $*" >&2
    exit 1
    ;;
esac
GH
chmod +x "${BASE}/bin/gh"

run() {
  local state="${BASE}/state-${CASE// /-}"
  rm -rf "$state"
  mkdir -p "$state"
  : >"${state}/trace"
  ERR="${state}/stderr"
  CODE=0
  OUT="$(env PATH="${BASE}/bin:${PATH}" FAKE_STATE="$state" FAKE_ZIP="$ZIP" FAKE_TAG="$TAG" \
    bash "$BRIDGE" "$@" 2>"$ERR")" || CODE=$?
  TRACE="$(cat "${state}/trace")"
}

fail() {
  printf 'FAIL %s: %s\nstdout:\n%s\nstderr:\n%s\ntrace:\n%s\n' "$CASE" "$1" "$OUT" "$(cat "$ERR")" "$TRACE" >&2
  FAILS=$((FAILS + 1))
}

ok() {
  printf 'ok %s\n' "$CASE"
}

bash -n "$BRIDGE"

CASE="script boundaries"
if grep -E -q -i 'stablyai|onorca|github-update-token|safeStorage|set -x' "$BRIDGE"; then
  fail "bridge script mentions a forbidden target, token store or tracing"
else
  ok
fi

CASE="publish order"
run "$TAG" example/old-orca
expected="create release create ${TAG} --repo example/old-orca --draft --prerelease --target main --title ${TAG} --notes Bridge to quzard/orca-fork
upload ${ZIP}
upload ${ZIP}.blockmap
upload latest-mac.yml
edit release edit ${TAG} --repo example/old-orca --draft=false
upload orca-macos-arm64.dmg
upload orca-macos-arm64.dmg.blockmap"
if [[ "$CODE" -ne 0 || "$TRACE" != "$expected" || "$OUT" != *"bridge=published"* ]]; then
  fail "unexpected order or result"
else
  ok
fi

CASE="default old repo"
run "$TAG" --no-dmg
if [[ "$CODE" -ne 0 || "$TRACE" != *"--repo quzard/orca --draft"* || "$TRACE" == *".dmg"* ]]; then
  fail "default repo or --no-dmg not honored"
else
  ok
fi

CASE="dry run changes nothing"
run --dry-run "$TAG" example/old-orca
if [[ "$CODE" -ne 0 || -n "$TRACE" || "$OUT" != *"bridge=dry-run"* ]] ||
  ! grep -q 'dry-run: gh release create' "$ERR"; then
  fail "dry run wrote to the old repo or printed nothing"
else
  ok
fi

CASE="token never printed"
FAKE_TOKEN_ERROR="$SECRET" run "$TAG" example/old-orca
if [[ "$CODE" -eq 0 ]] || grep -q "$SECRET" "$ERR" || [[ "$OUT" == *"$SECRET"* ]] ||
  ! grep -q 'details omitted' "$ERR"; then
  fail "a token-looking gh error leaked or did not fail"
else
  ok
fi

CASE="source must be a published prerelease"
FAKE_SOURCE_STATE="true true" run "$TAG" example/old-orca
if [[ "$CODE" -eq 0 || -n "$TRACE" ]]; then
  fail "copied a draft source release"
else
  ok
fi

CASE="yml lists only uploaded zips"
FAKE_YML_FILE="orca-macos-arm64.dmg" run "$TAG" example/old-orca
if [[ "$CODE" -eq 0 || -n "$TRACE" ]]; then
  fail "published a yml that names a file uploaded after publishing"
else
  ok
fi

CASE="old repo must differ"
run "$TAG" quzard/orca-fork
if [[ "$CODE" -eq 0 || -n "$TRACE" ]]; then
  fail "copied onto the source repo"
else
  ok
fi

if [[ "$FAILS" -ne 0 ]]; then
  printf '%s publish-bridge-release test(s) failed\n' "$FAILS" >&2
  exit 1
fi
printf 'publish-bridge-release tests passed\n'
