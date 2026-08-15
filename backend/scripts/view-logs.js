#!/usr/bin/env node

/**
 * Log viewer CLI tool
 * Usage:
 *   node scripts/view-logs.js              # View latest logs (tail -f style)
 *   node scripts/view-logs.js --latest     # Show latest log file path
 *   node scripts/view-logs.js --list       # List all log files
 *   node scripts/view-logs.js --filter ERROR   # Filter by level (ERROR, WARN, INFO, DEBUG)
 *   node scripts/view-logs.js --type REQUEST   # Filter by type (REQUEST, RESPONSE, DATABASE, AUTH, ERROR, ACTIVITY)
 *   node scripts/view-logs.js --search keyword  # Search for keyword
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const logsDir = path.join(__dirname, '..', 'logs');
const args = process.argv.slice(2);

/**
 * Get all log files sorted by date (newest first)
 */
function getAllLogFiles() {
  const files = [];
  try {
    const dates = fs.readdirSync(logsDir).sort().reverse();
    for (const date of dates) {
      const dayDir = path.join(logsDir, date);
      if (fs.statSync(dayDir).isDirectory()) {
        const dayFiles = fs.readdirSync(dayDir).filter((f) => f.endsWith('.log')).sort().reverse();
        for (const file of dayFiles) {
          files.push(path.join(dayDir, file));
        }
      }
    }
  } catch (error) {
    console.error('Error reading log files:', error.message);
  }
  return files;
}

/**
 * Get the latest log file
 */
function getLatestLogFile() {
  const files = getAllLogFiles();
  return files.length > 0 ? files[0] : null;
}

/**
 * Parse JSON log line
 */
function parseLogLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

/**
 * Format log entry for display
 */
function formatLogEntry(entry) {
  const timestamp = new Date(entry.timestamp).toLocaleTimeString();
  const level = `[${entry.level}]`.padEnd(8);
  const type = `[${entry.type}]`.padEnd(12);
  const message = entry.message || '';

  let output = `${timestamp} ${level} ${type} ${message}`;

  if (entry.duration) {
    output += ` (${entry.duration}ms)`;
  }

  if (entry.statusCode) {
    output += ` Status: ${entry.statusCode}`;
  }

  if (entry.userId) {
    output += ` User: ${entry.userId}`;
  }

  return output;
}

/**
 * View logs with filtering
 */
async function viewLogs(filterLevel = null, filterType = null, searchTerm = null) {
  const latestFile = getLatestLogFile();

  if (!latestFile) {
    console.error('❌ No log files found');
    return;
  }

  console.log(`\n📋 Reading: ${path.relative(process.cwd(), latestFile)}\n`);
  console.log('(Press Ctrl+C to exit)\n');

  const fileStream = fs.createReadStream(latestFile);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let lineCount = 0;

  rl.on('line', (line) => {
    const entry = parseLogLine(line);
    if (!entry) return;

    // Apply filters
    if (filterLevel && entry.level !== filterLevel) return;
    if (filterType && entry.type !== filterType) return;
    if (searchTerm && !JSON.stringify(entry).includes(searchTerm)) return;

    console.log(formatLogEntry(entry));

    // Print data if available
    if (entry.data && Object.keys(entry.data).length > 0) {
      console.log(`   Data: ${JSON.stringify(entry.data).substring(0, 100)}...`);
    }

    lineCount++;
  });

  rl.on('close', () => {
    console.log(`\n📊 Total entries shown: ${lineCount}`);
  });
}

/**
 * Main CLI handler
 */
async function main() {
  const command = args[0];

  switch (command) {
    case '--latest':
      const latest = getLatestLogFile();
      if (latest) {
        console.log(`Latest log file: ${path.relative(process.cwd(), latest)}`);
      } else {
        console.error('❌ No log files found');
      }
      break;

    case '--list':
      const files = getAllLogFiles();
      if (files.length === 0) {
        console.error('❌ No log files found');
      } else {
        console.log(`\n📁 Log files (${files.length} total):\n`);
        files.forEach((f, i) => {
          const size = (fs.statSync(f).size / 1024).toFixed(2);
          const relative = path.relative(process.cwd(), f);
          console.log(`  ${i + 1}. ${relative} (${size} KB)`);
        });
        console.log();
      }
      break;

    case '--filter':
      const level = args[1];
      if (!level) {
        console.error('❌ Please specify a log level: ERROR, WARN, INFO, DEBUG');
      } else {
        await viewLogs(level.toUpperCase());
      }
      break;

    case '--type':
      const type = args[1];
      if (!type) {
        console.error('❌ Please specify a log type: REQUEST, RESPONSE, DATABASE, AUTH, ERROR, ACTIVITY');
      } else {
        await viewLogs(null, type.toUpperCase());
      }
      break;

    case '--search':
      const term = args[1];
      if (!term) {
        console.error('❌ Please provide a search term');
      } else {
        await viewLogs(null, null, term);
      }
      break;

    default:
      // Default: view latest logs
      await viewLogs();
  }
}

main().catch(console.error);
