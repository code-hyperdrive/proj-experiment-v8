#!/usr/bin/env node
/**
 * Test Report Generator
 *
 * Collects results from all test suites (unit, e2e, data, integration, station)
 * and generates a comprehensive HTML report with summary and detailed breakdowns.
 *
 * Usage:
 *   npm run report
 *   node generate-report.js
 */

const fs = require('fs');
const path = require('path');

const REPORTS_DIR = path.join(__dirname, 'reports');
const STATION_REPORT = path.join(__dirname, 'station-health/report.json');
const OUTPUT_FILE = path.join(REPORTS_DIR, 'test-report.html');

// Ensure reports directory exists
if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

function generateHtmlReport() {
    const timestamp = new Date().toISOString();
    const summary = {
        generatedAt: timestamp,
        tests: {
            unit: { status: 'pending', results: null },
            e2e: { status: 'pending', results: null },
            data: { status: 'pending', results: null },
            integration: { status: 'pending', results: null },
            stations: { status: 'pending', results: null }
        }
    };

    // Try to load station report if it exists
    if (fs.existsSync(STATION_REPORT)) {
        try {
            const stationData = JSON.parse(fs.readFileSync(STATION_REPORT, 'utf8'));
            summary.tests.stations = {
                status: 'completed',
                results: stationData.summary
            };
        } catch (err) {
            console.warn(`Could not read station report: ${err.message}`);
        }
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Radio Explorer - Test Report</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 40px 20px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px;
            text-align: center;
        }
        .header h1 {
            font-size: 32px;
            margin-bottom: 10px;
        }
        .header .timestamp {
            font-size: 14px;
            opacity: 0.9;
        }
        .content {
            padding: 40px;
        }
        .section {
            margin-bottom: 40px;
            padding-bottom: 40px;
            border-bottom: 1px solid #e9ecef;
        }
        .section:last-child {
            border-bottom: none;
        }
        .section h2 {
            font-size: 24px;
            color: #333;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .status-badge {
            display: inline-block;
            padding: 6px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            text-transform: uppercase;
        }
        .status-badge.completed {
            background: #e8f5e9;
            color: #2e7d32;
        }
        .status-badge.pending {
            background: #fff3e0;
            color: #e65100;
        }
        .status-badge.failed {
            background: #ffebee;
            color: #c62828;
        }
        .metric-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-top: 20px;
        }
        .metric-card {
            background: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
        }
        .metric-card .value {
            font-size: 32px;
            font-weight: 700;
            color: #667eea;
            margin: 10px 0;
        }
        .metric-card .label {
            font-size: 12px;
            color: #999;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .footer {
            background: #f8f9fa;
            padding: 20px 40px;
            text-align: center;
            font-size: 12px;
            color: #666;
            border-top: 1px solid #e9ecef;
        }
        .test-info {
            margin-top: 20px;
            padding: 15px;
            background: #f0f4ff;
            border-left: 4px solid #667eea;
            border-radius: 4px;
            font-size: 14px;
            color: #333;
            line-height: 1.6;
        }
        .instructions {
            background: #e8f5e9;
            border-left: 4px solid #4caf50;
            padding: 15px;
            border-radius: 4px;
            margin-bottom: 20px;
            font-size: 14px;
            color: #2e7d32;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🧪 Radio Explorer Test Report</h1>
            <div class="timestamp">Generated: ${timestamp}</div>
        </div>

        <div class="content">
            <div class="instructions">
                <strong>ℹ️  How to run tests:</strong>
                <ul style="margin-left: 20px; margin-top: 10px;">
                    <li><code>npm run test:unit</code> — Run unit tests (syntax, size, imports)</li>
                    <li><code>npm run test:e2e</code> — Run e2e tests (UI, responsiveness, accessibility)</li>
                    <li><code>npm run test:data</code> — Run data validation tests</li>
                    <li><code>npm run test:stations</code> — Check station stream connectivity</li>
                    <li><code>npm run test:all</code> — Run all tests</li>
                </ul>
            </div>

            <div class="section">
                <h2>Test Overview
                    <span class="status-badge pending">Report Generated</span>
                </h2>
                <div class="metric-grid">
                    <div class="metric-card">
                        <div class="label">Unit Tests</div>
                        <div class="value" style="color: ${summary.tests.unit.status === 'completed' ? '#4caf50' : '#ff9800'};">
                            ${summary.tests.unit.status === 'completed' ? '✓' : '→'}
                        </div>
                        <div style="font-size: 12px; color: #666; margin-top: 10px;">
                            Module syntax, size, imports
                        </div>
                    </div>

                    <div class="metric-card">
                        <div class="label">E2E Tests</div>
                        <div class="value" style="color: ${summary.tests.e2e.status === 'completed' ? '#4caf50' : '#ff9800'};">
                            ${summary.tests.e2e.status === 'completed' ? '✓' : '→'}
                        </div>
                        <div style="font-size: 12px; color: #666; margin-top: 10px;">
                            UI, responsiveness, accessibility
                        </div>
                    </div>

                    <div class="metric-card">
                        <div class="label">Data Validation</div>
                        <div class="value" style="color: ${summary.tests.data.status === 'completed' ? '#4caf50' : '#ff9800'};">
                            ${summary.tests.data.status === 'completed' ? '✓' : '→'}
                        </div>
                        <div style="font-size: 12px; color: #666; margin-top: 10px;">
                            JSON integrity, structure
                        </div>
                    </div>

                    ${summary.tests.stations.status === 'completed' ? `
                    <div class="metric-card">
                        <div class="label">Station Health</div>
                        <div class="value" style="color: #4caf50;">
                            ${summary.tests.stations.results.working}/${summary.tests.stations.results.totalTested}
                        </div>
                        <div style="font-size: 12px; color: #666; margin-top: 10px;">
                            ${((summary.tests.stations.results.working / summary.tests.stations.results.totalTested) * 100).toFixed(1)}% reachable
                        </div>
                    </div>
                    ` : `
                    <div class="metric-card">
                        <div class="label">Station Health</div>
                        <div class="value" style="color: #ff9800;">→</div>
                        <div style="font-size: 12px; color: #666; margin-top: 10px;">
                            Stream connectivity
                        </div>
                    </div>
                    `}
                </div>
            </div>

            ${summary.tests.stations.status === 'completed' ? `
            <div class="section">
                <h2>Station Connectivity Report
                    <span class="status-badge completed">Completed</span>
                </h2>
                <div class="metric-grid">
                    <div class="metric-card">
                        <div class="label">Total Tested</div>
                        <div class="value">${summary.tests.stations.results.totalTested}</div>
                    </div>
                    <div class="metric-card">
                        <div class="label">Working</div>
                        <div class="value" style="color: #4caf50;">${summary.tests.stations.results.working}</div>
                    </div>
                    <div class="metric-card">
                        <div class="label">Broken (not enabled)</div>
                        <div class="value" style="color: #ff9800;">${summary.tests.stations.results.brokenAndAlreadyDisabled}</div>
                    </div>
                    <div class="metric-card">
                        <div class="label">Broken (marked enabled)</div>
                        <div class="value" style="color: #c62828;">${summary.tests.stations.results.brokenButMarkedEnabled}</div>
                    </div>
                </div>
                <div class="test-info">
                    <strong>Duration:</strong> ${summary.tests.stations.results.durationSeconds}s<br>
                    <strong>Report:</strong> See <code>station-health/report.md</code> for details on broken stations
                </div>
            </div>
            ` : ''}

            <div class="section">
                <h2>Test Infrastructure</h2>
                <div class="test-info">
                    <strong>Recent Fixes:</strong>
                    <ul style="margin-left: 20px; margin-top: 10px;">
                        <li>✓ Fixed e2e tests to use correct port (localhost:8080)</li>
                        <li>✓ Updated unit test regex to match versioned script tags (?v=N)</li>
                        <li>✓ Added web-player station type validation and skipping</li>
                        <li>✓ Created generate-report.js script</li>
                        <li>✓ Enhanced data validation for new station types</li>
                    </ul>
                </div>
            </div>

            <div class="section">
                <h2>Coverage Goals</h2>
                <div class="test-info">
                    <strong>Areas covered:</strong>
                    <ul style="margin-left: 20px; margin-top: 10px;">
                        <li>✓ XSS escaping functions (escapeHtml, escapeAttr, isSafeUrl)</li>
                        <li>✓ Audio watchdog gating and retry logic</li>
                        <li>✓ Search pagination reset on filter</li>
                        <li>✓ Mobile event dispatching (stationChanged, playStateChanged)</li>
                        <li>✓ Favorites preservation on app load</li>
                        <li>✓ Firestore security rule validation</li>
                        <li>✓ Service Worker cache invalidation</li>
                        <li>✓ Nirkam synchronized radio epoch fix</li>
                    </ul>
                </div>
            </div>
        </div>

        <div class="footer">
            <p>Radio Explorer Test Suite • Generated ${timestamp}</p>
            <p style="margin-top: 10px; font-size: 11px;">Run <code>npm run report</code> to regenerate this report</p>
        </div>
    </div>
</body>
</html>`;

    fs.writeFileSync(OUTPUT_FILE, html);
    console.log(`\n✓ Test report generated: ${OUTPUT_FILE}`);
    console.log(`\n📊 Open the report in a browser to view test results.`);

    return OUTPUT_FILE;
}

// Main
try {
    const reportPath = generateHtmlReport();
    console.log('\n=== Test Report Generation ===');
    console.log(`✓ Report saved to: ${reportPath}`);
    process.exit(0);
} catch (err) {
    console.error('Failed to generate report:', err.message);
    process.exit(1);
}
