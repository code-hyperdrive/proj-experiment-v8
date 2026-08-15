# Radio Explorer Admin Dashboard

A restricted admin panel for managing and monitoring the Radio Explorer database. **Only accessible to users who sign in with Google using the email address: `ramsharans.rathore@gmail.com`**

## Features

The admin dashboard provides:

- **📊 Real-time database statistics** — total users, active sessions, favorites count, history entries
- **👥 Users management** — view all users, their email, name, sign-in provider (Google/Anonymous), and listening time
- **🔑 Session management** — monitor active and expired sessions, see session creation and expiration times
- **⭐ Favorites tracking** — view all favorited stations by user, position, and creation date
- **📻 Listening history** — browse the last 1,000 listening history entries with genre, country, and duration
- **🔍 Search & filter** — find specific users, stations, or entries quickly
- **📥 Export to CSV** — download any table data for analysis or reporting

## Access Control

The admin dashboard is protected by a three-layer authentication system:

1. **User must be authenticated** — signed into the Radio Explorer app
2. **Google sign-in required** — not an anonymous session
3. **Specific email required** — only `ramsharans.rathore@gmail.com` can access

If any of these conditions aren't met, the dashboard shows a clear error message:
- Anonymous users: _"Admin access requires Google sign-in"_
- Non-admin Google users: _"Unauthorized: insufficient permissions"_

## How to Access

### Local Development

1. Start the backend and frontend:
   ```bash
   # Terminal 1
   cd backend && npm run dev

   # Terminal 2
   cd frontend && python3 -m http.server 8080
   ```

2. Go to http://localhost:8080

3. Sign in with Google (using the admin email address)

4. Navigate to: **http://localhost:8080/admin.html**

### Production

Once deployed to `https://radio.rathore.club`:

1. Sign in with Google (using the admin email address)
2. Navigate to: **https://radio.rathore.club/admin.html**

## Using the Dashboard

### Navigation

- **Tabs at the top** switch between different data views: Users, Sessions, Favorites, History
- **Search boxes** filter the currently displayed table in real-time
- **Export buttons** download the entire table as CSV

### Users Tab

View all users in the system:

| Column | Description |
|--------|-------------|
| **User ID** | Unique identifier (UUID, shortened) |
| **Email** | Google email or empty for anonymous users |
| **Display Name** | User's chosen name |
| **Provider** | Authentication method (google, anonymous) |
| **Type** | Whether the account is registered or anonymous |
| **Created** | When the account was first created |
| **Listening Time** | Total time spent listening to stations |

**Actions:**
- Search by email or display name
- Export user list as CSV

### Sessions Tab

Monitor authentication sessions:

| Column | Description |
|--------|-------------|
| **User ID** | Who owns the session |
| **Status** | Active or Expired |
| **Expires At** | When the session will/did expire |
| **Created** | When the session was created |

**Status Legend:**
- 🟢 **Active** — Session is valid and will be accepted for API calls
- ⚫ **Expired** — Session has expired and will be rejected

**Actions:**
- Show all sessions or just active ones
- Export session list as CSV

### Favorites Tab

Track which stations users have favorited:

| Column | Description |
|--------|-------------|
| **User** | User's display name and ID |
| **Station ID** | The unique station identifier |
| **Position** | Order in the user's favorites list |
| **Added** | When the station was favorited |

**Actions:**
- Search by user name or station ID
- Export favorites as CSV

### History Tab

View listening history (last 1,000 entries):

| Column | Description |
|--------|-------------|
| **User** | User's display name and ID |
| **Station ID** | The station they listened to |
| **Genre** | Music genre or category |
| **Country** | Broadcasting country |
| **Played At** | When they listened |
| **Duration (s)** | Seconds listened |

**Actions:**
- Search by user or station
- Export history as CSV

## API Endpoint

The admin dashboard calls a protected backend endpoint:

```
GET /api/v1/admin/data
Authorization: Bearer <sessionToken>
```

### Response Structure

```json
{
  "metadata": {
    "fetchedAt": "2026-08-15T12:34:56Z",
    "adminUser": {
      "id": "user-uuid",
      "email": "ramsharans.rathore@gmail.com",
      "displayName": "Admin Name"
    }
  },
  "stats": {
    "totalUsers": 42,
    "googleSignedInUsers": 5,
    "anonymousUsers": 37,
    "activeSessions": 8,
    "totalFavorites": 156,
    "totalHistoryEntries": 2891,
    "globalStats": {
      "connected_users": 8,
      "active_users": 5,
      "last_updated": 1692100496000
    }
  },
  "data": {
    "users": [...],
    "sessions": [...],
    "favorites": [...],
    "history": [...]
  }
}
```

### Error Responses

| Status | Error | Meaning |
|--------|-------|---------|
| **401** | (no response) | Not authenticated / missing session token |
| **403** | "Admin access requires Google sign-in" | User is anonymous |
| **403** | "Unauthorized: insufficient permissions" | Not the admin email |
| **404** | "User not found" | Session is invalid |
| **500** | "Failed to fetch admin data" | Database query error |

## Database Schema Reference

The admin dashboard queries from these tables:

### users
```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT,                    -- NULL for anonymous
  display_name TEXT,
  is_anonymous INTEGER,
  sign_in_provider TEXT,         -- 'google' or 'anonymous'
  created_at INTEGER,            -- Unix timestamp (seconds)
  total_listening_time INTEGER   -- Seconds
);
```

### sessions
```sql
CREATE TABLE sessions (
  user_id TEXT NOT NULL,
  token_hash TEXT,               -- SHA-256 of session token
  expires_at INTEGER,            -- Unix timestamp (milliseconds)
  created_at INTEGER
);
```

### favorites
```sql
CREATE TABLE favorites (
  user_id TEXT NOT NULL,
  station_id TEXT NOT NULL,
  position INTEGER,
  created_at INTEGER
);
```

### history
```sql
CREATE TABLE history (
  user_id TEXT,
  station_id TEXT,
  genre TEXT,
  country TEXT,
  played_at INTEGER,
  duration_seconds INTEGER
);
```

### stats_global
```sql
CREATE TABLE stats_global (
  connected_users INTEGER,
  active_users INTEGER,
  last_updated INTEGER
);
```

## Implementation Details

### Frontend (frontend/admin.html & frontend/js/admin.js)

- **Pure JavaScript** — no framework dependencies, uses vanilla DOM manipulation
- **Real-time search** — filters tables as you type
- **CSV export** — downloads table data with proper escaping and formatting
- **Responsive design** — works on mobile and desktop
- **Dark theme** — matches the main app's aesthetic

### Backend (backend/src/routes/admin.ts)

- **Protected route** — requires valid session token via Bearer authentication
- **Three-level access control** — user exists, Google sign-in, specific email match
- **Efficient queries** — uses database `COUNT()` and indexes for stats
- **Error handling** — clear, actionable error messages
- **No data modification** — read-only endpoint (no DELETE, UPDATE, etc.)

## Security Notes

✅ **What's protected:**
- Session token required (Bearer auth)
- User identity verified from token
- Google sign-in enforced
- Specific email address hardcoded in backend
- No database modification via admin page

⚠️ **What's NOT protected:**
- If the session token is compromised, the admin account is compromised
- Keep your session token secret (stored in localStorage, HttpOnly recommended for production)
- Browser DevTools can access it — don't share screenshots

## Future Enhancements

Potential improvements (not yet implemented):

- [ ] User data deletion from admin dashboard
- [ ] Session revocation/forced logout
- [ ] Data analytics graphs and charts
- [ ] Advanced filters (date ranges, status filters)
- [ ] User search suggestions
- [ ] Pagination for large tables
- [ ] Real-time data refresh polling
- [ ] Audit logging of admin actions
- [ ] Multiple admin users support

## Troubleshooting

### "You must be logged in to access the admin dashboard"

The app couldn't detect a logged-in user. Try:
1. Refresh the page
2. Sign out and sign in again with Google
3. Check browser console for errors

### "Admin access requires Google sign-in"

You're logged in but as an anonymous user. Try:
1. Click Profile → Sign in with Google
2. Complete the Google sign-in flow
3. Reload the admin page

### "Unauthorized: insufficient permissions"

You signed in with Google but with the wrong email address. Try:
1. Check which Google account you're logged into
2. Sign out and sign in with the correct email (`ramsharans.rathore@gmail.com`)
3. Reload the admin page

### Tables show "No data found"

This usually means the data hasn't been fetched yet. Try:
1. Wait a moment for the page to load
2. Check browser console for errors
3. Ensure the backend is running (`npm run dev` in `backend/` directory)
4. If backend URL is wrong, it will show an error banner

### "Failed to fetch admin data"

Backend error fetching from database. Try:
1. Check the backend logs for errors
2. Restart the backend: `npm run dev` in `backend/`
3. Check database migrations: `npm run db:migrate:local`
4. Look at browser console error message for details

## Related Documentation

- [`docs/SETUP_AND_DEPLOYMENT.md`](SETUP_AND_DEPLOYMENT.md) — Full setup and deployment guide
- [`backend/README.md`](../backend/README.md) — Backend API documentation
- [`docs/PROJECT_REFERENCE.md`](PROJECT_REFERENCE.md) — Architecture deep dive
