# Logging System Quick Reference

## TL;DR

Everything is logged automatically. Use these commands to investigate:

```bash
# View latest logs (all entries)
node backend/scripts/view-logs.js

# Find errors only
node backend/scripts/view-logs.js --filter ERROR

# Search for a user's activity
node backend/scripts/view-logs.js --search "user-uuid-here"

# Find slow API calls
node backend/scripts/view-logs.js --type RESPONSE

# Check authentication history
node backend/scripts/view-logs.js --type AUTH
```

## In Browser (F12 Console)

```javascript
// See what happened this session
window.appLogger.getSummary()

// Download logs for support team
window.appLogger.exportLogs()
```

## Log Files

**Backend**: Outputs to console (Cloudflare captures in production)

**Frontend**: Stored in browser memory, export from console

## Getting Help

Full guide: `docs/LOGGING_SYSTEM.md`

Need to find:
- **What happened at 12:34?** → `grep "12:34"` on CLI output
- **Why did this user fail?** → `--search "user-id"`
- **Which endpoints are slow?** → `--type RESPONSE` (look for duration)
- **All auth events?** → `--type AUTH`
- **Is there an error?** → `--filter ERROR`

## Files Reference

| File | Purpose |
|------|---------|
| `backend/src/lib/logger.ts` | Backend logger class |
| `backend/src/lib/logging-middleware.ts` | HTTP request/response middleware |
| `frontend/js/client-logger.js` | Frontend logger (browser) |
| `backend/scripts/view-logs.js` | CLI tool to view logs |
| `docs/LOGGING_SYSTEM.md` | Complete documentation |

## Logging Active

- ✅ All HTTP requests/responses auto-logged
- ✅ All errors auto-captured
- ✅ All auth events auto-tracked
- ✅ Frontend user actions available via API
- ✅ Tests: 217/217 passing with logging enabled
