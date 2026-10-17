#!/bin/bash
# 家里的 Mac 只构建、签名，并在 ORCA_PUBLISH_RELEASE=1 时发布到 quzard/orca。
# 不拉取上游，不变基，也不在客户机上安装。客户机用应用内更新。
# 状态写到 ~/Projects/orca-verify/sync-status.json。
set -euo pipefail

readonly SCRIPT_REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly STATUS_DIR="${HOME}/Projects/orca-verify"
readonly STATUS_JSON="${STATUS_DIR}/sync-status.json"
readonly LOCK_FILE="${STATUS_DIR}/mac-auto-update.lock"
readonly GLIBC217_ARCHIVE="node-v24.21.0-linux-x64-glibc-217.tar.gz"
readonly GLIBC217_SHA256="b1d164136d4b218d663e664f40ba5e260ebc07f90e2bd784c63a57d8c0e6aa8a"

if [[ "$(uname -s)" != Darwin ]]; then
  echo "mac-auto-update: this script runs on macOS" >&2
  exit 1
fi

mkdir -p "$STATUS_DIR"
if [[ -f "${STATUS_DIR}/sync.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${STATUS_DIR}/sync.env"
  set +a
fi

REPO="${ORCA_REPO:-$SCRIPT_REPO}"
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
INSTALLED_SHA=""
BUILT_SHA=""
PREVIOUS_RESULT=""
PREVIOUS_RELEASE=""
ALREADY_PUBLISHED=0

if [[ -f "$STATUS_JSON" ]]; then
  eval "$(python3 - "$STATUS_JSON" <<'PY'
import json, shlex, sys
try:
    data = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception:
    data = {}
for key, name in (
    ("installedSha", "INSTALLED_SHA"),
    ("builtSha", "BUILT_SHA"),
    ("result", "PREVIOUS_RESULT"),
    ("release", "PREVIOUS_RELEASE"),
    ("version", "VERSION"),
):
    print(f"{name}={shlex.quote(str(data.get(key) or ''))}")
PY
)"
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
    "builtSha": os.environ.get("STATUS_BUILT", ""),
}
with open(path, "w", encoding="utf-8") as handle:
    json.dump(doc, handle, indent=2)
    handle.write("\n")
PY
}

finish() {
  local code="$1"
  write_status
  exit "$code"
}

if [[ -f "$LOCK_FILE" ]]; then
  old="$(cat "$LOCK_FILE" 2>/dev/null || true)"
  if [[ -n "$old" ]] && kill -0 "$old" 2>/dev/null; then
    echo "mac-auto-update: already running (${old})"
    exit 0
  fi
fi
echo $$ >"$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

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
  export PATH="/opt/homebrew/bin:/usr/local/bin:${HOME}/.orbstack/bin:${PATH}"
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

publish_release() {
  if [[ "${ORCA_PUBLISH_RELEASE:-}" != 1 ]]; then
    RELEASE="skipped"
    return 0
  fi
  local yml="${REPO}/dist/latest-mac.yml"
  if [[ ! -f "$yml" ]]; then
    RELEASE="failed"
    ERROR="dist/latest-mac.yml is missing"
    return 1
  fi
  local list version
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
  if [[ -z "$version" ]]; then
    RELEASE="failed"
    ERROR="latest-mac.yml has no version"
    return 1
  fi
  local tag="v${version}"
  if gh release view "$tag" --repo quzard/orca >/dev/null 2>&1; then
    RELEASE="published"
    return 0
  fi
  local assets=("$yml")
  local name path
  while IFS= read -r name; do
    [[ -z "$name" || "$name" == "$version" ]] && continue
    path="${REPO}/dist/${name}"
    if [[ ! -f "$path" ]]; then
      RELEASE="failed"
      ERROR="release asset missing: ${name}"
      return 1
    fi
    assets+=("$path")
    if [[ -f "${path}.blockmap" ]]; then
      assets+=("${path}.blockmap")
    fi
  done < <(printf '%s\n' "$list" | tail -n +2)
  if ! gh release create "$tag" --repo quzard/orca --prerelease --target "$SHA" \
    --title "$tag" --notes "Fork build ${version} (${SHA})" "${assets[@]}"; then
    RELEASE="failed"
    ERROR="gh release create failed"
    return 1
  fi
  RELEASE="published"
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
  if [[ "$SHA" == "$BUILT_SHA" && "$PREVIOUS_RELEASE" == published ]]; then
    echo "mac-auto-update: ${SHA} is already published"
    ALREADY_PUBLISHED=1
    RELEASE="published"
    return 0
  fi
  # 变基后的 develop 不能快进。干净的 develop 检出对齐 origin，旧 HEAD 留在 reflog。
  echo "mac-auto-update: develop $(git rev-parse --short HEAD) -> $(git rev-parse --short origin/develop)"
  git reset --hard origin/develop
  seed_glibc217
  if ! bash fork/scripts/install-mac-release.sh --build-only; then
    ERROR="build failed"
    return 1
  fi
  VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "dist/mac-arm64/Orca.app/Contents/Info.plist")"
  BUILT_SHA="$SHA"
  publish_release
}

use_node24
export PATH="/opt/homebrew/bin:/usr/local/bin:${HOME}/.orbstack/bin:${PATH}"
if [[ "${ORCA_BUILD_RELEASES:-}" != 1 ]]; then
  RESULT="skipped"
  ERROR="set ORCA_BUILD_RELEASES=1 and ORCA_PUBLISH_RELEASE=1 in sync.env"
  finish 0
fi
if ! build_develop_release; then
  RESULT="failed"
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
