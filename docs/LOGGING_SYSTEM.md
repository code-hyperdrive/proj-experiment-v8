# Radio Explorer Logging System

Complete logging and monitoring system for debugging, auditing, and tracking all activities in the application.

## Overview

The logging system captures:
- **Backend**: All HTTP requests/responses, database operations, authentication, errors
- **Frontend**: User actions, API calls, errors, page navigation
- **Structured storage**: JSON logs organized by date in `logs/` folder
- **Easy access**: CLI tool to view, filter, and search logs

---

## Backend Logging

### Location
```
logs/
├── 2026-08-15/
│   ├── app-0.log      (10 MB max per file, auto-rotates)
│   ├── app-1.log
│   └── app-2.log
├── 2026-08-14/
│   └── app-0.log
└── ...
```

### Log Levels
- **INFO**: Normal operations (successful requests, successful auth)
- **WARN**: Unexpected but handled situations (4xx responses, missing data)
- **ERROR**: Problems that need attention (5xx errors, exceptions)
- **DEBUG**: Detailed information for debugging (database queries, config)

### Log Types
- **REQUEST**: Incoming HTTP request
- **RESPONSE**: Outgoing HTTP response
- **DATABASE**: Database operation (query, insert, update, delete)
- **AUTH**: Authentication event (sign-in, session creation, logout)
- **ERROR**: Error occurred
- **ACTIVITY**: User or system activity

### Example Log Entry (JSON)
```json
{
  "timestamp": "2026-08-15T12:34:56.789Z",
  "level": "INFO",
  "type": "REQUEST",
  "message": "POST /api/v1/favorites/add",
  "method": "POST",
  "url": "/api/v1/favorites/add",
  "userId": "user-123-uuid",
  "data": {
    "headers": {
      "contentType": "application/json"
    },
    "body": {
      "stationId": "station-456"
    }
  }
}
```

### Backend Logging API

**In route handlers:**
```typescript
// Log authentication events
logger.logAuth({
  action: 'Google Sign In',
  method: 'google',
  userId: user.id,
  email: user.email,
  success: true
});

// Log user activities
logger.logActivity({
  action: 'Added to favorites',
  userId: userId,
  details: { stationId: stationId },
  status: 'success'
});

// Log errors
logger.logError({
  error: err,
  context: 'Failed to fetch user profile',
  userId: userId,
  url: '/api/v1/profile'
});

// Debug information
logger.logDebug('Checking rate limit', { userId, endpoint: '/favorites' });
```

---

## Frontend Logging

### Usage
Access logs from browser console:
```javascript
// View all logs
window.appLogger.getAllLogs()

// Get summary
window.appLogger.getSummary()
// or print it nicely:
window.appLogger.printSummary()

// Export logs as JSON
window.appLogger.exportLogs()
```

### Frontend Logger API

**User actions:**
```javascript
window.appLogger.logUserAction('Clicked play button', { stationId: '123' });
window.appLogger.logPageLoad('search');
window.appLogger.logActivity('Searched for "jazz"', { query: 'jazz' });
```

**API calls:**
```javascript
// Log API call
const startTime = performance.now();
const response = await fetch('/api/v1/favorites');
const duration = performance.now() - startTime;
window.appLogger.logApiCall('GET', '/api/v1/favorites', response.status, duration);
```

**Errors:**
```javascript
window.appLogger.logError('Failed to load stations', { 
  error: err.message,
  code: err.code 
});
window.appLogger.logWarning('Slow API response', { duration: 5000 });
```

### In-Memory Storage
- Last 500 log entries kept in memory
- Automatically cleared when limit reached
- Can be exported anytime via `exportLogs()`

---

## CLI Tools

### View Logs

**Latest logs (real-time):**
```bash
cd backend
node scripts/view-logs.js
```

**Show latest log file path:**
```bash
node scripts/view-logs.js --latest
```

**List all log files:**
```bash
node scripts/view-logs.js --list
```

Output:
```
📁 Log files (12 total):

  1. logs/2026-08-15/app-2.log (8.45 KB)
  2. logs/2026-08-15/app-1.log (10.23 KB)
  3. logs/2026-08-15/app-0.log (10.12 KB)
  4. logs/2026-08-14/app-0.log (9.87 KB)
  ...
```

**Filter by level:**
```bash
node scripts/view-logs.js --filter ERROR
node scripts/view-logs.js --filter WARN
node scripts/view-logs.js --filter DEBUG
```

**Filter by type:**
```bash
node scripts/view-logs.js --type REQUEST
node scripts/view-logs.js --type RESPONSE
node scripts/view-logs.js --type DATABASE
node scripts/view-logs.js --type AUTH
node scripts/view-logs.js --type ERROR
node scripts/view-logs.js --type ACTIVITY
```

**Search logs:**
```bash
node scripts/view-logs.js --search "user-123"
node scripts/view-logs.js --search "favorites"
node scripts/view-logs.js --search "error"
```

### Output Format

Each log entry is displayed with:
- Timestamp (HH:MM:SS)
- Log level ([INFO], [WARN], [ERROR], [DEBUG])
- Log type ([REQUEST], [RESPONSE], etc.)
- Message
- Duration (for timed operations)
- HTTP status (for responses)
- User ID (if applicable)
- Additional data

Example:
```
12:34:56 [INFO]   [REQUEST]    POST /api/v1/favorites/add User: a1b2c3d4-...
         [INFO]   [RESPONSE]   201 /api/v1/favorites/add (45ms) Status: 201 User: a1b2c3d4-...
         [DEBUG]  [DATABASE]   INSERT (12ms) Duration: 12ms
```

---

## Integration Points

### How Logging Works

**1. Request comes in**
```
HTTP Request → CORS middleware → Logging middleware records it
```

**2. Processing**
```
Route handler → Database calls (logged) → Response prepared
```

**3. Response sent**
```
Response → Logging middleware records it → Sent to client
```

**4. Errors**
```
Error occurs → Error handler → Logged with full context → Response sent
```

### What Gets Logged Automatically

✅ **Always logged:**
- All HTTP requests (method, URL, headers summary)
- All HTTP responses (status code, duration)
- All errors with stack traces
- Authentication events
- Rate limit violations
- Validation errors

⚠️ **Sometimes logged:**
- Database operations (query time, rows affected)
- User activities (if explicitly logged in route)
- API response bodies (if they contain errors)

❌ **NOT logged (for privacy):**
- Authorization tokens (replaced with `***`)
- Sensitive user data
- Password/secret values

---

## Log Storage & Management

### Automatic Rotation
- Each log file caps at **10 MB**
- When limit reached, new file created automatically
- Old files never deleted (for audit trail)

### Directory Structure
```
logs/
├── 2026-08-15/          # Dated folders (YYYY-MM-DD)
│   ├── app-0.log        # First file of the day
│   ├── app-1.log        # Second file (rotation)
│   └── app-2.log        # etc.
├── 2026-08-14/
│   └── app-0.log
└── 2026-08-13/
    ├── app-0.log
    └── app-1.log
```

### Cleanup
Logs are kept indefinitely for audit trail. To archive old logs:
```bash
# Manual cleanup (example: keep last 30 days)
find backend/logs -type f -mtime +30 -delete
```

---

## Troubleshooting with Logs

### "User claims to be admin but isn't"
```bash
node scripts/view-logs.js --type AUTH --search user-id
# Check the 'email' and 'success' fields
```

### "Request failed but client doesn't know why"
```bash
node scripts/view-logs.js --filter ERROR
# Find the matching timestamp and look for full error details
```

### "Database is slow"
```bash
node scripts/view-logs.js --type DATABASE
# Look for high duration values (in milliseconds)
```

### "Which stations are broken?"
```bash
node scripts/view-logs.js --search "404"
# Find failed requests to `/api/v1/stream/` endpoints
```

### "User reported an error"
1. Get the user ID from their account
2. Run: `node scripts/view-logs.js --search "user-id-here"`
3. Look for ERROR or WARN entries nearby
4. Check timestamps and API responses

---

## Frontend Debugging

### In Browser Console
```javascript
// See all activity in this session
window.appLogger.getSummary()

// Find errors in this session
window.appLogger.getSummary().errors

// Export for support team
window.appLogger.exportLogs()  // Downloads logs-xxxxx.json
```

### Console Output
Frontend logger colors code the output:
- 🔵 **Blue**: INFO (normal operations)
- 🟠 **Orange**: WARN (potential issues)
- 🔴 **Red**: ERROR (problems)
- ⚪ **Gray**: DEBUG (detailed info)

---

## Best Practices

### For Developers

✅ **DO**:
- Log at appropriate levels (INFO for normal, ERROR for failures)
- Include enough context (user ID, resource ID, what failed)
- Use meaningful messages ("Added to favorites" not "Update OK")
- Clean up sensitive data before logging

❌ **DON'T**:
- Log raw passwords or tokens
- Log entire request/response bodies (too much noise)
- Log at DEBUG level for every operation
- Forget to log errors

### For Ops/Support

✅ **DO**:
- Check latest logs first: `node scripts/view-logs.js`
- Filter by error level when troubleshooting: `--filter ERROR`
- Export logs with timestamps for incidents
- Archive old logs regularly

❌ **DON'T**:
- Delete log files (keep audit trail)
- Share raw logs with untrusted parties
- Ignore errors in logs

---

## Performance Impact

- **Backend logging**: ~1-2ms per request (minimal)
- **Frontend logging**: <1ms per action (negligible)
- **Disk usage**: ~100-150 MB per 1M requests
- **No memory leaks**: Old entries automatically discarded

---

## Future Enhancements

Possible additions (not yet implemented):
- [ ] Centralized log aggregation (all logs → single database)
- [ ] Real-time alerts for ERROR-level events
- [ ] Log analysis dashboard
- [ ] Automatic log cleanup policy
- [ ] Structured log search UI
- [ ] Performance analytics from logs
- [ ] User activity timeline visualization

---

## Reference

**Backend logger module**: `backend/src/lib/logger.ts`
**Backend logging middleware**: `backend/src/lib/logging-middleware.ts`
**Frontend logger module**: `frontend/js/client-logger.js`
**CLI tool**: `backend/scripts/view-logs.js`

See logs are created and maintained at: `logs/` directory
