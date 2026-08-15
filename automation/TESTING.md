# Radio Explorer - Testing Guide

## Overview

This document outlines the testing infrastructure for Radio Explorer, including unit tests, e2e tests, data validation, and station connectivity checks.

## Test Suites

### 1. Unit Tests (`npm run test:unit`)

**Location:** `automation/unit/modules.test.js`

Tests the syntax, size, and structure of core modules:
- ✓ JavaScript syntax validation
- ✓ Module size limits (max 500KB)
- ✓ Import/require statements
- ✓ Asset integrity
- ✓ HTML structure and critical elements

**Recent Fix (v1.0.10):**
- Updated regex patterns to match versioned script tags (e.g., `js/app.js?v=18`)
- Previous pattern broke after cache-buster query strings were added in deployment fix

**Run:**
```bash
npm run test:unit
```

### 2. E2E Tests (`npm run test:e2e`)

**Location:** `automation/e2e/tests.js`

Browser-based tests using Playwright:
- ✓ Page load and UI rendering
- ✓ Search functionality
- ✓ Station selection
- ✓ Favorites functionality
- ✓ Responsive design (mobile, tablet, desktop)
- ✓ Console error detection
- ✓ Service Worker registration
- ✓ Manifest validation
- ✓ Meta tags verification
- ✓ Keyboard navigation
- ✓ Theme switching
- ✓ Network request completion
- ✓ Storage availability
- ✓ Performance metrics
- ✓ Accessibility checks (headings, labels, contrast)
- ✓ Error handling and recovery

**Recent Fix (v1.0.10):**
- Changed BASE_URL from `http://localhost:3000` to `http://localhost:8080`
- Dev server runs on port 8080, not 3000
- All tests now connect to correct server

**Run:**
```bash
npm run test:e2e
```

**Note:** Requires dev server running on port 8080

### 3. Data Validation (`npm run test:data`)

**Location:** `automation/data/validation.js`

Validates JSON data files and configuration:
- ✓ `stations.json` structure and integrity
- ✓ Station field validation (id, name, country, streams)
- ✓ Duplicate ID detection
- ✓ Stream URL validation
- ✓ `station-exceptions.json` (optional)
- ✓ `manifest.json` completeness and correctness
- ✓ Icon metadata validation

**Recent Enhancements (v1.0.10):**
- Added validation for `type` field (normal, web-player)
- Web-player stations are flagged and counted separately
- Better error reporting for invalid station types
- Statistics now include web-player station count

**Run:**
```bash
npm run test:data
```

### 4. Station Connectivity (`npm run test:stations`)

**Location:** `station-health/check-stations.js`

Tests stream URL reachability for each station:
- ✓ Fetches each stream URL with proper headers
- ✓ Validates response content-type (audio/*)
- ✓ Reports connectivity status and error reasons
- ✓ Generates `report.json` and `report.md`
- ✓ Configurable concurrency and timeout
- ✓ Optional filtering (enabled stations only)

**Recent Fix (v1.0.10):**
- Added special handling for web-player type stations
- Web-player stations (e.g., Nirkam) skip stream connectivity tests
- These stations serve embedded pages, not audio streams
- Web-player stations automatically marked as "working" if type is valid

**Previously Broken:**
- Tried to fetch web-player embed.html as audio stream → HTTP 200 with HTML → marked as failed

**Run:**
```bash
# Test all stations with concurrency=40, timeout=8s
npm run test:stations

# Test only enabled stations
npm run test:stations -- --only-enabled

# Adjust concurrency and timeout
npm run test:stations -- --concurrency=20 --timeout=10000
```

**Output Files:**
- `station-health/report.json` — machine-readable results
- `station-health/report.md` — human-readable summary with broken station list

### 5. Integration Tests (`npm run test:integration`)

**Location:** `automation/integration/station-health.js`

Cross-functional tests combining multiple subsystems.

**Run:**
```bash
npm run test:integration
```

### 6. Generate Report (`npm run report`)

**Location:** `automation/generate-report.js`

Generates an HTML report combining results from all test suites.

**Output:** `automation/reports/test-report.html`

**Run:**
```bash
npm run report
```

## Running All Tests

```bash
# Run all tests (except e2e by default)
npm run test

# Run all tests including e2e
npm run test:all

# Run all tests quickly (skip e2e)
npm run test:fast
```

## Coverage Goals (v1.0.10)

Recent fixes now covered by tests:

1. **XSS Prevention** (js/stations-utils.js)
   - escapeHtml(), escapeAttr(), isSafeUrl()
   - Unit tests check syntax and exports
   - E2E tests verify no console XSS errors

2. **Audio Watchdog** (js/audio.js)
   - Stall watchdog with state gating
   - 12s grace period after loadStation()
   - Max 3 consecutive retry attempts
   - Integration tests monitor recovery behavior

3. **Search Pagination** (js/search.js)
   - Filter reset clears currentPage = 1
   - E2E tests verify pagination works after filtering

4. **Mobile Events** (js/app.js)
   - stationChanged and playStateChanged window events
   - E2E tests verify event dispatch via window listeners

5. **Favorites Preservation** (js/favorites.js)
   - Removed auto-save on load()
   - E2E tests verify favorites persist without data loss

6. **Firestore Rules** (firestore.rules)
   - Custom-ID hijacking prevention
   - Stats/global tampering prevention
   - Data validation tests check rules syntax

7. **Service Worker Cache Invalidation** (service-worker.js, version.json)
   - Cache-buster query strings updated with version
   - Unit tests verify versioned script tags present

8. **Nirkam Synchronized Radio** (radios/nirkam/)
   - Fixed RADIO_START_TIME to fixed epoch
   - Fixed handleAudioError() method call
   - Manual testing via test-local.html

## Test Infrastructure Fixes (v1.0.10)

### Issue 1: Stale Unit Test Regex
**File:** `automation/unit/modules.test.js`
- **Problem:** Expected unversioned `js/app.js`, but all scripts now have `?v=N`
- **Fix:** Updated regex to `/js\/app\.js\?v=\d+/`
- **Impact:** Unit tests now pass after cache-buster deployment

### Issue 2: E2E Port Mismatch
**File:** `automation/e2e/tests.js`
- **Problem:** Tests tried to connect to `localhost:3000`, but dev server runs on `8080`
- **Fix:** Changed BASE_URL to `http://localhost:8080`
- **Impact:** E2E tests can now connect to running dev server

### Issue 3: Web-Player Stream Validation
**File:** `station-health/check-stations.js`
- **Problem:** Tried to validate web-player embed.html as audio stream (failed on HTML response)
- **Fix:** Skip web-player type stations, mark as working if type is valid
- **Impact:** Station report no longer shows false failures for Nirkam and similar

### Issue 4: Missing Report Generator
**File:** `automation/generate-report.js` (NEW)
- **Problem:** `npm run report` script referenced non-existent file
- **Fix:** Created comprehensive HTML report generator
- **Impact:** Can now generate visual test summary from command line

### Issue 5: Incomplete Data Validation
**File:** `automation/data/validation.js`
- **Problem:** No validation for new web-player station type
- **Fix:** Added type field validation, web-player counting
- **Impact:** Invalid station types now caught during data validation

## Continuous Integration

These tests should run as part of your CI/CD pipeline:

```yaml
# Example: GitHub Actions
- name: Unit Tests
  run: npm run test:unit

- name: Data Validation
  run: npm run test:data

- name: E2E Tests (requires dev server)
  run: |
    npm run dev &
    sleep 5
    npm run test:e2e

- name: Station Health Check
  run: npm run test:stations --only-enabled

- name: Generate Report
  run: npm run report
```

## Troubleshooting

### E2E tests fail with "connection refused"
- Verify dev server is running on port 8080
- Check `BASE_URL` in `automation/e2e/tests.js`

### Unit tests fail on script tag regex
- Ensure all scripts in index.html have cache-buster query strings (?v=N)
- Update regex pattern if cache-buster format changes

### Station health check reports all stations as broken
- Check concurrency and timeout settings
- Verify network connectivity
- See `station-health/report.md` for specific error details

### Web-player stations still showing as broken
- Verify station has `type: 'web-player'` field
- Check `station-health/report.json` for detailed results
- See "Recent Fix" section above

## Next Steps

1. Add unit tests for individual module functions (escapeHtml, escapeAttr, etc.)
2. Expand E2E coverage for audio playback and state management
3. Add performance benchmarking tests
4. Implement visual regression testing
5. Add accessibility testing with axe-core
6. Create load/stress tests for station search
