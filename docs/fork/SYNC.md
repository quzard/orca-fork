# Syncing fork/base with upstream

`fork/base` starts at the upstream commit last merged (`17a2bced1115f064e834e397c2b949d9e150d275`). Feature work lands in `src/fork/` and should not rewrite upstream files beyond the hooks in [HOOKS.md](./HOOKS.md). The patch stack is one commit on that upstream head: the earlier history was four branches merged together, and replaying those merges onto a new main reordered the same hook files.

## One-time git config

`merge=ours` in `.gitattributes` does nothing until this repo defines the driver. `rerere` remembers hook conflict resolutions. Each `merge=ours` entry is its own later line. Do not append it to an existing `text eol=lf` line: the skill-guide check requires that pin to stay exact, and a later line overrides only the `merge` attribute.

```bash
git config rerere.enabled true
git config merge.ours.driver true
```

`merge.ours.driver true` keeps the current branch’s copy of a generated file. After the merge, regenerate that file from the merged sources and commit the result. Do not leave a stale manifest in place.

Generated paths marked `merge=ours`:

- `resources/skills/current-manifest.json` (and the rest of `resources/skills/*.json`)
- `src/cli/bundled-skill-guides.ts`
- `skills/*/SKILL.md`
- `src/shared/rpc-contract/rpc-params-catalog.generated.ts`
- `src/renderer/src/i18n/en-runtime-required.json`
- `src/main/acp/generated/*.generated.ts`

## Rebase

```bash
git fetch https://github.com/stablyai/orca.git main
git checkout fork/base
git rebase <upstream-main-sha>
```

Conflicts should be limited to the `// fork:` lines listed in HOOKS.md. Keep the upstream side, then re-apply the hook call if the surrounding function moved. After the first resolution, `git rerere` replays it on the next sync.

```bash
git rerere status
# fix the file, then
git add <file>
git rebase --continue
```

Then regenerate catalogs and skills from the scripts in `package.json` (`verify:rpc-params-catalog`, `verify:bundled-skill-guides`, `verify:skill-bundle-manifest`, `verify:localization-runtime-catalog`) and run the checks in [VERIFY.md](./VERIFY.md).
