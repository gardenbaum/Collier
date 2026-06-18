/**
 * Simple logging utility for the frontend.
 *
 * In development: logs to browser console.
 * In production: when the user has enabled the "Enable diagnostic
 * logging" switch in Advanced preferences, also writes each line to
 * `<APPLOCALDATA>/logs/collier-YYYY-MM-DD.log` via the
 * `writeLogLine` Tauri command.
 *
 * The toggle is per-session (not persisted) and lives in Rust
 * (`DIAGNOSTIC_LOGGING_ENABLED` in `diagnostic_log.rs`); this
 * Logger just calls `setDiagnosticLogging` to flip it. The Rust
 * side gates the actual disk write so even if a future code path
 * forgets to check the flag, the file is safe.
 */

import { commands } from './tauri-bindings'

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  message: string
  timestamp: Date
  context?: Record<string, unknown>
}

class Logger {
  private isDevelopment = import.meta.env.DEV
  private diagnosticLoggingEnabled = false

  /**
   * Set the in-process diagnostic-logging flag. Called by the
   * Advanced preferences "Enable diagnostic logging" switch.
   * Best-effort: a failure here is logged to console but never
   * surfaced to the user (the toggle UI is a soft "best effort"
   * signal — disk I/O errors should not break the preferences page).
   */
  setDiagnosticLogging(enabled: boolean): void {
    this.diagnosticLoggingEnabled = enabled
    // Fire-and-forget; we don't await because the Logger is sync.
    void commands
      .setDiagnosticLogging(enabled)
      .then(result => {
        if (result.status === 'error') {
          console.error(
            'setDiagnosticLogging IPC failed:',
            result.error
          )
        }
      })
      .catch(error => {
        console.error('setDiagnosticLogging threw:', error)
      })
  }

  /**
   * Read the persisted diagnostic-logging state. The Rust side is
   * the source of truth — the FE's local copy is just a hint for
   * whether to attempt the logToBackend call.
   */
  isDiagnosticLoggingEnabled(): boolean {
    return this.diagnosticLoggingEnabled
  }

  /**
   * Log a trace message (most verbose)
   */
  trace(message: string, context?: Record<string, unknown>): void {
    this.log('trace', message, context)
  }

  /**
   * Log a debug message (development only)
   */
  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context)
  }

  /**
   * Log an info message
   */
  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context)
  }

  /**
   * Log a warning message
   */
  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context)
  }

  /**
   * Log an error message
   */
  error(message: string, context?: Record<string, unknown>): void {
    this.log('error', message, context)
  }

  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>
  ): void {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      context,
    }

    // Always log to console in development.
    if (this.isDevelopment) {
      this.logToConsole(entry)
    }

    // Mirror warn / error to the on-disk diagnostic log in
    // production, but only when the user has flipped the toggle.
    // We do not await the IPC — log writes must never block the
    // caller's hot path. The Rust `writeLogLine` is itself
    // best-effort: a write failure does not propagate.
    if (!this.isDevelopment && this.diagnosticLoggingEnabled) {
      if (level === 'warn' || level === 'error') {
        this.logToBackend(entry).catch(() => {
          // Swallow: writing to a log file must never break the app.
        })
      }
    }
  }

  private logToConsole(entry: LogEntry): void {
    const timestamp = entry.timestamp.toISOString()
    const prefix = `[${timestamp}] [${entry.level.toUpperCase()}]`

    const args = entry.context
      ? [prefix, entry.message, entry.context]
      : [prefix, entry.message]

    switch (entry.level) {
      case 'trace':
      case 'debug':
        console.debug(...args)
        break
      case 'info':
        console.info(...args)
        break
      case 'warn':
        console.warn(...args)
        break
      case 'error':
        console.error(...args)
        break
    }
  }

  /**
   * Best-effort fire-and-forget write to the per-day diagnostic
   * log file. The Rust side gates on its own `DIAGNOSTIC_LOGGING_ENABLED`
   * flag so even if the FE cache is stale the file write is
   * safe.
   */
  private async logToBackend(entry: LogEntry): Promise<void> {
    // Narrow the FE-side `Record<string, unknown>` to the binding's
    // `JsonValue`. The two are structurally compatible (both are
    // JSON-shaped trees); the cast is needed because the
    // generated bindings use the union type, not the open record.
    const result = await commands.writeLogLine({
      level: entry.level,
      message: entry.message,
      source: 'frontend',
      context: entry.context as Parameters<typeof commands.writeLogLine>[0]['context'],
    })
    if (result.status === 'error') {
      throw new Error(typeof result.error === 'string'
        ? result.error
        : JSON.stringify(result.error))
    }
  }
}

// Export a singleton logger instance
export const logger = new Logger()

// Export individual logging functions for convenience
export const { trace, debug, info, warn, error } = logger
