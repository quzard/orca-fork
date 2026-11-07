// 预览构建的输出目录和编译期开关。日常构建不写标记，也不改 out/。
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { UserConfig } from 'electron-vite'
import type { Plugin } from 'vite'

const requirementPreviewBuild = process.env.ORCA_REQUIREMENT_PREVIEW === '1'

export const REQUIREMENT_PREVIEW_DEFINE = {
  ORCA_REQUIREMENT_PREVIEW_BUILD: requirementPreviewBuild ? 'true' : 'false'
}

export const previewOutRoot = requirementPreviewBuild ? 'out-requirement-preview' : null

export function applyRequirementPreviewVite(config: UserConfig): void {
  config.main = {
    ...config.main,
    define: { ...config.main?.define, ...REQUIREMENT_PREVIEW_DEFINE }
  }
  config.preload = {
    ...config.preload,
    define: { ...config.preload?.define, ...REQUIREMENT_PREVIEW_DEFINE }
  }
  config.renderer = {
    ...config.renderer,
    define: { ...config.renderer?.define, ...REQUIREMENT_PREVIEW_DEFINE }
  }
  if (!previewOutRoot) {
    return
  }
  const marker = requirementPreviewMarkerPlugin()
  config.main = {
    ...config.main,
    plugins: [...(config.main?.plugins ?? []), marker],
    build: { ...config.main?.build, outDir: `${previewOutRoot}/main` }
  }
  config.preload = {
    ...config.preload,
    build: { ...config.preload?.build, outDir: `${previewOutRoot}/preload` }
  }
  config.renderer = {
    ...config.renderer,
    build: { ...config.renderer?.build, outDir: `${previewOutRoot}/renderer` }
  }
}

function requirementPreviewMarkerPlugin(): Plugin {
  return {
    name: 'requirement-preview-marker',
    apply: 'build',
    closeBundle() {
      if (!previewOutRoot) {
        return
      }
      mkdirSync(previewOutRoot, { recursive: true })
      writeFileSync(
        resolve(previewOutRoot, 'requirement-preview-build.json'),
        JSON.stringify({ preview: true })
      )
    }
  }
}
