#!/bin/bash
# 家里的 Mac 只构建、签名，并在 ORCA_PUBLISH_RELEASE=1 时发布到 quzard/orca。
# 不拉取上游，不变基，也不在客户机上安装。客户机用应用内更新。
# 状态写到 ~/Projects/orca-verify/sync-status.json。
set -euo pipefail

readonly STATUS_DIR="${HOME}/Projects/orca-verify"
readonly INSTALLED_SCRIPT="${STATUS_DIR}/bin/mac-auto-update.sh"
readonly STATUS_JSON="${STATUS_DIR}/sync-status.json"
readonly LOCK_FILE="${STATUS_DIR}/mac-auto-update.lock"
readonly GLIBC217_ARCHIVE="node-v24.21.0-linux-x64-glibc-217.tar.gz"
readonly GLIBC217_SHA256="b1d164136d4b218d663e664f40ba5e260ebc07f90e2bd784c63a57d8c0e6aa8a"
readonly RELEASE_COMPLETE="published"
readonly RELEASE_DMG_PENDING="published-dmg-pending"
readonly PUBLISH_DMG_PENDING_EXIT=20

if [[ "$(uname -s)" != Darwin ]]; then
  echo "mac-auto-update: this script runs on macOS" >&2
  exit 1
fi

# 仓库内的副本在 git reset 时会被换掉。先导出仓库路径，再从临时文件重新执行。
if [[ -z "${ORCA_REPO:-}" ]]; then
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [[ -f "${script_dir}/install-mac-release.sh" ]]; then
    ORCA_REPO="$(cd "${script_dir}/../.." && pwd)"
  fi
fi
if [[ "${ORCA_AUTO_UPDATE_REEXECED:-}" != 1 ]]; then
  copy="$(mktemp "${TMPDIR:-/tmp}/orca-auto-update.XXXXXX")"
  cp "${BASH_SOURCE[0]}" "$copy"
  chmod 700 "$copy"
  export ORCA_AUTO_UPDATE_REEXECED=1
  export ORCA_AUTO_UPDATE_SCRIPT_COPY="$copy"
  if [[ -n "${ORCA_REPO:-}" ]]; then
    export ORCA_REPO
  fi
  exec /bin/bash "$copy" "$@"
fi
# 重新执行后立刻登记。拿锁之前退出（缺少 ORCA_REPO、已有实例）也要删掉临时副本。
trap 'rm -f "${ORCA_AUTO_UPDATE_SCRIPT_COPY:-}"' EXIT
if [[ -z "${ORCA_REPO:-}" ]]; then
  echo "mac-auto-update: ORCA_REPO is not set" >&2
  exit 1
fi

mkdir -p "$STATUS_DIR"
if [[ -f "${STATUS_DIR}/sync.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${STATUS_DIR}/sync.env"
  set +a
fi

REPO="$ORCA_REPO"
export http_proxy="${http_proxy:-http://127.0.0.1:6152}"
export https_proxy="${https_proxy:-http://127.0.0.1:6152}"
export ALL_PROXY="${ALL_PROXY:-http://127.0.0.1:6152}"
export HTTP_PROXY="$http_proxy"
export HTTPS_PROXY="$https_proxy"
export NODE_USE_ENV_PROXY=1
export ORCA_BACKGROUND_LAUNCH=1
export ORCA_NODE_RUNTIME_CACHE_DIR="${ORCA_NODE_RUNTIME_CACHE_DIR:-${STATUS_DIR}/node-runtime-cache}"
mkdir -p "$ORCA_NODE_RUNTIME_CACHE_DIR"

STARTED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
RESULT="failed"
SHA=""
VERSION=""
ERROR=""
RELEASE="skipped"
GH_AUTH=""
INSTALLED_SHA=""
BUILT_SHA=""
PREVIOUS_SHA=""
PREVIOUS_VERSION=""
PREVIOUS_RESULT=""
PREVIOUS_RELEASE=""
ALREADY_PUBLISHED=0
BUILD_PGID=""

if [[ -f "$STATUS_JSON" ]]; then
  eval "$(python3 - "$STATUS_JSON" <<'PY'
import json, shlex, sys
try:
    data = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception:
    data = {}
for key, name in (
    ("sha", "PREVIOUS_SHA"),
    ("installedSha", "INSTALLED_SHA"),
    ("builtSha", "BUILT_SHA"),
    ("result", "PREVIOUS_RESULT"),
    ("release", "PREVIOUS_RELEASE"),
    ("version", "VERSION"),
):
    print(f"{name}={shlex.quote(str(data.get(key) or ''))}")
PY
)"
  PREVIOUS_VERSION="$VERSION"
fi

write_status() {
  FINISHED="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  STATUS_PATH="$STATUS_JSON" \
    STATUS_SHA="$SHA" \
    STATUS_VERSION="$VERSION" \
    STATUS_RESULT="$RESULT" \
    STATUS_STARTED="$STARTED" \
    STATUS_FINISHED="$FINISHED" \
    STATUS_ERROR="$ERROR" \
    STATUS_RELEASE="$RELEASE" \
    STATUS_GH_AUTH="$GH_AUTH" \
    STATUS_INSTALLED="$INSTALLED_SHA" \
    STATUS_BUILT="${BUILT_SHA:-}" \
    python3 - <<'PY'
import json, os
path = os.environ["STATUS_PATH"]
doc = {
    "sha": os.environ.get("STATUS_SHA", ""),
    "installedSha": os.environ.get("STATUS_INSTALLED", ""),
    "version": os.environ.get("STATUS_VERSION", ""),
    "result": os.environ.get("STATUS_RESULT", ""),
    "startedAt": os.environ.get("STATUS_STARTED", ""),
    "finishedAt": os.environ.get("STATUS_FINISHED", ""),
    "error": os.environ.get("STATUS_ERROR", ""),
    "release": os.environ.get("STATUS_RELEASE", ""),
    "ghAuth": os.environ.get("STATUS_GH_AUTH", ""),
    "builtSha": os.environ.get("STATUS_BUILT", ""),
}
with open(path, "w", encoding="utf-8") as handle:
    json.dump(doc, handle, indent=2)
    handle.write("\n")
PY
}

# 成功之后才用 mv 换掉安装副本。正在跑的是临时文件，mv 不会截断它。
refresh_installed_script() {
  local source="${REPO}/fork/scripts/mac-auto-update.sh"
  if [[ ! -f "$source" || "$source" -ef "$INSTALLED_SCRIPT" ]]; then
    return 0
  fi
  mkdir -p "$(dirname "$INSTALLED_SCRIPT")"
  cp "$source" "${INSTALLED_SCRIPT}.next"
  chmod 755 "${INSTALLED_SCRIPT}.next"
  mv -f "${INSTALLED_SCRIPT}.next" "$INSTALLED_SCRIPT"
}

finish() {
  local code="$1" refresh=0
  # dmg 还在补传时也换上脚本。这一轮已经把更新公开了，下一轮要靠这份脚本继续传 dmg。
  if [[ "$RESULT" != skipped && "$code" -eq 0 ]]; then
    refresh=1
  fi
  if [[ "$RESULT" != skipped && "$RELEASE" == "$RELEASE_DMG_PENDING" ]]; then
    refresh=1
  fi
  if [[ "$refresh" -eq 1 ]]; then
    refresh_installed_script || true
  fi
  write_status
  exit "$code"
}

# 原子锁：两次运行不能同时写 dist/。进程还在就退出，不改状态文件。
acquire_lock() {
  local tries=0 old
  while [[ "$tries" -lt 5 ]]; do
    if (set -o noclobber; echo $$ >"$LOCK_FILE") 2>/dev/null; then
      return 0
    fi
    old="$(cat "$LOCK_FILE" 2>/dev/null || true)"
    if [[ -n "$old" ]] && kill -0 "$old" 2>/dev/null; then
      echo "mac-auto-update: already running (${old})"
      exit 0
    fi
    rm -f "$LOCK_FILE"
    tries=$((tries + 1))
  done
  echo "mac-auto-update: lock busy" >&2
  exit 0
}

# 结束独立进程组里的 electron-builder/node，避免孤儿进程占着 dist/。
stop_build_group() {
  local pgid="$1"
  [[ -z "$pgid" ]] && return 0
  kill -- -"$pgid" 2>/dev/null || true
  kill -KILL -- -"$pgid" 2>/dev/null || true
}

acquire_lock
trap 'stop_build_group "${BUILD_PGID:-}"; rm -f "$LOCK_FILE" "${ORCA_AUTO_UPDATE_SCRIPT_COPY:-}"' EXIT

# launchd 没有登录 shell 的 PATH。~/.orbstack/bin 可能不存在，OrbStack 的 docker 在应用包的 xbin。
readonly MAC_TOOL_PATH="/opt/homebrew/bin:/usr/local/bin:${HOME}/.orbstack/bin:/Applications/OrbStack.app/Contents/MacOS/xbin"

use_node24() {
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [[ -s "$NVM_DIR/nvm.sh" ]]; then
    # shellcheck disable=SC1091
    source "$NVM_DIR/nvm.sh"
    nvm use 24
  fi
  hash -r
  if [[ "$(node -p 'process.versions.node.split(".")[0]')" != 24 ]]; then
    ERROR="Node 24 is required"
    finish 1
  fi
  if ! command -v pnpm >/dev/null 2>&1; then
    corepack enable
    corepack prepare pnpm@12.8.1 --activate
  fi
  export PATH="${MAC_TOOL_PATH}:${PATH}"
}

seed_glibc217() {
  local dest="${ORCA_NODE_RUNTIME_CACHE_DIR}/${GLIBC217_ARCHIVE}"
  if [[ -f "$dest" ]] && [[ "$(shasum -a 256 "$dest" | awk '{print $1}')" == "$GLIBC217_SHA256" ]]; then
    return 0
  fi
  if [[ -z "${ORCA_NODE_UNOFFICIAL_MIRROR:-}" ]]; then
    ERROR="glibc 2.17 Node archive is missing from ${dest}"
    finish 1
  fi
  local url="$ORCA_NODE_UNOFFICIAL_MIRROR"
  case "$url" in
    *.tar.gz) ;;
    *) url="${url%/}/v24.21.0/${GLIBC217_ARCHIVE}" ;;
  esac
  curl -fsSL "$url" -o "${dest}.partial"
  local actual
  actual="$(shasum -a 256 "${dest}.partial" | awk '{print $1}')"
  if [[ "$actual" != "$GLIBC217_SHA256" ]]; then
    rm -f "${dest}.partial"
    ERROR="mirrored Node archive hashed ${actual}"
    finish 1
  fi
  mv "${dest}.partial" "$dest"
}

etime_to_seconds() {
  local raw="$1" rest days=0 h m s
  raw="${raw#"${raw%%[![:space:]]*}"}"
  if [[ "$raw" == *-* ]]; then
    days="${raw%%-*}"
    rest="${raw#*-}"
  else
    rest="$raw"
  fi
  IFS=: read -r h m s <<<"$rest"
  if [[ -z "${s:-}" ]]; then
    s="$m"
    m="$h"
    h=0
  fi
  echo $((10#$days * 86400 + 10#$h * 3600 + 10#$m * 60 + 10#$s))
}

# 只看这次构建进程组里的 codesign。
codesign_in_group() {
  local pid="$1" group="$2" pgid
  pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d '[:space:]')"
  [[ -n "$pgid" && "$pgid" == "$group" ]]
}

# launchd 里 codesign 等钥匙串确认时会停住。超时则结束整个构建进程组。
watch_codesign_children() {
  local group="$1"
  local limit="$2"
  local marker="$3"
  local pid etime seconds
  while kill -0 "$group" 2>/dev/null; do
    while read -r pid etime; do
      [[ -z "$pid" || -z "$etime" ]] && continue
      codesign_in_group "$pid" "$group" || continue
      seconds="$(etime_to_seconds "$etime")"
      if [[ "$seconds" -ge "$limit" ]]; then
        printf '%s\n' "codesign timed out after ${limit}s waiting for the Orca Local Signing key. Run ${INSTALLED_SCRIPT} once in Terminal and click Always Allow." >"$marker"
        stop_build_group "$group"
        return 0
      fi
    done < <(ps -axo pid=,etime=,command= | awk '/codesign/ && $0 !~ /awk/ { print $1, $2 }')
    sleep 5
  done
}

run_build_with_codesign_watch() {
  local log="${STATUS_DIR}/mac-build.log"
  local marker="${STATUS_DIR}/codesign-failure.txt"
  local limit="${ORCA_CODESIGN_TIMEOUT_SECONDS:-600}"
  local build_pid watch_pid code=0
  rm -f "$marker"
  : >"$log"
  # macOS 没有 setsid。perl setpgrp 让这次构建独占一个进程组。
  perl -e 'setpgrp(0,0) or die $!; exec @ARGV or die $!' /bin/bash fork/scripts/install-mac-release.sh --build-only >"$log" 2>&1 &
  build_pid=$!
  BUILD_PGID="$build_pid"
  watch_codesign_children "$build_pid" "$limit" "$marker" &
  watch_pid=$!
  wait "$build_pid" || code=$?
  kill "$watch_pid" 2>/dev/null || true
  wait "$watch_pid" 2>/dev/null || true
  stop_build_group "$build_pid"
  BUILD_PGID=""
  if [[ -f "$marker" ]]; then
    ERROR="$(cat "$marker")"
    return 1
  fi
  if [[ "$code" -ne 0 ]]; then
    if grep -E -q 'errSecInternalComponent|errSecAuthFailed|errSecInteractionNotAllowed|User interaction is not allowed' "$log"; then
      ERROR="codesign was denied keychain access for Orca Local Signing. Run ${INSTALLED_SCRIPT} once in Terminal and click Always Allow."
    else
      ERROR="build failed"
    fi
    return 1
  fi
}

# 不在这里 finish。失败时保留已有的 release，另记 ghAuth。
require_gh_auth() {
  if [[ "${ORCA_PUBLISH_RELEASE:-}" != 1 ]]; then
    return 0
  fi
  if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
    GH_AUTH="ok"
    return 0
  fi
  return 1
}

record_gh_auth_failure() {
  local tried="$SHA"
  ERROR="gh auth status failed. The home Mac needs gh logged in with write access to quzard/orca. Clients do not need gh."
  if [[ -n "$tried" ]]; then
    ERROR="${ERROR} Not publishing ${tried}."
  fi
  RESULT="failed"
  GH_AUTH="failed"
  # 保留上一次的 release。没构建过的新 sha 不继承 published。
  RELEASE="$PREVIOUS_RELEASE"
  if [[ "$BUILT_SHA" != "$tried" ]]; then
    SHA="$PREVIOUS_SHA"
    VERSION="$PREVIOUS_VERSION"
  fi
}

publish_release() {
  if [[ "${ORCA_PUBLISH_RELEASE:-}" != 1 ]]; then
    RELEASE="skipped"
    return 0
  fi
  local out code=0 line value
  # zip 和 latest-mac.yml 先公开，dmg 失败只记 pending，不把这次构建标成没发布。
  out="$(bash "${REPO}/fork/scripts/publish-mac-release.sh" --dist "${REPO}/dist" --sha "$SHA")" || code=$?
  while IFS= read -r line; do
    case "$line" in
      release=*) RELEASE="${line#release=}" ;;
      version=*)
        value="${line#version=}"
        if [[ -n "$value" ]]; then
          VERSION="$value"
        fi
        ;;
      error=*) ERROR="${line#error=}" ;;
    esac
  done <<<"$out"
  if [[ "$code" -eq 0 ]]; then
    ERROR=""
    if [[ -z "$RELEASE" || "$RELEASE" == skipped ]]; then
      RELEASE="$RELEASE_COMPLETE"
    fi
    return 0
  fi
  if [[ "$code" -eq "$PUBLISH_DMG_PENDING_EXIT" ]]; then
    if [[ -z "$RELEASE" || "$RELEASE" == skipped ]]; then
      RELEASE="$RELEASE_DMG_PENDING"
    fi
    if [[ -z "$ERROR" ]]; then
      ERROR="published, dmg pending"
    fi
    return 1
  fi
  if [[ -z "$RELEASE" || "$RELEASE" == skipped ]]; then
    RELEASE="failed"
  fi
  if [[ -z "$ERROR" ]]; then
    ERROR="publish failed"
  fi
  return 1
}

# dist 里的版本后缀带 12 位 sha，且 yml 点名的文件都在，才算这次构建还在。
dist_matches_sha() {
  local sha="$1" yml="${REPO}/dist/latest-mac.yml" short list version name
  [[ -f "$yml" && -d "${REPO}/dist/mac-arm64/Orca.app" ]] || return 1
  short="$(printf '%.12s' "$sha")"
  list="$(python3 - "$yml" <<'PY'
import pathlib, sys
text = pathlib.Path(sys.argv[1]).read_text()
version = ""
names = []
for line in text.splitlines():
    if line.startswith("version:"):
        version = line.split(":", 1)[1].strip().strip("'\"")
    stripped = line.strip()
    if stripped.startswith("- "):
        stripped = stripped[2:].strip()
    if stripped.startswith("url:") or stripped.startswith("path:"):
        name = stripped.split(":", 1)[1].strip().strip("'\"")
        if name:
            names.append(name)
print(version)
for name in dict.fromkeys(names):
    print(name)
PY
)"
  version="$(printf '%s\n' "$list" | head -n 1)"
  [[ "$version" == *-local.*."$short" ]] || return 1
  while IFS= read -r name; do
    [[ -z "$name" || "$name" == "$version" ]] && continue
    [[ -f "${REPO}/dist/${name}" ]] || return 1
  done < <(printf '%s\n' "$list" | tail -n +2)
  VERSION="$version"
  return 0
}

# ORCA_BUILD_RELEASES=1 才构建。发布由 ORCA_PUBLISH_RELEASE=1 控制。
build_develop_release() {
  if [[ "${ORCA_BUILD_RELEASES:-}" != 1 ]]; then
    return 0
  fi
  cd "$REPO"
  if [[ -n "$(git status --porcelain)" ]]; then
    ERROR="worktree is dirty"
    return 1
  fi
  branch="$(git branch --show-current)"
  if [[ "$branch" != develop ]]; then
    ERROR="checkout is ${branch:-detached}; the builder expects develop"
    return 1
  fi
  git fetch --no-tags origin refs/heads/develop:refs/remotes/origin/develop
  SHA="$(git rev-parse origin/develop)"
  # pending 不能走这条。下一轮还要补 dmg，不能因为 sha 相同就跳过。
  if [[ "$SHA" == "$BUILT_SHA" && "$PREVIOUS_RELEASE" == "$RELEASE_COMPLETE" ]]; then
    echo "mac-auto-update: ${SHA} is already published"
    ALREADY_PUBLISHED=1
    RELEASE="published"
    return 0
  fi
  # 同一 sha 的产物还在就只补发，不再签名。gh 失败不把 release 改成 skipped。
  if dist_matches_sha "$SHA"; then
    echo "mac-auto-update: reusing dist for ${SHA}"
    if ! require_gh_auth; then
      record_gh_auth_failure
      return 1
    fi
    BUILT_SHA="$SHA"
    publish_release || return 1
    return 0
  fi
  if ! require_gh_auth; then
    record_gh_auth_failure
    return 1
  fi
  # 干净的 develop 检出对齐 origin/develop，旧 HEAD 留在 reflog。
  echo "mac-auto-update: develop $(git rev-parse --short HEAD) -> $(git rev-parse --short origin/develop)"
  git reset --hard origin/develop
  seed_glibc217
  if ! run_build_with_codesign_watch; then
    return 1
  fi
  VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "dist/mac-arm64/Orca.app/Contents/Info.plist")"
  BUILT_SHA="$SHA"
  publish_release || return 1
}

use_node24
if [[ "${ORCA_BUILD_RELEASES:-}" != 1 ]]; then
  RESULT="skipped"
  ERROR="set ORCA_BUILD_RELEASES=1 and ORCA_PUBLISH_RELEASE=1 in sync.env"
  finish 0
fi
if ! build_develop_release; then
  if [[ "$RELEASE" == "$RELEASE_DMG_PENDING" ]]; then
    RESULT="$RELEASE_DMG_PENDING"
  else
    RESULT="failed"
  fi
  echo "mac-auto-update: ${ERROR}" >&2
  finish 1
fi
if [[ "$ALREADY_PUBLISHED" == 1 ]]; then
  RESULT="up-to-date"
  finish 0
fi
if [[ "$RELEASE" == published ]]; then
  RESULT="published"
  finish 0
fi
RESULT="built"
finish 0
