/**
 * Simple logger interface for observability
 * In production, this would integrate with Cloud Logging or similar
 */

export interface LogContext {
  [key: string]: string | number | boolean | null | undefined;
}

export interface LogEntry {
  level: 'info' | 'warn' | 'error';
  message: string;
  context: LogContext;
  timestamp: string;
}

class Logger {
  private logs: LogEntry[] = [];

  info(message: string, context: LogContext = {}): void {
    this.log('info', message, context);
  }

  warn(message: string, context: LogContext = {}): void {
    this.log('warn', message, context);
  }

  error(message: string, context: LogContext = {}): void {
    this.log('error', message, context);
  }

  private log(level: 'info' | 'warn' | 'error', message: string, context: LogContext): void {
    const entry: LogEntry = {
      level,
      message,
      context,
      timestamp: new Date().toISOString(),
    };

    // In production, send to Cloud Logging
    // For now, console.log for development
    console.log(JSON.stringify(entry));

    // Store for testing
    this.logs.push(entry);
  }

  // For testing purposes
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  clearLogs(): void {
    this.logs = [];
  }
}

export const logger = new Logger();
