#!/bin/bash
# 用假 gh 走一遍发布顺序、失败补传和重复运行。不接触网络，也不读更新令牌。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PUBLISH="${ROOT}/fork/scripts/publish-mac-release.sh"
AUTO="${ROOT}/fork/scripts/mac-auto-update.sh"
SHA="0123456789abcdef0123456789abcdef01234567"
VERSION="1.4.228-local.1730000000000.0123456789ab"
TAG="v${VERSION}"
ZIP_NAME="Orca-${VERSION}-arm64-mac.zip"
ZIP_X64_NAME="Orca-${VERSION}-mac.zip"
DMG_NAME="orca-macos-arm64.dmg"
ZIP_SHA="ZIPSHA512VALUE+abc="
DMG_SHA="DMGSHA512VALUE+def="
SECRET_A="ghp_envtoken12345"
SECRET_B="github_pat_envtoken12345"
FAILS=0
CASE=""
CASE_BAD=0
BASE="$(mktemp -d "${TMPDIR:-/tmp}/orca-publish-test.XXXXXX")"
FAKE_BIN="${BASE}/bin"
STATE="${BASE}/state"
DIST=""
LAST_OUT=""
LAST_ERR=""
LAST_CODE=""

cleanup() {
  rm -rf "$BASE"
}
trap cleanup EXIT

fail() {
  CASE_BAD=1
  printf 'FAIL %s: %s\n' "$CASE" "$1" >&2
  if [[ -n "$LAST_OUT" ]]; then
    printf 'stdout:\n%s\n' "$LAST_OUT" >&2
  fi
  if [[ -n "$LAST_ERR" && -f "$LAST_ERR" ]]; then
    printf 'stderr:\n%s\n' "$(cat "$LAST_ERR")" >&2
  fi
  if [[ -f "${STATE}/trace" ]]; then
    printf 'trace:\n%s\n' "$(cat "${STATE}/trace")" >&2
  fi
  FAILS=$((FAILS + 1))
}

ok() {
  if [[ "$CASE_BAD" == 0 ]]; then
    printf 'ok %s\n' "$CASE"
  fi
  CASE_BAD=0
}

bash -n "$PUBLISH"
bash -n "$AUTO"

if grep -E -q 'stablyai|github-update-token|safeStorage' "$PUBLISH"; then
  CASE="script boundaries"
  fail "publish script mentions a forbidden target or token store"
else
  CASE="script boundaries"
  ok
fi

mkdir -p "$FAKE_BIN"
cat >"${FAKE_BIN}/gh" <<'EOF'
#!/bin/bash
set -euo pipefail
STATE="${ORCA_FAKE_GH_STATE:?}"
mkdir -p "${STATE}/assets" "${STATE}/meta"
trace="${STATE}/trace"
sub=""
if [[ "${1:-}" == release ]]; then
  shift
  sub="${1:-}"
  shift || true
fi
tag=""
repo=""
target=""
pattern=""
dir=""
clobber=0
draft_flag=""
files=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      repo="${2:-}"
      shift 2
      ;;
    --target)
      target="${2:-}"
      shift 2
      ;;
    --title|--notes|--json)
      shift 2
      ;;
    --pattern)
      pattern="${2:-}"
      shift 2
      ;;
    --dir)
      dir="${2:-}"
      shift 2
      ;;
    --output|-O)
      shift 2
      ;;
    --draft)
      draft_flag=true
      shift
      ;;
    --draft=false)
      draft_flag=false
      shift
      ;;
    --draft=true)
      draft_flag=true
      shift
      ;;
    --clobber)
      clobber=1
      shift
      ;;
    --prerelease|--latest=false)
      shift
      ;;
    --*)
      shift
      ;;
    *)
      if [[ -z "$tag" ]]; then
        tag="$1"
      else
        files+=("$1")
      fi
      shift
      ;;
  esac
done
if [[ "$repo" != "quzard/orca" ]]; then
  printf 'unexpected repo\n' >&2
  exit 1
fi
asset_path() {
  printf '%s\n' "${STATE}/assets/$(basename "$1")"
}
case "$sub" in
  view)
    printf 'view %s\n' "$tag" >>"$trace"
    if [[ "${FAIL_VIEW_SECRET:-}" == 1 ]]; then
      printf 'denied ghp_secretvalue\n' >&2
      exit 1
    fi
    if [[ ! -f "${STATE}/meta/exists" ]]; then
      printf 'release not found\n' >&2
      exit 1
    fi
    python3 - "${STATE}/assets" "${STATE}/meta/draft" <<'PY'
import json, os, sys
asset_dir, draft_path = sys.argv[1], sys.argv[2]
draft = open(draft_path, encoding="utf-8").read().strip() == "1"
assets = []
for name in sorted(os.listdir(asset_dir)):
    path = os.path.join(asset_dir, name)
    if os.path.isfile(path):
        assets.append({"name": name, "size": os.path.getsize(path), "state": "uploaded"})
print(json.dumps({"isDraft": draft, "assets": assets}))
PY
    ;;
  create)
    printf 'create %s %s\n' "$tag" "$target" >>"$trace"
    if [[ -f "${STATE}/meta/exists" ]]; then
      printf 'release already exists\n' >&2
      exit 1
    fi
    if [[ "$draft_flag" != true ]]; then
      printf 'create was not a draft\n' >&2
      exit 1
    fi
    printf '1\n' >"${STATE}/meta/exists"
    printf '1\n' >"${STATE}/meta/draft"
    ;;
  upload)
    if [[ ${#files[@]} -ne 1 ]]; then
      printf 'expected one upload file\n' >&2
      exit 1
    fi
    name="$(basename "${files[0]}")"
    printf 'upload %s %s\n' "$clobber" "$name" >>"$trace"
    fail_names=",${FAIL_UPLOAD:-},"
    if [[ "$fail_names" == *",${name},"* ]]; then
      printf 'upload failed\n' >&2
      exit 1
    fi
    dest="$(asset_path "$name")"
    if [[ -f "$dest" && "$clobber" != 1 ]]; then
      printf 'asset already exists\n' >&2
      exit 1
    fi
    cp -f "${files[0]}" "$dest"
    ;;
  edit)
    printf 'edit %s %s\n' "$tag" "$draft_flag" >>"$trace"
    if [[ "${FAIL_EDIT:-}" == 1 ]]; then
      printf 'edit failed\n' >&2
      exit 1
    fi
    if [[ "$draft_flag" != false ]]; then
      printf 'edit did not publish\n' >&2
      exit 1
    fi
    printf '0\n' >"${STATE}/meta/draft"
    ;;
  download)
    printf 'download %s %s\n' "$tag" "$pattern" >>"$trace"
    src="${STATE}/assets/${pattern}"
    if [[ ! -f "$src" ]]; then
      printf 'release not found\n' >&2
      exit 1
    fi
    mkdir -p "$dir"
    cp -f "$src" "${dir}/${pattern}"
    ;;
  *)
    printf 'unknown gh command\n' >&2
    exit 1
    ;;
esac
EOF
chmod 755 "${FAKE_BIN}/gh" "$PUBLISH"

reset_state() {
  rm -rf "$STATE"
  mkdir -p "${STATE}/assets" "${STATE}/meta"
  DIST="$(mktemp -d "${BASE}/dist.XXXXXX")"
}

write_yml() {
  local extra="${1:-}"
  cat >"${DIST}/latest-mac.yml" <<EOF
version: ${VERSION}
files:
  - url: ${ZIP_NAME}
    sha512: ${ZIP_SHA}
    size: 11
    blockMapSize: 4
${extra}  - url: ${DMG_NAME}
    sha512: ${DMG_SHA}
    size: 12
    blockMapSize: 5
path: ${ZIP_NAME}
sha512: ${ZIP_SHA}
releaseDate: '2026-10-17T12:00:00.000Z'
EOF
}

write_bytes() {
  local path="$1" content="$2"
  printf '%s' "$content" >"$path"
}

seed_local() {
  local with_x64="${1:-0}" with_dmg="${2:-1}"
  write_bytes "${DIST}/${ZIP_NAME}" "arm-zip-bytes"
  write_bytes "${DIST}/${ZIP_NAME}.blockmap" "arm-map"
  if [[ "$with_x64" == 1 ]]; then
    write_bytes "${DIST}/${ZIP_X64_NAME}" "x64-zip-bytes"
    write_bytes "${DIST}/${ZIP_X64_NAME}.blockmap" "x64-map"
  fi
  if [[ "$with_dmg" == 1 ]]; then
    write_bytes "${DIST}/${DMG_NAME}" "dmg-bytes-1"
    write_bytes "${DIST}/${DMG_NAME}.blockmap" "dmg-map"
  fi
}

run_publish() {
  local err
  err="$(mktemp "${BASE}/err.XXXXXX")"
  set +e
  LAST_OUT="$(
    PATH="${FAKE_BIN}:${PATH}" \
      ORCA_FAKE_GH_STATE="$STATE" \
      GH_TOKEN="$SECRET_A" \
      GITHUB_TOKEN="$SECRET_B" \
      FAIL_UPLOAD="${FAIL_UPLOAD:-}" \
      FAIL_EDIT="${FAIL_EDIT:-}" \
      FAIL_VIEW_SECRET="${FAIL_VIEW_SECRET:-}" \
      bash "$PUBLISH" --dist "$DIST" --sha "$SHA" 2>"$err"
  )"
  LAST_CODE=$?
  set -e
  LAST_ERR="$err"
}

field() {
  printf '%s\n' "$LAST_OUT" | awk -F= -v key="$1" '$1 == key { print substr($0, index($0, "=") + 1) }'
}

assert_no_secret() {
  local blob
  blob="$(printf '%s\n' "$LAST_OUT"; cat "$LAST_ERR"; if [[ -f "${STATE}/trace" ]]; then cat "${STATE}/trace"; fi)"
  if printf '%s\n' "$blob" | grep -E -q 'ghp_|github_pat_'; then
    fail "token appeared in output or trace"
    return 1
  fi
  return 0
}

assert_release() {
  local want_release="$1" want_code="$2"
  local got
  got="$(field release)"
  if [[ "$LAST_CODE" != "$want_code" ]]; then
    fail "exit ${LAST_CODE}, want ${want_code}"
    return 1
  fi
  if [[ "$got" != "$want_release" ]]; then
    fail "release ${got}, want ${want_release}"
    return 1
  fi
  return 0
}

assert_trace() {
  local expected="$1" actual=""
  if [[ -f "${STATE}/trace" ]]; then
    # 命令替换会吃掉末尾换行，补一个标记再剥掉，才能和预期逐字比较。
    actual="$(cat "${STATE}/trace"; printf x)"
    actual="${actual%x}"
  fi
  if [[ "$actual" != "$expected" ]]; then
    fail "trace mismatch"
    printf 'expected:\n[%s]\nactual:\n[%s]\n' "$expected" "$actual" >&2
    return 1
  fi
  return 0
}

clear_trace() {
  rm -f "${STATE}/trace"
}

published_flag() {
  cat "${STATE}/meta/draft"
}

# 首次发布：zip 和 blockmap，然后只含 zip 的 yml，公开，最后才是 dmg。
CASE="first publish order"
reset_state
write_yml
seed_local
unset FAIL_UPLOAD FAIL_EDIT FAIL_VIEW_SECRET || true
run_publish
assert_no_secret || true
assert_release published 0 || true
assert_trace "view ${TAG}
create ${TAG} ${SHA}
upload 0 ${ZIP_NAME}
upload 0 ${ZIP_NAME}.blockmap
upload 0 latest-mac.yml
edit ${TAG} false
upload 0 ${DMG_NAME}
upload 0 ${DMG_NAME}.blockmap
" || true
if [[ "$(published_flag)" != 0 ]]; then
  fail "release stayed a draft"
fi
if grep -q "$DMG_NAME" "${STATE}/assets/latest-mac.yml"; then
  fail "published latest-mac.yml names the dmg"
fi
if ! grep -q "$ZIP_NAME" "${STATE}/assets/latest-mac.yml"; then
  fail "published latest-mac.yml dropped the zip"
fi
if ! grep -q "$DMG_NAME" "${DIST}/latest-mac.yml"; then
  fail "dist latest-mac.yml was rewritten"
fi
ok

# 再跑一次：不新建 release，也不重传 zip / dmg。
CASE="rerun is a no-op"
clear_trace
run_publish
assert_no_secret || true
assert_release published 0 || true
assert_trace "view ${TAG}
download ${TAG} latest-mac.yml
" || true
ok

# dmg 上传失败后 release 保持公开，下一轮只补 dmg。
CASE="dmg upload failure"
reset_state
write_yml
seed_local
FAIL_UPLOAD="$DMG_NAME"
run_publish
assert_no_secret || true
assert_release published-dmg-pending 20 || true
if [[ "$(field error)" != "published, dmg pending: gh release upload failed: ${DMG_NAME}" ]]; then
  fail "error was [$(field error)]"
fi
if [[ "$(published_flag)" != 0 ]]; then
  fail "failure unpublished the release"
fi
if [[ ! -f "${STATE}/assets/${ZIP_NAME}" || -f "${STATE}/assets/${DMG_NAME}" ]]; then
  fail "zip/dmg asset set is wrong after the failed upload"
fi
clear_trace
unset FAIL_UPLOAD
run_publish
assert_release published 0 || true
assert_trace "view ${TAG}
download ${TAG} latest-mac.yml
upload 0 ${DMG_NAME}
upload 0 ${DMG_NAME}.blockmap
" || true
if [[ -f "${STATE}/assets/${DMG_NAME}" && -f "${STATE}/assets/${DMG_NAME}.blockmap" ]]; then
  :
else
  fail "retry did not store the dmg"
fi
ok

# 公开失败时不要开始传 dmg，release 保持草稿。
CASE="publish edit failure"
reset_state
write_yml
seed_local
FAIL_EDIT=1
run_publish
assert_release failed 1 || true
if [[ "$(published_flag)" != 1 ]]; then
  fail "draft was published despite edit failure"
fi
if [[ -f "${STATE}/assets/${DMG_NAME}" ]]; then
  fail "dmg was uploaded before publish"
fi
if grep -q 'upload 0 '"${DMG_NAME}" "${STATE}/trace"; then
  fail "trace uploaded the dmg"
fi
unset FAIL_EDIT
ok

# 已公开、清单仍点到 dmg、dmg 还不在：先换成只含 zip 的清单，再补 dmg。
CASE="repair published manifest before dmg"
reset_state
write_yml
seed_local
printf '1\n' >"${STATE}/meta/exists"
printf '0\n' >"${STATE}/meta/draft"
cp "${DIST}/${ZIP_NAME}" "${STATE}/assets/${ZIP_NAME}"
cp "${DIST}/${ZIP_NAME}.blockmap" "${STATE}/assets/${ZIP_NAME}.blockmap"
cp "${DIST}/latest-mac.yml" "${STATE}/assets/latest-mac.yml"
run_publish
assert_release published 0 || true
assert_trace "view ${TAG}
download ${TAG} latest-mac.yml
upload 1 latest-mac.yml
upload 0 ${DMG_NAME}
upload 0 ${DMG_NAME}.blockmap
" || true
if grep -q "$DMG_NAME" "${STATE}/assets/latest-mac.yml"; then
  fail "repaired latest-mac.yml still names the dmg"
fi
ok

# 已经齐的完整清单不要用 --clobber 重传。
CASE="complete release is kept"
reset_state
write_yml
seed_local
printf '1\n' >"${STATE}/meta/exists"
printf '0\n' >"${STATE}/meta/draft"
cp "${DIST}/${ZIP_NAME}" "${STATE}/assets/${ZIP_NAME}"
cp "${DIST}/${ZIP_NAME}.blockmap" "${STATE}/assets/${ZIP_NAME}.blockmap"
cp "${DIST}/${DMG_NAME}" "${STATE}/assets/${DMG_NAME}"
cp "${DIST}/${DMG_NAME}.blockmap" "${STATE}/assets/${DMG_NAME}.blockmap"
cp "${DIST}/latest-mac.yml" "${STATE}/assets/latest-mac.yml"
run_publish
assert_release published 0 || true
assert_trace "view ${TAG}
download ${TAG} latest-mac.yml
" || true
if ! grep -q "$DMG_NAME" "${STATE}/assets/latest-mac.yml"; then
  fail "complete latest-mac.yml was replaced"
fi
ok

# 远端 zip 大小不对时用 --clobber 换掉，不另建 release。
CASE="clobber mismatched zip"
reset_state
write_yml
seed_local
printf '1\n' >"${STATE}/meta/exists"
printf '0\n' >"${STATE}/meta/draft"
printf 'x' >"${STATE}/assets/${ZIP_NAME}"
cp "${DIST}/${ZIP_NAME}.blockmap" "${STATE}/assets/${ZIP_NAME}.blockmap"
cp "${DIST}/${DMG_NAME}" "${STATE}/assets/${DMG_NAME}"
cp "${DIST}/${DMG_NAME}.blockmap" "${STATE}/assets/${DMG_NAME}.blockmap"
cp "${DIST}/latest-mac.yml" "${STATE}/assets/latest-mac.yml"
run_publish
assert_release published 0 || true
assert_trace "view ${TAG}
upload 1 ${ZIP_NAME}
download ${TAG} latest-mac.yml
" || true
if ! cmp -s "${DIST}/${ZIP_NAME}" "${STATE}/assets/${ZIP_NAME}"; then
  fail "zip was not replaced"
fi
ok

# 两个 zip 都要在 yml 之前传完。
CASE="both zips before yml"
reset_state
write_yml "  - url: ${ZIP_X64_NAME}
    sha512: X64SHA512VALUE=
    size: 10
    blockMapSize: 3
"
seed_local 1 1
run_publish
assert_release published 0 || true
assert_trace "view ${TAG}
create ${TAG} ${SHA}
upload 0 ${ZIP_NAME}
upload 0 ${ZIP_NAME}.blockmap
upload 0 ${ZIP_X64_NAME}
upload 0 ${ZIP_X64_NAME}.blockmap
upload 0 latest-mac.yml
edit ${TAG} false
upload 0 ${DMG_NAME}
upload 0 ${DMG_NAME}.blockmap
" || true
if grep -q "$DMG_NAME" "${STATE}/assets/latest-mac.yml"; then
  fail "multi-zip manifest names the dmg"
fi
if ! grep -q "$ZIP_X64_NAME" "${STATE}/assets/latest-mac.yml"; then
  fail "multi-zip manifest dropped x64"
fi
ok

# 本地没有 dmg 时更新仍然公开，状态记 pending。
CASE="dmg missing locally"
reset_state
write_yml
seed_local 0 0
run_publish
assert_release published-dmg-pending 20 || true
if [[ "$(published_flag)" != 0 ]]; then
  fail "missing dmg left the release as a draft"
fi
if ! printf '%s\n' "$(field error)" | grep -q "$DMG_NAME"; then
  fail "pending error did not name the dmg"
fi
ok

# 没有 zip blockmap 时不要创建 release。
CASE="missing zip blockmap"
reset_state
write_yml
write_bytes "${DIST}/${ZIP_NAME}" "arm-zip-bytes"
write_bytes "${DIST}/${DMG_NAME}" "dmg-bytes-1"
write_bytes "${DIST}/${DMG_NAME}.blockmap" "dmg-map"
run_publish
assert_release failed 1 || true
if [[ -f "${STATE}/meta/exists" ]]; then
  fail "release was created without a zip blockmap"
fi
if ! printf '%s\n' "$(field error)" | grep -q "${ZIP_NAME}.blockmap"; then
  fail "error did not name the zip blockmap"
fi
ok

# gh 把令牌打进 stderr 时，脚本不能跟着打出来。
CASE="redact gh token"
reset_state
write_yml
seed_local
FAIL_VIEW_SECRET=1
run_publish
assert_release failed 1 || true
assert_no_secret || true
if ! grep -q 'details omitted' "$LAST_ERR"; then
  fail "token failure was not redacted"
fi
unset FAIL_VIEW_SECRET
ok

if [[ "$FAILS" -ne 0 ]]; then
  printf '%s case(s) failed\n' "$FAILS" >&2
  exit 1
fi
printf 'publish-mac-release tests passed\n'
