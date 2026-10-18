import { randomBytes } from 'node:crypto'
import type * as FileSystem from 'node:fs'
import {
  existsSync,
  linkSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LOCAL_SECRET_STORAGE, MacosFileSecretStore } from './macos-file-secret-store'

const TEST_VALUE = 'test-only-credential-中文'
const CORRUPT_KEY = 'corrupt-test-key'
vi.mock('node:fs', async (importOriginal) => {
  const original = await importOriginal<typeof FileSystem>()
  return { ...original, linkSync: vi.fn(original.linkSync) }
})

describe('macOS file-backed credentials', () => {
  let directory: string
  let keyPath: string

  beforeEach(() => {
    directory = join(
      mkdtempSync(join(tmpdir(), 'orca-local-secrets-')),
      LOCAL_SECRET_STORAGE.directory
    )
    keyPath = join(directory, LOCAL_SECRET_STORAGE.keyFile)
    vi.clearAllMocks()
  })

  afterEach(() => {
    rmSync(join(directory, '..'), { recursive: true, force: true })
  })

  it('opens existing ciphertext after reinstall without replacing the file key', () => {
    const first = new MacosFileSecretStore(directory)
    const ciphertext = first.encryptString(TEST_VALUE)
    const originalKey = readFileSync(keyPath)
    const reinstalled = new MacosFileSecretStore(directory)
    expect(reinstalled.decryptString(ciphertext)).toBe(TEST_VALUE)
    expect(reinstalled.encryptString(TEST_VALUE)).not.toEqual(ciphertext)
    expect(reinstalled.decryptString(reinstalled.encryptString(''))).toBe('')
    expect(readFileSync(keyPath)).toEqual(originalKey)
    expect(reinstalled.describeProtectionGap()).toBeNull()
    expect(reinstalled.isEncryptionAvailable()).toBe(true)
  })

  it('uses the winning key when another process publishes during initial creation', () => {
    const winningKey = randomBytes(LOCAL_SECRET_STORAGE.keyBytes).toString('base64')
    vi.mocked(linkSync).mockImplementationOnce((_source, destination) => {
      writeFileSync(destination, winningKey)
      throw Object.assign(new Error('test-only competing publisher'), { code: 'EEXIST' })
    })
    const ciphertext = new MacosFileSecretStore(directory).encryptString(TEST_VALUE)
    expect(readFileSync(keyPath, 'utf8')).toBe(winningKey)
    expect(new MacosFileSecretStore(directory).decryptString(ciphertext)).toBe(TEST_VALUE)
    expect(readdirSync(directory)).toEqual([LOCAL_SECRET_STORAGE.keyFile])
  })

  it('rejects old, unknown, truncated and modified ciphertext', () => {
    const store = new MacosFileSecretStore(directory)
    for (const ciphertext of [
      Buffer.from('v10old'),
      Buffer.from('unknown'),
      LOCAL_SECRET_STORAGE.prefix
    ]) {
      expect(() => store.decryptString(ciphertext)).toThrow(LOCAL_SECRET_STORAGE.invalidCiphertext)
    }
    expect(existsSync(keyPath)).toBe(false)
    const tampered = store.encryptString(TEST_VALUE)
    tampered[tampered.length - 1] ^= 1
    expect(() => store.decryptString(tampered)).toThrow()
  })

  it('never replaces a corrupt existing key or falls back to plaintext', () => {
    new MacosFileSecretStore(directory).encryptString(TEST_VALUE)
    writeFileSync(keyPath, CORRUPT_KEY)
    const store = new MacosFileSecretStore(directory)
    expect(store.isEncryptionAvailable()).toBe(true)
    expect(() => store.encryptString(TEST_VALUE)).toThrow(LOCAL_SECRET_STORAGE.invalidKey)
    expect(readFileSync(keyPath, 'utf8')).toBe(CORRUPT_KEY)
  })

  it('does not invent a replacement key when a ciphertext has lost its key', () => {
    const ciphertext = new MacosFileSecretStore(directory).encryptString(TEST_VALUE)
    rmSync(keyPath)
    expect(() => new MacosFileSecretStore(directory).decryptString(ciphertext)).toThrow(
      LOCAL_SECRET_STORAGE.unavailable
    )
    expect(existsSync(keyPath)).toBe(false)
  })

  it('cleans up a failed publication and can retry once storage recovers', () => {
    vi.mocked(linkSync).mockImplementationOnce(() => {
      throw Object.assign(new Error('test-only read-only volume'), { code: 'EROFS' })
    })
    const store = new MacosFileSecretStore(directory)
    expect(() => store.encryptString(TEST_VALUE)).toThrow('test-only read-only volume')
    expect(readdirSync(directory)).toEqual([])
    expect(store.decryptString(store.encryptString(TEST_VALUE))).toBe(TEST_VALUE)
  })

  it('restricts the key file and directory to their owner', () => {
    new MacosFileSecretStore(directory).encryptString(TEST_VALUE)
    if (process.platform !== 'win32') {
      expect(statSync(keyPath).mode & 0o777).toBe(0o600)
      expect(statSync(directory).mode & 0o777).toBe(0o700)
    }
  })
})
