// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ReviewPane } from './review-pane'

vi.mock('@monaco-editor/react', () => ({
  DiffEditor: (props: { original: string; modified: string }) => (
    <div data-testid="diff-editor">
      {props.original}:{props.modified}
    </div>
  )
}))

vi.mock('../i18n/fork-translate', () => ({
  forkTranslate: (_key: string, fallback: string) => fallback
}))

describe('requirement review pane', () => {
  it('compares the two files the user selects', () => {
    const onToggle = vi.fn()
    const catalog = {
      ref: { workspaceId: 'wt-catalog', relativePath: 'src/a.ts', source: 'uncommitted' as const },
      label: 'catalog: src/a.ts'
    }
    const billing = {
      ref: { workspaceId: 'wt-billing', relativePath: 'lib/b.ts', source: 'uncommitted' as const },
      label: 'billing: lib/b.ts'
    }
    const view = render(
      <ReviewPane
        files={[catalog, billing]}
        selected={[]}
        mode="diff"
        left={null}
        right={null}
        loadError={null}
        relativeBase="unsupported"
        onToggle={onToggle}
        onMode={() => undefined}
        onLoadRelativeBase={() => undefined}
      />
    )
    expect(screen.queryByTestId('diff-editor')).toBeNull()
    expect(screen.getByText(/Relative base stays unloaded/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /catalog: src\/a.ts/ }))
    expect(onToggle).toHaveBeenCalledWith(catalog.ref)
    view.rerender(
      <ReviewPane
        files={[catalog, billing]}
        selected={[catalog.ref, billing.ref]}
        mode="diff"
        left="left-text"
        right="right-text"
        loadError={null}
        relativeBase="unsupported"
        onToggle={onToggle}
        onMode={() => undefined}
        onLoadRelativeBase={() => undefined}
      />
    )
    expect(screen.getByTestId('diff-editor').textContent).toBe('left-text:right-text')
    cleanup()
  })
})
