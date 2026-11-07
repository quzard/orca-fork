import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { resolveRuntimeOutputEntry } from './output-root'

const { assertPreviewInputTree } = createRequire(import.meta.url)('./packaging.cjs')

describe('preview output tree', () => {
  it('uses the preview daemon when both trees exist and refuses a missing preview tree', () => {
    const root = mkdtempSync(join(tmpdir(), 'orca-preview-tree-'))
    try {
      const daily = join(root, 'out', 'main', 'daemon-entry.js')
      const preview = join(root, 'out-requirement-preview', 'main', 'daemon-entry.js')
      mkdirSync(join(root, 'out', 'main'), { recursive: true })
      writeFileSync(daily, 'daily')
      expect(() =>
        resolveRuntimeOutputEntry({
          basePath: root,
          segments: ['main', 'daemon-entry.js'],
          preview: true,
          exists: (path) => path === daily
        })
      ).toThrow(/will not use/)
      mkdirSync(join(root, 'out-requirement-preview', 'main'), { recursive: true })
      writeFileSync(preview, 'preview')
      expect(
        resolveRuntimeOutputEntry({
          basePath: root,
          segments: ['main', 'daemon-entry.js'],
          preview: true,
          exists: (path) => path === daily || path === preview
        })
      ).toBe(preview)
      const launchedMain = join(root, 'out-requirement-preview', 'main')
      mkdirSync(join(root, 'out-requirement-preview', 'cli'), { recursive: true })
      writeFileSync(join(root, 'out-requirement-preview', 'cli', 'index.js'), 'cli')
      expect(
        resolveRuntimeOutputEntry({
          basePath: launchedMain,
          segments: ['cli', 'index.js'],
          preview: true,
          exists: existsSync
        })
      ).toBe(join(launchedMain, '..', 'cli', 'index.js'))
      expect(
        resolveRuntimeOutputEntry({
          basePath: root,
          segments: ['main', 'daemon-entry.js'],
          preview: false,
          exists: () => false
        })
      ).toBe(daily)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects packaging input when only the daily tree exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'orca-preview-missing-'))
    try {
      mkdirSync(join(root, 'out', 'main'), { recursive: true })
      writeFileSync(join(root, 'out', 'main', 'index.js'), 'daily')
      expect(() => assertPreviewInputTree(root)).toThrow(/will not be used/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('points the real packager manifest at the preview tree only when the env is set', () => {
    const preview = execFileSync(
      'node',
      [
        '-e',
        `process.env.ORCA_REQUIREMENT_PREVIEW='1';
         const config = require('./config/electron-builder.config.cjs');
         const unpack = config.asarUnpack.join('\\n');
         if (unpack.includes('out/main/daemon-entry.js')) process.exit(2);
         if (!unpack.includes('out-requirement-preview/main/daemon-entry.js')) process.exit(3);
         if (!unpack.includes('out-requirement-preview/cli/**')) process.exit(4);
         if (!config.files.includes('!out/**')) process.exit(5);
         if (config.extraMetadata.main !== './out-requirement-preview/main/index.js') process.exit(6);`
      ],
      { cwd: process.cwd() }
    )
    expect(preview.toString()).toBe('')
    const publishRoot = mkdtempSync(join(tmpdir(), 'orca-publish-'))
    try {
      mkdirSync(join(publishRoot, 'out-requirement-preview'), { recursive: true })
      writeFileSync(
        join(publishRoot, 'out-requirement-preview', 'requirement-preview-build.json'),
        '{"preview":true}\n'
      )
      mkdirSync(join(publishRoot, 'dist'), { recursive: true })
      writeFileSync(join(publishRoot, 'dist', 'latest-mac.yml'), 'path: orca-macos-arm64.zip\n')
      execFileSync('bash', [
        '-c',
        'source "$1"; refuse_if_selected_payload_is_preview "$2" "$3"',
        'bash',
        'fork/scripts/refuse-daily-preview-payload.sh',
        join(publishRoot, 'dist'),
        publishRoot
      ])
      writeFileSync(
        join(publishRoot, 'dist', 'latest-mac.yml'),
        'path: orca-requirement-preview-macos-arm64.zip\n'
      )
      expect(() =>
        execFileSync('bash', [
          '-c',
          'source "$1"; refuse_if_selected_payload_is_preview "$2" "$3"',
          'bash',
          'fork/scripts/refuse-daily-preview-payload.sh',
          join(publishRoot, 'dist'),
          publishRoot
        ])
      ).toThrow(/requirement preview payload/)
    } finally {
      rmSync(publishRoot, { recursive: true, force: true })
    }
    execFileSync(
      'node',
      [
        '-e',
        `delete process.env.ORCA_REQUIREMENT_PREVIEW;
         const config = require('./config/electron-builder.config.cjs');
         const unpack = config.asarUnpack.join('\\n');
         if (!unpack.includes('out/main/daemon-entry.js')) process.exit(2);
         if (unpack.includes('out-requirement-preview/main/daemon-entry.js')) process.exit(3);`
      ],
      { cwd: process.cwd() }
    )
  })
})
