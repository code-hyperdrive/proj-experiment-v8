/**
 * Comprehensive logging system for Radio Explorer backend
 * Cloudflare Workers compatible - uses structured console logging
 * In production, logs are captured by Cloudflare and visible in dashboard
 * For local development, use backend/scripts/view-logs.js to view console output
 */

interface LogEntry {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  type: 'REQUEST' | 'RESPONSE' | 'DATABASE' | 'AUTH' | 'ERROR' | 'ACTIVITY';
  message: string;
  data?: Record<string, unknown>;
  duration?: number;
  statusCode?: number;
  userId?: string;
  method?: string;
  url?: string;
}

class Logger {
  constructor() {
    // Cloudflare Workers environment - no file I/O needed
    // Logs are captured by Cloudflare's logging system
  }

  /**
   * Format log entry as JSON for structured logging
   */
  private formatLogEntry(entry: LogEntry): string {
    return JSON.stringify(entry);
  }

  /**
   * Write log entry to console (captured by Cloudflare)
   */
  private writeLog(entry: LogEntry): void {
    const formatted = this.formatLogEntry(entry);
    // Color code by level for console visibility
    const colors: Record<string, string> = {
      ERROR: '🔴',
      WARN: '🟠',
      INFO: '🔵',
      DEBUG: '⚪',
    };
    const emoji = colors[entry.level] || '⚪';
    console.log(`${emoji} [${entry.level}] [${entry.type}] ${formatted}`);
  }

  // ===== Public logging methods =====

  logRequest(data: {
    method: string;
    url: string;
    headers?: Record<string, any>;
    body?: any;
    userId?: string;
  }): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      type: 'REQUEST',
      message: `${data.method} ${data.url}`,
      data: {
        headers: data.headers,
        body: data.body,
      },
      method: data.method,
      url: data.url,
      userId: data.userId,
    });
  }

  logResponse(data: {
    url: string;
    statusCode: number;
    duration: number;
    body?: any;
    userId?: string;
  }): void {
    const level = data.statusCode >= 400 ? 'WARN' : 'INFO';
    this.writeLog({
      timestamp: new Date().toISOString(),
      level,
      type: 'RESPONSE',
      message: `${data.statusCode} ${data.url}`,
      statusCode: data.statusCode,
      duration: data.duration,
      data: {
        body: data.body,
      },
      url: data.url,
      userId: data.userId,
    });
  }

  logDatabase(data: {
    operation: string;
    query: string;
    duration: number;
    rowsAffected?: number;
    error?: string;
    userId?: string;
  }): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: data.error ? 'ERROR' : 'DEBUG',
      type: 'DATABASE',
      message: `${data.operation} (${data.duration}ms)`,
      data,
      duration: data.duration,
      userId: data.userId,
    });
  }

  logAuth(data: {
    action: string;
    method: string;
    userId?: string;
    email?: string;
    success: boolean;
    error?: string;
  }): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: data.success ? 'INFO' : 'WARN',
      type: 'AUTH',
      message: `${data.action} - ${data.method} - ${data.success ? 'SUCCESS' : 'FAILED'}`,
      data,
      userId: data.userId,
    });
  }

  logError(data: {
    error: string | Error;
    context: string;
    userId?: string;
    url?: string;
    statusCode?: number;
    stack?: string;
  }): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      type: 'ERROR',
      message: data.context,
      data: {
        error: data.error instanceof Error ? data.error.message : data.error,
        stack: data.error instanceof Error ? data.error.stack : undefined,
      },
      statusCode: data.statusCode,
      userId: data.userId,
      url: data.url,
    });
  }

  logActivity(data: {
    action: string;
    userId: string;
    details?: Record<string, any>;
    status: 'success' | 'failure';
  }): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: data.status === 'success' ? 'INFO' : 'WARN',
      type: 'ACTIVITY',
      message: `${data.action} - ${data.status}`,
      data: data.details,
      userId: data.userId,
    });
  }

  logDebug(message: string, data?: Record<string, any>): void {
    this.writeLog({
      timestamp: new Date().toISOString(),
      level: 'DEBUG',
      type: 'ACTIVITY',
      message,
      data,
    });
  }
}

// Export singleton instance
export const logger = new Logger();
