#!/usr/bin/env bash
# `ls -1Ap` 仍不给目录软链加斜杠。上游 SSH 浏览已经不用这条命令。
set -euo pipefail

OUT_DIR="${OUT_DIR:-/tmp/orca-fork-verify}"
BASE="$OUT_DIR/tree"
REPORT="$OUT_DIR/ssh-symlink-listing.txt"
mkdir -p "$BASE/real-dir"
ln -sfn real-dir "$BASE/link-dir"
echo 'sample' > "$BASE/real-dir/file.txt"

{
  echo "local listing of $BASE"
  ls -1Ap "$BASE"
} | tee "$OUT_DIR/local-ls.txt"

python3 - "$OUT_DIR/local-ls.txt" <<'PY'
import sys
text = open(sys.argv[1], encoding='utf-8').read().splitlines()
names = [line.strip() for line in text if line.strip() and not line.startswith('local ')]
link = next((line for line in names if line.startswith('link-dir')), '')
real = next((line for line in names if line.startswith('real-dir')), '')
if real != 'real-dir/':
    raise SystemExit(f'real directory was not classified as a directory: {real!r}')
if link != 'link-dir':
    raise SystemExit(f'directory symlink gained a trailing slash: {link!r}')
print('local ls -1Ap: directory symlink has no trailing slash')
PY

# 本机 sshd：不依赖 Docker。只监听 127.0.0.1，用一次性密钥，不改系统 sshd。
start_local_sshd() {
  local sshd_bin=""
  if command -v sshd >/dev/null 2>&1; then
    sshd_bin="$(command -v sshd)"
  elif [[ -x /usr/sbin/sshd ]]; then
    sshd_bin=/usr/sbin/sshd
  else
    return 1
  fi
  local cfg="$OUT_DIR/sshd_config"
  rm -f "$OUT_DIR/ssh_host_ed25519" "$OUT_DIR/ssh_host_ed25519.pub" \
    "$OUT_DIR/ssh_client_ed25519" "$OUT_DIR/ssh_client_ed25519.pub"
  ssh-keygen -q -t ed25519 -f "$OUT_DIR/ssh_host_ed25519" -N ""
  ssh-keygen -q -t ed25519 -f "$OUT_DIR/ssh_client_ed25519" -N ""
  cp "$OUT_DIR/ssh_client_ed25519.pub" "$OUT_DIR/authorized_keys"
  chmod 600 "$OUT_DIR/ssh_host_ed25519" "$OUT_DIR/ssh_client_ed25519" "$OUT_DIR/authorized_keys"
  cat >"$cfg" <<EOF
Port 2222
ListenAddress 127.0.0.1
HostKey $OUT_DIR/ssh_host_ed25519
PidFile $OUT_DIR/sshd.pid
AuthorizedKeysFile $OUT_DIR/authorized_keys
PasswordAuthentication no
KbdInteractiveAuthentication no
UsePAM no
StrictModes no
PrintMotd no
PrintLastLog no
EOF
  "$sshd_bin" -f "$cfg" -E "$OUT_DIR/sshd.log"
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if ssh -i "$OUT_DIR/ssh_client_ed25519" -o IdentitiesOnly=yes \
      -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=2 \
      -p 2222 "${USER}@127.0.0.1" "ls -1Ap '$BASE'" >"$OUT_DIR/ssh-ls.txt" 2>"$OUT_DIR/ssh-ls.err"; then
      return 0
    fi
    sleep 1
  done
  return 1
}

stop_local_sshd() {
  if [[ -f "$OUT_DIR/sshd.pid" ]]; then
    kill "$(cat "$OUT_DIR/sshd.pid")" >/dev/null 2>&1 || true
    rm -f "$OUT_DIR/sshd.pid"
  fi
}

SSH_NOTE="ssh listing skipped"
if command -v docker >/dev/null 2>&1; then
  docker rm -f orca-fork-verify-sshd >/dev/null 2>&1 || true
  if docker run -d --name orca-fork-verify-sshd -p 127.0.0.1:2222:22 \
    -e PASSWORD_ACCESS=true -e USER_NAME=orca -e USER_PASSWORD=orca \
    -v "$BASE:/home/orca/tree:ro" \
    lscr.io/linuxserver/openssh-server; then
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      if ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=2 \
        -p 2222 orca@127.0.0.1 'ls -1Ap ~/tree' > "$OUT_DIR/ssh-ls.txt" 2>"$OUT_DIR/ssh-ls.err"; then
        SSH_NOTE="ssh listing written to $OUT_DIR/ssh-ls.txt"
        python3 - "$OUT_DIR/ssh-ls.txt" <<'PY'
import sys
names = [line.strip() for line in open(sys.argv[1], encoding='utf-8') if line.strip()]
link = next((line for line in names if line.startswith('link-dir')), '')
if link != 'link-dir':
    raise SystemExit(f'ssh symlink classification changed: {link!r}')
print('ssh ls -1Ap: directory symlink has no trailing slash')
PY
        break
      fi
      sleep 2
    done
    docker rm -f orca-fork-verify-sshd >/dev/null 2>&1 || true
  else
    SSH_NOTE="docker sshd did not start"
  fi
else
  if start_local_sshd; then
    SSH_NOTE="localhost sshd listing written to $OUT_DIR/ssh-ls.txt"
    python3 - "$OUT_DIR/ssh-ls.txt" <<'PY'
import sys
names = [line.strip() for line in open(sys.argv[1], encoding='utf-8') if line.strip()]
link = next((line for line in names if line.startswith('link-dir')), '')
if link != 'link-dir':
    raise SystemExit(f'ssh symlink classification changed: {link!r}')
print('ssh ls -1Ap: directory symlink has no trailing slash')
PY
    stop_local_sshd
  else
    SSH_NOTE="docker not installed and local sshd did not start; local ls -1Ap is the POSIX command the browser runs"
    stop_local_sshd
  fi
fi

{
  echo "$SSH_NOTE"
  echo "report $REPORT"
} | tee "$REPORT"
