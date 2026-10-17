#!/bin/bash
# 把构建代理装进当前用户的 LaunchAgents。加上 --bootstrap 才会加载。
set -euo pipefail

readonly LABEL="com.orca.fork.mac-auto-update"
readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly TEMPLATE="${REPO_ROOT}/fork/scripts/launchd/${LABEL}.plist"
readonly DEST="${HOME}/Library/LaunchAgents/${LABEL}.plist"

if [[ "$(uname -s)" != Darwin ]]; then
  echo "install-mac-auto-update-agent: macOS only" >&2
  exit 1
fi
mkdir -p "${HOME}/Projects/orca-verify" "${HOME}/Library/LaunchAgents" \
  "${HOME}/Projects/orca-verify/node-runtime-cache"
REPO="${ORCA_REPO:-$REPO_ROOT}"
python3 - "$TEMPLATE" "$DEST" "$HOME" "$REPO" <<'PY'
import pathlib, sys
template, dest, home, repo = sys.argv[1:]
text = pathlib.Path(template).read_text()
pathlib.Path(dest).write_text(text.replace("__HOME__", home).replace("__REPO__", repo))
PY
echo "已写入 ${DEST}"
echo "仓库：${REPO}"
if [[ "${1:-}" == "--bootstrap" ]]; then
  launchctl bootout "gui/$(id -u)/${LABEL}" >/dev/null 2>&1 || true
  launchctl bootstrap "gui/$(id -u)" "$DEST"
  launchctl enable "gui/$(id -u)/${LABEL}"
  echo "已加载 ${LABEL}。登录时以及之后每 30 分钟运行一次。"
else
  echo "尚未加载。确认时区、登录钥匙串和 sync.env 之后执行："
  echo "  bash fork/scripts/install-mac-auto-update-agent.sh --bootstrap"
fi
