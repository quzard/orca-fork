#!/bin/bash
# 把构建代理装进当前用户的 LaunchAgents。加上 --bootstrap 才会加载。
set -euo pipefail

readonly LABEL="com.orca.fork.mac-auto-update"
readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
readonly TEMPLATE="${REPO_ROOT}/fork/scripts/launchd/${LABEL}.plist"
readonly DEST="${HOME}/Library/LaunchAgents/${LABEL}.plist"
readonly BIN_DIR="${HOME}/Projects/orca-verify/bin"
readonly INSTALLED_SCRIPT="${BIN_DIR}/mac-auto-update.sh"

if [[ "$(uname -s)" != Darwin ]]; then
  echo "install-mac-auto-update-agent: macOS only" >&2
  exit 1
fi
mkdir -p "${HOME}/Projects/orca-verify" "${HOME}/Library/LaunchAgents" \
  "${HOME}/Projects/orca-verify/node-runtime-cache" "$BIN_DIR"
REPO="${ORCA_REPO:-$REPO_ROOT}"
# mv 换掉正在运行的副本，不把文件截断到一半。
cp "${REPO_ROOT}/fork/scripts/mac-auto-update.sh" "${INSTALLED_SCRIPT}.next"
chmod 755 "${INSTALLED_SCRIPT}.next"
mv -f "${INSTALLED_SCRIPT}.next" "$INSTALLED_SCRIPT"
python3 - "$TEMPLATE" "$DEST" "$HOME" "$REPO" "$BIN_DIR" <<'PY'
import pathlib, sys
template, dest, home, repo, bin_dir = sys.argv[1:]
text = pathlib.Path(template).read_text()
pathlib.Path(dest).write_text(
    text.replace("__HOME__", home).replace("__REPO__", repo).replace("__BIN__", bin_dir)
)
PY
echo "已写入 ${DEST}"
echo "稳定副本：${INSTALLED_SCRIPT}"
echo "仓库：${REPO}"
if [[ "${1:-}" == "--bootstrap" ]]; then
  launchctl bootout "gui/$(id -u)/${LABEL}" >/dev/null 2>&1 || true
  launchctl bootstrap "gui/$(id -u)" "$DEST"
  launchctl enable "gui/$(id -u)/${LABEL}"
  echo "已加载 ${LABEL}。登录时以及之后每 30 分钟运行一次。"
else
  echo "若已经加载过指向仓库内脚本的代理，先重跑本脚本换掉它。"
  echo "尚未加载。先在终端里跑一次稳定副本，给 Orca Local Signing 点 Always Allow："
  echo "  ORCA_REPO=${REPO} ${INSTALLED_SCRIPT}"
  echo "家里的 Mac 还要 gh 已登录，并且对 quzard/orca 有写权限。客户机不需要 gh。"
  echo "确认 sync.env 之后再加载："
  echo "  bash fork/scripts/install-mac-auto-update-agent.sh --bootstrap"
fi
