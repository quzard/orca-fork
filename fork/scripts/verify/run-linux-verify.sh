#!/usr/bin/env bash
# Linux 验收：内部标识检查 + 后台 Electron 截图。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"
export OUT_DIR="${OUT_DIR:-/tmp/orca-fork-verify}"
mkdir -p "$OUT_DIR"

# 标识扫描接着跑提交身份检查，它要最新的 upstream/main。
bash fork/scripts/verify/fetch-upstream-main.sh
bash fork/scripts/verify/check-no-internal-refs.sh

if command -v xvfb-run >/dev/null 2>&1; then
  xvfb-run -a node fork/scripts/verify/screenshot-electron.mjs
else
  echo 'xvfb-run is not installed; screenshot skipped' | tee "$OUT_DIR/screenshot-skipped.txt"
  exit 1
fi
