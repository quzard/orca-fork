# Fork rework brief (shared by all rework agents)

Branch base: `fork/rework-20261101` = develop + upstream main through 4365547899 (merge 2192cea2f6) + skills pin.
Upstream base for diffs: `upstream/main` (4365547899). See the fork delta with
`git diff upstream/main HEAD -- <path>` and the old fork's intent with `git diff eb3379ff99 develop -- <path>`.

Read first: `AGENTS.md`, `FORK-CHANGES.md` (the requirements, in Chinese), `docs/fork/HOOKS.md` (long; grep it).

## User and environment

- The user runs the desktop app on an Apple Silicon Mac and SSHes to x86_64 Linux servers
  (direct SSH workspaces, and managed `orcad` deployed over SSH). Those paths matter most; Windows,
  WSL and Linux desktop must keep working (cross-platform rule in AGENTS.md).
- A bot merges upstream `main` into `develop` every day (`fork/scripts/daily-sync.sh`). Every line the
  fork changes in an upstream file is a future merge conflict. Sync cost is a first-class requirement.

## Rules for upstream files (anything outside `src/fork/`, `src/shared/fork-hooks/`, `fork/`, `docs/fork/`)

1. Only hook calls. Logic lives in `src/fork/**` (renderer code `.tsx`, main-only code in `src/fork/main/`),
   registries in `src/shared/fork-hooks/`. An unregistered hook must leave upstream behavior exactly.
2. Never move, copy, re-indent or reformat upstream code. Wrapping an upstream expression so its lines
   re-indent is not allowed: add one line (a spread, a call, an early return) instead.
3. Line caps (`max-lines`: 300 for .ts, 400 for .tsx): if an upstream file goes over because of a hook line,
   put `/* oxlint-disable max-lines -- fork: hook call only */` as the FIRST line of that file. Do not move
   upstream code into fork files to dodge the cap. Undo existing relocations of that kind in your area.
4. Keep each hook call to as few lines as possible and next to stable code, marked `// fork:` only when the
   line does not explain itself.
5. Fork tests go in `src/fork/**/*.fork.test.ts(x)`, not in upstream test files. Move existing fork additions
   out of upstream test files in your area.
6. If upstream now covers a fork behavior, delete the fork code and use upstream.
7. Type assertions need a line-specific `SAFETY:` comment (AGENTS.md). No dead code.

## Process

- Work only in your own worktree and branch. Commit there in small logical commits. Git identity is already
  `quzard <30899719+quzard@users.noreply.github.com>`; do not change it. End each commit message with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Do not edit `FORK-CHANGES.md`, `docs/fork/AUDIT.md`, `docs/fork/HOOKS.md`; instead write your doc updates
  (Chinese, same style as FORK-CHANGES) into `docs/fork/rework-notes/<area>.md` in your worktree.
- Do not push, do not touch `develop`, do not touch `/Users/tom/Projects/orca-fork` (the LaunchAgent uses it).
- Validate: `pnpm tc`, `pnpm exec oxlint <changed files>`, fork tests
  `node config/scripts/run-vitest.mjs run --config config/vitest.config.ts --maxWorkers=2 <paths>`, and the
  upstream tests next to every upstream file you touched. Run with `ORCA_BACKGROUND_LAUNCH=1`.
  Never launch or show app windows; never steal focus.
- No employer/internal names in new files.
- Final report (your last message): what changed per requirement, fork code removed, bugs fixed, the
  `git diff --stat upstream/main HEAD -- . ':!src/fork' ':!src/shared/fork-hooks' ':!fork' ':!docs/fork'`
  for your area before/after, tests run with results, and anything you could not verify.
