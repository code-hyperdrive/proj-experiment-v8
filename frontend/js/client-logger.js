/**
 * Frontend client-side logger
 * Logs user activities and API calls to console and sends to backend
 */

class ClientLogger {
  constructor() {
    this.sessionId = this.generateSessionId();
    this.logs = [];
    this.maxLocalLogs = 500; // Keep last 500 logs in memory
    this.initializeConsoleOverride();
    this.setupPageUnloadHandler();
  }

  /**
   * Generate unique session ID
   */
  generateSessionId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Create log entry
   */
  createLogEntry(level, type, message, data = {}) {
    return {
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      level, // INFO, WARN, ERROR, DEBUG
      type, // USER_ACTION, API_CALL, ERROR, ACTIVITY
      message,
      data,
      url: window.location.pathname,
      userAgent: navigator.userAgent,
    };
  }

  /**
   * Add log entry
   */
  addLog(entry) {
    this.logs.push(entry);

    // Keep only recent logs
    if (this.logs.length > this.maxLocalLogs) {
      this.logs = this.logs.slice(-this.maxLocalLogs);
    }

    // Log to console with color coding
    this.logToConsole(entry);
  }

  /**
   * Log to browser console with colors
   */
  logToConsole(entry) {
    const colors = {
      INFO: 'color: #0066cc',
      WARN: 'color: #ff9900',
      ERROR: 'color: #cc0000',
      DEBUG: 'color: #666666',
    };

    const time = new Date(entry.timestamp).toLocaleTimeString();
    const style = colors[entry.level] || colors.INFO;

    console.log(
      `%c[${time}] [${entry.level}] [${entry.type}] ${entry.message}`,
      style,
      entry.data
    );
  }

  /**
   * Override console methods to capture errors
   */
  initializeConsoleOverride() {
    const originalError = console.error;
    const originalWarn = console.warn;

    console.error = (...args) => {
      originalError.apply(console, args);
      this.logError('Console Error', {
        message: args.join(' '),
      });
    };

    console.warn = (...args) => {
      originalWarn.apply(console, args);
      this.logWarning('Console Warning', {
        message: args.join(' '),
      });
    };

    // Capture unhandled errors
    window.addEventListener('error', (event) => {
      this.logError('Unhandled Error', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    });

    // Capture unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.logError('Unhandled Promise Rejection', {
        reason: event.reason,
      });
    });
  }

  /**
   * Send logs to backend (optional - only if backend supports it)
   */
  async sendLogsToBackend() {
    try {
      const token = localStorage.getItem('globeRadio_sessionToken');
      if (!token) return;

      // Only send recent critical logs
      const criticalLogs = this.logs.filter(
        (l) => l.level === 'ERROR' || l.level === 'WARN'
      );

      if (criticalLogs.length === 0) return;

      await fetch('http://localhost:8787/api/v1/logs', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          logs: criticalLogs.slice(-50), // Send last 50 critical logs
        }),
      }).catch(() => {
        // Silently fail - backend might not have this endpoint yet
      });
    } catch (error) {
      // Silently fail
    }
  }

  /**
   * Send logs before page unload
   */
  setupPageUnloadHandler() {
    window.addEventListener('beforeunload', () => {
      this.sendLogsToBackend();
    });
  }

  /**
   * Get all logs
   */
  getAllLogs() {
    return this.logs;
  }

  /**
   * Export logs as JSON
   */
  exportLogs() {
    const dataStr = JSON.stringify(this.logs, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const exportFileDefaultName = `logs-${this.sessionId}.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  }

  // ===== Public logging methods =====

  logUserAction(action, details = {}) {
    const entry = this.createLogEntry('INFO', 'USER_ACTION', action, details);
    this.addLog(entry);
  }

  logPageLoad(page, details = {}) {
    const entry = this.createLogEntry('INFO', 'USER_ACTION', `Page loaded: ${page}`, details);
    this.addLog(entry);
  }

  logApiCall(method, url, status, duration, details = {}) {
    const level = status >= 400 ? 'WARN' : 'INFO';
    const message = `${method} ${url} - ${status} (${duration}ms)`;
    const entry = this.createLogEntry(level, 'API_CALL', message, {
      method,
      url,
      status,
      duration,
      ...details,
    });
    this.addLog(entry);
  }

  logError(message, details = {}) {
    const entry = this.createLogEntry('ERROR', 'ERROR', message, details);
    this.addLog(entry);
  }

  logWarning(message, details = {}) {
    const entry = this.createLogEntry('WARN', 'ACTIVITY', message, details);
    this.addLog(entry);
  }

  logDebug(message, details = {}) {
    const entry = this.createLogEntry('DEBUG', 'ACTIVITY', message, details);
    this.addLog(entry);
  }

  logActivity(activity, details = {}) {
    const entry = this.createLogEntry('INFO', 'ACTIVITY', activity, details);
    this.addLog(entry);
  }

  /**
   * Get summary of logs
   */
  getSummary() {
    const summary = {
      totalLogs: this.logs.length,
      sessionId: this.sessionId,
      byLevel: {},
      byType: {},
      errors: [],
      warnings: [],
    };

    for (const log of this.logs) {
      summary.byLevel[log.level] = (summary.byLevel[log.level] || 0) + 1;
      summary.byType[log.type] = (summary.byType[log.type] || 0) + 1;

      if (log.level === 'ERROR') {
        summary.errors.push({ timestamp: log.timestamp, message: log.message });
      }
      if (log.level === 'WARN') {
        summary.warnings.push({ timestamp: log.timestamp, message: log.message });
      }
    }

    return summary;
  }

  /**
   * Print summary to console
   */
  printSummary() {
    const summary = this.getSummary();
    console.log('%c📊 Session Logs Summary', 'font-size: 14px; font-weight: bold; color: #0066cc');
    console.table(summary);
  }
}

// Create global logger instance
window.appLogger = new ClientLogger();

// Log that the app has loaded
window.appLogger.logActivity('App logger initialized');
