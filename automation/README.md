# Radio Explorer - Comprehensive Test Automation Suite

Complete end-to-end, integration, unit, and data validation testing for the Radio Explorer application.

## 📁 Directory Structure

```
automation/
├── e2e/                          # End-to-End Browser Tests (Playwright)
│   ├── tests.js                  # Core UI and functionality tests
│   ├── playwright.config.js       # Playwright configuration
│   └── run.js                     # E2E test runner
├── unit/                         # Unit & Module Tests
│   ├── modules.test.js           # JavaScript module validation
│   └── run.js                    # Unit test runner
├── data/                         # Data Validation Tests
│   ├── validation.js             # stations.json, manifest.json validation
│   └── run.js                    # Data validation runner
├── integration/                  # Integration Tests
│   ├── station-health.js         # Station connectivity checks
│   └── run.js                    # Integration test runner
├── station-health/                # Standalone station connectivity checker
│   ├── check-stations.js         # Tests every stream URL in frontend/data/stations.json
│   ├── report.json / report.md   # Generated results (see station-health/README.md)
├── reports/                      # Test Reports (auto-generated)
│   ├── test-report.json          # Main test summary
│   ├── test-report.html          # Visual HTML report
│   ├── data-validation-report.json
│   ├── unit-test-report.json
│   ├── e2e-report/               # Detailed Playwright reports
│   └── integration-test-report.json
├── run-all-tests.js              # Master test orchestrator
└── package.json                  # Dependencies
```

## 🚀 Quick Start

### Installation

```bash
cd automation
npm install
```

### Run All Tests

```bash
# Run complete test suite
npm test

# Run with verbose output
npm run test:all

# Skip E2E tests (faster)
node run-all-tests.js --skip-e2e

# Skip station health checks
node run-all-tests.js --skip-stations
```

### Run Individual Test Suites

```bash
# Data validation only
npm run test:data

# Unit tests only
npm run test:unit

# E2E tests only
npm run test:e2e

# Station health checks only
npm run test:stations

# Integration tests
npm run test:integration
```

## 📋 Test Suites

### 1. Data Validation (`data/validation.js`)

Validates the integrity of JSON data files and configuration.

**Tests:**
- ✓ `stations.json` structure and format
- ✓ Station field validation (id, name, country, streams)
- ✓ Stream URL validity
- ✓ Duplicate station ID detection
- ✓ `station-exceptions.json` format
- ✓ `manifest.json` PWA configuration
- ✓ Required manifest fields

**Output:** `reports/data-validation-report.json`

### 2. Unit Tests (`unit/modules.test.js`)

Validates JavaScript modules and assets.

**Tests:**
- ✓ Module syntax validation
- ✓ File size checks
- ✓ Import resolution
- ✓ Asset file existence
- ✓ HTML structure (index.html)
- ✓ Script and resource includes

**Output:** `reports/unit-test-report.json`

### 3. End-to-End Tests (`e2e/tests.js`)

Browser-based UI and functionality testing using Playwright.

**Test Categories:**

**Core Functionality:**
- ✓ Page loads and main UI displays
- ✓ Search functionality works
- ✓ Station selection and display
- ✓ Favorites/bookmark functionality
- ✓ No console errors on load

**Responsive Design:**
- ✓ Mobile viewport (375×812)
- ✓ Tablet viewport (768×1024)
- ✓ Desktop viewport (1280×800)

**PWA Features:**
- ✓ Service worker registration
- ✓ Manifest file validity
- ✓ Meta tags present

**Accessibility:**
- ✓ Heading hierarchy
- ✓ Button labels
- ✓ Link text
- ✓ Keyboard navigation
- ✓ Color contrast

**Performance:**
- ✓ Page load time
- ✓ Network request completion
- ✓ DOM content loaded time

**Error Handling:**
- ✓ Graceful 404 handling
- ✓ Network interruption recovery
- ✓ Theme switching

**Browsers Tested:**
- Chromium
- Firefox
- WebKit (Safari)
- Mobile Chrome (Pixel 5)
- Mobile Safari (iPhone 12)

**Output:** 
- `reports/e2e-report/` (detailed HTML report)
- `reports/e2e-results.json` (JSON results)

### 4. Integration Tests (`integration/station-health.js`)

Validates radio station stream connectivity.

**Tests:**
- ✓ Stream URL reachability
- ✓ HTTP status validation
- ✓ Content-type verification
- ✓ Timeout handling
- ✓ Fallback stream testing
- ✓ Health metric reporting

**Configuration:**
```bash
CONCURRENCY=40         # Number of concurrent checks (default: 40)
TIMEOUT=8000           # Timeout per station in ms (default: 8000)
ONLY_ENABLED=true      # Check only enabled stations (default: false)
```

**Output:** 
- `station-health/report.json` (full results)
- `station-health/report.md` (markdown summary)
- `reports/integration-test-report.json` (test suite summary)

## 📊 Reports

### HTML Report

Visual test summary with status dashboard:
```
reports/test-report.html
```

Open in browser to see:
- Pass/fail statistics
- Test execution times
- Performance metrics
- Success rate percentage

### JSON Reports

Programmatically accessible reports:
- `test-report.json` - Main summary
- `data-validation-report.json` - Data validation details
- `unit-test-report.json` - Module validation details
- `e2e-results.json` - Browser test results
- `integration-test-report.json` - Station health results

## 🔧 Configuration

### Environment Variables

```bash
# E2E Tests
BASE_URL=http://localhost:3000    # Application URL

# Station Health Checks
CONCURRENCY=40                     # Parallel checks
TIMEOUT=8000                       # Connection timeout (ms)
ONLY_ENABLED=false                 # Check only enabled stations

# Test Runner
VERBOSE=true                       # Detailed output
CI=true                           # CI/CD mode (affects retries, workers)
```

### Custom Settings

Edit `automation/run-all-tests.js` to:
- Add/remove test phases
- Modify phase order
- Adjust logging
- Change report location

## 🎯 Common Tasks

### Run Tests Locally

```bash
npm test
```

### Run Tests in CI/CD

```bash
CI=true npm test
```

### Generate Visual Reports Only

```bash
node generate-report.js
```

### Test Specific Feature

```bash
# Only check data integrity
npm run test:data

# Only check UI in browsers
npm run test:e2e

# Only check station health
npm run test:stations
```

### Debug Failed Tests

```bash
# Run with detailed output
npm run test:all

# Run specific test suite with debug info
DEBUG=* npm run test:e2e

# View E2E test artifacts
open reports/e2e-report/index.html
```

## ✅ Test Result Interpretation

### Success Criteria

**All Phases Pass:**
```
✓ Data Validation - 0 errors, 0 warnings
✓ Module Tests - all syntax valid, sizes OK
✓ E2E Tests - responsive, accessible, performant
✓ Station Health - no broken enabled stations
```

**Status: 🎉 READY FOR DEPLOYMENT**

### Known Warnings (OK to Ignore)

- ⚠️ Service worker not active (on first visit)
- ⚠️ Optional assets missing (icons, manifests)
- ⚠️ Some stations temporarily unavailable

### Critical Failures (MUST FIX)

- ✗ Invalid JSON structure
- ✗ Missing required fields
- ✗ Page fails to load in browsers
- ✗ Console errors on page load
- ✗ Broken enabled stations affecting users

## 🐛 Troubleshooting

### Tests Won't Run

```bash
# Ensure Node.js 18+ installed
node --version

# Reinstall dependencies
rm -rf node_modules
npm install
```

### E2E Tests Timeout

```bash
# Increase timeout
BASE_URL=http://localhost:3000 npm run test:e2e

# Or edit playwright.config.js
```

### Station Health Checks Fail

```bash
# Increase timeout for slow networks
TIMEOUT=15000 npm run test:stations

# Test only enabled stations
ONLY_ENABLED=true npm run test:stations
```

### Port Already in Use

```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Or use different port
BASE_URL=http://localhost:3001 npm run test:e2e
```

## 📈 Metrics & KPIs

Test suite tracks:
- **Coverage:** Lines of code/functionality tested
- **Performance:** Page load time, network idle time
- **Stability:** Pass/fail ratio, test reliability
- **Responsiveness:** Tests across 5 device types
- **Accessibility:** WCAG compliance checks
- **Availability:** Station uptime metrics

## 🔄 Continuous Integration

### GitHub Actions Example

```yaml
name: Test Suite
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: cd automation && npm install
      - run: CI=true npm test
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: test-reports
          path: automation/reports/
```

## 📝 Best Practices

1. **Run before commits:** Catch issues early
2. **Review HTML reports:** Visual verification
3. **Check integration tests:** Ensure station data quality
4. **Monitor performance:** Track load time trends
5. **Keep data fresh:** Update stations.json regularly

## 🤝 Contributing

To add new tests:
1. Create test file in appropriate directory
2. Export test runner function
3. Update `run-all-tests.js` to include phase
4. Document in README

## 📄 License

Same as Radio Explorer project.

---

**Last Updated:** 2024
**Version:** 1.0.0
