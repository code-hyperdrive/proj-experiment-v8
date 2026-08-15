#!/usr/bin/env node
const { StationHealthCheck } = require('./station-health.js');
const fs = require('fs');
const path = require('path');

async function runIntegrationTests() {
    console.log('=== Running Integration Tests ===\n');

    const reportDir = path.join(__dirname, '../reports');
    if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir, { recursive: true });
    }

    const results = {
        timestamp: new Date().toISOString(),
        tests: {}
    };

    // Run station health checks
    const stationHealth = new StationHealthCheck();
    const stationResult = stationHealth.run({
        concurrency: process.env.CONCURRENCY || 40,
        timeout: process.env.TIMEOUT || 8000,
        onlyEnabled: process.env.ONLY_ENABLED === 'true'
    });

    results.tests.stationHealth = stationResult;

    // Save integration test report
    const reportPath = path.join(reportDir, 'integration-test-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
    console.log(`\nReport saved to: ${reportPath}`);

    const success = stationResult.success;
    process.exit(success ? 0 : 1);
}

runIntegrationTests().catch(err => {
    console.error('Integration tests failed:', err);
    process.exit(1);
});
