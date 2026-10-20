import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  forkMarkdownPreviewSourceFields,
  registerMarkdownPreviewSourceFields
} from '../../shared/fork-hooks/markdown-preview-source-fields'
import { markdownPreviewGrantFields, registerMarkdownPreviewGrant } from './markdown-preview-grant'

const TABS = [
  { id: 'granted', terminalArtifactGrantId: 'grant-1' },
  { id: 'plain' },
  { id: 'blank-grant', terminalArtifactGrantId: '' }
]

describe('markdown preview source fields hook', () => {
  afterEach(() => {
    registerMarkdownPreviewSourceFields(undefined)
  })

  it('unregistered, returns one frozen empty object without reading the tabs', () => {
    const tabs = { find: vi.fn() } as unknown as typeof TABS
    const first = forkMarkdownPreviewSourceFields(tabs, 'granted')
    expect(first).toEqual({})
    expect(Object.isFrozen(first)).toBe(true)
    expect(forkMarkdownPreviewSourceFields(TABS, 'plain')).toBe(first)
    expect((tabs as unknown as { find: ReturnType<typeof vi.fn> }).find).not.toHaveBeenCalled()
  })

  it('registered, copies the grant and makes the preview read-only', () => {
    registerMarkdownPreviewGrant()
    expect(forkMarkdownPreviewSourceFields(TABS, 'granted')).toEqual({
      terminalArtifactGrantId: 'grant-1',
      readOnly: true
    })
  })

  it('registered, adds nothing for a source without a grant or a missing source', () => {
    registerMarkdownPreviewGrant()
    expect(forkMarkdownPreviewSourceFields(TABS, 'plain')).toEqual({})
    expect(forkMarkdownPreviewSourceFields(TABS, 'blank-grant')).toEqual({})
    expect(forkMarkdownPreviewSourceFields(TABS, 'gone')).toEqual({})
  })

  it('markdownPreviewGrantFields never sets readOnly without a grant', () => {
    expect(markdownPreviewGrantFields({ id: 'plain' })).toEqual({})
  })
})
