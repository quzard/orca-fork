#!/bin/bash
set -euo pipefail

readonly LABEL="com.orca.fork.mac-auto-update"
readonly DEST="${HOME}/Library/LaunchAgents/${LABEL}.plist"

if [[ "$(uname -s)" == Darwin ]]; then
  launchctl bootout "gui/$(id -u)/${LABEL}" >/dev/null 2>&1 || true
fi
rm -f "$DEST"
echo "已移除 ${LABEL}"
