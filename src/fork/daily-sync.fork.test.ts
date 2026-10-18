import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
describe('fork daily sync split', () => {
  it('points fork release checks at the anonymous quzard/orca-fork feed only', () => {
    const setup = readFileSync(resolve('src/main/updater/updater-setup.ts'), 'utf8')
    const pin = readFileSync(resolve('src/main/updater/updater-release-feed.ts'), 'utf8')
    const schedule = readFileSync(resolve('src/main/updater/updater-scheduling.ts'), 'utf8')
    const menu = readFileSync(resolve('src/main/updater/updater-menu-checks.ts'), 'utf8')
    const download = readFileSync(resolve('src/main/updater/updater-download-install.ts'), 'utf8')
    const feed = readFileSync(resolve('src/shared/fork-hooks/update-feed.ts'), 'utf8')
    expect(setup).toContain('isForkBuild()')
    expect(pin).toContain('forkReleaseFeedDecision()')
    expect(pin.indexOf('forkReleaseFeedDecision()')).toBeLessThan(
      pin.indexOf('fetchNewerReleaseTagsWithReadiness(')
    )
    expect(pin).not.toMatch(/private-github|PrivateGithub|token/i)
    expect(schedule).toContain("kind === 'skip'")
    expect(menu).toContain('FORK_UPSTREAM_RELEASE_BLOCKED')
    expect(download).not.toContain('forkBuiltinUpdateNotifyOnly')
    const builds = readFileSync(resolve('src/main/updater-release-builds.ts'), 'utf8')
    expect(builds.indexOf("from './updater-fallback'")).toBeLessThan(
      builds.indexOf("from './updater-release-api-token'")
    )
    const selection = readFileSync(resolve('src/main/updater/updater-build-selection.ts'), 'utf8')
    expect(selection.indexOf("from '../updater-fallback'")).toBeLessThan(
      selection.indexOf('profileStateBuildCompatibilityError')
    )
    expect(feed).toContain('private: false')
    expect(feed).not.toMatch(/token:|process\.env|safeStorage/)
  })

  it('merges upstream into develop, pushes develop without force, and parks failures on a sync branch', () => {
    const script = readFileSync(resolve('fork/scripts/daily-sync.sh'), 'utf8')
    expect(script).toContain('git checkout -B develop origin/develop')
    expect(script).toContain('git merge --no-ff --no-edit')
    expect(script).not.toContain('git rebase')
    expect(script).toContain('git branch -f fork/base-upstream')
    expect(script).toContain('sync-skills-source-commit.mjs')
    expect(script).toContain('check-no-internal-refs.sh')
    const refs = readFileSync(resolve('fork/scripts/verify/check-no-internal-refs.sh'), 'utf8')
    expect(refs).toContain('command -v rg')
    expect(refs).toContain('grep -I -n -i -F')
    expect(script).toContain('pnpm exec oxlint')
    expect(script).toContain('pnpm tc')
    expect(script).toContain('build-orcad-template.mjs')
    expect(script).toContain('git push origin "HEAD:refs/heads/develop"')
    // Every push runs the identity guard first.
    expect(script.indexOf('require_commit_identity HEAD')).toBeLessThan(
      script.indexOf('git push origin "HEAD:refs/heads/develop"')
    )
    expect(script.indexOf('require_commit_identity "$commit"')).toBeLessThan(
      script.indexOf('git push origin "${commit}:refs/heads/${ATTEMPT_BRANCH}"')
    )
    expect(refs).toContain('check-commit-identity.sh')
    expect(refs).toContain('--no-renames --diff-filter=A')
    expect(script).not.toContain('--force-with-lease="refs/heads/develop')
    expect(script).toContain('sync/upstream-')
    expect(script).not.toContain('--force-with-lease')
    expect(script).toContain('ATTEMPT_BRANCH="${base}-${n}"')
    expect(script.indexOf('attempt_matches "$ATTEMPT_BRANCH" "$commit"')).toBeLessThan(
      script.indexOf('ATTEMPT_BRANCH="${base}-${n}"')
    )
    expect(script).toContain('develop push rejected')
    expect(readFileSync(resolve('.gitattributes'), 'utf8')).not.toContain(
      'en-runtime-required.json merge=ours'
    )
    expect(script).not.toContain('workflow_dispatch')
    expect(script).not.toContain('gh workflow')
    expect(script).not.toContain('git push --tags')
    execFileSync('bash', ['-n', resolve('fork/scripts/daily-sync.sh')])
  })

  it('reuses an attempt branch that already holds the same attempt, including a check-failure rerun, instead of adding -n', () => {
    const script = readFileSync(resolve('fork/scripts/daily-sync.sh'), 'utf8')
    const fn = (name: string): string => {
      const start = script.indexOf(`${name}() {`)
      return script.slice(start, script.indexOf('\n}\n', start) + 3)
    }
    const dir = mkdtempSync(join(tmpdir(), 'orca-attempt-'))
    const env = {
      ...process.env,
      GIT_AUTHOR_NAME: 'test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
      GIT_CONFIG_NOSYSTEM: '1',
      HOME: dir
    }
    const harness = `set -euo pipefail
die() { printf '%s\n' "$@"; exit 1; }
require_commit_identity() { :; }
${fn('attempt_shape')}
${fn('attempt_matches')}
${fn('push_attempt_commit')}
attempt() { ATTEMPT_BRANCH="\${2:-sync/upstream-20260101}"; push_attempt_commit "$1" >/dev/null 2>&1; echo "$ATTEMPT_BRANCH $ATTEMPT_SHA"; }
git init -q --bare origin.git
git init -q work && cd work
git remote add origin ../origin.git
echo a > f && git add f && git commit -q -m base
ORIGIN_DEVELOP=$(git rev-parse HEAD)
echo b > f && git commit -q -am one
one=$(git rev-parse HEAD)
git push -q origin "$one:refs/heads/sync/upstream-20260101"
echo "same-commit $(attempt "$one")"
again=$(git commit-tree "$one^{tree}" -p "$one^" -m rerun)
echo "same-tree $(attempt "$again")"
other=$(git commit-tree "$one^{tree}" -p "$one" -m other-parent)
echo "other-parent $(attempt "$other")"
echo c > f && git commit -q -am two
two=$(git rev-parse HEAD)
echo "other-tree $(attempt "$two")"
echo "other-tree-again $(attempt "$two")"
# 检查失败后重跑：合并和 pin 提交是新 SHA，树和上游父提交不变。
up=$(git commit-tree "$ORIGIN_DEVELOP^{tree}" -m upstream)
up2=$(git commit-tree "$ORIGIN_DEVELOP^{tree}" -m upstream-later)
echo m > f && git add f && merged=$(git write-tree)
echo p > f && git add f && pinned=$(git write-tree)
merge1=$(GIT_COMMITTER_DATE='2026-01-02T01:00:00Z' git commit-tree "$merged" -p "$ORIGIN_DEVELOP" -p "$up" -m merge)
pin1=$(GIT_COMMITTER_DATE='2026-01-02T01:00:00Z' git commit-tree "$pinned" -p "$merge1" -m pin)
merge2=$(GIT_COMMITTER_DATE='2026-01-02T02:00:00Z' git commit-tree "$merged" -p "$ORIGIN_DEVELOP" -p "$up" -m merge)
pin2=$(GIT_COMMITTER_DATE='2026-01-02T02:00:00Z' git commit-tree "$pinned" -p "$merge2" -m pin)
merge3=$(git commit-tree "$merged" -p "$ORIGIN_DEVELOP" -p "$up2" -m merge)
pin3=$(git commit-tree "$pinned" -p "$merge3" -m pin)
echo "rerun-first $(attempt "$pin1" sync/upstream-20260102)"
echo "rerun-again $(attempt "$pin2" sync/upstream-20260102)"
echo "rerun-other-upstream $(attempt "$pin3" sync/upstream-20260102)"
# 手工修过的分支：多一个提交，树相同也不复用，也不覆盖。
manual=$(git commit-tree "$pinned" -p "$pin1" -m manual-fix)
git push -q origin "$manual:refs/heads/sync/upstream-20260103"
echo "rerun-manual $(attempt "$pin2" sync/upstream-20260103)"
echo "manual-kept $(git ls-remote origin refs/heads/sync/upstream-20260103 | awk '{print $1}') $manual"
echo "pins $pin1 $pin2"
git ls-remote origin 'refs/heads/sync/*' | awk '{print $2}' | sort | tr '\n' ' '
`
    try {
      const out = execFileSync('bash', ['-c', harness], { cwd: dir, env, encoding: 'utf8' })
      const lines = out.trim().split('\n')
      const sha = (label: string) => lines.find((l) => l.startsWith(`${label} `))?.split(' ')
      const sameCommit = sha('same-commit')!
      expect(sameCommit[1]).toBe('sync/upstream-20260101')
      const sameTree = sha('same-tree')!
      expect(sameTree[1]).toBe('sync/upstream-20260101')
      expect(sameTree[2]).toBe(sameCommit[2])
      expect(sha('other-parent')![1]).toBe('sync/upstream-20260101-2')
      expect(sha('other-tree')![1]).toBe('sync/upstream-20260101-3')
      expect(sha('other-tree-again')![1]).toBe('sync/upstream-20260101-3')
      const [, pin1, pin2] = sha('pins')!
      expect(pin1).not.toBe(pin2)
      expect(sha('rerun-first')!.slice(1)).toEqual(['sync/upstream-20260102', pin1])
      expect(sha('rerun-again')!.slice(1)).toEqual(['sync/upstream-20260102', pin1])
      expect(sha('rerun-other-upstream')![1]).toBe('sync/upstream-20260102-2')
      expect(sha('rerun-manual')!.slice(1)).toEqual(['sync/upstream-20260103-2', pin2])
      const kept = sha('manual-kept')!
      expect(kept[1]).toBe(kept[2])
      expect(lines.at(-1)!.trim()).toBe(
        [
          'refs/heads/sync/upstream-20260101',
          'refs/heads/sync/upstream-20260101-2',
          'refs/heads/sync/upstream-20260101-3',
          'refs/heads/sync/upstream-20260102',
          'refs/heads/sync/upstream-20260102-2',
          'refs/heads/sync/upstream-20260103',
          'refs/heads/sync/upstream-20260103-2'
        ].join(' ')
      )
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('builds the Mac app from origin/develop and records the status file', () => {
    const script = readFileSync(resolve('fork/scripts/mac-auto-update.sh'), 'utf8')
    expect(script).toContain('install-mac-release.sh --build-only')
    expect(script).not.toContain('--install-built')
    expect(script).not.toContain('gh release download')
    expect(script).toContain('Projects/orca-verify/sync-status.json')
    expect(script).toContain('ORCA_PUBLISH_RELEASE')
    expect(script).toContain('ORCA_AUTO_UPDATE_REEXECED')
    expect(script.indexOf('ORCA_AUTO_UPDATE_REEXECED')).toBeLessThan(
      script.indexOf('git reset --hard')
    )
    expect(script.indexOf('${ORCA_AUTO_UPDATE_SCRIPT_COPY:-}')).toBeLessThan(
      script.indexOf('already running')
    )
    expect(script).toContain('refresh_installed_script')
    expect(script).toContain('noclobber')
    expect(script).toContain('setpgrp(0,0)')
    expect(script).toContain('kill -- -')
    const buildBody = script.slice(script.indexOf('build_develop_release()'))
    expect(buildBody.indexOf('already published')).toBeLessThan(
      buildBody.indexOf('require_gh_auth')
    )
    expect(buildBody.indexOf('dist_matches_sha')).toBeLessThan(
      buildBody.indexOf('git reset --hard')
    )
    expect(buildBody.indexOf('require_gh_auth')).toBeLessThan(buildBody.indexOf('git reset --hard'))
    expect(script.slice(script.lastIndexOf('\nuse_node24'))).not.toContain('require_gh_auth')
    const ghAuth = script.slice(
      script.indexOf('require_gh_auth()'),
      script.indexOf('record_gh_auth_failure()')
    )
    expect(ghAuth).toContain('gh auth status')
    expect(ghAuth).not.toContain('finish')
    expect(script).toContain('GH_AUTH="failed"')
    expect(script).toContain('RELEASE="$PREVIOUS_RELEASE"')
    expect(script).toContain('ORCA_CODESIGN_TIMEOUT_SECONDS')
    expect(script).toContain('Always Allow')
    expect(script).toContain('fork/scripts/publish-mac-release.sh')
    expect(script).toContain('latest-mac.yml')
    expect(script).toContain('RELEASE_DMG_PENDING="published-dmg-pending"')
    expect(script).toContain('PUBLISH_DMG_PENDING_EXIT=20')
    expect(script).not.toContain('gh release create')
    expect(script).not.toContain('--publish')
    const publish = readFileSync(resolve('fork/scripts/publish-mac-release.sh'), 'utf8')
    expect(publish).toContain('release create')
    expect(publish).toContain('release edit')
    expect(publish).toContain('release download')
    expect(publish).toContain('--repo "$GH_REPO"')
    expect(publish).toContain('readonly GH_REPO="quzard/orca-fork"')
    expect(publish).toContain('--prerelease')
    expect(publish).toContain('--draft=false')
    expect(publish).toContain('--clobber')
    expect(publish).toContain('EXIT_DMG_PENDING=20')
    expect(publish).toContain('latest-mac.yml')
    expect(publish).not.toContain('stablyai')
    expect(publish).not.toContain('github-update-token')
    expect(publish).not.toContain('safeStorage')
    expect(publish.indexOf('release upload')).toBeGreaterThan(0)
    const publishCall = script.slice(script.indexOf('publish_release()'))
    expect(publishCall.indexOf('check-commit-identity.sh')).toBeLessThan(
      publishCall.indexOf('publish-mac-release.sh')
    )
    expect(script).not.toContain('installedSha')
    const pushGithub = readFileSync(resolve('fork/push_github.sh'), 'utf8')
    expect(pushGithub.indexOf('check-commit-identity.sh')).toBeLessThan(
      pushGithub.indexOf('push_args=(push)')
    )
    expect(publishCall.indexOf('publish-mac-release.sh')).toBeLessThan(
      publishCall.indexOf('git reset --hard')
    )
    const failedTail = script.slice(script.lastIndexOf('if ! build_develop_release'))
    expect(failedTail.indexOf('RESULT="$RELEASE_DMG_PENDING"')).toBeLessThan(
      failedTail.indexOf('RESULT="failed"')
    )
    expect(script).not.toContain('unofficial-builds.nodejs.org')
    expect(script).not.toContain('git push')
    expect(script).toContain('/Applications/OrbStack.app/Contents/MacOS/xbin')
    expect(script).toContain('export PATH="${MAC_TOOL_PATH}:${PATH}"')
    expect(script).toContain('${STATUS_DIR}/node-runtime-cache')
    // The glibc 2.17 Node seed reads upstream's pin instead of a second copy of it.
    expect(script).toContain('nodeRuntimeAsset("linux-x64-glibc217")')
    expect(script).not.toMatch(/GLIBC217_SHA256|node-v\d+\.\d+\.\d+-linux-x64-glibc-217/)
    const plist = readFileSync(
      resolve('fork/scripts/launchd/com.orca.fork.mac-auto-update.plist'),
      'utf8'
    )
    expect(plist).toContain('__BIN__/mac-auto-update.sh')
    expect(plist).not.toContain('__REPO__/fork/scripts/mac-auto-update.sh')
    expect(plist).toContain('<key>ORCA_REPO</key>')
    expect(plist).toContain('<key>StartInterval</key>')
    expect(plist).toContain('<integer>1800</integer>')
    expect(plist).toContain('<key>RunAtLoad</key>')
    expect(plist).toContain('/Applications/OrbStack.app/Contents/MacOS/xbin')
    for (const path of [
      'fork/scripts/mac-auto-update.sh',
      'fork/scripts/publish-mac-release.sh',
      'fork/scripts/publish-bridge-release.sh',
      'fork/scripts/install-mac-auto-update-agent.sh',
      'fork/scripts/uninstall-mac-auto-update-agent.sh'
    ]) {
      execFileSync('bash', ['-n', resolve(path)])
    }
    execFileSync('bash', [resolve('fork/scripts/publish-mac-release.test.sh')], {
      stdio: 'inherit'
    })
    execFileSync('bash', [resolve('fork/scripts/publish-bridge-release.test.sh')], {
      stdio: 'inherit'
    })
    execFileSync('bash', [resolve('fork/scripts/mac-auto-update-seed.test.sh')], {
      stdio: 'inherit'
    })
    execFileSync('bash', [resolve('fork/scripts/check-commit-identity.test.sh')], {
      stdio: 'inherit'
    })
    execFileSync('bash', [resolve('fork/scripts/check-no-internal-refs.test.sh')], {
      stdio: 'inherit'
    })
  })
})
