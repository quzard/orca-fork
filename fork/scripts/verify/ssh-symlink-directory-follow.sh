#!/usr/bin/env bash
# Directory symlinks stay selectable when the registered POSIX browse tail runs over local sshd.
set -euo pipefail

TAIL="${POSIX_SYMLINK_DIRECTORY_LIST_TAIL:?POSIX_SYMLINK_DIRECTORY_LIST_TAIL is required}"
OUT_DIR=$(mktemp -d)
BASE="$OUT_DIR/tree"
mkdir -p "$BASE/real-dir"
ln -sfn real-dir "$BASE/link-dir"
ln -sfn missing "$BASE/dangling"
echo sample >"$BASE/real-dir/file.txt"
ln -sfn real-dir/file.txt "$BASE/link-file"

cleanup() {
  if [[ -f "$OUT_DIR/sshd.pid" ]]; then
    kill "$(cat "$OUT_DIR/sshd.pid")" >/dev/null 2>&1 || true
  fi
  rm -rf "$OUT_DIR"
}
trap cleanup EXIT

assert_listing() {
  local label="$1"
  local file="$2"
  python3 - "$label" "$file" <<'PY'
import sys
label, path = sys.argv[1], sys.argv[2]
lines = [line.strip() for line in open(path, encoding="utf-8") if line.strip()]
names = lines[1:]
expected = {"real-dir/", "link-dir/", "dangling", "link-file"}
missing = sorted(expected.difference(names))
if missing:
    raise SystemExit(f"{label}: missing {missing} in {names}")
doubled = [name for name in names if name.endswith("//")]
if doubled:
    raise SystemExit(f"{label}: double slash in {doubled}")
print(f"{label}: directory symlink is selectable ({', '.join(names)})")
PY
}

(cd "$BASE" && bash -c "$TAIL") >"$OUT_DIR/local.txt"
assert_listing local "$OUT_DIR/local.txt"

if command -v sshd >/dev/null 2>&1; then
  SSHD=$(command -v sshd)
elif [[ -x /usr/sbin/sshd ]]; then
  SSHD=/usr/sbin/sshd
else
  echo "sshd is not installed" >&2
  exit 1
fi

PORT=$(python3 - <<'PY'
import socket
sock = socket.socket()
sock.bind(("127.0.0.1", 0))
print(sock.getsockname()[1])
sock.close()
PY
)

ssh-keygen -q -t ed25519 -f "$OUT_DIR/ssh_host_ed25519" -N ""
ssh-keygen -q -t ed25519 -f "$OUT_DIR/ssh_client_ed25519" -N ""
cp "$OUT_DIR/ssh_client_ed25519.pub" "$OUT_DIR/authorized_keys"
chmod 600 "$OUT_DIR/ssh_host_ed25519" "$OUT_DIR/ssh_client_ed25519" "$OUT_DIR/authorized_keys"
cat >"$OUT_DIR/sshd_config" <<EOF
Port ${PORT}
ListenAddress 127.0.0.1
HostKey ${OUT_DIR}/ssh_host_ed25519
PidFile ${OUT_DIR}/sshd.pid
AuthorizedKeysFile ${OUT_DIR}/authorized_keys
PasswordAuthentication no
KbdInteractiveAuthentication no
UsePAM no
StrictModes no
PrintMotd no
PrintLastLog no
EOF

"$SSHD" -f "$OUT_DIR/sshd_config" -E "$OUT_DIR/sshd.log"

remote=$(printf '%q' "cd ${BASE} && ${TAIL}")
ok=0
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if ssh -i "$OUT_DIR/ssh_client_ed25519" -o IdentitiesOnly=yes \
    -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=2 \
    -p "$PORT" "${USER}@127.0.0.1" "bash -c ${remote}" >"$OUT_DIR/ssh.txt" 2>"$OUT_DIR/ssh.err"; then
    ok=1
    break
  fi
  sleep 0.3
done
if [[ "$ok" != 1 ]]; then
  echo "local sshd did not return the symlink listing" >&2
  cat "$OUT_DIR/sshd.log" >&2 || true
  cat "$OUT_DIR/ssh.err" >&2 || true
  exit 1
fi
assert_listing ssh "$OUT_DIR/ssh.txt"
