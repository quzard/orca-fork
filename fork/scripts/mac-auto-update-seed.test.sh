#!/bin/bash
# 单独跑 mac-auto-update.sh 里的 seed_glibc217：用假 node 给出各种 pin，检查格式校验、缓存命中和镜像下载。
# 不接触网络。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
AUTO="${ROOT}/fork/scripts/mac-auto-update.sh"
BASE="$(mktemp -d "${TMPDIR:-/tmp}/orca-seed-test.XXXXXX")"
trap 'rm -rf "$BASE"' EXIT
FAILS=0
VERSION="24.21.0"
ARCHIVE="node-v${VERSION}-linux-x64-glibc-217.tar.gz"

SEED_FUNC="$(awk '/^seed_glibc217\(\) \{/,/^\}/' "$AUTO")"
if [[ -z "$SEED_FUNC" ]]; then
  echo "FAIL: seed_glibc217 not found in mac-auto-update.sh" >&2
  exit 1
fi

mkdir -p "${BASE}/bin"
cat >"${BASE}/bin/node" <<'SH'
#!/bin/bash
if [[ -n "${FAKE_NODE_FAIL:-}" ]]; then
  exit 1
fi
printf '%s\n' "$FAKE_PIN"
SH
cat >"${BASE}/bin/curl" <<'SH'
#!/bin/bash
out=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    -*) shift ;;
    *) printf '%s\n' "$1" >>"$CURL_LOG"; shift ;;
  esac
done
cp "$MIRROR_FILE" "$out"
SH
chmod +x "${BASE}/bin/node" "${BASE}/bin/curl"

sha_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

# shasum 在 Linux 上可能没有，用 sha256sum 代替；Mac 上用系统自带的。
if ! command -v shasum >/dev/null 2>&1; then
  cat >"${BASE}/bin/shasum" <<'SH'
#!/bin/bash
shift 2
sha256sum "$@"
SH
  chmod +x "${BASE}/bin/shasum"
fi

printf 'archive bytes\n' >"${BASE}/good.tar.gz"
GOOD_SHA="$(sha_of "${BASE}/good.tar.gz")"

# 跑一次 seed_glibc217，输出 "exit=<code>"，以及 finish 时的 ERROR。
run_seed() {
  local cache="$1"
  (
    export PATH="${BASE}/bin:${PATH}"
    export ORCA_NODE_RUNTIME_CACHE_DIR="$cache"
    ERROR=""
    finish() {
      printf 'ERROR=%s\n' "$ERROR"
      exit "$1"
    }
    eval "$SEED_FUNC"
    seed_glibc217
    printf 'returned\n'
  ) 2>&1 && printf 'exit=0\n' || printf 'exit=%s\n' "$?"
}

check() {
  local name="$1" out="$2" want="$3"
  if [[ "$out" != *"$want"* ]]; then
    printf 'FAIL %s: want %q in:\n%s\n' "$name" "$want" "$out" >&2
    FAILS=$((FAILS + 1))
  fi
}

fresh() {
  rm -rf "${BASE}/cache" "${BASE}/curl.log"
  mkdir -p "${BASE}/cache"
  : >"${BASE}/curl.log"
}

export CURL_LOG="${BASE}/curl.log" MIRROR_FILE="${BASE}/good.tar.gz"
unset ORCA_NODE_UNOFFICIAL_MIRROR FAKE_NODE_FAIL || true

# 缓存里已有正确的文件：直接返回，不下载。
fresh
cp "${BASE}/good.tar.gz" "${BASE}/cache/${ARCHIVE}"
out="$(FAKE_PIN="${ARCHIVE} ${GOOD_SHA} ${VERSION}" run_seed "${BASE}/cache")"
check "cached archive" "$out" "exit=0"
check "cached archive no download" "$(cat "${BASE}/curl.log")x" "x"

# 没缓存、设了镜像目录：拼出 v<version>/<archive> 并放进缓存。
fresh
out="$(ORCA_NODE_UNOFFICIAL_MIRROR="https://mirror.example/node/" FAKE_PIN="${ARCHIVE} ${GOOD_SHA} ${VERSION}" run_seed "${BASE}/cache")"
check "mirror download" "$out" "exit=0"
check "mirror url" "$(cat "${BASE}/curl.log")" "https://mirror.example/node/v${VERSION}/${ARCHIVE}"
[[ -f "${BASE}/cache/${ARCHIVE}" ]] || { echo "FAIL mirror download: archive not in cache" >&2; FAILS=$((FAILS + 1)); }

# 镜像给的文件哈希不对：报错，不留下文件。
fresh
out="$(ORCA_NODE_UNOFFICIAL_MIRROR="https://mirror.example/node" FAKE_PIN="${ARCHIVE} $(printf 'a%.0s' {1..64}) ${VERSION}" run_seed "${BASE}/cache")"
check "mirror hash mismatch" "$out" "ERROR=mirrored Node archive hashed ${GOOD_SHA}"
check "mirror hash mismatch exit" "$out" "exit=1"

# 没缓存也没镜像。
fresh
out="$(FAKE_PIN="${ARCHIVE} ${GOOD_SHA} ${VERSION}" run_seed "${BASE}/cache")"
check "missing archive" "$out" "ERROR=glibc 2.17 Node archive is missing from ${BASE}/cache/${ARCHIVE}"

# node 读不出 pin。
fresh
out="$(FAKE_NODE_FAIL=1 FAKE_PIN="" run_seed "${BASE}/cache")"
check "pin unreadable" "$out" "ERROR=cannot read the glibc 2.17 Node pin"

# 格式不对的 pin：都要在下载前失败，并说清楚是哪一项。
bad_pin() {
  local name="$1" pin="$2" want="$3"
  fresh
  local result
  result="$(ORCA_NODE_UNOFFICIAL_MIRROR="https://mirror.example/node" FAKE_PIN="$pin" run_seed "${BASE}/cache")"
  check "$name" "$result" "ERROR=${want}"
  check "$name exit" "$result" "exit=1"
  check "$name no download" "$(cat "${BASE}/curl.log")x" "x"
}
bad_pin "empty pin" "" "glibc 2.17 Node pin has an invalid version: ''"
bad_pin "short version" "node-v24.21-linux-x64-glibc-217.tar.gz ${GOOD_SHA} 24.21" \
  "glibc 2.17 Node pin has an invalid version: '24.21'"
bad_pin "version with path" "${ARCHIVE} ${GOOD_SHA} 24.21.0/../x" \
  "glibc 2.17 Node pin has an invalid version: '24.21.0/../x'"
bad_pin "short sha" "${ARCHIVE} ${GOOD_SHA:1} ${VERSION}" \
  "glibc 2.17 Node pin has an invalid sha256: '${GOOD_SHA:1}'"
bad_pin "uppercase sha" "${ARCHIVE} $(printf '%s' "$GOOD_SHA" | tr a-f A-F) ${VERSION}" \
  "glibc 2.17 Node pin has an invalid sha256"
bad_pin "non-hex sha" "${ARCHIVE} $(printf 'g%.0s' {1..64}) ${VERSION}" \
  "glibc 2.17 Node pin has an invalid sha256"
bad_pin "archive path" "../${ARCHIVE} ${GOOD_SHA} ${VERSION}" \
  "glibc 2.17 Node pin has an unexpected archive name: '../${ARCHIVE}'"
bad_pin "archive other target" "node-v${VERSION}-linux-x64.tar.gz ${GOOD_SHA} ${VERSION}" \
  "glibc 2.17 Node pin has an unexpected archive name: 'node-v${VERSION}-linux-x64.tar.gz'"
bad_pin "archive other version" "node-v24.20.0-linux-x64-glibc-217.tar.gz ${GOOD_SHA} ${VERSION}" \
  "glibc 2.17 Node pin has an unexpected archive name"
bad_pin "extra field" "${ARCHIVE} ${GOOD_SHA} ${VERSION} extra" \
  "glibc 2.17 Node pin has an unexpected archive name: '${ARCHIVE} extra'"

if [[ "$FAILS" -ne 0 ]]; then
  printf '%s seed_glibc217 case(s) failed\n' "$FAILS" >&2
  exit 1
fi
echo "mac-auto-update seed_glibc217 tests passed"
