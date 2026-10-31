import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import {
  computerUsePermissionHelperArgs,
  registerComputerUsePermissionHelperArgs
} from '../../shared/fork-hooks/computer-use-permission'
import { FORK_PERMISSION_DRAG_CARD_ARG } from './permission-card'

const SWIFT = 'native/computer-use-macos/Sources/OrcaComputerUseMacOS'

describe('computer-use permission card', () => {
  afterEach(() => registerComputerUsePermissionHelperArgs([]))

  it('adds nothing to the helper launch until the fork registers it', () => {
    expect(computerUsePermissionHelperArgs()).toEqual([])
    registerComputerUsePermissionHelperArgs([FORK_PERMISSION_DRAG_CARD_ARG])
    expect(computerUsePermissionHelperArgs()).toEqual(['--fork-drag-card'])
  })

  // The Swift side runs only in the macOS helper; this pins the cross-language contract.
  it('switches the Swift card on with the same argument and wires it into the window', () => {
    const card = readFileSync(`${SWIFT}/ForkPermissionCard.swift`, 'utf8')
    expect(card).toContain(`static let argument = "${FORK_PERMISSION_DRAG_CARD_ARG}"`)
    const main = readFileSync(`${SWIFT}/main.swift`, 'utf8')
    expect(main).toContain('ForkPermissionCard.install(in: header, replacing: icon')
    expect(main).toContain('if ForkPermissionCard.enabled { windowController?.showWindow(nil) }')
  })
})
