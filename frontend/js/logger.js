/**
 * Application Logger
 * 
 * Captures all console errors, warnings, and app events.
 * Provides a log viewer panel and export functionality.
 * 
 * Usage:
 *   - Logs are automatically captured
 *   - Press Ctrl+Shift+L to toggle log viewer
 *   - Or call: window.appLogger.showPanel()
 *   - Export logs: window.appLogger.exportLogs()
 */

class AppLogger {
    constructor() {
        this.logs = [];
        this.maxLogs = 500;
        this.sessionId = this.generateSessionId();
        this.startTime = new Date();
        this.isVisible = false;
        this.filters = {
            error: true,
            warn: true,
            info: true,
            debug: false,
            event: true
        };
        
        this.init();
    }

    generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    init() {
        // Intercept console methods
        this.interceptConsole();
        
        // Capture global errors
        this.captureGlobalErrors();
        
        // Capture unhandled promise rejections
        this.capturePromiseRejections();
        
        // Capture app-specific events
        this.captureAppEvents();
        
        // Create UI panel
        this.createPanel();
        
        // Keyboard shortcut
        this.setupKeyboardShortcut();
        
        // Log session start
        this.log('info', 'Logger initialized', { sessionId: this.sessionId });
    }

    interceptConsole() {
        const originalConsole = {
            log: console.log.bind(console),
            error: console.error.bind(console),
            warn: console.warn.bind(console),
            info: console.info.bind(console),
            debug: console.debug.bind(console)
        };

        // Store original for internal use
        this.originalConsole = originalConsole;

        // Intercept console.error
        console.error = (...args) => {
            this.log('error', this.formatArgs(args), { source: 'console.error' });
            originalConsole.error(...args);
        };

        // Intercept console.warn
        console.warn = (...args) => {
            this.log('warn', this.formatArgs(args), { source: 'console.warn' });
            originalConsole.warn(...args);
        };

        // Intercept console.info
        console.info = (...args) => {
            this.log('info', this.formatArgs(args), { source: 'console.info' });
            originalConsole.info(...args);
        };
    }

    captureGlobalErrors() {
        window.addEventListener('error', (event) => {
            this.log('error', event.message, {
                source: 'window.onerror',
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                stack: event.error?.stack
            });
        });
    }

    capturePromiseRejections() {
        window.addEventListener('unhandledrejection', (event) => {
            this.log('error', `Unhandled Promise Rejection: ${event.reason}`, {
                source: 'unhandledrejection',
                reason: String(event.reason),
                stack: event.reason?.stack
            });
        });
    }

    captureAppEvents() {
        // List of app events to track
        const appEvents = [
            'search:searchResults',
            'search:stationSelected',
            'stationSelected',
            'station:playRequested',
            'station:playSuccess',
            'station:playError',
            'audio:play',
            'audio:pause',
            'audio:error',
            'audio:stateChange',
            'globe:focusStation',
            'globe:updateMarker',
            'globe:setPlaying',
            'favorites:updated',
            'theme:changed',
            'language:changed',
            'station:selected',
            'panel:collapsed',
            'panel:expanded',
            'tabChanged',
            'viewModeChanged'
        ];

        appEvents.forEach(eventName => {
            window.addEventListener(eventName, (e) => {
                this.log('event', `Event: ${eventName}`, { 
                    source: 'custom-event',
                    detail: e.detail 
                });
            });
        });

        // Track network requests (fetch)
        this.interceptFetch();
    }

    interceptFetch() {
        const originalFetch = window.fetch;
        const self = this;

        window.fetch = async function(...args) {
            const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
            const startTime = performance.now();
            
            try {
                const response = await originalFetch.apply(this, args);
                const duration = Math.round(performance.now() - startTime);
                
                if (!response.ok) {
                    self.log('warn', `Fetch failed: ${url}`, {
                        source: 'fetch',
                        status: response.status,
                        statusText: response.statusText,
                        duration: `${duration}ms`
                    });
                } else {
                    self.log('debug', `Fetch success: ${url}`, {
                        source: 'fetch',
                        status: response.status,
                        duration: `${duration}ms`
                    });
                }
                
                return response;
            } catch (error) {
                const duration = Math.round(performance.now() - startTime);
                self.log('error', `Fetch error: ${url}`, {
                    source: 'fetch',
                    error: error.message,
                    duration: `${duration}ms`
                });
                throw error;
            }
        };
    }

    formatArgs(args) {
        return args.map(arg => {
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg, null, 2);
                } catch {
                    return String(arg);
                }
            }
            return String(arg);
        }).join(' ');
    }

    log(level, message, metadata = {}) {
        const entry = {
            id: this.logs.length + 1,
            timestamp: new Date().toISOString(),
            relativeTime: this.getRelativeTime(),
            level,
            message: String(message).substring(0, 1000), // Limit message length
            metadata,
            url: window.location.href
        };

        this.logs.push(entry);

        // Keep logs under max limit
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }

        // Update panel if visible
        if (this.isVisible) {
            this.updatePanel();
        }

        // Store in sessionStorage for persistence
        this.persistLogs();
    }

    getRelativeTime() {
        const elapsed = Date.now() - this.startTime.getTime();
        const seconds = Math.floor(elapsed / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    persistLogs() {
        try {
            // Store last 100 logs in sessionStorage
            const recentLogs = this.logs.slice(-100);
            sessionStorage.setItem('appLogs', JSON.stringify(recentLogs));
        } catch (e) {
            // Storage might be full, ignore
        }
    }

    loadPersistedLogs() {
        try {
            const stored = sessionStorage.getItem('appLogs');
            if (stored) {
                return JSON.parse(stored);
            }
        } catch (e) {
            // Ignore parse errors
        }
        return [];
    }

    createPanel() {
        // Create log viewer panel
        const panel = document.createElement('div');
        panel.id = 'logViewerPanel';
        panel.innerHTML = `
            <style>
                #logViewerPanel {
                    position: fixed;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    height: 300px;
                    background: #1a1a2e;
                    border-top: 2px solid #4a4a6a;
                    z-index: 100000;
                    display: none;
                    flex-direction: column;
                    font-family: 'Consolas', 'Monaco', monospace;
                    font-size: 12px;
                }
                #logViewerPanel.visible {
                    display: flex;
                }
                #logViewerPanel .log-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 8px 12px;
                    background: #16213e;
                    border-bottom: 1px solid #4a4a6a;
                }
                #logViewerPanel .log-header h3 {
                    margin: 0;
                    color: #fff;
                    font-size: 14px;
                }
                #logViewerPanel .log-controls {
                    display: flex;
                    gap: 8px;
                    align-items: center;
                }
                #logViewerPanel .log-controls button {
                    padding: 4px 10px;
                    background: #4a4a6a;
                    border: none;
                    border-radius: 4px;
                    color: #fff;
                    cursor: pointer;
                    font-size: 11px;
                }
                #logViewerPanel .log-controls button:hover {
                    background: #6a6a8a;
                }
                #logViewerPanel .log-filters {
                    display: flex;
                    gap: 12px;
                }
                #logViewerPanel .log-filters label {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    color: #aaa;
                    font-size: 11px;
                    cursor: pointer;
                }
                #logViewerPanel .log-filters input {
                    cursor: pointer;
                }
                #logViewerPanel .log-content {
                    flex: 1;
                    overflow-y: auto;
                    padding: 8px;
                }
                #logViewerPanel .log-entry {
                    padding: 6px 8px;
                    margin-bottom: 4px;
                    border-radius: 4px;
                    border-left: 3px solid;
                    background: rgba(255,255,255,0.03);
                }
                #logViewerPanel .log-entry.error {
                    border-color: #ef4444;
                    background: rgba(239, 68, 68, 0.1);
                }
                #logViewerPanel .log-entry.warn {
                    border-color: #f59e0b;
                    background: rgba(245, 158, 11, 0.1);
                }
                #logViewerPanel .log-entry.info {
                    border-color: #3b82f6;
                    background: rgba(59, 130, 246, 0.1);
                }
                #logViewerPanel .log-entry.debug {
                    border-color: #6b7280;
                    background: rgba(107, 114, 128, 0.1);
                }
                #logViewerPanel .log-entry.event {
                    border-color: #8b5cf6;
                    background: rgba(139, 92, 246, 0.1);
                }
                #logViewerPanel .log-time {
                    color: #6b7280;
                    font-size: 10px;
                    margin-right: 8px;
                }
                #logViewerPanel .log-level {
                    display: inline-block;
                    width: 50px;
                    font-weight: bold;
                    text-transform: uppercase;
                    font-size: 10px;
                }
                #logViewerPanel .log-level.error { color: #ef4444; }
                #logViewerPanel .log-level.warn { color: #f59e0b; }
                #logViewerPanel .log-level.info { color: #3b82f6; }
                #logViewerPanel .log-level.debug { color: #6b7280; }
                #logViewerPanel .log-level.event { color: #8b5cf6; }
                #logViewerPanel .log-message {
                    color: #e5e5e5;
                    word-break: break-word;
                }
                #logViewerPanel .log-meta {
                    color: #6b7280;
                    font-size: 10px;
                    margin-top: 4px;
                    padding-left: 58px;
                }
                #logViewerPanel .log-stats {
                    display: flex;
                    gap: 16px;
                    padding: 6px 12px;
                    background: #0f0f23;
                    border-top: 1px solid #4a4a6a;
                    font-size: 11px;
                    color: #888;
                }
                #logViewerPanel .stat-item {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }
                #logViewerPanel .stat-count {
                    font-weight: bold;
                }
                #logViewerPanel .stat-count.errors { color: #ef4444; }
                #logViewerPanel .stat-count.warnings { color: #f59e0b; }
                #logViewerPanel .stat-count.events { color: #8b5cf6; }
            </style>
            <div class="log-header">
                <h3>📋 Application Logs</h3>
                <div class="log-controls">
                    <div class="log-filters">
                        <label><input type="checkbox" data-filter="error" checked> Errors</label>
                        <label><input type="checkbox" data-filter="warn" checked> Warnings</label>
                        <label><input type="checkbox" data-filter="info" checked> Info</label>
                        <label><input type="checkbox" data-filter="debug"> Debug</label>
                        <label><input type="checkbox" data-filter="event" checked> Events</label>
                    </div>
                    <button id="logClearBtn">Clear</button>
                    <button id="logExportBtn">Export</button>
                    <button id="logCloseBtn">✕ Close</button>
                </div>
            </div>
            <div class="log-content" id="logContent">
                <div class="log-empty">No logs yet...</div>
            </div>
            <div class="log-stats" id="logStats">
                <div class="stat-item">Session: <span id="statSession">-</span></div>
                <div class="stat-item">Duration: <span id="statDuration">0s</span></div>
                <div class="stat-item">Errors: <span class="stat-count errors" id="statErrors">0</span></div>
                <div class="stat-item">Warnings: <span class="stat-count warnings" id="statWarnings">0</span></div>
                <div class="stat-item">Events: <span class="stat-count events" id="statEvents">0</span></div>
                <div class="stat-item">Total: <span id="statTotal">0</span></div>
            </div>
        `;
        
        document.body.appendChild(panel);
        this.panel = panel;
        
        // Event listeners
        panel.querySelector('#logCloseBtn').addEventListener('click', () => this.hidePanel());
        panel.querySelector('#logClearBtn').addEventListener('click', () => this.clearLogs());
        panel.querySelector('#logExportBtn').addEventListener('click', () => this.exportLogs());
        
        // Filter checkboxes
        panel.querySelectorAll('[data-filter]').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                this.filters[e.target.dataset.filter] = e.target.checked;
                this.updatePanel();
            });
        });

        // Update duration periodically
        setInterval(() => {
            if (this.isVisible) {
                const duration = document.getElementById('statDuration');
                if (duration) {
                    duration.textContent = this.getRelativeTime();
                }
            }
        }, 1000);
    }

    updatePanel() {
        const content = document.getElementById('logContent');
        const filteredLogs = this.logs.filter(log => this.filters[log.level]);
        
        if (filteredLogs.length === 0) {
            content.innerHTML = '<div class="log-empty" style="color:#666;padding:20px;text-align:center;">No logs matching filters...</div>';
        } else {
            content.innerHTML = filteredLogs.map(log => `
                <div class="log-entry ${log.level}">
                    <span class="log-time">${log.relativeTime}</span>
                    <span class="log-level ${log.level}">${log.level}</span>
                    <span class="log-message">${this.escapeHtml(log.message)}</span>
                    ${log.metadata && Object.keys(log.metadata).length > 0 ? `
                        <div class="log-meta">${this.formatMetadata(log.metadata)}</div>
                    ` : ''}
                </div>
            `).join('');
            
            // Auto-scroll to bottom
            content.scrollTop = content.scrollHeight;
        }
        
        // Update stats
        this.updateStats();
    }

    updateStats() {
        const errors = this.logs.filter(l => l.level === 'error').length;
        const warnings = this.logs.filter(l => l.level === 'warn').length;
        const events = this.logs.filter(l => l.level === 'event').length;
        
        document.getElementById('statSession').textContent = this.sessionId.substring(0, 15) + '...';
        document.getElementById('statErrors').textContent = errors;
        document.getElementById('statWarnings').textContent = warnings;
        document.getElementById('statEvents').textContent = events;
        document.getElementById('statTotal').textContent = this.logs.length;
    }

    formatMetadata(meta) {
        return Object.entries(meta)
            .filter(([k, v]) => v !== undefined && v !== null && v !== '')
            .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`)
            .join(' | ');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    setupKeyboardShortcut() {
        document.addEventListener('keydown', (e) => {
            // Ctrl+Shift+L or Cmd+Shift+L
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'l') {
                e.preventDefault();
                this.togglePanel();
            }
        });
    }

    showPanel() {
        this.panel.classList.add('visible');
        this.isVisible = true;
        this.updatePanel();
    }

    hidePanel() {
        this.panel.classList.remove('visible');
        this.isVisible = false;
    }

    togglePanel() {
        if (this.isVisible) {
            this.hidePanel();
        } else {
            this.showPanel();
        }
    }

    clearLogs() {
        this.logs = [];
        sessionStorage.removeItem('appLogs');
        this.updatePanel();
        this.log('info', 'Logs cleared');
    }

    exportLogs() {
        const exportData = {
            sessionId: this.sessionId,
            startTime: this.startTime.toISOString(),
            exportTime: new Date().toISOString(),
            duration: this.getRelativeTime(),
            userAgent: navigator.userAgent,
            url: window.location.href,
            stats: {
                total: this.logs.length,
                errors: this.logs.filter(l => l.level === 'error').length,
                warnings: this.logs.filter(l => l.level === 'warn').length,
                info: this.logs.filter(l => l.level === 'info').length,
                events: this.logs.filter(l => l.level === 'event').length
            },
            logs: this.logs
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `rathore-club-logs-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        this.log('info', 'Logs exported', { filename: a.download });
    }

    // Public API for manual logging
    error(message, metadata = {}) {
        this.log('error', message, { ...metadata, source: 'app' });
    }

    warn(message, metadata = {}) {
        this.log('warn', message, { ...metadata, source: 'app' });
    }

    info(message, metadata = {}) {
        this.log('info', message, { ...metadata, source: 'app' });
    }

    debug(message, metadata = {}) {
        this.log('debug', message, { ...metadata, source: 'app' });
    }

    event(eventName, data = {}) {
        this.log('event', `Custom: ${eventName}`, { ...data, source: 'app-event' });
    }

    // Get logs for analysis
    getLogs(filter = null) {
        if (filter) {
            return this.logs.filter(l => l.level === filter);
        }
        return [...this.logs];
    }

    getErrors() {
        return this.getLogs('error');
    }

    getWarnings() {
        return this.getLogs('warn');
    }

    hasErrors() {
        return this.logs.some(l => l.level === 'error');
    }
}

// Initialize logger
window.appLogger = new AppLogger();

// Convenience functions
window.showLogs = () => window.appLogger.showPanel();
window.hideLogs = () => window.appLogger.hidePanel();
window.exportLogs = () => window.appLogger.exportLogs();
window.clearLogs = () => window.appLogger.clearLogs();

// Log helpful message
console.info('📋 Logger active! Press Ctrl+Shift+L to view logs, or call showLogs()');
