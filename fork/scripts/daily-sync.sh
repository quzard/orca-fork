#!/bin/bash
# 云端每日上游同步。在干净的 Linux 检出上运行：
#   bash fork/scripts/daily-sync.sh
# 变基成功且检查通过时，只强制更新 origin/develop（--force-with-lease），不推标签、不推其他分支。
# 冲突或检查失败时不改 origin/develop，把现场推到 sync/upstream-YYYYMMDD（时区取 ORCA_SYNC_TZ，默认 UTC）后以非 0 退出。
# 不调用 GitHub Actions。仓库的 Actions 必须保持关闭。
set -euo pipefail

readonly REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

export GIT_TERMINAL_PROMPT=0
export GIT_EDITOR=true
export TZ="${ORCA_SYNC_TZ:-UTC}"

ATTEMPT_BRANCH="sync/upstream-$(date +%Y%m%d)"
ORIGIN_DEVELOP=""
UPSTREAM_SHA=""
PUSH_ATTEMPT=0

summary() {
  printf '%s\n' "$@"
}

die() {
  summary "$@"
  exit 1
}

require_identity() {
  if ! git config user.name >/dev/null || ! git config user.email >/dev/null; then
    die "daily-sync: FAILED" "reason: git user.name and user.email must be set" "develop: not pushed"
  fi
}

require_fork_origin() {
  local url
  url="$(git remote get-url origin)"
  case "$url" in
    *quzard/orca*) ;;
    *) die "daily-sync: FAILED" "reason: origin is not quzard/orca ($url)" "develop: not pushed" ;;
  esac
}

ensure_upstream() {
  if ! git remote get-url upstream >/dev/null 2>&1; then
    git remote add upstream https://github.com/stablyai/orca.git
  fi
}

# 冲突现场提交成独立对象，再退出 rebase，避免本地 develop 停在冲突中间。
publish_conflict() {
  local files tree parent commit
  files="$(git diff --name-only --diff-filter=U || true)"
  git add -u
  tree="$(git write-tree)"
  parent="$(git rev-parse HEAD)"
  commit="$(
    git commit-tree "$tree" -p "$parent" -m "$(
      cat <<EOF
sync: rebase onto upstream stopped with conflict markers

Upstream: ${UPSTREAM_SHA}
Conflicted files:
${files}

Resolve the markers on this branch, then open a PR against develop.
EOF
    )"
  )"
  git rebase --quit
  push_attempt_commit "$commit"
  summary \
    "daily-sync: FAILED" \
    "reason: rebase conflict" \
    "upstream: ${UPSTREAM_SHA}" \
    "develop: not pushed (${ORIGIN_DEVELOP})" \
    "attempt: ${ATTEMPT_BRANCH} (${commit})" \
    "files:" \
    "${files}"
  exit 1
}

push_attempt_commit() {
  local commit="$1"
  if git ls-remote --exit-code origin "refs/heads/${ATTEMPT_BRANCH}" >/dev/null 2>&1; then
    git fetch --no-tags origin "refs/heads/${ATTEMPT_BRANCH}:refs/remotes/origin/${ATTEMPT_BRANCH}"
    if ! git push --force-with-lease="refs/heads/${ATTEMPT_BRANCH}:$(git rev-parse "origin/${ATTEMPT_BRANCH}")" \
      origin "${commit}:refs/heads/${ATTEMPT_BRANCH}"; then
      die "daily-sync: FAILED" "reason: could not push ${ATTEMPT_BRANCH}" "commit: ${commit}" "develop: not pushed (${ORIGIN_DEVELOP})"
    fi
  elif ! git push origin "${commit}:refs/heads/${ATTEMPT_BRANCH}"; then
    die "daily-sync: FAILED" "reason: could not push ${ATTEMPT_BRANCH}" "commit: ${commit}" "develop: not pushed (${ORIGIN_DEVELOP})"
  fi
}

# 检查失败时推送已经变基的 HEAD。origin/develop 不动。
fail_checks() {
  local reason="$1"
  local head
  head="$(git rev-parse HEAD)"
  if [[ "$PUSH_ATTEMPT" == 1 && "$head" != "$ORIGIN_DEVELOP" ]]; then
    push_attempt_commit "$head"
    summary \
      "daily-sync: FAILED" \
      "reason: ${reason}" \
      "upstream: ${UPSTREAM_SHA}" \
      "develop: not pushed (${ORIGIN_DEVELOP})" \
      "attempt: ${ATTEMPT_BRANCH} (${head})"
  else
    summary \
      "daily-sync: FAILED" \
      "reason: ${reason}" \
      "upstream: ${UPSTREAM_SHA}" \
      "develop: not pushed (${ORIGIN_DEVELOP})" \
      "attempt: none"
  fi
  exit 1
}

run_check() {
  local name="$1"
  shift
  echo "daily-sync: ${name}"
  if ! "$@"; then
    fail_checks "${name} failed"
  fi
}

require_identity
require_fork_origin
if [[ -n "$(git status --porcelain)" ]]; then
  die "daily-sync: FAILED" "reason: worktree is dirty" "develop: not pushed"
fi

ensure_upstream
# 新鲜云端机器没有这份本地配置时，生成文件的 merge=ours 不会生效。
git config rerere.enabled true
git config merge.ours.driver true

git fetch --no-tags origin refs/heads/develop:refs/remotes/origin/develop
git fetch --no-tags upstream main
ORIGIN_DEVELOP="$(git rev-parse origin/develop)"
UPSTREAM_SHA="$(git rev-parse upstream/main)"

git checkout -B develop origin/develop

if git merge-base --is-ancestor "$UPSTREAM_SHA" HEAD; then
  echo "daily-sync: develop already contains upstream/main"
else
  base="$(git merge-base HEAD "$UPSTREAM_SHA")"
  if ! git rebase --onto "$UPSTREAM_SHA" "$base" develop; then
    if [[ -d .git/rebase-merge || -d .git/rebase-apply ]]; then
      publish_conflict
    fi
    die "daily-sync: FAILED" "reason: rebase failed" "upstream: ${UPSTREAM_SHA}" "develop: not pushed (${ORIGIN_DEVELOP})"
  fi
  PUSH_ATTEMPT=1
fi

# 先把本地上游指针拨到本次 main。pin 脚本优先读这个本地引用，不会退回旧的 origin/fork/base-upstream。
# 不推送 fork/base-upstream。
git branch -f fork/base-upstream "$UPSTREAM_SHA"
node fork/scripts/sync-skills-source-commit.mjs
if ! git diff --quiet -- src/cli/skills-source-commit.ts src/fork/skills-source-commit.ts; then
  git add -- src/cli/skills-source-commit.ts src/fork/skills-source-commit.ts
  HUSKY=0 git commit -m "$(cat <<'EOF'
fix(fork): pin skill installs to the upstream base

EOF
)"
  PUSH_ATTEMPT=1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  fail_checks "pin script left extra changes"
fi

run_check "company-info" bash fork/scripts/verify/check-no-internal-refs.sh
run_check "install" pnpm install --frozen-lockfile
run_check "lint" pnpm exec oxlint
run_check "rpc catalog" pnpm run verify:rpc-params-catalog
run_check "skill guides" pnpm run verify:bundled-skill-guides
run_check "skill manifest" pnpm run verify:skill-bundle-manifest
run_check "localization catalog" pnpm run verify:localization-runtime-catalog
run_check "fork tests" node config/scripts/run-vitest.mjs run --config config/vitest.config.ts --maxWorkers=2 src/fork src/shared/fork-hooks/builtin-update.test.ts src/shared/fork-hooks/update-feed.test.ts
run_check "typecheck" pnpm tc

echo "daily-sync: linux orcad template"
slot="$(node config/scripts/build-orcad-prebuilds.mjs --print-slot)"
case "$slot" in
  linux-*) ;;
  *) fail_checks "orcad host slot is ${slot}; this check runs on Linux" ;;
esac
run_check "orcad prebuild" pnpm build:orcad-prebuilds
run_check "orcad require slot" pnpm build:orcad-prebuilds --require-slots "$slot"
run_check "orcad smoke" pnpm build:orcad-prebuilds --smoke
# 上游打包 orcad 时会装入手机页面。mobile 是独立锁文件，根安装不会带上它。
run_check "mobile install" pnpm install --frozen-lockfile --dir mobile
run_check "mobile web" pnpm build:mobile-web
template_targets="$slot"
# 跨架构槽由家里的 Mac 打包。云端默认只编当前 Linux 槽并打进模板。
if [[ "${ORCA_SYNC_DOCKER_SLOTS:-}" == 1 ]]; then
  run_check "orcad linux slots" bash fork/scripts/build-orcad-linux-prebuilds.sh
  template_targets="linux-x64-glibc,linux-arm64-glibc"
fi
run_check "orcad template" node config/scripts/build-orcad-template.mjs --targets "$template_targets"
node --input-type=commonjs -e '
  const { readFileSync } = require("node:fs")
  const manifest = JSON.parse(readFileSync("out/orcad-template/orcad-template.json", "utf8"))
  const names = manifest.targets ?? {}
  const required = process.argv[1].split(",")
  const missing = required.filter((name) => !Object.hasOwn(names, name))
  if (missing.length > 0) {
    console.error(`orcad template missing ${missing.join(", ")}`)
    process.exit(1)
  }
' "$template_targets" || fail_checks "orcad template manifest"

head="$(git rev-parse HEAD)"
if [[ "$head" == "$ORIGIN_DEVELOP" ]]; then
  summary \
    "daily-sync: OK" \
    "upstream: ${UPSTREAM_SHA}" \
    "develop: ${head} (unchanged)"
  exit 0
fi

git push --force-with-lease="refs/heads/develop:${ORIGIN_DEVELOP}" origin "HEAD:refs/heads/develop"
summary \
  "daily-sync: OK" \
  "upstream: ${UPSTREAM_SHA}" \
  "develop: ${head}"
