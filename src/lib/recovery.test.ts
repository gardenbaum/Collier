import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// vi.hoisted lets us grab a reference to the mocks before the factory
// runs so `mockReset` is callable in beforeEach.
const { mockCommands, mockLogger } = vi.hoisted(() => ({
  mockCommands: {
    saveEmergencyData: vi.fn(),
    loadEmergencyData: vi.fn(),
    cleanupOldRecoveryFiles: vi.fn(),
  },
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/lib/tauri-bindings', () => ({
  commands: mockCommands,
}))

vi.mock('@/lib/logger', () => ({
  logger: mockLogger,
}))

import {
  saveEmergencyData,
  loadEmergencyData,
  cleanupOldFiles,
  saveCrashState,
} from './recovery'

// `BdError` is a discriminated union — one test case per variant keeps
// the exhaustive switch honest. Add a new variant and a new test
// case; the source file's `switch` will fail to compile otherwise.
function makeError(type: string, fields: Record<string, unknown> = {}) {
  return { type, ...fields }
}

describe('recovery — saveEmergencyData', () => {
  beforeEach(() => {
    mockCommands.saveEmergencyData.mockReset()
    mockLogger.debug.mockReset()
    mockLogger.info.mockReset()
    mockLogger.error.mockReset()
  })

  it('forwards the call to commands.saveEmergencyData and logs success', async () => {
    mockCommands.saveEmergencyData.mockResolvedValue({
      status: 'ok',
      data: null,
    })
    await saveEmergencyData('snap.json', { hello: 'world' })
    expect(mockCommands.saveEmergencyData).toHaveBeenCalledWith('snap.json', {
      hello: 'world',
    })
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Emergency data saved successfully',
      { filename: 'snap.json' }
    )
  })

  it('throws a formatted error on the default (loud) path', async () => {
    mockCommands.saveEmergencyData.mockResolvedValue({
      status: 'error',
      error: makeError('IoError', { message: 'disk full' }),
    })
    await expect(saveEmergencyData('snap.json', {})).rejects.toThrow(
      'IO error: disk full'
    )
    expect(mockLogger.error).toHaveBeenCalled()
  })

  it('does not throw when silent: true on error', async () => {
    mockCommands.saveEmergencyData.mockResolvedValue({
      status: 'error',
      error: makeError('IoError', { message: 'disk full' }),
    })
    await expect(
      saveEmergencyData('snap.json', {}, { silent: true })
    ).resolves.toBeUndefined()
  })

  it('does not log success when silent: true', async () => {
    mockCommands.saveEmergencyData.mockResolvedValue({
      status: 'ok',
      data: null,
    })
    await saveEmergencyData('snap.json', {}, { silent: true })
    expect(mockLogger.info).not.toHaveBeenCalled()
  })

  it('formats every BdError variant with a useful message', async () => {
    const cases: { error: unknown; expected: RegExp }[] = [
      { error: makeError('NotFound', { id: 'x' }), expected: /File not found/ },
      {
        error: makeError('PermissionDenied', { path: '/etc' }),
        expected: /Permission denied/,
      },
      {
        error: makeError('NotARepo', { path: '/tmp' }),
        expected: /Not a Beads repo/,
      },
      {
        error: makeError('Timeout', { seconds: 30 }),
        expected: /timed out after 30s/,
      },
      {
        error: makeError('AlreadyLocked', { repo_path: '/r' }),
        expected: /locked/,
      },
      { error: makeError('BdNotInPath'), expected: /bd CLI not found/ },
      {
        error: makeError('SchemaMismatch', { message: 'mismatch' }),
        expected: /Schema mismatch/,
      },
      {
        error: makeError('DoltOnly', { message: 'nope' }),
        expected: /Dolt-only/,
      },
      {
        error: makeError('ParseError', { message: 'bad json' }),
        expected: /Parse error/,
      },
      {
        error: makeError('NonZeroExit', {
          code: 2,
          stdout: '',
          stderr: 'boom',
        }),
        expected: /exited with code 2: boom/,
      },
    ]
    for (const { error, expected } of cases) {
      mockCommands.saveEmergencyData.mockResolvedValue({
        status: 'error',
        error,
      })
      await expect(saveEmergencyData('snap.json', {})).rejects.toThrow(expected)
    }
  })
})

describe('recovery — loadEmergencyData', () => {
  beforeEach(() => {
    mockCommands.loadEmergencyData.mockReset()
    mockLogger.debug.mockReset()
    mockLogger.info.mockReset()
    mockLogger.error.mockReset()
  })

  it('returns the data on success', async () => {
    mockCommands.loadEmergencyData.mockResolvedValue({
      status: 'ok',
      data: { foo: 'bar' },
    })
    const result = await loadEmergencyData<{ foo: string }>('snap.json')
    expect(result).toEqual({ foo: 'bar' })
    expect(mockLogger.info).toHaveBeenCalled()
  })

  it('returns null on NotFound (expected first-launch / cleared-cache case)', async () => {
    mockCommands.loadEmergencyData.mockResolvedValue({
      status: 'error',
      error: makeError('NotFound', { id: 'snap.json' }),
    })
    const result = await loadEmergencyData('snap.json')
    expect(result).toBeNull()
    // NotFound is debug-level, not error — guards against log spam on
    // every cold start.
    expect(mockLogger.debug).toHaveBeenCalled()
    expect(mockLogger.error).not.toHaveBeenCalled()
  })

  it('throws for non-NotFound errors', async () => {
    mockCommands.loadEmergencyData.mockResolvedValue({
      status: 'error',
      error: makeError('IoError', { message: 'permission denied' }),
    })
    await expect(loadEmergencyData('snap.json')).rejects.toThrow(
      'IO error: permission denied'
    )
  })
})

describe('recovery — cleanupOldFiles', () => {
  beforeEach(() => {
    mockCommands.cleanupOldRecoveryFiles.mockReset()
    mockLogger.debug.mockReset()
    mockLogger.info.mockReset()
    mockLogger.error.mockReset()
  })

  it('returns the count and logs info when files were removed', async () => {
    mockCommands.cleanupOldRecoveryFiles.mockResolvedValue({
      status: 'ok',
      data: 5,
    })
    const count = await cleanupOldFiles()
    expect(count).toBe(5)
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Cleaned up old recovery files',
      { removedCount: 5 }
    )
  })

  it('stays at debug when no files were removed', async () => {
    mockCommands.cleanupOldRecoveryFiles.mockResolvedValue({
      status: 'ok',
      data: 0,
    })
    const count = await cleanupOldFiles()
    expect(count).toBe(0)
    expect(mockLogger.info).not.toHaveBeenCalled()
    expect(mockLogger.debug).toHaveBeenCalledWith(
      'No old recovery files to clean up'
    )
  })

  it('throws a formatted error on failure', async () => {
    mockCommands.cleanupOldRecoveryFiles.mockResolvedValue({
      status: 'error',
      error: makeError('IoError', { message: 'no such dir' }),
    })
    await expect(cleanupOldFiles()).rejects.toThrow('IO error: no such dir')
  })
})

describe('recovery — saveCrashState', () => {
  let randomUUIDSpy: ReturnType<typeof vi.spyOn>
  let originalCrypto: Crypto | undefined

  beforeEach(() => {
    mockCommands.saveEmergencyData.mockReset()
    mockLogger.info.mockReset()
    mockLogger.error.mockReset()
    mockLogger.debug.mockReset()
    // The function uses crypto.randomUUID; jsdom may or may not have it
    // depending on the env. Mock it so we can predict the filename.
    originalCrypto = globalThis.crypto
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { randomUUID: () => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' },
    })
  })

  afterEach(() => {
    if (originalCrypto) {
      Object.defineProperty(globalThis, 'crypto', {
        configurable: true,
        value: originalCrypto,
      })
    } else {
      // jsdom may not define crypto on globalThis by default; delete is safe.
      // @ts-expect-error — best-effort cleanup
      delete globalThis.crypto
    }
    randomUUIDSpy?.mockRestore()
  })

  it('saves the crash payload and logs success', async () => {
    mockCommands.saveEmergencyData.mockResolvedValue({
      status: 'ok',
      data: null,
    })
    await saveCrashState({ state: 'broken' }, { error: 'err' })
    expect(mockCommands.saveEmergencyData).toHaveBeenCalledTimes(1)
    const saveCall = mockCommands.saveEmergencyData.mock.calls[0] as [
      string,
      { crashInfo: unknown },
    ]
    expect(saveCall).toBeDefined()
    const [filename, payload] = saveCall
    expect(filename).toMatch(/^crash-\d+-aaaaaaaa$/)
    expect(payload).toMatchObject({
      state: { state: 'broken' },
      crashInfo: { error: 'err' },
    })
    expect(payload).toHaveProperty('userAgent')
    expect(payload).toHaveProperty('url')
    expect(typeof (payload as unknown as { timestamp: number }).timestamp).toBe(
      'number'
    )
    expect(mockLogger.info).toHaveBeenCalled()
  })

  it('passes crashInfo: null when no info is supplied', async () => {
    mockCommands.saveEmergencyData.mockResolvedValue({
      status: 'ok',
      data: null,
    })
    await saveCrashState({ x: 1 })
    const saveCalls = mockCommands.saveEmergencyData.mock.calls[0] as [
      string,
      { crashInfo: unknown },
    ]
    expect(saveCalls).toBeDefined()
    const payload = saveCalls[1]
    expect(payload.crashInfo).toBeNull()
  })

  it('does not throw and does not log error when silent save fails (silent swallows the error)', async () => {
    // saveEmergencyData is called with { silent: true }, which means
    // the typed error from the backend is swallowed inside
    // saveEmergencyData and the outer try never throws. The catch in
    // saveCrashState is the second line of defense — only reachable
    // if saveEmergencyData itself throws synchronously, which is not
    // exercised by the normal Result-based path.
    mockCommands.saveEmergencyData.mockResolvedValue({
      status: 'error',
      error: makeError('IoError', { message: 'disk full' }),
    })
    await expect(saveCrashState({ x: 1 })).resolves.toBeUndefined()
    // No "Failed to save crash state" log — saveEmergencyData's
    // silent branch is what makes that possible.
    expect(mockLogger.error).not.toHaveBeenCalledWith(
      'Failed to save crash state',
      expect.anything()
    )
  })

  it('logs an error if saveEmergencyData ever throws synchronously', async () => {
    // Defensive path: the try/catch in saveCrashState guards against
    // any future code that throws from inside saveEmergencyData (e.g.
    // a programming error, a missing field, an invariant break). This
    // test simulates that synchronous throw to exercise the catch.
    mockCommands.saveEmergencyData.mockImplementation(() => {
      throw new Error('synthetic explosion')
    })
    await expect(saveCrashState({ x: 1 })).resolves.toBeUndefined()
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to save crash state',
      {
        error: expect.any(Error),
      }
    )
  })
})
