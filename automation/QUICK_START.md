# Quick Start Guide 🚀

## 30-Second Setup

### 1️⃣ Install Dependencies
```bash
cd automation
npm install
```

### 2️⃣ Start Your Application
```bash
# In project root (separate terminal)
python3 -m http.server 3000
# or your preferred dev server
```

### 3️⃣ Run Tests
```bash
npm test
```

### 4️⃣ View Results
```bash
open reports/test-report.html
```

---

## Common Commands

### Run All Tests
```bash
npm test
```
Runs: Data Validation → Unit Tests → Station Health → E2E Tests

### Run Specific Test Suite
```bash
npm run test:data          # Data validation only
npm run test:unit          # Unit tests only
npm run test:e2e           # Browser tests only
npm run test:stations      # Station health only
npm run test:integration   # All integration tests
```

### Skip Slow Tests
```bash
# Skip E2E tests (saves ~5 minutes)
node run-all-tests.js --skip-e2e

# Skip station health checks
node run-all-tests.js --skip-stations
```

### Run with Verbose Output
```bash
npm run test:all           # Full details
```

---

## Interpreting Results

### ✅ Success Example
```
✓ Data Validation          15.23s
✓ Module Unit Tests        3.45s
✓ Station Health Check     45.67s
✓ E2E Browser Tests        123.45s

Tests Passed: 4
Tests Failed: 0

🎉 All tests passed!
```
**Status:** Ready to deploy ✨

### ⚠️ Failure Example
```
✓ Data Validation          15.23s
✓ Module Unit Tests        3.45s
✗ E2E Browser Tests        89.12s
  Error: Page load timeout

Tests Passed: 2
Tests Failed: 1

⚠️  1 test(s) failed
```
**Status:** Fix issues before deploying 🔧

---

## What Gets Tested

| Phase | What | Time |
|-------|------|------|
| **Data** | JSON structure, fields, URLs | ~15s |
| **Unit** | JS modules, assets, HTML | ~3s |
| **Integration** | Radio station connectivity | ~45s |
| **E2E** | Browser UI, responsive, performance | ~2m |

---

## Troubleshooting

### "Port already in use"
```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Then start again
python3 -m http.server 3000
```

### "Cannot find module"
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### "Tests time out"
```bash
# Increase timeout for slow connections
TIMEOUT=15000 npm run test:stations

# Set custom base URL
BASE_URL=http://localhost:8080 npm test
```

### "E2E tests fail in browser"
```bash
# Run with debug info
npm run test:e2e

# View detailed report
open reports/e2e-report/index.html
```

---

## Reports

After tests complete, check:

| Report | Type | Location |
|--------|------|----------|
| **Summary** | HTML | `reports/test-report.html` |
| **Details** | JSON | `reports/test-report.json` |
| **Browser** | HTML | `reports/e2e-report/index.html` |
| **Data** | JSON | `reports/data-validation-report.json` |

---

## Performance Baseline

Expected test times on modern hardware:

- **Fast Run** (skip E2E): ~2 minutes
- **Standard Run** (all tests): ~4-5 minutes
- **Detailed Run** (all tests, verbose): ~5-6 minutes

---

## Next Steps

1. ✅ Run tests once to baseline
2. 📋 Review full documentation: `cat README.md`
3. 🔧 Configure for your environment: `.env`
4. 🚀 Add to CI/CD pipeline
5. 📊 Monitor test trends

---

## Need Help?

- **See all options:** `npm run`
- **Read docs:** `cat README.md`
- **Debug test:** `npm run test:all`
- **View reports:** `open reports/`

---

**That's it!** You now have comprehensive automation for Radio Explorer. 🎙️
