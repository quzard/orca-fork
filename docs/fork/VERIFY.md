# Linux verification

Node 24 is required. `package.json` sets `"engines": { "node": "24" }`. Node 22.14 cannot import the `.ts` build plugins (`ERR_UNKNOWN_FILE_EXTENSION`), and `pnpm lint` / `pnpm test` / `pnpm build` must run on Node 24. Bun 1.4.3 (`config/.bun-version`) is what `pnpm test` uses to launch Vitest.

Run this on a Linux checkout of `develop` before treating a hook change as behavior-neutral. The scripts stay on this branch.

```bash
bash fork/scripts/verify/run-linux-verify.sh
```

Outputs go to `$OUT_DIR` (default `/tmp/orca-fork-verify`).

## Internal identifiers

`check-no-internal-refs.sh` scans `src/fork`, `src/shared/fork-hooks`, `docs/fork`, `fork/` (scripts and the push script), `FORK-CHANGES.md`, and every file added since the upstream base recorded in `src/cli/skills-source-commit.ts`, of any type. Without that commit it falls back to `*.fork.test.ts(x)` and `*-fork.test.ts(x)`. It fails when a pattern matches. Put one fixed string per line in `fork/scripts/verify/internal-ref-patterns.local` (gitignored) or in `ORCA_INTERNAL_REF_PATTERNS` (newline-separated). When neither is set, the script exits 2 without scanning. It does not scan itself. `run-linux-verify.sh` runs this check first.

## What the scripts check

`screenshot-electron.mjs` builds `electron-vite --mode e2e` when `out/main/index.js` is missing, then launches Electron under Xvfb with `ORCA_BACKGROUND_LAUNCH=1` and `ORCA_E2E_HEADLESS=1`. It uses an isolated `HOME` and `ORCA_E2E_USER_DATA_DIR`, waits for the first window, and writes `fork-base-window.png`. The window stays hidden. Set `ORCA_FORK_VERIFY_SKIP_BUILD=1` to reuse an existing `out/`.

## Checks only a Mac can do

These need macOS, a logged-in GUI session, or a Mac-only binary. Linux does not run them.

- Code signing with the local `Orca Local Signing` identity, and the signed-app install/rollback in the Mac install script (F002).
- macOS keychain prompts versus the file secret store, including a packaged app that must not call Safe Storage (F038). The file backend is registered for packaged macOS; Linux cannot prove the zero Safe Storage count.
- `electron-builder --mac dmg:arm64 zip:arm64` through `fork/scripts/install-mac-release.sh`, `mac.signIgnore`, and the Docker manylinux orcad slots (F002, F036). The installer refuses a non-arm64 Node. Linux runs `bash -n` on that script and on `fork/scripts/build-orcad-linux-prebuilds.sh`, and, after `pnpm build:cli`, `node fork/scripts/verify-packaged-cli-closure.mjs`. A checkout without a Docker daemon does not compile the manylinux slots. The x64 PTY check is not executed because that package is not built.
- Dragging the computer-use app card into System Settings (`pnpm build:computer-macos`, F006). Linux only checks that the Swift source contains the card, `acceptsFirstMouse`, and `hitTest`.
- Opening a workspace from the Cursor `cursor://vscode-remote` link, and from a VS Code Remote SSH row on a managed-server workspace (F021, F043). That needs the editor installed and a reachable SSH host.
- A signed Mac app. The deep link and the permission card are not a substitute for that check.
