// @vitest-environment happy-dom
// The renderer entry registers the markdown preview grant hook.
import { beforeAll, describe, expect, it } from 'vitest'
import { forkMarkdownPreviewSourceFields } from '../../shared/fork-hooks/markdown-preview-source-fields'
import { registerForkModules } from '../register'
import { registerForkRendererModules } from '../register-renderer'

describe('registerForkRendererModules', () => {
  beforeAll(() => {
    registerForkModules()
    registerForkRendererModules()
  })

  it('makes markdown previews inherit a source tab grant', () => {
    expect(
      forkMarkdownPreviewSourceFields([{ id: 'src', terminalArtifactGrantId: 'grant-1' }], 'src')
    ).toEqual({ terminalArtifactGrantId: 'grant-1', readOnly: true })
  })
})
