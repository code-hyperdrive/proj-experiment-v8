#!/usr/bin/env node
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const reportDir = path.join(__dirname, '../reports');
if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
}

console.log('Starting E2E tests with Playwright...\n');

try {
    // Run playwright tests
    const command = `npx playwright test --config=${path.join(__dirname, 'playwright.config.js')} ${process.argv.slice(2).join(' ')}`;
    execSync(command, { stdio: 'inherit', cwd: __dirname });
} catch (err) {
    console.error('E2E tests failed');
    process.exit(1);
}
