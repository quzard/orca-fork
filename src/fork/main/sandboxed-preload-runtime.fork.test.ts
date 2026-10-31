import { describe, expect, it } from 'vitest'
import type { OutputBundle } from 'rolldown'
import {
  SANDBOXED_PRELOAD_ENTRY_FILES,
  assertSandboxedPreloadsHaveNoChunkRequires,
  inlineRolldownRuntimeIntoSandboxedPreloads
} from './sandboxed-preload-runtime'

const RUNTIME_NAME = 'chunks/rolldown-runtime-Cj7rkB0V.js'
const RUNTIME_CODE = 'exports.__toESM = function __toESM(mod) { return mod };'

function bundle(): OutputBundle {
  // SAFETY: the plugin reads only type, fileName and code of each chunk.
  return {
    'index.js': {
      type: 'chunk',
      fileName: 'index.js',
      code: `const runtime = require("./${RUNTIME_NAME}");`
    },
    'browser-window-close-preload.js': {
      type: 'chunk',
      fileName: 'browser-window-close-preload.js',
      code: `const runtime = require("./${RUNTIME_NAME}");\nruntime.__toESM(require("electron"));`
    },
    'doc-preview-link-preload.js': {
      type: 'chunk',
      fileName: 'doc-preview-link-preload.js',
      code: `const runtime = require("./${RUNTIME_NAME}");`
    },
    [RUNTIME_NAME]: {
      type: 'chunk',
      fileName: RUNTIME_NAME,
      code: RUNTIME_CODE
    }
  } as unknown as OutputBundle
}

describe('sandboxed preload rolldown runtime', () => {
  it('inlines the runtime chunk into both preload entries and leaves it for the main bundle', () => {
    const output = bundle()
    expect(inlineRolldownRuntimeIntoSandboxedPreloads(output)).toEqual([
      ...SANDBOXED_PRELOAD_ENTRY_FILES
    ])
    for (const fileName of SANDBOXED_PRELOAD_ENTRY_FILES) {
      const entry = output[fileName]
      expect(entry?.type).toBe('chunk')
      if (entry?.type !== 'chunk') {
        continue
      }
      expect(entry.code).not.toContain('rolldown-runtime-')
      expect(entry.code).toContain(RUNTIME_CODE)
      expect(entry.code).toContain('return module.exports;')
    }
    const main = output['index.js']
    expect(main?.type).toBe('chunk')
    if (main?.type === 'chunk') {
      expect(main.code).toContain(`require("./${RUNTIME_NAME}")`)
    }
    expect(output[RUNTIME_NAME]?.type).toBe('chunk')
    expect(() => assertSandboxedPreloadsHaveNoChunkRequires(output)).not.toThrow()
  })

  it('fails when a preload still requires a chunk after inlining', () => {
    const output = bundle()
    const runtime = output[RUNTIME_NAME]
    if (runtime?.type === 'chunk') {
      runtime.code = `${RUNTIME_CODE}\nrequire("./chunks/rolldown-runtime-other.js");`
    }
    inlineRolldownRuntimeIntoSandboxedPreloads(output)
    expect(() => assertSandboxedPreloadsHaveNoChunkRequires(output)).toThrow(
      /still require \.\/chunks\//
    )
  })

  it('fails when the runtime require pattern no longer matches but a chunk require remains', () => {
    const output = bundle()
    const preload = output['browser-window-close-preload.js']
    if (preload?.type === 'chunk') {
      preload.code = 'require("./chunks/helper.js");'
    }
    expect(inlineRolldownRuntimeIntoSandboxedPreloads(output)).toEqual([
      'doc-preview-link-preload.js'
    ])
    expect(() => assertSandboxedPreloadsHaveNoChunkRequires(output)).toThrow(
      /browser-window-close-preload\.js/
    )
  })
})
