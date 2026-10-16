import { defineConfig } from 'vitest/config'
import { createWorkspaceSourceResolver } from '../../config/scripts/workspace-source-exports.mjs'

// One-off runner so the corpus measurement stays out of the unit include list.
export default defineConfig({
  resolve: {
    alias: [
      ...createWorkspaceSourceResolver().aliases,
      { find: 'fs/promises', replacement: 'node:fs/promises' },
      { find: 'fs', replacement: 'node:fs' },
      { find: 'os', replacement: 'node:os' }
    ]
  },
  test: {
    environment: 'node',
    include: ['fork/scripts/measure-ai-vault-scan.fork.test.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 900_000,
    hookTimeout: 900_000
  }
})
