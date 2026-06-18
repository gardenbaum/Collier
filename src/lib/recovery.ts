import { logger } from '@/lib/logger'
import { commands, type BdError, type JsonValue } from '@/lib/tauri-bindings'

/**
 * Format a `BdError` from the recovery backend as a human-readable
 * message. Kept as a single switch so the exhaustive nature of the
 * type is preserved — adding a new `BdError` variant causes a TS error
 * here, which is the canary we want.
 */
function formatBdError(error: BdError): string {
  switch (error.type) {
    case 'NotFound':
      return `File not found: ${error.id}`
    case 'IoError':
      return `IO error: ${error.message}`
    case 'ParseError':
      return `Parse error: ${error.message}`
    case 'PermissionDenied':
      return `Permission denied: ${error.path}`
    case 'NotARepo':
      return `Not a Beads repo: ${error.path}`
    case 'Timeout':
      return `Operation timed out after ${error.seconds}s`
    case 'AlreadyLocked':
      return `Repo is locked: ${error.repo_path}`
    case 'BdNotInPath':
      return 'bd CLI not found in PATH'
    case 'SchemaMismatch':
      return `Schema mismatch: ${error.message}`
    case 'DoltOnly':
      return `Dolt-only operation unsupported: ${error.message}`
    case 'NonZeroExit':
      return `bd exited with code ${error.code}: ${error.stderr.trim() || error.stdout.trim()}`
  }
}

export interface RecoveryOptions {
  /** Suppress error notifications (useful for background saves) */
  silent?: boolean
}

export async function saveEmergencyData(
  filename: string,
  data: JsonValue,
  options: RecoveryOptions = {}
): Promise<void> {
  logger.debug('Saving emergency data', { filename, dataType: typeof data })

  const result = await commands.saveEmergencyData(filename, data)

  if (result.status === 'error') {
    logger.error('Failed to save emergency data', {
      filename,
      error: result.error,
    })
    if (!options.silent) {
      throw new Error(formatBdError(result.error))
    }
    return
  }

  if (!options.silent) {
    logger.info('Emergency data saved successfully', { filename })
  }
}

export async function loadEmergencyData<T = unknown>(
  filename: string
): Promise<T | null> {
  logger.debug('Loading emergency data', { filename })

  const result = await commands.loadEmergencyData(filename)

  if (result.status === 'error') {
    // `NotFound` is an expected case (first launch, cleared cache)
    // — return null instead of throwing. The other `BdError`
    // variants are real failures we surface to the caller.
    if (result.error.type === 'NotFound') {
      logger.debug('Recovery file not found', { filename })
      return null
    }
    logger.error('Failed to load emergency data', {
      filename,
      error: result.error,
    })
    throw new Error(formatBdError(result.error))
  }

  logger.info('Emergency data loaded successfully', { filename })
  return result.data as T
}

export async function cleanupOldFiles(): Promise<number> {
  logger.debug('Starting recovery file cleanup')

  const result = await commands.cleanupOldRecoveryFiles()

  if (result.status === 'error') {
    logger.error('Failed to cleanup old recovery files', {
      error: result.error,
    })
    throw new Error(formatBdError(result.error))
  }

  const removedCount = result.data
  if (removedCount > 0) {
    logger.info('Cleaned up old recovery files', { removedCount })
  } else {
    logger.debug('No old recovery files to clean up')
  }

  return removedCount
}

export async function saveCrashState(
  state: JsonValue,
  crashInfo?: { error?: string; stack?: string; componentStack?: string }
): Promise<void> {
  // Append a UUID suffix to the filename so two `ErrorBoundary`
  // fires in the same millisecond don't silently overwrite each
  // other. (T48 history: ms-resolution was the original spec,
  // but the integration test fired two boundaries in <1ms.)
  const timestamp = Date.now()
  const random = crypto.randomUUID().slice(0, 8)
  const filename = `crash-${timestamp}-${random}`

  const crashData: JsonValue = {
    timestamp,
    state,
    crashInfo: crashInfo ?? null,
    userAgent: navigator.userAgent,
    url: window.location.href,
  }

  try {
    await saveEmergencyData(filename, crashData, { silent: true })
    logger.info('Crash state saved', { filename, timestamp })
  } catch (error) {
    // Don't throw from crash handler - just log
    logger.error('Failed to save crash state', { error })
  }
}
