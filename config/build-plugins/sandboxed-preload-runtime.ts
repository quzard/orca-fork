import type { OutputBundle, Plugin } from 'rolldown'

/** 沙箱 webview 的 preload。它们和主进程打在同一次 Rolldown 里，不能再 require 共享 chunk。 */
export const SANDBOXED_PRELOAD_ENTRY_FILES = [
  'browser-window-close-preload.js',
  'doc-preview-link-preload.js'
] as const

const RUNTIME_CHUNK_REQUIRE = /require\(\s*(['"])\.\/chunks\/(rolldown-runtime-[^'"]+\.js)\1\s*\)/g

/** 沙箱 preload 里任何 ./chunks/ require 都不能留下，包括内联进去的运行时再去 require 别的 chunk。 */
const PRELOAD_CHUNK_REQUIRE = /require\(\s*['"]\.\/chunks\//

function runtimeFactory(code: string): string {
  // 沙箱 preloadRequire 解析不了 ./chunks/rolldown-runtime-*.js。把这份 CJS 运行时就地求值。
  return `(function(){var module={exports:{}};var exports=module.exports;${code}\nreturn module.exports;})()`
}

/** 把两个沙箱 preload 里的 rolldown-runtime require 换成内联。其它入口仍用原来的 chunk。 */
export function inlineRolldownRuntimeIntoSandboxedPreloads(bundle: OutputBundle): string[] {
  const inlined: string[] = []
  for (const fileName of SANDBOXED_PRELOAD_ENTRY_FILES) {
    const entry = bundle[fileName]
    if (!entry || entry.type !== 'chunk') {
      continue
    }
    RUNTIME_CHUNK_REQUIRE.lastIndex = 0
    const match = RUNTIME_CHUNK_REQUIRE.exec(entry.code)
    if (!match) {
      continue
    }
    const runtime = bundle[`chunks/${match[2]}`]
    if (!runtime || runtime.type !== 'chunk') {
      continue
    }
    const factory = runtimeFactory(runtime.code)
    RUNTIME_CHUNK_REQUIRE.lastIndex = 0
    entry.code = entry.code.replace(RUNTIME_CHUNK_REQUIRE, () => factory)
    inlined.push(fileName)
  }
  return inlined
}

/** Rolldown 升级后 require 写法变了也必须失败，不能悄悄把 preload 打回沙箱加载不了的样子。 */
export function assertSandboxedPreloadsHaveNoChunkRequires(bundle: OutputBundle): void {
  const offenders: string[] = []
  for (const fileName of SANDBOXED_PRELOAD_ENTRY_FILES) {
    const entry = bundle[fileName]
    if (!entry || entry.type !== 'chunk') {
      offenders.push(`${fileName} (missing)`)
      continue
    }
    if (PRELOAD_CHUNK_REQUIRE.test(entry.code)) {
      offenders.push(fileName)
    }
  }
  if (offenders.length > 0) {
    throw new Error(
      `Sandboxed preloads still require ./chunks/: ${offenders.join(', ')}. preloadRequire cannot load Rolldown helper chunks.`
    )
  }
}

export function createSandboxedPreloadRuntimeInlinePlugin(): Plugin {
  return {
    name: 'inline-sandboxed-preload-rolldown-runtime',
    generateBundle(_options, bundle) {
      inlineRolldownRuntimeIntoSandboxedPreloads(bundle)
      assertSandboxedPreloadsHaveNoChunkRequires(bundle)
    }
  }
}
