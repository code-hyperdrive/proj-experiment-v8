/**
 * Radio Explorer Admin Dashboard
 * Restricted to: Google sign-in with email ramsharans.rathore@gmail.com
 */

let adminData = null;
let currentFilter = {};

document.addEventListener('DOMContentLoaded', async () => {
  // Hide loading initially until we know auth state
  document.getElementById('loading').style.display = 'none';
  document.getElementById('content').style.display = 'none';

  try {
    // Check for sessionToken in URL (from Google OAuth callback)
    const urlParams = new URLSearchParams(window.location.search);
    const sessionTokenFromUrl = urlParams.get('sessionToken');
    const authError = urlParams.get('authError');

    // Handle auth errors
    if (authError) {
      showError(`Authentication failed: ${authError}`);
      // Clean up URL
      window.history.replaceState({}, document.title, '/admin.html');
      showSignInSection();
      return;
    }

    // If we got a session token from URL, save it and clean the URL.
    // Also sync to apiClient.sessionToken directly — apiClient's constructor
    // ran before this token existed, so its internal copy is stale.
    // We do NOT call apiClient.init() because that would create a new
    // anonymous session and overwrite this Google token if no prior session
    // existed when the constructor ran.
    if (sessionTokenFromUrl) {
      localStorage.setItem('globeRadio_sessionToken', sessionTokenFromUrl);
      if (window.apiClient) {
        window.apiClient.sessionToken = sessionTokenFromUrl;
      }
      window.history.replaceState({}, document.title, '/admin.html');
    }

    // Get session token from localStorage
    const sessionToken = localStorage.getItem('globeRadio_sessionToken');
    if (!sessionToken) {
      showSignInSection();
      return;
    }

    // Check if user is authenticated - try both window.app and localStorage
    let userData = null;
    if (window.app?.user?.data?.id) {
      userData = window.app.user.data;
    } else {
      // Try to fetch user profile from backend using session token
      try {
        const apiBase = getApiBase();
        const response = await fetch(`${apiBase}/api/v1/profile`, {
          headers: {
            'Authorization': `Bearer ${sessionToken}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const profileData = await response.json();
          userData = profileData.profile;
        }
      } catch (err) {
        console.warn('Could not fetch profile:', err);
      }
    }

    if (!userData?.id) {
      showSignInSection();
      return;
    }

    // Check if user is signed in with Google (not anonymous)
    // Backend stores provider as 'google.com' (matches GOOGLE_PROVIDER constant in oauth.ts)
    if (userData.isAnonymous || userData.signInProvider !== 'google.com') {
      showSignInSection();
      return;
    }

    // Check if email matches admin email
    if (userData.email !== 'ramsharans.rathore@gmail.com') {
      showError(`Unauthorized: You are signed in as ${userData.email}. Only ramsharans.rathore@gmail.com can access this dashboard.`);
      return;
    }

    // Update admin info display
    document.getElementById('admin-name').textContent = userData.displayName || 'Admin User';
    document.getElementById('admin-email').textContent = userData.email || '---';

    // Hide sign-in section, show loading and content
    document.getElementById('signin-section').style.display = 'none';
    document.getElementById('loading').style.display = 'block';
    document.getElementById('content').style.display = 'none';

    // Fetch admin data
    await fetchAdminData();

    // Setup tab switching
    setupTabs();

    // Setup search and filtering
    setupSearchAndFiltering();
  } catch (error) {
    console.error('Admin dashboard error:', error);
    showError(`Error initializing dashboard: ${error.message}`);
  }
});

// Helper function to get API base URL
function getApiBase() {
  let apiBase = 'http://localhost:8787';
  if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    apiBase = 'https://radio-explorer-api.ramsharans-rathore.workers.dev';
  }
  return apiBase;
}

// Show the sign-in section
function showSignInSection() {
  document.getElementById('signin-section').style.display = 'block';
  document.getElementById('loading').style.display = 'none';
  document.getElementById('content').style.display = 'none';
  document.getElementById('error-container').innerHTML = '';
}

// Sign in with Google
function signInWithGoogle() {
  const apiBase = getApiBase();
  // Redirect to backend's Google sign-in endpoint with admin.html as the redirect path
  // The backend will redirect to Google, and Google will redirect back to admin.html with ?sessionToken=
  window.location.href = `${apiBase}/api/v1/auth/google/start?redirectPath=/admin.html`;
}

async function fetchAdminData() {
  const loadingEl = document.getElementById('loading');
  const contentEl = document.getElementById('content');

  try {
    loadingEl.style.display = 'block';
    contentEl.style.display = 'none';

    // Get session token from localStorage
    const sessionToken = localStorage.getItem('globeRadio_sessionToken');
    if (!sessionToken) {
      throw new Error('No session token found. Please sign in again.');
    }

    // Get API base URL (same logic as api-client.js)
    let apiBase = 'http://localhost:8787';
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      apiBase = 'https://radio-explorer-api.ramsharans-rathore.workers.dev';
    }

    // Fetch admin data from backend
    const response = await fetch(`${apiBase}/api/v1/admin/data`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      if (response.status === 403) {
        throw new Error(errorData.error || 'You do not have permission to access this dashboard.');
      } else if (response.status === 404) {
        throw new Error('Admin data endpoint not found.');
      } else {
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }
    }

    adminData = await response.json();

    // Update fetch time
    const fetchTime = new Date(adminData.metadata.fetchedAt);
    document.getElementById('fetch-time').textContent = `Fetched: ${fetchTime.toLocaleString()}`;
    document.getElementById('last-update').textContent = fetchTime.toLocaleTimeString();

    // Render UI
    renderStats();
    renderUsers();
    renderSessions();
    renderFavorites();
    renderHistory();

    loadingEl.style.display = 'none';
    contentEl.style.display = 'block';
  } catch (error) {
    loadingEl.style.display = 'none';
    showError(error.message);
  }
}

function renderStats() {
  const stats = adminData.stats;
  const globalStats = stats.globalStats;

  const statsGrid = document.getElementById('stats-grid');
  statsGrid.innerHTML = `
    <div class="stat-card">
      <h3>Total Users</h3>
      <div class="value">${stats.totalUsers}</div>
    </div>
    <div class="stat-card">
      <h3>Google Signed In</h3>
      <div class="value">${stats.googleSignedInUsers}</div>
    </div>
    <div class="stat-card">
      <h3>Anonymous Users</h3>
      <div class="value">${stats.anonymousUsers}</div>
    </div>
    <div class="stat-card">
      <h3>Active Sessions</h3>
      <div class="value">${stats.activeSessions}</div>
    </div>
    <div class="stat-card">
      <h3>Total Favorites</h3>
      <div class="value">${stats.totalFavorites}</div>
    </div>
    <div class="stat-card">
      <h3>History Entries</h3>
      <div class="value">${stats.totalHistoryEntries}</div>
    </div>
    <div class="stat-card">
      <h3>Connected Users</h3>
      <div class="value">${globalStats?.connected_users || 0}</div>
    </div>
    <div class="stat-card">
      <h3>Active Today</h3>
      <div class="value">${globalStats?.active_users || 0}</div>
    </div>
  `;
}

function renderUsers() {
  const users = adminData.data.users || [];
  const tbody = document.getElementById('users-tbody');
  const empty = document.getElementById('users-empty');

  if (users.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  tbody.innerHTML = users
    .map((user) => {
      const createdDate = new Date(user.created_at * 1000);
      const provider = user.sign_in_provider || 'unknown';
      const type = user.is_anonymous ? '🤖 Anonymous' : '✅ Registered';

      return `
        <tr>
          <td><code style="font-size: 11px; color: #7c3aed;">${user.id.substring(0, 8)}...</code></td>
          <td>${user.email || '—'}</td>
          <td>${user.display_name || '—'}</td>
          <td><span class="label">${provider}</span></td>
          <td>${type}</td>
          <td>${createdDate.toLocaleString()}</td>
          <td>${formatSeconds(user.total_listening_time)}</td>
        </tr>
      `;
    })
    .join('');
}

function renderSessions() {
  const sessions = adminData.data.sessions || [];
  const tbody = document.getElementById('sessions-tbody');
  const empty = document.getElementById('sessions-empty');

  if (sessions.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  tbody.innerHTML = sessions
    .map((session) => {
      const expiresDate = new Date(session.expires_at);
      const createdDate = new Date(session.created_at * 1000);
      const isActive = session.status === 'active';

      return `
        <tr>
          <td><code style="font-size: 11px; color: #7c3aed;">${session.user_id.substring(0, 8)}...</code></td>
          <td>
            <span class="status-indicator ${isActive ? 'status-active' : 'status-inactive'}"></span>
            <span class="label ${isActive ? 'active' : 'expired'}">${session.status}</span>
          </td>
          <td>${expiresDate.toLocaleString()}</td>
          <td>${createdDate.toLocaleString()}</td>
        </tr>
      `;
    })
    .join('');
}

function renderFavorites() {
  const favorites = adminData.data.favorites || [];
  const tbody = document.getElementById('favorites-tbody');
  const empty = document.getElementById('favorites-empty');

  if (favorites.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  tbody.innerHTML = favorites
    .map((fav) => {
      const createdDate = new Date(fav.created_at * 1000);

      return `
        <tr>
          <td><strong>${fav.user_name || '—'}</strong><br><code style="font-size: 10px; color: #888;">${fav.user_id.substring(0, 8)}...</code></td>
          <td><code style="font-size: 11px; color: #7c3aed;">${fav.station_id.substring(0, 12)}...</code></td>
          <td>${fav.position}</td>
          <td>${createdDate.toLocaleString()}</td>
        </tr>
      `;
    })
    .join('');
}

function renderHistory() {
  const history = adminData.data.history || [];
  const tbody = document.getElementById('history-tbody');
  const empty = document.getElementById('history-empty');

  if (history.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  tbody.innerHTML = history
    .map((entry) => {
      const playedDate = new Date(entry.played_at);

      return `
        <tr>
          <td><strong>${entry.user_name || '—'}</strong><br><code style="font-size: 10px; color: #888;">${entry.user_id.substring(0, 8)}...</code></td>
          <td><code style="font-size: 11px; color: #7c3aed;">${entry.station_id.substring(0, 12)}...</code></td>
          <td>${entry.genre || '—'}</td>
          <td>${entry.country || '—'}</td>
          <td>${playedDate.toLocaleString()}</td>
          <td>${entry.duration_seconds}s</td>
        </tr>
      `;
    })
    .join('');
}

function setupTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      // Remove active from all tabs and contents
      tabBtns.forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));

      // Add active to clicked tab
      btn.classList.add('active');
      const tabId = btn.dataset.tab;
      document.getElementById(tabId).classList.add('active');
    });
  });
}

function setupSearchAndFiltering() {
  // Users search
  document.getElementById('search-users')?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    filterTable('users-tbody', query, [1, 2]); // Search in email and display name columns
  });

  // Favorites search
  document.getElementById('search-favorites')?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    filterTable('favorites-tbody', query, [0, 1]); // Search in user and station ID
  });

  // History search
  document.getElementById('search-history')?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    filterTable('history-tbody', query, [0, 1]); // Search in user and station
  });
}

function filterTable(tableBodyId, query, columnIndices) {
  const tbody = document.getElementById(tableBodyId);
  if (!tbody) return;

  const rows = tbody.querySelectorAll('tr');
  let visibleCount = 0;

  rows.forEach((row) => {
    const cells = row.querySelectorAll('td');
    let matches = false;

    columnIndices.forEach((idx) => {
      if (cells[idx] && cells[idx].textContent.toLowerCase().includes(query)) {
        matches = true;
      }
    });

    row.style.display = matches ? '' : 'none';
    if (matches) visibleCount++;
  });

  // Show "no results" message if needed
  const emptyId = tableBodyId.replace('-tbody', '-empty');
  const empty = document.getElementById(emptyId);
  if (empty && visibleCount === 0 && query) {
    empty.style.display = 'block';
    empty.textContent = 'No matches found';
  } else if (empty && query === '') {
    empty.style.display = 'none';
  }
}

function filterSessions(type) {
  const tbody = document.getElementById('sessions-tbody');
  if (!tbody) return;

  const rows = tbody.querySelectorAll('tr');
  rows.forEach((row) => {
    const statusLabel = row.querySelector('.label');
    if (!statusLabel) return;

    const isActive = statusLabel.textContent.toLowerCase().includes('active');

    if (type === 'all') {
      row.style.display = '';
    } else if (type === 'active') {
      row.style.display = isActive ? '' : 'none';
    }
  });
}

function downloadAsCSV(dataType) {
  let data = [];
  let headers = [];

  switch (dataType) {
    case 'users':
      headers = ['User ID', 'Email', 'Display Name', 'Provider', 'Type', 'Created', 'Listening Time'];
      data = (adminData.data.users || []).map((user) => {
        const createdDate = new Date(user.created_at * 1000).toLocaleString();
        const type = user.is_anonymous ? 'Anonymous' : 'Registered';
        return [
          user.id,
          user.email || '—',
          user.display_name || '—',
          user.sign_in_provider || 'unknown',
          type,
          createdDate,
          formatSeconds(user.total_listening_time),
        ];
      });
      break;

    case 'sessions':
      headers = ['User ID', 'Status', 'Expires At', 'Created'];
      data = (adminData.data.sessions || []).map((session) => {
        const expiresDate = new Date(session.expires_at).toLocaleString();
        const createdDate = new Date(session.created_at * 1000).toLocaleString();
        return [session.user_id, session.status, expiresDate, createdDate];
      });
      break;

    case 'favorites':
      headers = ['User', 'Station ID', 'Position', 'Added'];
      data = (adminData.data.favorites || []).map((fav) => {
        const createdDate = new Date(fav.created_at * 1000).toLocaleString();
        return [fav.user_name || '—', fav.station_id, fav.position, createdDate];
      });
      break;

    case 'history':
      headers = ['User', 'Station ID', 'Genre', 'Country', 'Played At', 'Duration (s)'];
      data = (adminData.data.history || []).map((entry) => {
        const playedDate = new Date(entry.played_at).toLocaleString();
        return [
          entry.user_name || '—',
          entry.station_id,
          entry.genre || '—',
          entry.country || '—',
          playedDate,
          entry.duration_seconds,
        ];
      });
      break;
  }

  // Convert to CSV
  const csv = [
    headers.map((h) => `"${h}"`).join(','),
    ...data.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
  ].join('\n');

  // Download
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `radio-explorer-${dataType}-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

function formatSeconds(seconds) {
  if (!seconds || seconds === 0) return '0h';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function showError(message) {
  const errorContainer = document.getElementById('error-container');
  const loadingEl = document.getElementById('loading');
  const contentEl = document.getElementById('content');

  errorContainer.innerHTML = `
    <div class="error-banner">
      <strong>❌ Error:</strong> ${message}
      <p style="font-size: 12px; margin-top: 10px;">
        <a href="/" style="color: #ff6b6b; text-decoration: underline;">Return to main page</a>
      </p>
    </div>
  `;

  loadingEl.style.display = 'none';
  contentEl.style.display = 'none';
}

// Load and display database schema
async function loadDatabaseSchema() {
  const container = document.getElementById('schema-container');
  container.innerHTML = '<p style="color: #b0b0b0;">Loading schema...</p>';

  try {
    const sessionToken = localStorage.getItem('globeRadio_sessionToken');
    const apiBase = getApiBase();

    const response = await fetch(`${apiBase}/api/v1/admin/schema`, {
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to load schema');
    }

    const data = await response.json();
    let html = '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">';

    for (const [tableName, tableInfo] of Object.entries(data.schema)) {
      const columns = (tableInfo as any).columns || [];
      html += `
        <div style="background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 15px;">
          <h3 style="color: #7c3aed; margin-bottom: 10px;">📌 ${tableName}</h3>
          <div style="max-height: 200px; overflow-y: auto;">
            <table style="width: 100%; font-size: 11px;">
              <thead>
                <tr style="background: rgba(124, 58, 237, 0.2);">
                  <th style="padding: 5px; text-align: left;">Column</th>
                  <th style="padding: 5px; text-align: left;">Type</th>
                </tr>
              </thead>
              <tbody>
      `;

      for (const col of columns) {
        html += `
                <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05);">
                  <td style="padding: 5px;">${(col as any).name}</td>
                  <td style="padding: 5px; color: #b0b0b0;">${(col as any).type}</td>
                </tr>
        `;
      }

      html += `
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    html += '</div>';
    container.innerHTML = html;
  } catch (error) {
    container.innerHTML = `<div class="error-banner"><strong>❌ Error:</strong> ${error instanceof Error ? error.message : String(error)}</div>`;
  }
}

// Execute custom SQL query
async function executeCustomQuery() {
  const query = document.getElementById('custom-query').value.trim();
  if (!query) {
    alert('Please enter a query');
    return;
  }

  const resultsContainer = document.getElementById('query-results');
  resultsContainer.innerHTML = '<p style="color: #b0b0b0;">Executing query...</p>';

  try {
    const sessionToken = localStorage.getItem('globeRadio_sessionToken');
    const apiBase = getApiBase();

    const response = await fetch(`${apiBase}/api/v1/admin/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || error.details || 'Query failed');
    }

    const data = await response.json();

    if (!data.data || data.data.length === 0) {
      resultsContainer.innerHTML = '<p style="color: #b0b0b0; text-align: center; padding: 20px;">No results returned (0 rows)</p>';
      return;
    }

    // Build table from results
    const cols = Object.keys(data.data[0]);
    let html = `<div style="margin-bottom: 10px; color: #b0b0b0; font-size: 12px;">✅ Query successful - ${data.rowCount} rows returned</div>`;
    html += '<div class="table-wrapper" style="margin-top: 10px;"><table>';
    html += '<thead><tr>';

    for (const col of cols) {
      html += `<th style="padding: 10px; background: rgba(124, 58, 237, 0.2); color: #7c3aed; text-align: left; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">${col}</th>`;
    }

    html += '</tr></thead><tbody>';

    for (const row of data.data) {
      html += '<tr>';
      for (const col of cols) {
        const value = (row as any)[col];
        const displayValue = value === null ? '<em>null</em>' : String(value).substring(0, 100);
        html += `<td style="padding: 10px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-family: monospace; font-size: 12px; word-break: break-all;">${displayValue}</td>`;
      }
      html += '</tr>';
    }

    html += '</tbody></table></div>';
    resultsContainer.innerHTML = html;
  } catch (error) {
    resultsContainer.innerHTML = `<div class="error-banner"><strong>❌ Error:</strong> ${error instanceof Error ? error.message : String(error)}</div>`;
  }
}
