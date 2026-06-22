import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// The logger module reads `import.meta.env.DEV` at class-construction time.
// We stub it via vi.stubEnv before each import so we can drive the
// "isDevelopment" branch on demand.
const mockWriteLogLine = vi.fn()
const mockSetDiagnosticLogging = vi.fn()

vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    writeLogLine: (...args: unknown[]) => mockWriteLogLine(...args),
    setDiagnosticLogging: (...args: unknown[]) => mockSetDiagnosticLogging(...args),
  },
}))

type ImportResult = typeof import('./logger')

async function loadLogger(dev: boolean): Promise<ImportResult> {
  vi.resetModules()
  vi.stubEnv('DEV', dev)
  return await import('./logger')
}

describe('logger', () => {
  let consoleDebugSpy: ReturnType<typeof vi.spyOn>
  let consoleInfoSpy: ReturnType<typeof vi.spyOn>
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    mockWriteLogLine.mockReset()
    mockSetDiagnosticLogging.mockReset()
    mockWriteLogLine.mockResolvedValue({ status: 'ok', data: null })
    mockSetDiagnosticLogging.mockResolvedValue({ status: 'ok', data: null })

    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleDebugSpy.mockRestore()
    consoleInfoSpy.mockRestore()
    consoleWarnSpy.mockRestore()
    consoleErrorSpy.mockRestore()
    vi.unstubAllEnvs()
  })

  describe('singleton surface', () => {
    it('exports a logger singleton and convenience functions', async () => {
      const { logger, trace, debug, info, warn, error } = await loadLogger(true)
      expect(logger).toBeDefined()
      // The convenience exports are bound at module load and do NOT
      // preserve the singleton's `this` — that's a known property of
      // the source file, not something tests should paper over. We
      // assert they exist as functions so a future maintainer sees a
      // clear failure if the destructure line is removed.
      expect(typeof trace).toBe('function')
      expect(typeof debug).toBe('function')
      expect(typeof info).toBe('function')
      expect(typeof warn).toBe('function')
      expect(typeof error).toBe('function')
    })

    it('starts with the diagnostic-logging flag disabled', async () => {
      const { logger } = await loadLogger(true)
      expect(logger.isDiagnosticLoggingEnabled()).toBe(false)
    })
  })

  describe('console routing in dev', () => {
    it('routes trace to console.debug with the ISO timestamp prefix', async () => {
      const { logger } = await loadLogger(true)
      logger.trace('hello', { foo: 1 })
      expect(consoleDebugSpy).toHaveBeenCalledTimes(1)
      const [firstArg, msg, ctx] = consoleDebugSpy.mock.calls[0]!
      expect(firstArg).toMatch(/^\[\d{4}-\d{2}-\d{2}T/) // ISO timestamp
      expect(firstArg).toContain('TRACE')
      expect(msg).toBe('hello')
      expect(ctx).toEqual({ foo: 1 })
    })

    it('routes debug to console.debug', async () => {
      const { logger } = await loadLogger(true)
      logger.debug('msg')
      expect(consoleDebugSpy).toHaveBeenCalled()
    })

    it('routes info to console.info', async () => {
      const { logger } = await loadLogger(true)
      logger.info('msg')
      expect(consoleInfoSpy).toHaveBeenCalled()
    })

    it('routes warn to console.warn', async () => {
      const { logger } = await loadLogger(true)
      logger.warn('msg')
      expect(consoleWarnSpy).toHaveBeenCalled()
    })

    it('routes error to console.error', async () => {
      const { logger } = await loadLogger(true)
      logger.error('msg')
      expect(consoleErrorSpy).toHaveBeenCalled()
    })

    it('omits the context arg when no context is provided', async () => {
      const { logger } = await loadLogger(true)
      logger.info('no-ctx')
      const call = consoleInfoSpy.mock.calls[0]!
      expect(call).toHaveLength(2) // [prefix, message]
    })
  })

  describe('production mode', () => {
    it('does not write to the console in production', async () => {
      const { logger } = await loadLogger(false)
      logger.info('silent')
      logger.warn('silent')
      logger.error('silent')
      logger.debug('silent')
      expect(consoleDebugSpy).not.toHaveBeenCalled()
      expect(consoleInfoSpy).not.toHaveBeenCalled()
      expect(consoleWarnSpy).not.toHaveBeenCalled()
      expect(consoleErrorSpy).not.toHaveBeenCalled()
    })

    it('does not mirror to the backend when the diagnostic flag is off', async () => {
      const { logger } = await loadLogger(false)
      logger.warn('should-not-write')
      // Wait one tick for the fire-and-forget to resolve.
      await new Promise(r => setTimeout(r, 0))
      expect(mockWriteLogLine).not.toHaveBeenCalled()
    })

    it('mirrors warn to the backend when the diagnostic flag is on', async () => {
      const { logger } = await loadLogger(false)
      logger.setDiagnosticLogging(true)
      logger.warn('disk', { trace: 'x' })
      await new Promise(r => setTimeout(r, 0))
      expect(mockWriteLogLine).toHaveBeenCalledTimes(1)
      const line = mockWriteLogLine.mock.calls[0]![0]
      expect(line.level).toBe('warn')
      expect(line.message).toBe('disk')
      expect(line.source).toBe('frontend')
      expect(line.context).toEqual({ trace: 'x' })
    })

    it('mirrors error to the backend when the diagnostic flag is on', async () => {
      const { logger } = await loadLogger(false)
      logger.setDiagnosticLogging(true)
      logger.error('boom')
      await new Promise(r => setTimeout(r, 0))
      expect(mockWriteLogLine).toHaveBeenCalledTimes(1)
      expect(mockWriteLogLine.mock.calls[0]![0].level).toBe('error')
    })

    it('does not mirror info / debug to the backend even with the flag on', async () => {
      const { logger } = await loadLogger(false)
      logger.setDiagnosticLogging(true)
      logger.info('verbose')
      logger.debug('verbose')
      await new Promise(r => setTimeout(r, 0))
      expect(mockWriteLogLine).not.toHaveBeenCalled()
    })

    it('swallows a backend writeLogLine error result', async () => {
      const { logger } = await loadLogger(false)
      mockWriteLogLine.mockResolvedValue({
        status: 'error',
        error: 'disk full',
      })
      logger.setDiagnosticLogging(true)
      logger.warn('will-fail')
      await new Promise(r => setTimeout(r, 0))
      // logToBackend threw, but the .catch in log() swallowed it — we
      // only care that no test-visible error escaped.
      expect(mockWriteLogLine).toHaveBeenCalled()
    })
  })

  describe('setDiagnosticLogging / isDiagnosticLoggingEnabled', () => {
    it('flips the in-process flag and reflects it via isDiagnosticLoggingEnabled', async () => {
      const { logger } = await loadLogger(false)
      expect(logger.isDiagnosticLoggingEnabled()).toBe(false)
      logger.setDiagnosticLogging(true)
      expect(logger.isDiagnosticLoggingEnabled()).toBe(true)
      logger.setDiagnosticLogging(false)
      expect(logger.isDiagnosticLoggingEnabled()).toBe(false)
    })

    it('forwards the flag to the Tauri command', async () => {
      const { logger } = await loadLogger(false)
      logger.setDiagnosticLogging(true)
      // Fire-and-forget — give the promise microtask queue a turn.
      await new Promise(r => setTimeout(r, 0))
      expect(mockSetDiagnosticLogging).toHaveBeenCalledWith(true)
    })

    it('logs an error when setDiagnosticLogging IPC fails but does not throw', async () => {
      const { logger } = await loadLogger(false)
      mockSetDiagnosticLogging.mockResolvedValue({
        status: 'error',
        error: 'no permission',
      })
      logger.setDiagnosticLogging(true)
      await new Promise(r => setTimeout(r, 0))
      expect(consoleErrorSpy).toHaveBeenCalled()
    })

    it('logs an error when setDiagnosticLogging throws', async () => {
      const { logger } = await loadLogger(false)
      mockSetDiagnosticLogging.mockRejectedValue(new Error('boom'))
      logger.setDiagnosticLogging(true)
      await new Promise(r => setTimeout(r, 0))
      expect(consoleErrorSpy).toHaveBeenCalled()
    })
  })
})
