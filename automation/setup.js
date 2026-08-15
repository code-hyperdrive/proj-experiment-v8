#!/usr/bin/env node
/**
 * Setup script for test automation suite
 * Installs dependencies and verifies environment
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m'
};

function log(color, symbol, message) {
    console.log(`${colors[color]}${symbol} ${message}${colors.reset}`);
}

function setup() {
    log('cyan', '🔧', 'Setting up Radio Explorer Test Automation Suite\n');

    // Check Node.js version
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.split('.')[0].substring(1));

    if (majorVersion < 18) {
        log('red', '✗', `Node.js 18+ required (you have ${nodeVersion})`);
        process.exit(1);
    }
    log('green', '✓', `Node.js ${nodeVersion} detected`);

    // Check and create reports directory
    const reportDir = path.join(__dirname, 'reports');
    if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir, { recursive: true });
        log('green', '✓', 'Created reports directory');
    } else {
        log('green', '✓', 'Reports directory exists');
    }

    // Create subdirectories
    const subdirs = ['e2e', 'data', 'unit', 'integration'];
    for (const subdir of subdirs) {
        const dir = path.join(reportDir, subdir);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    // Check if package.json exists
    const pkgPath = path.join(__dirname, 'package.json');
    if (!fs.existsSync(pkgPath)) {
        log('red', '✗', 'package.json not found');
        process.exit(1);
    }
    log('green', '✓', 'package.json found');

    // Install dependencies
    log('cyan', '📦', 'Installing dependencies...');
    try {
        execSync('npm install', { stdio: 'inherit', cwd: __dirname });
        log('green', '✓', 'Dependencies installed');
    } catch (err) {
        log('red', '✗', 'Failed to install dependencies');
        process.exit(1);
    }

    // Verify key files
    const requiredFiles = [
        'run-all-tests.js',
        'data/validation.js',
        'data/run.js',
        'unit/modules.test.js',
        'unit/run.js',
        'e2e/tests.js',
        'e2e/playwright.config.js',
        'e2e/run.js',
        'integration/station-health.js',
        'integration/run.js'
    ];

    log('cyan', '📋', 'Verifying test files...');
    let filesOk = true;
    for (const file of requiredFiles) {
        const filePath = path.join(__dirname, file);
        if (fs.existsSync(filePath)) {
            log('green', '✓', file);
        } else {
            log('red', '✗', `${file} - NOT FOUND`);
            filesOk = false;
        }
    }

    if (!filesOk) {
        log('red', '✗', 'Some test files are missing');
        process.exit(1);
    }

    // Create .env file if not exists
    const envPath = path.join(__dirname, '.env');
    const envExamplePath = path.join(__dirname, '.env.example');
    if (!fs.existsSync(envPath) && fs.existsSync(envExamplePath)) {
        fs.copyFileSync(envExamplePath, envPath);
        log('green', '✓', '.env file created from example');
    }

    log('green', '✓', 'All test files verified');

    console.log('\n' + '═'.repeat(50));
    log('green', '✨', 'Setup Complete!\n');

    console.log('Next steps:');
    console.log('  1. Start your application: npm start (in project root)');
    console.log('  2. Run all tests: npm test');
    console.log('  3. View reports: open reports/test-report.html\n');

    console.log('Quick commands:');
    console.log('  npm test              - Run all tests');
    console.log('  npm run test:data     - Run data validation');
    console.log('  npm run test:unit     - Run unit tests');
    console.log('  npm run test:e2e      - Run E2E tests');
    console.log('  npm run test:stations - Run station health checks\n');

    console.log('Documentation:');
    console.log('  cat README.md         - Read full documentation');
    console.log('═'.repeat(50) + '\n');
}

setup();
