#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class TestOrchestrator {
    constructor() {
        this.results = {};
        this.startTime = Date.now();
        this.reportDir = path.join(__dirname, 'reports');
        this.ensureReportDir();
    }

    ensureReportDir() {
        if (!fs.existsSync(this.reportDir)) {
            fs.mkdirSync(this.reportDir, { recursive: true });
        }
    }

    log(level, message) {
        const prefix = {
            'INFO': '[ℹ️  INFO]',
            'SUCCESS': '[✓ SUCCESS]',
            'ERROR': '[✗ ERROR]',
            'WARN': '[⚠️  WARN]'
        }[level] || `[${level}]`;

        console.log(`${prefix} ${message}`);
    }

    runTest(name, script, options = {}) {
        this.log('INFO', `Starting ${name}...`);

        const startTime = Date.now();
        const shouldFail = options.allowFail ? false : true;

        try {
            const command = `node ${script}`;
            const env = { ...process.env, ...options.env };

            execSync(command, {
                stdio: options.quiet ? 'pipe' : 'inherit',
                cwd: __dirname,
                env
            });

            const duration = Date.now() - startTime;
            this.results[name] = { success: true, duration };
            this.log('SUCCESS', `${name} completed in ${(duration / 1000).toFixed(2)}s`);

            return true;
        } catch (err) {
            const duration = Date.now() - startTime;
            this.results[name] = { success: false, duration, error: err.message };
            this.log('ERROR', `${name} failed after ${(duration / 1000).toFixed(2)}s`);

            if (options.required) {
                return false;
            }
            return true;
        }
    }

    runAllTests(options = {}) {
        console.log('\n╔════════════════════════════════════════════════════════╗');
        console.log('║     Radio Explorer - Comprehensive Test Suite 🚀       ║');
        console.log('╚════════════════════════════════════════════════════════╝\n');

        const verbose = options.verbose || process.argv.includes('--verbose');
        const skipE2E = process.argv.includes('--skip-e2e');
        const skipStations = process.argv.includes('--skip-stations');

        // Run data validation tests (required)
        this.log('INFO', 'Phase 1: Data Validation');
        console.log('─'.repeat(50));
        this.runTest(
            'Data Validation',
            'data/run.js',
            { required: true, quiet: !verbose }
        );

        // Run unit tests (required)
        console.log('\n' + '─'.repeat(50));
        this.log('INFO', 'Phase 2: Unit Tests');
        console.log('─'.repeat(50));
        this.runTest(
            'Module Unit Tests',
            'unit/run.js',
            { required: true, quiet: !verbose }
        );

        // Run integration tests (station health)
        if (!skipStations) {
            console.log('\n' + '─'.repeat(50));
            this.log('INFO', 'Phase 3: Integration Tests');
            console.log('─'.repeat(50));
            this.runTest(
                'Station Health Check',
                'integration/run.js',
                { required: false, quiet: !verbose }
            );
        }

        // Run E2E tests
        if (!skipE2E) {
            console.log('\n' + '─'.repeat(50));
            this.log('INFO', 'Phase 4: End-to-End Tests');
            console.log('─'.repeat(50));
            this.runTest(
                'E2E Browser Tests',
                'e2e/run.js',
                { required: false, quiet: !verbose }
            );
        }

        this.generateSummary();
    }

    generateSummary() {
        const totalDuration = Date.now() - this.startTime;
        const allResults = Object.entries(this.results);
        const successCount = allResults.filter(([_, r]) => r.success).length;
        const failedCount = allResults.filter(([_, r]) => !r.success).length;

        console.log('\n' + '═'.repeat(50));
        console.log('║ TEST SUMMARY');
        console.log('═'.repeat(50));

        for (const [name, result] of allResults) {
            const status = result.success ? '✓' : '✗';
            const duration = (result.duration / 1000).toFixed(2);
            console.log(`${status} ${name.padEnd(35)} ${duration}s`);
        }

        console.log('═'.repeat(50));
        console.log(`Total Time: ${(totalDuration / 1000).toFixed(2)}s`);
        console.log(`Tests Passed: ${successCount}`);
        console.log(`Tests Failed: ${failedCount}`);

        if (failedCount === 0) {
            console.log('\n🎉 All tests passed!');
        } else {
            console.log(`\n⚠️  ${failedCount} test(s) failed`);
        }

        // Save comprehensive report
        this.saveReport(totalDuration, successCount, failedCount);
    }

    saveReport(totalDuration, successCount, failedCount) {
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                totalTests: Object.keys(this.results).length,
                passed: successCount,
                failed: failedCount,
                totalDurationMs: totalDuration
            },
            tests: this.results
        };

        const reportPath = path.join(this.reportDir, 'test-report.json');
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

        console.log(`\n📋 Full report saved to: ${reportPath}`);
        this.generateHtmlReport(report);
    }

    generateHtmlReport(report) {
        const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Radio Explorer - Test Report</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; }
        .container { max-width: 1000px; margin: 40px auto; padding: 0 20px; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px; border-radius: 8px; margin-bottom: 30px; }
        .header h1 { font-size: 32px; margin-bottom: 10px; }
        .header p { opacity: 0.9; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
        .summary-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .summary-card .label { color: #666; font-size: 14px; margin-bottom: 8px; }
        .summary-card .value { font-size: 32px; font-weight: bold; }
        .summary-card.success .value { color: #22c55e; }
        .summary-card.failure .value { color: #ef4444; }
        .tests { background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); overflow: hidden; }
        .test-item { padding: 16px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
        .test-item:last-child { border-bottom: none; }
        .test-item.pass { border-left: 4px solid #22c55e; }
        .test-item.fail { border-left: 4px solid #ef4444; background: #fef2f2; }
        .test-name { font-weight: 500; }
        .test-duration { color: #666; font-size: 14px; }
        .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
        .badge.success { background: #dcfce7; color: #166534; }
        .badge.failure { background: #fee2e2; color: #991b1b; }
        .footer { text-align: center; color: #666; font-size: 14px; margin-top: 30px; padding: 20px 0; border-top: 1px solid #eee; }
        .time { color: #999; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎙️ Radio Explorer - Test Report</h1>
            <p>Comprehensive Application Test Suite</p>
        </div>

        <div class="summary">
            <div class="summary-card success">
                <div class="label">Tests Passed</div>
                <div class="value">${report.summary.passed}</div>
            </div>
            <div class="summary-card ${report.summary.failed > 0 ? 'failure' : 'success'}">
                <div class="label">Tests Failed</div>
                <div class="value">${report.summary.failed}</div>
            </div>
            <div class="summary-card">
                <div class="label">Total Duration</div>
                <div class="value">${(report.summary.totalDurationMs / 1000).toFixed(2)}s</div>
            </div>
            <div class="summary-card">
                <div class="label">Success Rate</div>
                <div class="value">${((report.summary.passed / report.summary.totalTests) * 100).toFixed(0)}%</div>
            </div>
        </div>

        <div class="tests">
            ${Object.entries(report.tests).map(([name, result]) => `
                <div class="test-item ${result.success ? 'pass' : 'fail'}">
                    <div>
                        <div class="test-name">${name}</div>
                        <span class="badge ${result.success ? 'success' : 'failure'}">
                            ${result.success ? '✓ PASSED' : '✗ FAILED'}
                        </span>
                    </div>
                    <div class="test-duration">${(result.duration / 1000).toFixed(2)}s</div>
                </div>
            `).join('')}
        </div>

        <div class="footer">
            <p>Generated: <span class="time">${new Date(report.timestamp).toLocaleString()}</span></p>
            <p>Radio Explorer Automation Test Suite v1.0</p>
        </div>
    </div>
</body>
</html>
        `;

        const htmlPath = path.join(this.reportDir, 'test-report.html');
        fs.writeFileSync(htmlPath, html);
        console.log(`📊 HTML report saved to: ${htmlPath}`);
    }
}

// Run tests
const orchestrator = new TestOrchestrator();
orchestrator.runAllTests();
