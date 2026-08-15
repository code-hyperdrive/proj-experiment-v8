# Admin Dashboard — Quick Start

## One-Minute Overview

A secure admin panel at `/admin.html` that shows:
- **Stats**: Total users, active sessions, favorites, history, connected users
- **Users table**: All users with email, name, provider, listening time
- **Sessions table**: All sessions with status (active/expired)
- **Favorites table**: What stations each user favorited
- **History table**: Last 1,000 listening history entries

**Access**: Sign in with Google using `ramsharans.rathore@gmail.com`, then go to `http://localhost:8080/admin.html`

---

## Access Steps

### Local Development

```bash
# Terminal 1: Backend
cd backend && npm run dev

# Terminal 2: Frontend
cd frontend && python3 -m http.server 8080
```

Then:
1. Open http://localhost:8080
2. Click "Sign in with Google"
3. Use email: `ramsharans.rathore@gmail.com`
4. Go to: http://localhost:8080/admin.html

### Production (once deployed)

1. Open https://radio.rathore.club
2. Sign in with Google (admin email)
3. Go to: https://radio.rathore.club/admin.html

---

## What You Can Do

| Feature | How |
|---------|-----|
| **View users** | Go to "Users" tab — see all users, emails, listening time |
| **Monitor sessions** | Go to "Sessions" tab — see active (🟢) vs expired (⚫) sessions |
| **See favorites** | Go to "Favorites" tab — see which stations users favorited |
| **Review history** | Go to "History" tab — see what users are listening to |
| **Search data** | Type in any search box — filters table in real-time |
| **Export data** | Click "Export [Type]" button — downloads CSV file |
| **See overview stats** | Visible at the top — total users, active today, etc. |

---

## What You CANNOT Do (By Design)

- ❌ Create new users
- ❌ Delete users or sessions
- ❌ Modify data
- ❌ Access admin page without Google sign-in
- ❌ Access admin page with wrong email

This is **read-only** for safety.

---

## Error Messages & Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| "You must be logged in" | Not signed in | Click "Sign in" on the main app |
| "Admin access requires Google sign-in" | Signed in as anonymous | Click Profile → "Sign in with Google" |
| "Unauthorized: insufficient permissions" | Wrong Google email | Sign out and sign in with correct email |
| "Failed to fetch admin data" | Backend error | Restart backend: `npm run dev` in `backend/` |
| No data shown | Page still loading | Wait a moment, then refresh |

---

## Behind the Scenes

### What Gets Queried?

- **All users** (ID, email, name, provider type, listening time, created date)
- **All sessions** (user ID, status, expiration date, creation date)
- **All favorites** (user, station ID, position, added date)
- **Last 1,000 history entries** (user, station, genre, country, play time, duration)
- **Global stats** (connected users, active today, stats update time)

### How Is It Secure?

1. **Backend checks session token** — must be valid
2. **Backend checks Google sign-in** — cannot be anonymous
3. **Backend checks email** — must be `ramsharans.rathore@gmail.com`

All three checks happen on the server. Even if someone knows the password, they can't bypass the email check (it's hardcoded in the backend code).

### Database Used

All data comes from the D1 database that's already used by the app:
- `users` table
- `sessions` table
- `favorites` table
- `history` table
- `stats_global` table

---

## Technical Details

### Files Created

```
Frontend:
  ✓ frontend/admin.html              (main page)
  ✓ frontend/js/admin.js             (logic)

Backend:
  ✓ backend/src/routes/admin.ts      (API endpoint)
  ✓ backend/src/index.ts             (updated to mount route)

Documentation:
  ✓ docs/ADMIN_DASHBOARD.md          (full guide)
  ✓ docs/ADMIN_QUICK_START.md        (this file)
```

### API Endpoint

```
GET /api/v1/admin/data
Authorization: Bearer <sessionToken>
```

Returns JSON with:
- `metadata` — fetch time, admin user info
- `stats` — totals and overview numbers
- `data` — users, sessions, favorites, history arrays

### Access Control Implementation

**Backend (admin.ts):**
```typescript
// Check 1: User must exist and have valid session
const user = await getUser(db, uid);

// Check 2: Must be Google sign-in (not anonymous)
if (user.is_anonymous || user.sign_in_provider !== 'google') {
  return 403 error;
}

// Check 3: Email must match
if (user.email !== 'ramsharans.rathore@gmail.com') {
  return 403 error;
}
```

**Frontend (admin.js):**
- Verifies user is logged in
- Verifies user has session token
- Calls backend endpoint with token
- Shows error if access denied

---

## Common Questions

**Q: Can other admins access this?**
A: No, currently hardcoded for one email. To add more admins, edit the `ADMIN_EMAIL` constant in `backend/src/routes/admin.ts` and redeploy.

**Q: What if I forget my Google password?**
A: You won't be able to access the admin panel. Use Google's password recovery: https://accounts.google.com

**Q: Can I modify data from the admin page?**
A: No, it's read-only. The endpoint only does `SELECT` queries, no `UPDATE` or `DELETE`.

**Q: Is the data exported in CSV secure?**
A: Yes, special characters are properly escaped. But don't share CSV files with sensitive user data.

**Q: Does this auto-refresh?**
A: No, refresh the page manually to get latest data. Could add auto-refresh in the future.

**Q: What if the backend is down?**
A: Admin page shows "Failed to fetch admin data" error.

---

## Files to Read

- **How it works**: [`docs/ADMIN_DASHBOARD.md`](ADMIN_DASHBOARD.md) (full 500-line guide)
- **Setup guide**: [`docs/SETUP_AND_DEPLOYMENT.md`](SETUP_AND_DEPLOYMENT.md)
- **Architecture**: [`docs/PROJECT_REFERENCE.md`](PROJECT_REFERENCE.md)
- **Backend API**: [`backend/README.md`](../backend/README.md)

---

## Next Steps

1. ✅ Backend is built and tested (217/217 tests pass)
2. ✅ Frontend page is built and ready
3. 🔜 Sign in and visit http://localhost:8080/admin.html
4. 🔜 Check the data tables
5. 🔜 Try searching and exporting
6. 🔜 (Future) Deploy to production and access at radio.rathore.club/admin.html
