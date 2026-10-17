import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
describe('fork daily sync split', () => {
  it('points fork release checks at quzard/orca and skips them without a token', () => {
    const setup = readFileSync(resolve('src/main/updater/updater-setup.ts'), 'utf8')
    const pin = readFileSync(resolve('src/main/updater/updater-release-feed.ts'), 'utf8')
    const schedule = readFileSync(resolve('src/main/updater/updater-scheduling.ts'), 'utf8')
    const menu = readFileSync(resolve('src/main/updater/updater-menu-checks.ts'), 'utf8')
    const download = readFileSync(resolve('src/main/updater/updater-download-install.ts'), 'utf8')
    const feed = readFileSync(resolve('src/fork/update-feed.ts'), 'utf8')
    expect(setup).toContain('forkUpstreamReleaseReadsBlocked()')
    expect(pin).toContain('forkReleaseFeedDecision()')
    expect(pin.indexOf('forkReleaseFeedDecision()')).toBeLessThan(
      pin.indexOf('fetchNewerReleaseTagsWithReadiness(')
    )
    expect(pin.indexOf('installPrivateGithubDifferentialDownload()')).toBeLessThan(
      pin.indexOf('autoUpdater.setFeedURL(forkFeed.feed)')
    )
    expect(schedule).toContain("kind === 'skip'")
    expect(menu).toContain('FORK_GITHUB_UPDATE_TOKEN_HINT')
    expect(download).not.toContain('forkBuiltinUpdateNotifyOnly')
    const builds = readFileSync(resolve('src/main/updater-release-builds.ts'), 'utf8')
    expect(builds.indexOf("from './updater-fallback'")).toBeLessThan(
      builds.indexOf("from './updater-release-api-token'")
    )
    const selection = readFileSync(resolve('src/main/updater/updater-build-selection.ts'), 'utf8')
    expect(selection.indexOf("from '../updater-fallback'")).toBeLessThan(
      selection.indexOf('profileStateBuildCompatibilityError')
    )
    expect(feed).toContain('readGithubUpdateToken')
    expect(feed).not.toContain('safeStorage')
    expect(feed).not.toContain('auth token')
  })

  it('pushes only develop after checks, and parks failures on a sync branch', () => {
    const script = readFileSync(resolve('fork/scripts/daily-sync.sh'), 'utf8')
    expect(script).toContain('git checkout -B develop origin/develop')
    expect(script).toContain('git branch -f fork/base-upstream')
    expect(script).toContain('sync-skills-source-commit.mjs')
    expect(script).toContain('check-no-internal-refs.sh')
    expect(script).toContain('pnpm exec oxlint')
    expect(script).toContain('pnpm tc')
    expect(script).toContain('build-orcad-template.mjs')
    expect(script).toContain('--force-with-lease="refs/heads/develop:${ORIGIN_DEVELOP}"')
    expect(script).toContain('sync/upstream-')
    expect(script).not.toContain('workflow_dispatch')
    expect(script).not.toContain('gh workflow')
    expect(script).not.toContain('git push --tags')
    execFileSync('bash', ['-n', resolve('fork/scripts/daily-sync.sh')])
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
    expect(script).toContain('gh release create')
    expect(script).toContain('latest-mac.yml')
    expect(script).toContain('--repo quzard/orca')
    expect(script).toContain('--prerelease')
    expect(script).not.toContain('--publish')
    expect(script).not.toContain('unofficial-builds.nodejs.org')
    expect(script).not.toContain('git push')
    expect(script).toContain('/Applications/OrbStack.app/Contents/MacOS/xbin')
    expect(script).toContain('export PATH="${MAC_TOOL_PATH}:${PATH}"')
    expect(script).toContain('${STATUS_DIR}/node-runtime-cache')
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
      'fork/scripts/install-mac-auto-update-agent.sh',
      'fork/scripts/uninstall-mac-auto-update-agent.sh'
    ]) {
      execFileSync('bash', ['-n', resolve(path)])
    }
  })
})
