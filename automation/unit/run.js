#!/usr/bin/env node
const { ModuleTestRunner } = require('./modules.test.js');
const fs = require('fs');
const path = require('path');

const runner = new ModuleTestRunner();
const result = runner.run();

// Save report
const reportPath = path.join(__dirname, '../reports/unit-test-report.json');
fs.writeFileSync(reportPath, JSON.stringify(result, null, 2));
console.log(`\nReport saved to: ${reportPath}`);

process.exit(result.success ? 0 : 1);
