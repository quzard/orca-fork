#!/bin/bash
# Usage: ./fork/scripts/install-mac-release.sh [--fast] [--build-only] | --install-built <version>
# After acceptance: ./fork/scripts/install-mac-release.sh --cleanup-verified-backups <accepted-version>
# Local production build and install. The previous app is kept until acceptance, then removed.
# --fast is for repeat local checks: skip install and the full typecheck, and skip native/Swift
# rebuilds whose outputs are still newer than their sources. Signing, packaging, and the atomic
# swap stay the same. Do not use --fast when dependencies or types changed.
set -euo pipefail

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly APP_NAME='Orca.app'
readonly INSTALL_ROOT='/Applications'
readonly INSTALL_APP="$INSTALL_ROOT/$APP_NAME"
readonly BUILDER_CONFIG='config/electron-builder.config.cjs'
readonly OUTPUT_DIR='dist/local-release'
readonly LOCAL_BUILDER_CONFIG="$OUTPUT_DIR/electron-builder.local.cjs"
readonly CLEANUP_VERIFIED_BACKUPS='--cleanup-verified-backups'
readonly APP_BUNDLE_ID='com.stablyai.orca'

if [[ "$(uname -s)" != 'Darwin' ]]; then
  echo '此脚本仅用于 macOS 本机安装。' >&2
  exit 1
fi
if [[ "${1:-}" == "$CLEANUP_VERIFIED_BACKUPS" ]]; then
  # The version argument limits cleanup to the install that was just accepted.
  readonly INSTALLED_VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$INSTALL_APP/Contents/Info.plist")"
  if [[ "$#" != 2 || "$2" != "$INSTALLED_VERSION" ]]; then
    echo '请传入刚完成验收的当前安装版本号。' >&2
    exit 1
  fi
  codesign --verify --deep --strict "$INSTALL_APP"
  readonly RUNNING_EXECUTABLES="$(ps -axo comm=)"
  removed=0
  removed_kib=0
  for backup_dir in "$INSTALL_ROOT"/.orca-previous.*; do
    [[ -d "$backup_dir" && ! -L "$backup_dir" && -d "$backup_dir/$APP_NAME" && ! -L "$backup_dir/$APP_NAME" ]] || continue
    if [[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$backup_dir/$APP_NAME/Contents/Info.plist" 2>/dev/null || true)" != "$APP_BUNDLE_ID" ]]; then
      continue
    fi
    # Skip a copy a process is still using, and do not touch extra files parked in the backup dir.
    if awk -v prefix="$backup_dir/" 'index($0, prefix) == 1 { found = 1 } END { exit !found }' <<< "$RUNNING_EXECUTABLES"; then
      echo "跳过正在使用的旧版：$backup_dir"
      continue
    fi
    size_kib="$(du -sk "$backup_dir/$APP_NAME" | awk '{print $1}')"
    rm -rf -- "$backup_dir/$APP_NAME"
    rmdir "$backup_dir" 2>/dev/null || true
    removed=$((removed + 1))
    removed_kib=$((removed_kib + size_kib))
  done
  echo "已清理 $removed 个旧版应用，合计 $removed_kib KiB；当前应用与用户数据保留。"
  exit 0
fi
FAST=false
BUILD_ONLY=false
INSTALL_BUILT_VERSION=''
while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --fast) FAST=true; shift ;;
    --build-only) BUILD_ONLY=true; shift ;;
    --install-built) INSTALL_BUILT_VERSION="${2:?请提供已构建版本号}"; shift 2 ;;
    *) echo "未知参数：$1" >&2; exit 1 ;;
  esac
done
if [[ -n "$INSTALL_BUILT_VERSION" && ( "$FAST" == true || "$BUILD_ONLY" == true ) ]]; then
  echo '--install-built 不能与构建选项一起使用。' >&2
  exit 1
fi
cd "$REPO_ROOT"
if [[ "$(node -p 'process.versions.node.split(".")[0]')" != '24' ]]; then
  echo '请先切换到项目要求的 Node.js 24。' >&2
  exit 1
fi
xcode-select -p >/dev/null
# Fixed certificate. Stop if it is missing so the build cannot fall back to an ad-hoc signature.
readonly LOCAL_SIGNING_IDENTITY="$(node -p "require('./src/fork/packaging.cjs').localSigningIdentity")"
if ! security find-identity -v -p codesigning | awk -v identity="$LOCAL_SIGNING_IDENTITY" \
  'index($0, "\"" identity "\"") { found = 1 } END { exit !found }'; then
  echo "未找到有效的代码签名身份：${LOCAL_SIGNING_IDENTITY}；请在登录钥匙串中创建并信任该证书。" >&2
  exit 1
fi
readonly ARCH="$(node -p 'process.arch')"
if [[ "$ARCH" == 'arm64' ]]; then
  readonly BUILT_APP="$OUTPUT_DIR/mac-arm64/$APP_NAME"
else
  readonly BUILT_APP="$OUTPUT_DIR/mac/$APP_NAME"
fi

if [[ -z "$INSTALL_BUILT_VERSION" ]]; then
if [[ "$FAST" == false ]]; then
  pnpm install --frozen-lockfile
  # Desktop builds include the mobile web app. Its own install matches CI.
  pnpm --dir mobile install --frozen-lockfile
  pnpm tc
else
  echo '快速安装：跳过依赖安装和全量类型检查。'
fi

# Production optimizations are unrelated to Apple distribution signing.
# The personal package reuses the fixed local certificate and does not need a Developer ID.
export NODE_ENV=production
export ORCA_MAC_RELEASE=0 ORCA_MAC_HOURLY=0 ORCA_MAC_DAILY=0 ORCA_MAC_ADHOC=0
export CSC_IDENTITY_AUTO_DISCOVERY=false
export CSC_NAME="$LOCAL_SIGNING_IDENTITY" ORCA_COMPUTER_MACOS_SIGN_IDENTITY="$LOCAL_SIGNING_IDENTITY"
ORCA_LOCAL_BUILD_VERSION="$(node --input-type=module -e \
  'import { getLocalBuildIdentity } from "./config/scripts/build-mac-local.mjs"; console.log(getLocalBuildIdentity().version)')"
ORCA_BUILD_COMMIT="$(git rev-parse --short=12 HEAD)"
export ORCA_LOCAL_BUILD_VERSION ORCA_BUILD_COMMIT

# Local orcad templates only contain the slots this machine built. Release CI leaves the
# variable unset and still checks every target.
if [[ -f out/orcad-template/orcad-template.json ]]; then
  ORCA_ORCAD_TEMPLATE_TARGETS="$(node src/fork/packaging.cjs --print-built-targets)"
  export ORCA_ORCAD_TEMPLATE_TARGETS
fi

if [[ "$FAST" == false ]]; then
  pnpm run build:release
else
  # Rebuild only outputs older than their sources.
  pnpm run build:release:javascript
  # Directory browse for Add Project runs inside the managed server. Rebuild the template
  # when that source is newer than the template.
  if [[ ! -f out/orcad-template/orcad.js || src/main/runtime -nt out/orcad-template/orcad.js || src/main/orcad -nt out/orcad-template/orcad.js ]]; then
    pnpm run build:orcad-template
  fi
  if [[ native -nt out/orcad-template/orcad-template.json ]]; then
    pnpm run build:native
  fi
  computer_app='native/computer-use-macos/.build/release/Orca Computer Use.app'
  if [[ ! -d "$computer_app" || native/computer-use-macos/Sources -nt "$computer_app" ]]; then
    pnpm run build:computer-macos
  fi
  keyboard_helper='native/keyboard-layout-macos/.build/release/orca-keyboard-layout'
  if [[ ! -x "$keyboard_helper" || native/keyboard-layout-macos/Sources -nt "$keyboard_helper" ]]; then
    pnpm run build:keyboard-layout-macos
  fi
  notification_helper='native/notification-status-macos/.build/release/orca-notification-status'
  if [[ ! -x "$notification_helper" || native/notification-status-macos/Sources -nt "$notification_helper" ]]; then
    pnpm run build:notification-status-macos
  fi
fi
pnpm run ensure:electron-runtime
# Earlier trial packages can leave other dist children. Ignore the whole dist tree.
node - "$REPO_ROOT/$BUILDER_CONFIG" "$LOCAL_BUILDER_CONFIG" <<'JS'
const { mkdirSync, writeFileSync } = require('node:fs')
const { dirname } = require('node:path')
const [baseConfig, outputConfig] = process.argv.slice(2)
mkdirSync(dirname(outputConfig), { recursive: true })
writeFileSync(outputConfig,
  `const base = require(${JSON.stringify(baseConfig)})\n` +
  `module.exports = { ...base, files: [...base.files, '!dist{,/**/*}'] }\n`)
JS
# Current architecture only. Skip DMG/ZIP and the other architecture.
pnpm exec electron-builder --config "$LOCAL_BUILDER_CONFIG" --mac --dir "--$ARCH" \
  --publish never --config.mac.identity="$LOCAL_SIGNING_IDENTITY" --config.forceCodeSigning=true \
  --config.directories.output="$OUTPUT_DIR"
else
  # A multi-machine release builds first. Install checks the exact version so another batch cannot be swapped in.
  ORCA_LOCAL_BUILD_VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$BUILT_APP/Contents/Info.plist")"
  if [[ "$ORCA_LOCAL_BUILD_VERSION" != "$INSTALL_BUILT_VERSION" ]]; then
    echo '已构建应用版本与本批发布不一致。' >&2
    exit 1
  fi
fi
codesign --verify --deep --strict "$BUILT_APP"
if [[ "$BUILD_ONLY" == true ]]; then
  echo "构建已完成，尚未安装：$BUILT_APP（$ORCA_LOCAL_BUILD_VERSION）"
  exit 0
fi

# Do not replace a running app, and do not kill by name. That would drop the user's terminals and agents.
if ps -axo comm= | awk -v executable="$INSTALL_APP/Contents/MacOS/Orca" \
  '$0 == executable { found = 1 } END { exit !found }'; then
  echo "构建已完成：${REPO_ROOT}/${BUILT_APP}；请退出 Orca 后重跑脚本安装。" >&2
  exit 1
fi

# Copy and verify on the same volume, then swap. Keep the previous app until acceptance. User data stays.
readonly STAGE_DIR="$(mktemp -d "$INSTALL_ROOT/.orca-install.XXXXXX")"
ditto "$BUILT_APP" "$STAGE_DIR/$APP_NAME"
codesign --verify --deep --strict "$STAGE_DIR/$APP_NAME"
# The app creates its own file key. The per-build signature hash does not change that key.
# A partition list does not parse a certificate expression, so install no longer edits keychain ACLs.
BACKUP_DIR=''
if [[ -e "$INSTALL_APP" ]]; then
  BACKUP_DIR="$(mktemp -d "$INSTALL_ROOT/.orca-previous.XXXXXX")"
  mv "$INSTALL_APP" "$BACKUP_DIR/$APP_NAME"
fi
if ! mv "$STAGE_DIR/$APP_NAME" "$INSTALL_APP"; then
  if [[ -n "$BACKUP_DIR" ]]; then
    mv "$BACKUP_DIR/$APP_NAME" "$INSTALL_APP"
    rmdir "$BACKUP_DIR"
  fi
  exit 1
fi
rmdir "$STAGE_DIR"
echo "已安装：${INSTALL_APP}（${ORCA_LOCAL_BUILD_VERSION}）"
if [[ -n "$BACKUP_DIR" ]]; then
  echo "旧版备份：$BACKUP_DIR/$APP_NAME"
fi
echo "完成新版功能与 SSH 验收后清理旧版：bash fork/scripts/install-mac-release.sh $CLEANUP_VERIFIED_BACKUPS $ORCA_LOCAL_BUILD_VERSION"
if [[ "${ORCA_BACKGROUND_LAUNCH:-}" == '1' ]]; then
  # LaunchServices does not inherit this shell. Pass the background policy so the window stays hidden.
  open -gj --env ORCA_BACKGROUND_LAUNCH=1 "$INSTALL_APP"
else
  open "$INSTALL_APP"
fi
