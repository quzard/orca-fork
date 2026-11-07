#!/usr/bin/env node
// 先编预览树，再允许打包。日常 out/ 可以同时存在，但不能被当成预览入口。
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { buildCli } from '../../config/scripts/cli-build/build-cli.mjs'
import { resolveBuildSourceCommit } from '../../config/scripts/build-identity/build-source-commit.mjs'

const { PREVIEW_OUTPUT_ROOT, assertPreviewInputTree } = createRequire(import.meta.url)(
  '../../src/fork/requirement-preview/packaging.cjs'
)

export { PREVIEW_OUTPUT_ROOT, assertPreviewInputTree }

function writeCliPackageBoundary(root) {
  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const destination = join(root, PREVIEW_OUTPUT_ROOT, 'package.json')
  mkdirSync(join(root, PREVIEW_OUTPUT_ROOT), { recursive: true })
  writeFileSync(
    destination,
    `${JSON.stringify(
      {
        name: 'orca-requirement-preview-output',
        type: 'commonjs',
        private: true,
        version: packageJson.version,
        commit: resolveBuildSourceCommit()
      },
      null,
      2
    )}\n`
  )
}

function run(command, args, env) {
  const result = spawnSync(command, args, { env, stdio: 'inherit' })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed (${result.status ?? 'signal'})`)
  }
}

export async function buildRequirementPreview(options = {}) {
  const root = options.root ?? process.cwd()
  const env = { ...process.env, ORCA_REQUIREMENT_PREVIEW: '1' }
  if (!options.skipCompile) {
    run(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['build:electron-vite'], env)
    await buildCli({ root, outDir: PREVIEW_OUTPUT_ROOT })
    writeCliPackageBoundary(root)
  }
  assertPreviewInputTree(root)
  if (!options.packageTargets?.length) {
    return
  }
  run(
    process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
    [
      'exec',
      'electron-builder',
      '--config',
      'config/electron-builder.config.cjs',
      '--mac',
      ...options.packageTargets
    ],
    env
  )
}

if (process.argv[1] && process.argv[1].endsWith('build-requirement-preview.mjs')) {
  const packageTargets = process.argv.slice(2)
  buildRequirementPreview({ packageTargets }).catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
