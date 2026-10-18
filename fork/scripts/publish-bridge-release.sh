#!/bin/bash
# 把 quzard/orca-fork 上已经公开的预发布复制到旧仓库（默认 quzard/orca）。
# 还在读旧仓库的已安装应用靠它更新到读 quzard/orca-fork 的版本。
# 用法: publish-bridge-release.sh [--dry-run] [--no-dmg] <tag> [old-repo]
# 顺序和 publish-mac-release.sh 一样：草稿 → 每个 zip → zip 的 .blockmap → latest-mac.yml → 公开 → dmg。
# --dry-run 只做只读检查和下载，写操作只打印要执行的 gh 命令。
# 不打印令牌：gh 报错里出现令牌样式时只输出一句固定说明。
set -euo pipefail

readonly SOURCE_REPO="quzard/orca-fork"
readonly DEFAULT_OLD_REPO="quzard/orca"
readonly CHANNEL_FILE="latest-mac.yml"
readonly NOTES="Bridge to ${SOURCE_REPO}"

WORKDIR=""
DRY_RUN=0
WITH_DMG=1
ARGS=()

log() {
  printf 'publish-bridge-release: %s\n' "$*" >&2
}

die() {
  log "$*"
  exit 1
}

usage() {
  printf 'usage: %s [--dry-run] [--no-dmg] <tag> [old-repo]\n' "$(basename "$0")" >&2
  exit 2
}

cleanup() {
  if [[ -n "$WORKDIR" && -d "$WORKDIR" ]]; then
    rm -rf "$WORKDIR"
  fi
}
trap cleanup EXIT

# gh 的 stdout 原样返回。stderr 先进临时文件，有令牌样式就不转发。
gh_run() {
  local err code=0
  err="$(mktemp "${TMPDIR:-/tmp}/orca-bridge-gh.XXXXXX")"
  command gh "$@" 2>"$err" || code=$?
  if [[ "$code" -ne 0 ]]; then
    if grep -E -q 'gh[pousr]_[A-Za-z0-9]|github_pat_' "$err"; then
      log "gh ${1:-} ${2:-} failed (details omitted)"
    else
      sed 's/^/  gh: /' "$err" >&2
    fi
  fi
  rm -f "$err"
  return "$code"
}

# 只读探测：失败是预期结果之一（例如旧仓库还没有这个 tag），不转发 stderr。
gh_probe() {
  command gh "$@" 2>/dev/null
}

# 写操作。--dry-run 时只打印命令。
gh_write() {
  if [[ "$DRY_RUN" == 1 ]]; then
    log "dry-run: gh $*"
    return 0
  fi
  gh_run "$@" >/dev/null
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --no-dmg) WITH_DMG=0 ;;
    -h | --help) usage ;;
    -*) usage ;;
    *) ARGS+=("$1") ;;
  esac
  shift
done
[[ ${#ARGS[@]} -ge 1 && ${#ARGS[@]} -le 2 ]] || usage
TAG="${ARGS[0]}"
OLD_REPO="${ARGS[1]:-$DEFAULT_OLD_REPO}"
[[ "$TAG" =~ ^v[0-9A-Za-z._+-]+$ ]] || die "tag must look like v<version>"
[[ "$OLD_REPO" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || die "old repo must be <owner>/<name>"
[[ "$OLD_REPO" != "$SOURCE_REPO" ]] || die "old repo must differ from ${SOURCE_REPO}"
command -v gh >/dev/null 2>&1 || die "gh is not on PATH"

source_state="$(gh_run release view "$TAG" --repo "$SOURCE_REPO" --json isDraft,isPrerelease \
  --jq '"\(.isDraft) \(.isPrerelease)"')" || die "${TAG} is not a release on ${SOURCE_REPO}"
[[ "$source_state" == "false true" ]] ||
  die "${TAG} on ${SOURCE_REPO} must be a published prerelease (isDraft isPrerelease: ${source_state})"

RESUME=0
if old_draft="$(gh_probe release view "$TAG" --repo "$OLD_REPO" --json isDraft --jq '.isDraft')"; then
  if [[ "$old_draft" != true ]]; then
    die "${TAG} is already published on ${OLD_REPO}; nothing to copy"
  fi
  # 上一次中途失败留下的草稿：不再 create，补传后公开。
  RESUME=1
  log "${TAG} is a draft on ${OLD_REPO}; uploading into it"
fi

branch="$(gh_run repo view "$OLD_REPO" --json defaultBranchRef --jq '.defaultBranchRef.name')" ||
  die "cannot read the default branch of ${OLD_REPO}"
[[ -n "$branch" ]] || die "${OLD_REPO} has no default branch"

WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/orca-bridge.XXXXXX")"
assets="${WORKDIR}/assets"
mkdir -p "$assets"
gh_run release download "$TAG" --repo "$SOURCE_REPO" --dir "$assets" >/dev/null ||
  die "cannot download ${TAG} from ${SOURCE_REPO}"

shopt -s nullglob
zips=("$assets"/*.zip)
[[ ${#zips[@]} -gt 0 ]] || die "${TAG} on ${SOURCE_REPO} has no zip"
blockmaps=()
for zip in "${zips[@]}"; do
  [[ -f "${zip}.blockmap" ]] || die "$(basename "$zip").blockmap is missing on ${SOURCE_REPO}"
  blockmaps+=("${zip}.blockmap")
done
[[ -f "${assets}/${CHANNEL_FILE}" ]] || die "${CHANNEL_FILE} is missing on ${SOURCE_REPO}"
# 其他渠道文件（例如 local-mac.yml）放在 latest-mac.yml 之前。
channels=()
for yml in "$assets"/*-mac.yml; do
  [[ "$(basename "$yml")" == "$CHANNEL_FILE" ]] || channels+=("$yml")
done
channels+=("${assets}/${CHANNEL_FILE}")
dmgs=("$assets"/*.dmg "$assets"/*.dmg.blockmap)
shopt -u nullglob

# 公开时 latest-mac.yml 列出的每个文件都必须已经上传，所以只能是 zip。
while IFS= read -r name; do
  [[ "$name" == *.zip ]] || die "${CHANNEL_FILE} names ${name}; only zips may be listed"
  [[ -f "${assets}/${name}" ]] || die "${CHANNEL_FILE} names ${name}, which is not on the release"
done < <(sed -n -E "s/^[[:space:]-]*(url|path):[[:space:]]*['\"]?([^'\"]+)['\"]?[[:space:]]*$/\2/p" \
  "${assets}/${CHANNEL_FILE}")

if [[ "$RESUME" == 0 ]]; then
  gh_write release create "$TAG" --repo "$OLD_REPO" --draft --prerelease --target "$branch" \
    --title "$TAG" --notes "$NOTES" || die "cannot create the draft on ${OLD_REPO}"
fi
# 先全部 zip，再全部 blockmap，最后渠道文件。
for file in "${zips[@]}" "${blockmaps[@]}" "${channels[@]}"; do
  gh_write release upload "$TAG" --repo "$OLD_REPO" --clobber "$file" ||
    die "cannot upload $(basename "$file") to ${OLD_REPO}"
done
gh_write release edit "$TAG" --repo "$OLD_REPO" --draft=false || die "cannot publish ${TAG} on ${OLD_REPO}"

if [[ "$WITH_DMG" == 1 ]]; then
  for file in "${dmgs[@]+"${dmgs[@]}"}"; do
    # release 已经公开，dmg 只给手动安装。传失败只警告。
    gh_write release upload "$TAG" --repo "$OLD_REPO" --clobber "$file" ||
      log "warning: $(basename "$file") was not uploaded; the update itself does not need it"
  done
fi

if [[ "$DRY_RUN" == 1 ]]; then
  log "dry-run: nothing was changed on ${OLD_REPO}"
  printf 'bridge=dry-run\ntag=%s\nrepo=%s\n' "$TAG" "$OLD_REPO"
  exit 0
fi

# 和 electron-updater 的私有 GitHub provider 一样，按 API 的顺序取第一个非草稿预发布。
newest="$(gh_run api "repos/${OLD_REPO}/releases?per_page=30" \
  --jq '[.[] | select(.draft == false and .prerelease == true)][0].tag_name // ""')" ||
  die "cannot list releases on ${OLD_REPO}"
[[ "$newest" == "$TAG" ]] ||
  die "the newest non-draft prerelease on ${OLD_REPO} is ${newest:-none}, not ${TAG}"
uploaded="$(gh_run release view "$TAG" --repo "$OLD_REPO" --json assets --jq '.assets[].name')" ||
  die "cannot read the assets of ${TAG} on ${OLD_REPO}"
for file in "${zips[@]}" "${blockmaps[@]}" "${channels[@]}"; do
  grep -F -x -q "$(basename "$file")" <<<"$uploaded" ||
    die "$(basename "$file") is missing from ${TAG} on ${OLD_REPO}"
done
printf 'bridge=published\ntag=%s\nrepo=%s\n' "$TAG" "$OLD_REPO"
