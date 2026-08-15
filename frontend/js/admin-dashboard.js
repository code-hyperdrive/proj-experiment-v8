/**
 * Admin Dashboard Modal Handler
 * Integrates admin dashboard into the main app via a modal overlay
 */

class AdminDashboard {
  constructor() {
    this.apiBase = this.detectApiBase();
    this.adminData = null;
    this.currentFilter = {};
  }

  detectApiBase() {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:8787';
    }
    return 'https://radio-explorer-api.ramsharans-rathore.workers.dev';
  }

  async open() {
    const modal = document.getElementById('adminDashboardModal');
    if (!modal) {
      console.error('Admin dashboard modal not found in DOM');
      return;
    }

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Load admin data
    await this.loadAdminData();

    // Setup event listeners
    this.setupEventListeners();
  }

  close() {
    const modal = document.getElementById('adminDashboardModal');
    if (modal) {
      modal.style.display = 'none';
      document.body.style.overflow = '';
    }
  }

  setupEventListeners() {
    // Close button
    const closeBtn = document.querySelector('#adminDashboardModal .close-modal-btn');
    if (closeBtn) {
      closeBtn.onclick = () => this.close();
    }

    // Backdrop click
    const backdrop = document.querySelector('#adminDashboardModal .modal-backdrop');
    if (backdrop) {
      backdrop.onclick = () => this.close();
    }

    // Tab buttons
    const tabBtns = document.querySelectorAll('#adminDashboardModal .admin-tab-btn');
    tabBtns.forEach(btn => {
      btn.onclick = (e) => this.switchTab(e.target.closest('.admin-tab-btn').dataset.tab);
    });

    // Custom query button
    const queryBtn = document.querySelector('#adminDashboardModal #executeQueryBtn');
    if (queryBtn) {
      queryBtn.onclick = () => this.executeCustomQuery();
    }

    // Schema button
    const schemaBtn = document.querySelector('#adminDashboardModal #loadSchemaBtn');
    if (schemaBtn) {
      schemaBtn.onclick = () => this.loadDatabaseSchema();
    }
  }

  switchTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('#adminDashboardModal .admin-tab-content').forEach(tab => {
      tab.style.display = 'none';
    });

    // Remove active class from all buttons
    document.querySelectorAll('#adminDashboardModal .admin-tab-btn').forEach(btn => {
      btn.classList.remove('active');
    });

    // Show selected tab
    const tab = document.getElementById(`adminTab-${tabName}`);
    if (tab) {
      tab.style.display = 'block';
    }

    // Mark button as active
    const btn = document.querySelector(`#adminDashboardModal .admin-tab-btn[data-tab="${tabName}"]`);
    if (btn) {
      btn.classList.add('active');
    }
  }

  async loadAdminData() {
    const loadingEl = document.getElementById('adminDashboardLoading');
    const contentEl = document.getElementById('adminDashboardContent');

    if (!loadingEl || !contentEl) return;

    try {
      loadingEl.style.display = 'block';
      contentEl.style.display = 'none';

      const sessionToken = localStorage.getItem('globeRadio_sessionToken');
      if (!sessionToken) {
        throw new Error('No session token found');
      }

      const response = await fetch(`${this.apiBase}/api/v1/admin/data`, {
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to load admin data');
      }

      this.adminData = await response.json();

      // Render stats
      this.renderStats();
      // Render tables
      this.renderUsers();
      this.renderSessions();
      this.renderFavorites();
      this.renderHistory();

      loadingEl.style.display = 'none';
      contentEl.style.display = 'block';
    } catch (error) {
      console.error('Admin data load error:', error);
      loadingEl.innerHTML = `<p style="color: #ff6b6b;">❌ Error: ${error instanceof Error ? error.message : String(error)}</p>`;
    }
  }

  renderStats() {
    const stats = this.adminData?.stats;
    if (!stats) return;

    const grid = document.getElementById('adminStatsGrid');
    if (!grid) return;

    grid.innerHTML = `
      <div style="padding: 15px; background: rgba(124, 58, 237, 0.1); border-radius: 8px;">
        <div style="color: #b0b0b0; font-size: 12px; margin-bottom: 5px;">Total Users</div>
        <div style="font-size: 24px; font-weight: bold; color: #7c3aed;">${stats.totalUsers || 0}</div>
      </div>
      <div style="padding: 15px; background: rgba(124, 58, 237, 0.1); border-radius: 8px;">
        <div style="color: #b0b0b0; font-size: 12px; margin-bottom: 5px;">Google Users</div>
        <div style="font-size: 24px; font-weight: bold; color: #7c3aed;">${stats.googleSignedInUsers || 0}</div>
      </div>
      <div style="padding: 15px; background: rgba(124, 58, 237, 0.1); border-radius: 8px;">
        <div style="color: #b0b0b0; font-size: 12px; margin-bottom: 5px;">Anonymous Users</div>
        <div style="font-size: 24px; font-weight: bold; color: #7c3aed;">${stats.anonymousUsers || 0}</div>
      </div>
      <div style="padding: 15px; background: rgba(124, 58, 237, 0.1); border-radius: 8px;">
        <div style="color: #b0b0b0; font-size: 12px; margin-bottom: 5px;">Active Sessions</div>
        <div style="font-size: 24px; font-weight: bold; color: #7c3aed;">${stats.activeSessions || 0}</div>
      </div>
    `;
  }

  renderUsers() {
    const users = this.adminData?.data?.users || [];
    const tbody = document.getElementById('adminUsersTbody');
    if (!tbody) return;

    tbody.innerHTML = users.map(u => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-size: 11px;">${u.id?.substring(0, 8) || '---'}</td>
        <td style="padding: 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-size: 11px;">${u.email || '---'}</td>
        <td style="padding: 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-size: 11px;">${u.display_name || '---'}</td>
        <td style="padding: 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-size: 11px;">${u.sign_in_provider || 'N/A'}</td>
      </tr>
    `).join('');
  }

  renderSessions() {
    const sessions = this.adminData?.data?.sessions || [];
    const tbody = document.getElementById('adminSessionsTbody');
    if (!tbody) return;

    tbody.innerHTML = sessions.slice(0, 50).map(s => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-size: 11px;">${s.user_id?.substring(0, 8) || '---'}</td>
        <td style="padding: 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-size: 11px;"><span style="color: ${s.status === 'active' ? '#4ade80' : '#ef4444'};">${s.status}</span></td>
        <td style="padding: 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-size: 11px;">${new Date(s.expires_at).toLocaleString()}</td>
      </tr>
    `).join('');
  }

  renderFavorites() {
    const favorites = this.adminData?.data?.favorites || [];
    const tbody = document.getElementById('adminFavoritesTbody');
    if (!tbody) return;

    tbody.innerHTML = favorites.slice(0, 50).map(f => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-size: 11px;">${f.user_name || '---'}</td>
        <td style="padding: 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-size: 11px;">${f.station_id}</td>
        <td style="padding: 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-size: 11px;">${f.position}</td>
      </tr>
    `).join('');
  }

  renderHistory() {
    const history = this.adminData?.data?.history || [];
    const tbody = document.getElementById('adminHistoryTbody');
    if (!tbody) return;

    tbody.innerHTML = history.slice(0, 50).map(h => `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-size: 11px;">${h.user_name || '---'}</td>
        <td style="padding: 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-size: 11px;">${h.station_id}</td>
        <td style="padding: 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-size: 11px;">${h.genre || '---'}</td>
        <td style="padding: 8px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-size: 11px;">${new Date(h.played_at).toLocaleString()}</td>
      </tr>
    `).join('');
  }

  async loadDatabaseSchema() {
    const container = document.getElementById('adminSchemaContainer');
    if (!container) return;

    try {
      container.innerHTML = '<p style="color: #b0b0b0;">Loading schema...</p>';

      const sessionToken = localStorage.getItem('globeRadio_sessionToken');
      const response = await fetch(`${this.apiBase}/api/v1/admin/schema`, {
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) throw new Error('Failed to load schema');

      const data = await response.json();
      let html = '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px;">';

      for (const [tableName, tableInfo] of Object.entries(data.schema)) {
        const columns = (tableInfo as any).columns || [];
        html += `
          <div style="background: rgba(124, 58, 237, 0.1); border: 1px solid rgba(124, 58, 237, 0.3); border-radius: 8px; padding: 12px;">
            <div style="color: #7c3aed; font-weight: bold; margin-bottom: 8px;">📌 ${tableName}</div>
            <div style="font-size: 11px;">
              ${columns.map(c => `<div style="color: #b0b0b0; margin: 3px 0;"><strong>${(c as any).name}</strong>: ${(c as any).type}</div>`).join('')}
            </div>
          </div>
        `;
      }

      html += '</div>';
      container.innerHTML = html;
    } catch (error) {
      container.innerHTML = `<p style="color: #ff6b6b;">❌ Error: ${error instanceof Error ? error.message : String(error)}</p>`;
    }
  }

  async executeCustomQuery() {
    const queryTextarea = document.getElementById('adminCustomQueryText');
    const resultsContainer = document.getElementById('adminQueryResults');

    if (!queryTextarea || !resultsContainer) return;

    const query = queryTextarea.value.trim();
    if (!query) {
      alert('Please enter a query');
      return;
    }

    try {
      resultsContainer.innerHTML = '<p style="color: #b0b0b0;">Executing...</p>';

      const sessionToken = localStorage.getItem('globeRadio_sessionToken');
      const response = await fetch(`${this.apiBase}/api/v1/admin/query`, {
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
        resultsContainer.innerHTML = '<p style="color: #b0b0b0; text-align: center; padding: 20px;">No results (0 rows)</p>';
        return;
      }

      const cols = Object.keys(data.data[0]);
      let html = `<div style="color: #b0b0b0; font-size: 12px; margin-bottom: 10px;">✅ ${data.rowCount} rows returned</div>`;
      html += '<div style="overflow-x: auto;"><table style="font-size: 11px; width: 100%;"><thead><tr>';

      cols.forEach(col => {
        html += `<th style="padding: 8px; background: rgba(124, 58, 237, 0.2); text-align: left; border: 1px solid rgba(124, 58, 237, 0.3);">${col}</th>`;
      });

      html += '</tr></thead><tbody>';

      data.data.forEach((row, idx) => {
        html += '<tr>';
        cols.forEach(col => {
          const value = (row as any)[col];
          const display = value === null ? '<em>null</em>' : String(value).substring(0, 50);
          html += `<td style="padding: 8px; border: 1px solid rgba(255, 255, 255, 0.05);">${display}</td>`;
        });
        html += '</tr>';
      });

      html += '</tbody></table></div>';
      resultsContainer.innerHTML = html;
    } catch (error) {
      resultsContainer.innerHTML = `<p style="color: #ff6b6b;">❌ Error: ${error instanceof Error ? error.message : String(error)}</p>`;
    }
  }
}

// Create global instance
window.adminDashboard = new AdminDashboard();
