import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const SOURCE = 'native/computer-use-macos/Sources/OrcaComputerUseMacOS/main.swift'

describe('computer-use permission card', () => {
  it('shows a draggable app card in the authorization window', () => {
    const source = readFileSync(SOURCE, 'utf8')
    expect(source).toContain(
      'Drag the app card below into the permission list in System Settings, then enable its switch.'
    )
    expect(source).toContain('let appTile = DraggableAppTile(appURL: appURL)')
    expect(source).toContain('appTile.heightAnchor.constraint(equalToConstant: 42)')
    expect(source).toContain('appTile.widthAnchor.constraint(equalTo: stack.widthAnchor)')
    expect(source).toContain('NSStackView(views: [title, subtitle, appTile])')
    expect(source).toContain(
      'override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }'
    )
    expect(source).toContain('super.hitTest(point) == nil ? nil : self')
    expect(source).toContain('windowController?.showWindow(nil)')
  })
})
