// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkspacePort } from '../../shared/workspace-ports'
import { LocalPortRow } from '../../renderer/src/components/right-sidebar/local-port-row'
import { ForkPortForward } from './workspace-port-forward'
import { enableWorkspacePortForward } from './workspace-port-forward-flag'

const port: WorkspacePort = {
  id: 'p-5173',
  kind: 'external',
  bindHost: '0.0.0.0',
  connectHost: 'localhost',
  port: 5173,
  processName: 'vite',
  protocol: 'http'
}

function renderPanel(targetId: string | null): void {
  render(
    <>
      <LocalPortRow port={port} onStop={vi.fn()} onShowDetails={vi.fn()} />
      <ForkPortForward.Dialog targetId={targetId} />
    </>
  )
}

afterEach(() => {
  cleanup()
})

// Order matters: the flag has no off switch, as in the app.
describe('Forward on a detected port of a managed-server workspace', () => {
  it('adds nothing to the row until the renderer registers it', () => {
    renderPanel('ssh-target-1')
    expect(screen.queryByRole('button', { name: 'Forward' })).toBeNull()
  })

  it('needs an SSH forward target even after registration', () => {
    enableWorkspacePortForward()
    renderPanel(null)
    expect(screen.queryByRole('button', { name: 'Forward' })).toBeNull()
  })

  it('opens the existing forward dialog with the port, localhost and process name', () => {
    enableWorkspacePortForward()
    renderPanel('ssh-target-1')
    fireEvent.click(screen.getByRole('button', { name: 'Forward' }))
    expect(screen.getByText('Forward a Port')).toBeTruthy()
    expect(screen.getAllByDisplayValue('5173').length).toBeGreaterThan(0)
    expect(screen.getByDisplayValue('localhost')).toBeTruthy()
    expect(screen.getByDisplayValue('vite')).toBeTruthy()
  })

  it('drops the button once the panel that owns the dialog unmounts', () => {
    enableWorkspacePortForward()
    renderPanel('ssh-target-1')
    expect(screen.getByRole('button', { name: 'Forward' })).toBeTruthy()
    cleanup()
    render(<LocalPortRow port={port} onStop={vi.fn()} onShowDetails={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Forward' })).toBeNull()
  })
})
