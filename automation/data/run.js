#!/usr/bin/env node
const { DataValidator } = require('./validation.js');

const validator = new DataValidator();
const { success, report } = validator.run();

// Save report
const fs = require('fs');
const path = require('path');
const reportPath = path.join(__dirname, '../reports/data-validation-report.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(`\nReport saved to: ${reportPath}`);

process.exit(success ? 0 : 1);
