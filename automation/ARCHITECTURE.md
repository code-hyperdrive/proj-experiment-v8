# Test Automation Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                  Radio Explorer Application                      │
├─────────────────────────────────────────────────────────────────┤
│  ├─ index.html                                                   │
│  ├─ js/                 (app logic, audio, search, UI)           │
│  ├─ data/               (stations.json, exceptions)              │
│  ├─ assets/             (images, logos)                          │
│  └─ manifest.json       (PWA configuration)                      │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Tests
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│             Test Automation Suite (automation/)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ Master Orchestrator: run-all-tests.js                      │  │
│  │ ✓ Coordinates all test phases                             │  │
│  │ ✓ Generates reports & metrics                             │  │
│  └────────────────────────────────────────────────────────────┘  │
│           │          │          │          │                      │
│           ▼          ▼          ▼          ▼                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ PHASE 1: Data Validation                                  │  │
│  │ ├─ stations.json structure                               │  │
│  │ ├─ Field validation (id, name, country, streams)         │  │
│  │ ├─ URL format validation                                 │  │
│  │ ├─ manifest.json PWA config                              │  │
│  │ └─ Dataset statistics                                    │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ PHASE 2: Unit Tests                                       │  │
│  │ ├─ Module syntax validation                              │  │
│  │ ├─ File size monitoring                                  │  │
│  │ ├─ Asset integrity checks                                │  │
│  │ └─ HTML structure validation                             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ PHASE 3: Integration Tests (Station Health)               │  │
│  │ ├─ Connect to each station URL                           │  │
│  │ ├─ Validate HTTP status (200, 206)                       │  │
│  │ ├─ Check content-type (audio/*)                          │  │
│  │ ├─ Timeout handling (8s default)                         │  │
│  │ └─ Report broken vs working stations                     │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ PHASE 4: E2E Tests (Playwright)                           │  │
│  │                                                            │  │
│  │ ┌─────────────────────────────────────────────────────┐  │  │
│  │ │ Browser Compatibility                               │  │  │
│  │ │ ├─ Desktop Chrome (1280x800)                        │  │  │
│  │ │ ├─ Desktop Firefox                                  │  │  │
│  │ │ ├─ Desktop Safari (WebKit)                          │  │  │
│  │ │ ├─ Mobile Chrome (Pixel 5, 393x851)                 │  │  │
│  │ │ └─ Mobile Safari (iPhone 12, 390x844)               │  │  │
│  │ └─────────────────────────────────────────────────────┘  │  │
│  │                                                            │  │
│  │ ┌─────────────────────────────────────────────────────┐  │  │
│  │ │ UI & Functionality Tests                             │  │  │
│  │ │ ├─ Page loads with content                          │  │  │
│  │ │ ├─ Search functionality                             │  │  │
│  │ │ ├─ Station selection                                │  │  │
│  │ │ ├─ Favorites/bookmarks                              │  │  │
│  │ │ ├─ Theme switching                                  │  │  │
│  │ │ └─ No console errors                                │  │  │
│  │ └─────────────────────────────────────────────────────┘  │  │
│  │                                                            │  │
│  │ ┌─────────────────────────────────────────────────────┐  │  │
│  │ │ Responsive Design                                   │  │  │
│  │ │ ├─ Mobile (375x812) - visible & usable             │  │  │
│  │ │ ├─ Tablet (768x1024) - visible & usable            │  │  │
│  │ │ └─ Desktop (1280x800) - visible & usable           │  │  │
│  │ └─────────────────────────────────────────────────────┘  │  │
│  │                                                            │  │
│  │ ┌─────────────────────────────────────────────────────┐  │  │
│  │ │ Performance Metrics                                  │  │  │
│  │ │ ├─ DOM Content Loaded time                          │  │  │
│  │ │ ├─ Network Idle time                                │  │  │
│  │ │ ├─ First Contentful Paint                           │  │  │
│  │ │ └─ Resource load times                              │  │  │
│  │ └─────────────────────────────────────────────────────┘  │  │
│  │                                                            │  │
│  │ ┌─────────────────────────────────────────────────────┐  │  │
│  │ │ Accessibility (WCAG)                                │  │  │
│  │ │ ├─ Heading structure                                │  │  │
│  │ │ ├─ Button labels (aria-label, text)                 │  │  │
│  │ │ ├─ Link text                                        │  │  │
│  │ │ ├─ Keyboard navigation (Tab, Enter)                 │  │  │
│  │ │ └─ Color contrast                                   │  │  │
│  │ └─────────────────────────────────────────────────────┘  │  │
│  │                                                            │  │
│  │ ┌─────────────────────────────────────────────────────┐  │  │
│  │ │ PWA Features                                         │  │  │
│  │ │ ├─ Service worker registration                      │  │  │
│  │ │ ├─ Manifest link present                            │  │  │
│  │ │ ├─ Meta tags (viewport, description)                │  │  │
│  │ │ ├─ OG tags for social share                         │  │  │
│  │ │ └─ Local/Session storage accessibility              │  │  │
│  │ └─────────────────────────────────────────────────────┘  │  │
│  │                                                            │  │
│  │ ┌─────────────────────────────────────────────────────┐  │  │
│  │ │ Network & Error Handling                             │  │  │
│  │ │ ├─ 404 error detection                              │  │  │
│  │ │ ├─ Failed request logging                           │  │  │
│  │ │ ├─ Network interruption recovery                    │  │  │
│  │ │ └─ Graceful degradation                             │  │  │
│  │ └─────────────────────────────────────────────────────┘  │  │
│  │                                                            │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Output
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Reports & Artifacts                           │
├─────────────────────────────────────────────────────────────────┤
│  ├─ reports/                                                     │
│  │  ├─ test-report.html          (Visual dashboard)            │
│  │  ├─ test-report.json          (Summary results)             │
│  │  ├─ data-validation-report.json                             │
│  │  ├─ unit-test-report.json                                   │
│  │  ├─ integration-test-report.json                            │
│  │  ├─ e2e-results.json                                        │
│  │  └─ e2e-report/               (Detailed Playwright report)  │
│  │     ├─ index.html             (Browser test dashboard)      │
│  │     ├─ trace-*.zip            (Test execution traces)       │
│  │     └─ screenshots/           (Failure screenshots)         │
│  │                                                              │
│  └─ station-health/                                             │
│     ├─ report.json              (Full station results)          │
│     └─ report.md                (Markdown summary)              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### 1. Test Initialization
```
npm test (or run-tests.sh)
        ↓
  Node Process Started
        ↓
  Load Configuration (.env, args)
        ↓
  Verify Environment (Node.js version, dependencies)
```

### 2. Test Execution Pipeline
```
run-all-tests.js
        ↓
    Phase 1: Data Validation
    ├─ Load stations.json
    ├─ Validate structure
    ├─ Check URLs
    └─ Generate report
        ↓
    Phase 2: Unit Tests
    ├─ Check module syntax
    ├─ Verify file sizes
    ├─ Validate assets
    └─ Generate report
        ↓
    Phase 3: Integration Tests
    ├─ Start HTTP server
    ├─ Test each station URL
    ├─ Collect metrics
    └─ Generate report
        ↓
    Phase 4: E2E Tests
    ├─ Launch Playwright
    ├─ Open browser(s)
    ├─ Run test suite
    └─ Generate report
        ↓
    Summary & Reporting
    ├─ Aggregate results
    ├─ Calculate metrics
    ├─ Generate HTML dashboard
    └─ Export JSON
```

### 3. Station Health Check Detail
```
For each station:
  ├─ Extract stream URLs (in order)
  ├─ For each stream URL:
  │  ├─ Send HTTP HEAD/GET
  │  ├─ Check status (200, 206)
  │  ├─ Check content-type (audio/*)
  │  ├─ Validate headers (icy-name)
  │  └─ Record result
  ├─ Mark station as working/broken
  └─ Continue to next station

Results:
  ├─ Working: station has at least 1 working stream
  ├─ Broken: all streams failed
  └─ Summary: metrics & error details
```

### 4. E2E Test Session
```
For each browser/device:
  ├─ Launch browser instance
  ├─ Navigate to base URL
  ├─ Wait for page load
  ├─ Run test suite
  │  ├─ Test visibility
  │  ├─ Test interaction
  │  ├─ Test responsive behavior
  │  └─ Collect metrics
  ├─ Take screenshot (if failure)
  ├─ Record trace (if failure)
  └─ Close browser

Results:
  ├─ Test status (pass/fail/timeout)
  ├─ Execution time
  ├─ Console messages
  ├─ Network requests
  └─ Artifacts (screenshots, videos)
```

---

## Test Independence & Isolation

```
Each test phase is:
✓ Independent     - Can run in any order
✓ Isolated        - No cross-phase dependencies
✓ Repeatable      - Same results on retry
✓ Fast            - Parallel where possible
✓ Observable      - Clear pass/fail output

They can be:
- Run individually: npm run test:data
- Run in sequence: npm test
- Run in parallel: (custom scripts)
- Run in CI/CD: npm test
- Run on schedule: cron jobs
```

---

## Report Generation

### JSON Report Structure
```json
{
  "timestamp": "2024-07-26T12:34:56.789Z",
  "summary": {
    "totalTests": 4,
    "passed": 4,
    "failed": 0,
    "totalDurationMs": 180000
  },
  "tests": {
    "Data Validation": {
      "success": true,
      "duration": 15230
    },
    "Module Unit Tests": {
      "success": true,
      "duration": 3450
    },
    "Station Health Check": {
      "success": true,
      "duration": 45670
    },
    "E2E Browser Tests": {
      "success": true,
      "duration": 120650
    }
  }
}
```

### HTML Report
```
┌─────────────────────────────────────────┐
│ Radio Explorer - Test Report            │
├─────────────────────────────────────────┤
│                                         │
│  Tests Passed: 4      Failed: 0         │
│  Success Rate: 100%   Duration: 180s    │
│                                         │
│  ✓ Data Validation        15.23s        │
│  ✓ Module Unit Tests      3.45s         │
│  ✓ Station Health Check   45.67s        │
│  ✓ E2E Browser Tests      123.45s       │
│                                         │
│  Generated: July 26, 2024 12:34 PM      │
└─────────────────────────────────────────┘
```

---

## Error Handling & Recovery

```
Test Failure → Analysis → Recovery Strategy

Data Error       → Validate JSON manually → Fix data → Re-run
Syntax Error     → Fix JavaScript → Clear cache → Re-run  
Network Timeout  → Increase timeout env var → Re-run
Browser Crash    → Retry test → Playwright recovers
Station Offline  → Normal (expected) → Record as broken
```

---

## Performance Characteristics

```
Single Test Phase Times (approx):
  Data Validation     → 15-20 seconds   (static analysis)
  Unit Tests          → 3-5 seconds     (file validation)
  Station Health      → 45-90 seconds   (network I/O bound)
  E2E Browser Tests   → 2-3 minutes     (browser startup + interaction)

Total Suite Time:
  Full Run            → 4-5 minutes
  Fast Run (no E2E)   → 1-2 minutes
  Quick Check (data)  → 15 seconds

Parallelization:
  Data & Unit Tests   → 18-25 seconds total (sequential)
  E2E Tests           → Playwright manages browser parallelization
  Station Checks      → Configurable concurrency (default: 40)
```

---

## Scalability

```
Current Capacity:
  Stations Tested    → 2,600+ (all)
  Browsers Tested    → 5 types
  Device Sizes       → 3 (mobile, tablet, desktop)
  URL Checks         → ~6,000 stream URLs
  Test Cases         → 40+ individual tests

Optimization Opportunities:
  ✓ Increase station check concurrency
  ✓ Add test parallelization
  ✓ Cache browser downloads
  ✓ Skip slow browsers on feature branch
  ✓ Distributed testing across machines
```

---

## Extension Points

Add new tests by:

1. **New data validation:**
   ```javascript
   // In data/validation.js
   validateNewFile() {
     // validation logic
   }
   ```

2. **New unit tests:**
   ```javascript
   // In unit/modules.test.js
   testNewModule() {
     // test logic
   }
   ```

3. **New E2E tests:**
   ```javascript
   // In e2e/tests.js
   test('new UI feature', async ({ page }) => {
     // test logic
   });
   ```

4. **New integration tests:**
   ```javascript
   // In integration/run.js
   // Add new test runner
   ```

---

## CI/CD Integration Points

```
Git Hook (pre-commit)
  ↓
  npm run test:fast
  (skip E2E for speed)
  ↓
Pull Request
  ↓
  GitHub Actions / GitLab CI
  ├─ npm test (full suite)
  ├─ Upload artifacts
  └─ Report status
  ↓
Main Branch
  ↓
  Production Deployment
  (tests passed ✓)
```

---

## Maintenance & Monitoring

```
Regular Tasks:
  Weekly:     Run full test suite
  Monthly:    Review test trends
  Quarterly:  Add new test coverage
  Annually:   Refactor for new patterns

Alerts:
  ✗ > 20% stations broken      → Manual intervention
  ✗ > 5 E2E test failures      → Debug & fix
  ⚠ > 10% performance drop     → Profile & optimize
  ⚠ > 50% data warnings        → Clean up data

Metrics to Track:
  - Test pass rate (% over time)
  - Station availability (% working)
  - Page load time (ms over time)
  - Test execution time (s over time)
  - Browser compatibility (% tests passing per browser)
```

---

## Documentation Map

```
High-Level Overview
  └─ This file (ARCHITECTURE.md)

Quick Setup
  └─ QUICK_START.md (5 minutes)

Full Documentation
  └─ README.md (comprehensive)

Implementation Details
  ├─ data/validation.js
  ├─ unit/modules.test.js
  ├─ e2e/tests.js
  ├─ integration/station-health.js
  └─ run-all-tests.js

Configuration
  └─ .env.example, .env

---

**Version:** 1.0.0
**Last Updated:** July 2024
**Maintainer:** Ram Sharan Singh
```
