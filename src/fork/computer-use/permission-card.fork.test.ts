import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import {
  computerUsePermissionHelperArgs,
  registerComputerUsePermissionHelperArgs
} from '../../shared/fork-hooks/computer-use-permission'
import { FORK_PERMISSION_DRAG_CARD_ARG } from './permission-card'

const SOURCE = 'native/computer-use-macos/Sources/OrcaComputerUseMacOS/main.swift'
const source = readFileSync(SOURCE, 'utf8')

describe('computer-use permission card', () => {
  afterEach(() => registerComputerUsePermissionHelperArgs([]))

  it('is switched on by the argument the fork app passes', () => {
    expect(source).toContain(`static let argument = "${FORK_PERMISSION_DRAG_CARD_ARG}"`)
    expect(source).toContain('static let enabled = CommandLine.arguments.contains(argument)')
  })

  it('keeps the card in one place in every state, and drags only while one is missing', () => {
    expect(source).toContain('let usesCardLayout = ForkPermissionCard.enabled')
    expect(source).toContain(
      'let showsDragCard = ForkPermissionCard.enabled && !checking && !ready'
    )
    expect(source).toContain(
      'let appTile = DraggableAppTile(appURL: appURL, dragEnabled: showsDragCard)'
    )
    expect(source).toContain('appTile.heightAnchor.constraint(equalToConstant: 42)')
    expect(source).toContain('guard dragEnabled else { return }')
    // No blank placeholder while checking: the card itself holds the place.
    expect(source).not.toContain('holdsDragCardSlot')
    expect(source).not.toMatch(/let slot = NSView\(\)/)
    expect(source).toContain(
      'views: usesCardLayout ? [title, subtitle, headerArt] : [headerArt, title, subtitle]'
    )
    expect(source).toContain(
      'Drag the app card below into the permission list in System Settings, then enable its switch.'
    )
  })

  it('keeps the upstream icon, copy and drag tile when the argument is absent', () => {
    expect(source).toContain('icon.widthAnchor.constraint(equalToConstant: 58)')
    expect(source).toContain('"Grant permissions so Orca can use apps when you ask."')
    // The drag assistant still builds the tile the upstream way, with the drag on.
    expect(source).toContain('let dragTile = DraggableAppTile(appURL: appURL)')
    expect(source).toContain('init(appURL: URL, dragEnabled: Bool = true)')
  })

  it('gates the inactive-window drag and the window-stays-up change', () => {
    expect(source).toContain(
      'ForkPermissionCard.enabled ? true : super.acceptsFirstMouse(for: event)'
    )
    expect(source).toContain('guard ForkPermissionCard.enabled else { return hit }')
    expect(source).toMatch(
      /if ForkPermissionCard\.enabled \{\n(?:.*\n)?\s*windowController\?\.showWindow\(nil\)\n\s*\}\n\s*windowController\?\.openPermission\(initialPermission\)/
    )
  })

  it('adds nothing to the helper launch until the fork registers it', () => {
    expect(computerUsePermissionHelperArgs()).toEqual([])
    registerComputerUsePermissionHelperArgs([FORK_PERMISSION_DRAG_CARD_ARG])
    expect(computerUsePermissionHelperArgs()).toEqual(['--fork-drag-card'])
  })

  it('the fork registers the argument in the desktop process', () => {
    const register = readFileSync('src/fork/main/register-electron.ts', 'utf8')
    expect(register).toContain(
      'registerComputerUsePermissionHelperArgs([FORK_PERMISSION_DRAG_CARD_ARG])'
    )
    const launcher = readFileSync('src/main/computer/macos-computer-use-permissions.ts', 'utf8')
    expect(launcher).toContain('...computerUsePermissionHelperArgs()')
  })
})
