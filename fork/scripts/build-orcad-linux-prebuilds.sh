#!/bin/bash
# Linux orcad slots for a Mac package. Images and the compile/smoke commands match
# linux_glibc_floor and linux_glibc217_compat in .github/workflows/node-server-tests.yml.
# The host fetches the pinned Node. The container only compiles and smokes.
# Do not pnpm install here: that would replace the Mac node_modules.
set -euo pipefail

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

# Digests are the workflow image lines. packaging.fork.test.ts compares them.
readonly IMAGE_LINUX_X64_GLIBC='quay.io/pypa/manylinux_2_28_x86_64@sha256:407f771c51a2c3e83ebe5a7970b4289ead3a6db21d9b9c089168775cad11d328'
readonly IMAGE_LINUX_ARM64_GLIBC='quay.io/pypa/manylinux_2_28_aarch64@sha256:c22ffd129ac99a8a42d1f2c2f4e88a9089288dd9ee987a7092da1c7dc48f27a9'
readonly IMAGE_LINUX_X64_GLIBC217='quay.io/pypa/manylinux2014_x86_64@sha256:6f74cabeac2432570aa4bfdb29f7c1f30313d4d6654d764c44e574b6ffdd4ed5'

if ! docker info >/dev/null 2>&1; then
  echo '未找到可用的 Docker。Linux SSH 槽需要本机 Docker 运行上游的 manylinux 镜像。' >&2
  exit 1
fi

run_slot() {
  local slot="$1"
  local platform="$2"
  local image="$3"
  local floor_tools="$4"
  local unset_smoke_libs="$5"
  if [[ "${FAST:-false}" == true ]] && node config/scripts/build-orcad-prebuilds.mjs --require-slots "$slot"; then
    echo "已有 ${slot}，快速安装跳过。"
    return
  fi
  local runtime
  runtime="$(node config/scripts/build-orcad-prebuilds.mjs --slot="$slot" --print-runtime)"
  case "$runtime" in
    "$REPO_ROOT"/*) ;;
    *) echo "pinned Node cached outside the workspace: $runtime" >&2; exit 1 ;;
  esac
  echo "正在用上游镜像编译 ${slot}（${platform}）。"
  docker run --rm --init -i --platform "$platform" \
    -e ORCA_BACKGROUND_LAUNCH=1 \
    -e COMPAT_NODE="/work/${runtime#"$REPO_ROOT"/}" \
    -e ORCAD_SLOT="$slot" \
    -e FLOOR_TOOLS="$floor_tools" \
    -e UNSET_SMOKE_LIBS="$unset_smoke_libs" \
    -e HOST_UID="$(id -u)" \
    -e HOST_GID="$(id -g)" \
    -e CC=gcc \
    -e CXX=g++ \
    -e PYTHON=/opt/python/cp312-cp312/bin/python3 \
    -v "$REPO_ROOT":/work \
    -w /work \
    "$image" bash -s <<'SLOT'
set -eu
if [ "$FLOOR_TOOLS" = 1 ]; then
  missing_tool=false
  for tool in git ps unzip which xz; do
    if ! command -v "$tool" >/dev/null 2>&1; then
      missing_tool=true
    fi
  done
  if [ "$missing_tool" = true ]; then
    dnf --disablerepo='epel*' install -y git procps-ng unzip which xz
  fi
fi
export PATH="$(dirname "$COMPAT_NODE"):$PATH"
node config/scripts/build-orcad-prebuilds.mjs --slot="$ORCAD_SLOT"
node config/scripts/build-orcad-prebuilds.mjs --require-slots "$ORCAD_SLOT"
if [ "$UNSET_SMOKE_LIBS" = 1 ]; then
  # The image's devtoolset LD_LIBRARY_PATH must not stand in for a host C++ runtime.
  env -u LD_LIBRARY_PATH node config/scripts/build-orcad-prebuilds.mjs --slot="$ORCAD_SLOT" --smoke
else
  node config/scripts/build-orcad-prebuilds.mjs --slot="$ORCAD_SLOT" --smoke
fi
for dir in out/orcad-prebuilds out/orcad-prebuild-work out/node-runtime-cache; do
  if [ -d "$dir" ]; then
    chown -R "$HOST_UID:$HOST_GID" "$dir"
  fi
done
SLOT
}

run_slot linux-x64-glibc linux/amd64 "$IMAGE_LINUX_X64_GLIBC" 1 0
run_slot linux-arm64-glibc linux/arm64 "$IMAGE_LINUX_ARM64_GLIBC" 1 0
run_slot linux-x64-glibc217 linux/amd64 "$IMAGE_LINUX_X64_GLIBC217" 0 1
