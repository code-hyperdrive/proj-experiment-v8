/**
 * user.js - User Profile & Personalization
 * Manages user preferences, listening history, and recommendations
 * Backed by the api-client.js backend (no Firebase anywhere)
 */

/**
 * Client-side format check only - mirrors backend/src/lib/validate.ts's
 * validateCustomId() exactly (8-12 chars, lowercase letters/digits/
 * underscore, must start with a letter). Whether the id is actually
 * *available* is only known once the backend's PATCH /profile responds -
 * there's no separate "check availability" endpoint (customId is a
 * cosmetic nickname now, not a recovery mechanism, so it doesn't need one).
 */
function isValidCustomIdFormat(value) {
    return /^[a-z][a-z0-9_]{7,11}$/.test(value);
}

class UserProfile {
    constructor() {
        this.storageKey = 'globeRadio_user';
        this.data = this.load();
        this.isNewUser = !this.data.id;

        // Backend API client instance
        this.apiClient = null;
        this.syncStatus = 'offline'; // 'offline', 'syncing', 'synced', 'error'
        
        // Ensure all required fields exist
        this.data = {
            id: this.data.id || this.generateUserId(),
            customId: this.data.customId || null, // Custom memorable ID
            displayName: this.data.displayName || '',
            // Google's profile photo URL, once signed in - null for
            // anonymous accounts (see mergeServerProfile()), never
            // fabricated.
            avatarUrl: this.data.avatarUrl || null,
            createdAt: this.data.createdAt || Date.now(),
            lastVisit: Date.now(),
            lastActiveDate: this.data.lastActiveDate || null, // YYYY-MM-DD format for activity tracking
            lastSyncAt: this.data.lastSyncAt || null,
            syncEnabled: this.data.syncEnabled ?? true,
            
            // Preferences
            preferences: {
                theme: this.data.preferences?.theme || 'rathore',
                language: this.data.preferences?.language || 'en',
                viewMode: this.data.preferences?.viewMode || 'map', // Default to 2D map
                autoRotate: this.data.preferences?.autoRotate ?? true,
                volume: this.data.preferences?.volume ?? 0.7,
                autoResume: this.data.preferences?.autoResume ?? true,
                visualizerStyle: this.data.preferences?.visualizerStyle || 'couple', // Dancing couple as default
                idleTimeout: this.data.preferences?.idleTimeout ?? 5, // 5 seconds default
                visualizerEnabled: this.data.preferences?.visualizerEnabled ?? true,
                visualizerGenres: this.data.preferences?.visualizerGenres || null, // Will use getDefaultVisualizerGenres()
                panelAutoHide: this.data.preferences?.panelAutoHide ?? true, // Auto-hide side panel
                panelAutoHideDelay: this.data.preferences?.panelAutoHideDelay ?? 10, // Seconds before auto-hide
                httpsOnly: this.data.preferences?.httpsOnly ?? true, // HTTPS-only stations by default
                ...this.data.preferences
            },
            
            // Last session state
            lastSession: {
                stationId: this.data.lastSession?.stationId || null,
                timestamp: this.data.lastSession?.timestamp || null,
                ...this.data.lastSession
            },
            
            // Listening history (recent stations with play count)
            history: this.data.history || [],
            
            // Genre preferences (auto-learned from listening)
            genreStats: this.data.genreStats || {},
            
            // Country preferences (auto-learned)
            countryStats: this.data.countryStats || {},
            
            // Language preferences
            languageStats: this.data.languageStats || {},
            
            // Saved filters
            savedFilters: this.data.savedFilters || {
                region: '',
                country: '',
                genre: '',
                language: '',
                status: ''
            },
            
            // Total listening time (seconds)
            totalListeningTime: this.data.totalListeningTime || 0
        };
        
        this.save();
        
        // Track current session
        this.sessionStart = null;
        this.currentStation = null;
        
        // Apply saved theme on load
        this.applyTheme(this.data.preferences.theme);
        
        // Apply saved language on load
        if (this.data.preferences.language && typeof i18n !== 'undefined') {
            i18n.setLanguage(this.data.preferences.language);
        }
        
        // Initialize backend API client. Stored so other modules (e.g.
        // favorites.js's backend reconciliation, which needs to know
        // window.apiClient.syncEnabled has actually settled - not still
        // mid-flight - before it can safely run once) can await readiness
        // via waitForApiClient() instead of racing this fire-and-forget call.
        this.apiClientReadyPromise = this.initApiClient();
    }

    /** Resolves once initApiClient() has settled (success or failure). */
    async waitForApiClient() {
        return this.apiClientReadyPromise;
    }

    /**
     * Initialize the backend API client: establishes/restores a session,
     * consumes a Google-redirect return if this load is one, and fetches
     * the backend profile (deriving connected/active-user stats from the
     * same call). Never throws to the caller - any failure here just
     * leaves the app running fully local, per this milestone's own
     * "additive, never breaks the app on a backend error" ground rule.
     */
    async initApiClient() {
        if (typeof ApiClient === 'undefined') {
            this.showFallbackStats();
            return;
        }

        this.apiClient = new ApiClient();
        const initialized = await this.apiClient.init();
        if (!initialized) {
            this.showFallbackStats();
            return;
        }

        try {
            const { profile, globalStats } = await this.apiClient.getProfile();
            this.mergeServerProfile(profile);

            this.globalStats = globalStats;
            window.dispatchEvent(new CustomEvent('globalStatsUpdated', { detail: this.globalStats }));
            console.log('📊 Backend stats:', this.globalStats);
        } catch (error) {
            console.error('Error fetching profile from backend:', error);
            this.showFallbackStats();
            return;
        }

        if (this.apiClient.pendingSignInResult) {
            window.dispatchEvent(new CustomEvent('signedInWithGoogle', { detail: this.apiClient.pendingSignInResult }));
        }
        if (this.apiClient.pendingAuthError) {
            window.dispatchEvent(new CustomEvent('authSignInError', { detail: { message: this.apiClient.pendingAuthError } }));
        }
    }

    /**
     * Reconciles a profile fetched from the backend into this.data.
     * - id becomes the backend's real (UUID) id - the single canonical
     *   identity going forward, replacing whatever legacy locally-generated
     *   8-char id this profile had.
     * - preferences: local wins on first contact if the backend's are
     *   still empty (a brand-new anonymous account); otherwise the
     *   backend's are applied locally. Mirrors the same "don't clobber
     *   real local data with an empty server-side default" reasoning
     *   favorites.js uses for the data-loss-sensitive favorites merge.
     */
    mergeServerProfile(profile) {
        this.data.id = profile.id;
        this.data.email = profile.email || null;
        this.data.avatarUrl = profile.avatarUrl || null;
        this.data.isAnonymous = profile.isAnonymous;
        this.data.signInProvider = profile.signInProvider;

        if (profile.customId) {
            this.data.customId = profile.customId;
        }
        if (profile.displayName && (!this.data.displayName || this.data.displayName === 'Anonymous')) {
            this.data.displayName = profile.displayName;
        }

        const serverPrefsEmpty = !profile.preferences || Object.keys(profile.preferences).length === 0;
        if (!serverPrefsEmpty) {
            this.data.preferences = { ...this.data.preferences, ...profile.preferences };
            this.applyTheme(this.data.preferences.theme);
        }

        this.data.lastSyncAt = Date.now();
        this.save();
        this.updateProfileUI();
    }

    /**
     * Show fallback stats when the backend is not reachable
     */
    showFallbackStats() {
        // No cloud connection available — stats are unknown, not fabricated
        this.globalStats = {
            connectedUsers: 0,
            activeUsers: 0
        };

        // Dispatch event for UI update
        window.dispatchEvent(new CustomEvent('globalStatsUpdated', {
            detail: this.globalStats
        }));

        console.log('📊 Using fallback stats (backend unavailable):', this.globalStats);
    }

    /**
     * Get global stats (connected/active users)
     */
    getGlobalStats() {
        return this.globalStats || { connectedUsers: 0, activeUsers: 0 };
    }

    /**
     * Generate unique 8-character user ID
     */
    generateUserId() {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let id = '';
        for (let i = 0; i < 8; i++) {
            id += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return id;
    }
    
    /**
     * Get the display ID (custom ID or original ID)
     */
    getDisplayId() {
        return this.data.customId || this.data.id;
    }
    
    /**
     * Check if user needs setup (first visit)
     */
    needsSetup() {
        return !this.data.displayName || this.data.displayName.trim() === '';
    }
    
    /**
     * Get display name
     */
    getDisplayName() {
        return this.data.displayName || 'Anonymous';
    }
    
    /**
     * Set display name
     */
    setDisplayName(name) {
        const trimmed = (name || '').trim().slice(0, 30);
        this.data.displayName = trimmed || 'Anonymous';
        this.save();
        this.updateProfileUI();
        return this.data.displayName;
    }
    
    /**
     * Get user initials for avatar
     */
    getInitials() {
        const name = this.data.displayName || 'A';
        return name
            .split(' ')
            .map(n => n[0])
            .join('')
            .toUpperCase()
            .slice(0, 2);
    }

    /**
     * Renders into an avatar placeholder element: the real Google profile
     * photo if one is known, falling back to the initials text otherwise.
     * Never fabricates a photo - anonymous accounts simply get initials,
     * same as before this existed. `extraClass` distinguishes the two
     * differently-sized placeholders (header vs. profile modal) so each
     * keeps its own CSS.
     */
    renderAvatarInto(el, extraClass) {
        if (!el) return;
        el.classList.toggle('has-photo', !!this.data.avatarUrl);
        if (this.data.avatarUrl) {
            el.innerHTML = `<img class="${extraClass}" src="${this.escapeAttr(this.data.avatarUrl)}" alt="" referrerpolicy="no-referrer">`;
        } else {
            el.textContent = this.getInitials();
        }
    }

    /**
     * Update profile display in UI
     */
    updateProfileUI() {
        const nameEl = document.getElementById('userDisplayName');
        const avatarEl = document.getElementById('userAvatarInitials');
        const profileBtn = document.getElementById('userProfileBtn');

        if (nameEl) {
            nameEl.textContent = this.getDisplayName();
        }

        this.renderAvatarInto(avatarEl, 'user-avatar-img');

        if (profileBtn) {
            profileBtn.title = this.getDisplayName();
        }

        // The mobile header keeps its own copy of this avatar (see
        // mobile.js's updateMobileAvatar) since it's a separate DOM element,
        // not a responsive re-layout of the same one - refresh it here too
        // so a Google photo that only arrives after the async backend
        // fetch (mergeServerProfile) isn't stuck showing stale initials.
        window.mobileHandler?.updateMobileAvatar?.();
    }
    
    /**
     * Show user setup modal - deliberately minimal by request: exactly
     * two options, no name entry, no unique-ID display, no custom-ID
     * setup. Both remain available later from the profile modal
     * (display name is editable there; custom ID has its own
     * changeIdBtn flow) - this screen is just the first-visit choice of
     * identity: real (Google) or anonymous.
     */
    showSetupModal(action = 'get started') {
        return new Promise((resolve) => {
            // Remove existing modal if any
            document.getElementById('userSetupModal')?.remove();

            // The install/resume banners use a higher z-index than .modal (so
            // they can float above the main app), which means if either was
            // already showing when this first-run modal appears, it would sit
            // on top of the modal instead of behind it — hide them.
            document.querySelectorAll('.resume-banner').forEach((banner) => {
                banner.classList.remove('show');
                setTimeout(() => banner.remove(), 300);
            });

            const modal = document.createElement('div');
            modal.id = 'userSetupModal';
            modal.className = 'modal';
            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-modal', 'true');
            modal.innerHTML = `
                <div class="modal-backdrop"></div>
                <div class="modal-content user-setup-modal">
                    <div class="setup-header">
                        <div class="setup-icon">🎵</div>
                        <h2>${t('welcomeTitle')}</h2>
                        <p>${t('welcomeMessage')}</p>
                    </div>

                    <!-- Language Selector -->
                    <div class="setup-language-selector">
                        <label>🌍 Language / Langue / Idioma / 语言</label>
                        <select id="setupLanguageSelect" class="language-select">
                            <option value="en">🇬🇧 English</option>
                            <option value="es">🇪🇸 Español</option>
                            <option value="fr">🇫🇷 Français</option>
                            <option value="de">🇩🇪 Deutsch</option>
                            <option value="pt">🇧🇷 Português</option>
                            <option value="ru">🇷🇺 Русский</option>
                            <option value="zh">🇨🇳 中文</option>
                            <option value="ja">🇯🇵 日本語</option>
                            <option value="ar">🇸🇦 العربية</option>
                            <option value="hi">🇮🇳 हिन्दी</option>
                        </select>
                    </div>

                    <div class="setup-form">
                        <button id="setupGoogleSignInBtn" class="setup-btn">
                            🔐 Sign in with Google
                        </button>
                        <button id="setupSkipBtn" class="setup-skip-btn">
                            Continue as Anonymous
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            // Setup language selector
            const setupLanguageSelect = document.getElementById('setupLanguageSelect');
            if (setupLanguageSelect) {
                setupLanguageSelect.value = window.i18n?.currentLang || 'en';

                setupLanguageSelect.addEventListener('change', () => {
                    const lang = setupLanguageSelect.value;
                    if (window.i18n) {
                        window.i18n.setLanguage(lang);
                        this.setPreference('language', lang);

                        // Close current modal and reopen with new language
                        modal.remove();
                        setTimeout(() => {
                            this.showSetupModal();
                        }, 100);
                    }
                });
            }

            // Sign in with Google - replaces the old "type your ID to
            // restore" flow entirely (see PROJECT_REFERENCE.md/plan doc -
            // that flow had zero real security).
            document.getElementById('setupGoogleSignInBtn')?.addEventListener('click', () => {
                if (this.apiClient) {
                    this.apiClient.signInWithGoogle();
                }
            });

            // Continue as Anonymous
            document.getElementById('setupSkipBtn')?.addEventListener('click', () => {
                this.data.displayName = 'Anonymous';
                this.save();
                this.updateProfileUI();
                modal.remove();
                resolve('Anonymous');
            });
        });
    }

    /**
     * Update sync status UI indicator
     */
    updateSyncStatusUI() {
        const statusEl = document.getElementById('syncStatusIndicator');
        if (!statusEl) return;
        
        const icons = {
            'offline': '☁️',
            'syncing': '🔄',
            'synced': '✓',
            'error': '⚠️'
        };
        
        const labels = {
            'offline': 'Offline',
            'syncing': 'Syncing...',
            'synced': 'Synced',
            'error': 'Sync Error'
        };
        
        statusEl.innerHTML = `${icons[this.syncStatus] || '☁️'} <span>${labels[this.syncStatus] || 'Unknown'}</span>`;
        statusEl.className = `sync-status-indicator sync-${this.syncStatus}`;
    }
    
    /**
     * Show quick language selector modal
     */
    showLanguageModal() {
        // Remove existing modal if any
        document.getElementById('languageModal')?.remove();
        
        const currentLang = window.i18n?.currentLang || this.getPreference('language') || 'en';
        
        const modal = document.createElement('div');
        modal.id = 'languageModal';
        modal.className = 'modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.innerHTML = `
            <div class="modal-backdrop"></div>
            <div class="modal-content language-modal">
                <div class="language-modal-header">
                    <h3>🌍 ${t('selectLanguage')}</h3>
                    <button class="modal-close-btn" id="closeLangModalBtn">&times;</button>
                </div>
                <div class="language-grid">
                    <button class="language-option ${currentLang === 'en' ? 'active' : ''}" data-lang="en">
                        <span class="lang-flag">🇬🇧</span>
                        <span class="lang-name">English</span>
                    </button>
                    <button class="language-option ${currentLang === 'es' ? 'active' : ''}" data-lang="es">
                        <span class="lang-flag">🇪🇸</span>
                        <span class="lang-name">Español</span>
                    </button>
                    <button class="language-option ${currentLang === 'fr' ? 'active' : ''}" data-lang="fr">
                        <span class="lang-flag">🇫🇷</span>
                        <span class="lang-name">Français</span>
                    </button>
                    <button class="language-option ${currentLang === 'de' ? 'active' : ''}" data-lang="de">
                        <span class="lang-flag">🇩🇪</span>
                        <span class="lang-name">Deutsch</span>
                    </button>
                    <button class="language-option ${currentLang === 'pt' ? 'active' : ''}" data-lang="pt">
                        <span class="lang-flag">🇧🇷</span>
                        <span class="lang-name">Português</span>
                    </button>
                    <button class="language-option ${currentLang === 'ru' ? 'active' : ''}" data-lang="ru">
                        <span class="lang-flag">🇷🇺</span>
                        <span class="lang-name">Русский</span>
                    </button>
                    <button class="language-option ${currentLang === 'zh' ? 'active' : ''}" data-lang="zh">
                        <span class="lang-flag">🇨🇳</span>
                        <span class="lang-name">中文</span>
                    </button>
                    <button class="language-option ${currentLang === 'ja' ? 'active' : ''}" data-lang="ja">
                        <span class="lang-flag">🇯🇵</span>
                        <span class="lang-name">日本語</span>
                    </button>
                    <button class="language-option ${currentLang === 'ar' ? 'active' : ''}" data-lang="ar">
                        <span class="lang-flag">🇸🇦</span>
                        <span class="lang-name">العربية</span>
                    </button>
                    <button class="language-option ${currentLang === 'hi' ? 'active' : ''}" data-lang="hi">
                        <span class="lang-flag">🇮🇳</span>
                        <span class="lang-name">हिन्दी</span>
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Close button
        document.getElementById('closeLangModalBtn')?.addEventListener('click', () => {
            modal.remove();
        });
        
        // Backdrop close
        modal.querySelector('.modal-backdrop')?.addEventListener('click', () => {
            modal.remove();
        });
        
        // Language selection
        modal.querySelectorAll('.language-option').forEach(btn => {
            btn.addEventListener('click', () => {
                const lang = btn.dataset.lang;
                if (window.i18n) {
                    window.i18n.setLanguage(lang);
                    this.setPreference('language', lang);
                }
                modal.remove();
            });
        });
    }
    
    /**
     * Show profile settings modal with tabbed layout
     */
    showProfileModal() {
        return new Promise((resolve) => {
            // Remove existing modal if any
            document.getElementById('profileModal')?.remove();
            
            const stats = this.getStats();
            const displayId = this.getDisplayId();
            const hasCustomId = !!this.data.customId;
            const syncEnabled = this.apiClient?.syncEnabled;
            const isSignedInWithGoogle = !!this.data.email;
            const isAdmin = isSignedInWithGoogle && this.data.email === 'ramsharans.rathore@gmail.com' && this.data.signInProvider === 'google.com';
            
            const modal = document.createElement('div');
            modal.id = 'profileModal';
            modal.className = 'modal';
            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-modal', 'true');
            modal.innerHTML = `
                <div class="modal-backdrop"></div>
                <div class="modal-content profile-modal profile-modal-tabbed">
                    <div class="modal-header">
                        <h3>${t('profile')}</h3>
                        <button class="icon-btn close-modal-btn" aria-label="${t('close')}">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                        </button>
                    </div>

                    <!-- Profile Tabs Navigation -->
                    <div class="profile-tabs">
                        <button class="profile-tab-btn active" data-tab="profile" role="tab" aria-selected="true">
                            <span class="tab-icon">👤</span>
                            <span class="tab-label">Me</span>
                        </button>
                        <button class="profile-tab-btn" data-tab="stats" role="tab" aria-selected="false">
                            <span class="tab-icon">📊</span>
                            <span class="tab-label">Stats</span>
                        </button>
                        <button class="profile-tab-btn" data-tab="appearance" role="tab" aria-selected="false">
                            <span class="tab-icon">🎨</span>
                            <span class="tab-label">Appearance</span>
                        </button>
                        <button class="profile-tab-btn" data-tab="visualizer" role="tab" aria-selected="false">
                            <span class="tab-icon">🎵</span>
                            <span class="tab-label">Visualizer</span>
                        </button>
                        <button class="profile-tab-btn" data-tab="account" role="tab" aria-selected="false">
                            <span class="tab-icon">⚙️</span>
                            <span class="tab-label">Account</span>
                        </button>
                        ${isAdmin ? `
                        <button class="profile-tab-btn" data-tab="admin" role="tab" aria-selected="false">
                            <span class="tab-icon">🔐</span>
                            <span class="tab-label">Admin</span>
                        </button>
                        ` : ''}
                    </div>

                    <div class="modal-body profile-tab-body">
                        <!-- Tab 1: Profile -->
                        <div class="profile-tab-content active" id="profileTabProfile">
                            <!-- Profile Avatar -->
                            <div class="profile-avatar-section">
                                <div class="profile-avatar-large${this.data.avatarUrl ? ' has-photo' : ''}">${
                                    this.data.avatarUrl
                                        ? `<img class="profile-avatar-img" src="${this.escapeAttr(this.data.avatarUrl)}" alt="" referrerpolicy="no-referrer">`
                                        : this.getInitials()
                                }</div>
                                <div class="profile-name-display">
                                    <h4 style="margin: 10px 0; color: #e0e0e0; font-size: 16px;">${this.escapeHtml(this.getDisplayName())}</h4>
                                </div>
                                <div class="profile-member-info">
                                    <p>Member since ${stats.memberSince}</p>
                                    ${isSignedInWithGoogle ? `<p style="font-size: 12px; color: #7c3aed;">📧 ${this.escapeHtml(this.data.email)}</p>` : ''}
                                </div>
                            </div>
                            
                            <!-- Unique ID Section - only relevant before Google
                                 sign-in; once signed in, the account's real,
                                 durable identity is the Google account itself. -->
                            ${!isSignedInWithGoogle ? `
                                <div class="profile-id-section">
                                    <div class="id-display-row">
                                        <label>Your Unique ID:</label>
                                        <div class="id-display-value">
                                            <code id="profileIdDisplay" style="font-size: 16px; letter-spacing: 1px;">${this.escapeHtml(this.data.id.substring(0, 8).toUpperCase())}</code>
                                            <button type="button" id="copyProfileIdBtn" class="copy-id-btn" title="Copy ID">📋</button>
                                        </div>
                                    </div>
                                    <div class="id-change-section">
                                        <button type="button" id="changeIdBtn" class="link-btn">
                                            ${hasCustomId ? '✏️ Change Custom Nickname' : '✏️ Set Custom Nickname'}
                                        </button>
                                        <div id="changeIdForm" class="change-id-form" hidden>
                                            <input type="text" id="newCustomIdInput"
                                                   placeholder="${hasCustomId ? this.data.customId : 'your_nickname'}"
                                                   minlength="4" maxlength="12" autocomplete="off">
                                            <span id="newIdStatus" class="id-status"></span>
                                            <span class="input-hint">4-12 characters, letters/numbers/underscore</span>
                                            <div class="change-id-actions">
                                                <button type="button" id="saveNewIdBtn" class="save-name-btn" disabled>Save</button>
                                                <button type="button" id="cancelChangeIdBtn" class="link-btn">Cancel</button>
                                            </div>
                                        </div>
                                    </div>
                                    <p class="id-warning">ℹ️ Share your 8-digit ID or custom nickname with friends to help them find you</p>
                                </div>
                            ` : ''}

                        </div>

                        <!-- Tab 2: Stats -->
                        <div class="profile-tab-content" id="profileTabStats" hidden>
                            <!-- Summary stat tiles -->
                            <div class="profile-stats">
                                <div class="profile-stat">
                                    <span class="stat-icon">⏱️</span>
                                    <span class="stat-value">${stats.formattedTime}</span>
                                    <span class="stat-label">${t('listeningTime')}</span>
                                </div>
                                <div class="profile-stat">
                                    <span class="stat-icon">📻</span>
                                    <span class="stat-value">${stats.stationsPlayed}</span>
                                    <span class="stat-label">${t('stationsPlayed')}</span>
                                </div>
                                <div class="profile-stat">
                                    <span class="stat-icon">⭐</span>
                                    <span class="stat-value">${stats.favoritesCount}</span>
                                    <span class="stat-label">${t('favorites')}</span>
                                </div>
                                <div class="profile-stat">
                                    <span class="stat-icon">🌍</span>
                                    <span class="stat-value">${this.escapeHtml(stats.topCountry)}</span>
                                    <span class="stat-label">Top Country</span>
                                </div>
                            </div>

                            <!-- Top Genres -->
                            ${Object.keys(this.data.genreStats || {}).length > 0 ? `
                            <div class="profile-id-section" style="margin-top: var(--spacing-md);">
                                <div class="id-display-row" style="margin-bottom: var(--spacing-sm);">
                                    <label style="font-weight: 600;">🎵 Top Genres</label>
                                </div>
                                ${Object.entries(this.data.genreStats)
                                    .sort((a, b) => b[1] - a[1])
                                    .slice(0, 5)
                                    .map(([genre, count]) => `
                                    <div style="display:flex; justify-content:space-between; align-items:center; padding: 4px 0; border-bottom: 1px solid var(--border-color); font-size: var(--font-size-sm);">
                                        <span>${this.escapeHtml(genre)}</span>
                                        <span style="color: var(--accent-primary); font-weight:600;">${count}</span>
                                    </div>`).join('')}
                            </div>` : ''}

                            <!-- Top Countries -->
                            ${Object.keys(this.data.countryStats || {}).length > 0 ? `
                            <div class="profile-id-section" style="margin-top: var(--spacing-md);">
                                <div class="id-display-row" style="margin-bottom: var(--spacing-sm);">
                                    <label style="font-weight: 600;">🌍 Top Countries</label>
                                </div>
                                ${Object.entries(this.data.countryStats)
                                    .sort((a, b) => b[1] - a[1])
                                    .slice(0, 5)
                                    .map(([country, count]) => `
                                    <div style="display:flex; justify-content:space-between; align-items:center; padding: 4px 0; border-bottom: 1px solid var(--border-color); font-size: var(--font-size-sm);">
                                        <span>${this.escapeHtml(country)}</span>
                                        <span style="color: var(--accent-primary); font-weight:600;">${count}</span>
                                    </div>`).join('')}
                            </div>` : ''}

                            <!-- No data placeholder -->
                            ${stats.stationsPlayed === 0 ? `
                            <p style="text-align:center; color: var(--text-secondary); font-size: var(--font-size-sm); margin-top: var(--spacing-lg);">
                                🎧 Start listening to see your stats here!
                            </p>` : ''}
                        </div>

                        <!-- Tab 4: Appearance -->
                        <div class="profile-tab-content" id="profileTabAppearance" hidden>
                            <div class="profile-preferences">
                                <div class="pref-item">
                                    <span>${t('theme')}</span>
                                    <select id="prefTheme">
                                        <option value="dark" ${this.data.preferences.theme === 'dark' ? 'selected' : ''}>🌙 Dark</option>
                                        <option value="light" ${this.data.preferences.theme === 'light' ? 'selected' : ''}>☀️ Light</option>
                                        <option value="midnight" ${this.data.preferences.theme === 'midnight' ? 'selected' : ''}>🌌 Midnight Blue</option>
                                        <option value="forest" ${this.data.preferences.theme === 'forest' ? 'selected' : ''}>🌲 Forest Green</option>
                                        <option value="purple" ${this.data.preferences.theme === 'purple' ? 'selected' : ''}>👑 Royal Purple</option>
                                        <option value="sunset" ${this.data.preferences.theme === 'sunset' ? 'selected' : ''}>🌅 Sunset Orange</option>
                                        <option value="ocean" ${this.data.preferences.theme === 'ocean' ? 'selected' : ''}>🌊 Ocean Blue</option>
                                        <option value="rosegold" ${this.data.preferences.theme === 'rosegold' ? 'selected' : ''}>🌸 Rose Gold</option>
                                        <option value="rathore" ${this.data.preferences.theme === 'rathore' ? 'selected' : ''}>🦁 Rathore Royal (Default)</option>
                                    </select>
                                </div>
                                <div class="pref-item">
                                    <span>${t('appLanguage')}</span>
                                    <select id="prefLanguage">
                                        ${i18n.getLanguages().map(lang => 
                                            `<option value="${lang.code}" ${this.data.preferences.language === lang.code ? 'selected' : ''}>${lang.flag} ${lang.native}</option>`
                                        ).join('')}
                                    </select>
                                </div>
                                <div class="pref-item">
                                    <span>${t('viewMode')}</span>
                                    <div class="view-mode-toggle">
                                        <button id="prefViewGlobe" class="view-mode-btn ${this.data.preferences.viewMode === 'globe' ? 'active' : ''}">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <circle cx="12" cy="12" r="10"/>
                                                <line x1="2" y1="12" x2="22" y2="12"/>
                                                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                                            </svg>
                                            ${t('globe')}
                                        </button>
                                        <button id="prefViewMap" class="view-mode-btn ${this.data.preferences.viewMode === 'map' ? 'active' : ''}">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                                <rect x="3" y="3" width="18" height="18" rx="2"/>
                                                <line x1="3" y1="9" x2="21" y2="9"/>
                                                <line x1="3" y1="15" x2="21" y2="15"/>
                                                <line x1="9" y1="3" x2="9" y2="21"/>
                                            </svg>
                                            ${t('map')}
                                        </button>
                                    </div>
                                </div>
                                <div class="pref-item">
                                    <span>${t('autoResume')}</span>
                                    <label class="toggle-switch">
                                        <input type="checkbox" id="prefAutoResume" ${this.data.preferences.autoResume ? 'checked' : ''}>
                                        <span class="toggle-slider"></span>
                                    </label>
                                </div>
                                <div class="pref-item pref-item-vertical">
                                    <div class="pref-item-header">
                                        <span>${t('httpsOnly')}</span>
                                        <label class="toggle-switch">
                                            <input type="checkbox" id="prefHttpsOnly" ${this.data.preferences.httpsOnly ? 'checked' : ''}>
                                            <span class="toggle-slider"></span>
                                        </label>
                                    </div>
                                    <p class="pref-help-text">${t('httpsOnlyDesc')}</p>
                                </div>
                                <div class="pref-item">
                                    <span>${t('panelAutoHide') || 'Panel Auto-Hide'}</span>
                                    <label class="toggle-switch">
                                        <input type="checkbox" id="prefPanelAutoHide" ${this.data.preferences.panelAutoHide ? 'checked' : ''}>
                                        <span class="toggle-slider"></span>
                                    </label>
                                </div>
                                <div class="pref-item" id="panelAutoHideDelayRow" ${!this.data.preferences.panelAutoHide ? 'style="opacity: 0.5; pointer-events: none;"' : ''}>
                                    <span>${t('panelAutoHideDelay') || 'Auto-Hide Delay'}</span>
                                    <select id="prefPanelAutoHideDelay">
                                        <option value="5" ${this.data.preferences.panelAutoHideDelay === 5 ? 'selected' : ''}>5 ${t('seconds')}</option>
                                        <option value="10" ${this.data.preferences.panelAutoHideDelay === 10 ? 'selected' : ''}>10 ${t('seconds')}</option>
                                        <option value="15" ${this.data.preferences.panelAutoHideDelay === 15 ? 'selected' : ''}>15 ${t('seconds')}</option>
                                        <option value="30" ${this.data.preferences.panelAutoHideDelay === 30 ? 'selected' : ''}>30 ${t('seconds')}</option>
                                        <option value="60" ${this.data.preferences.panelAutoHideDelay === 60 ? 'selected' : ''}>60 ${t('seconds')}</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Tab 5: Visualizer -->
                        <div class="profile-tab-content" id="profileTabVisualizer" hidden>
                            <div class="profile-preferences">
                                <div class="pref-item">
                                    <span>${t('showOnIdle')}</span>
                                    <label class="toggle-switch">
                                        <input type="checkbox" id="prefVisualizerEnabled" ${this.data.preferences.visualizerEnabled ? 'checked' : ''}>
                                        <span class="toggle-slider"></span>
                                    </label>
                                </div>
                                <div class="pref-item">
                                    <span>${t('style')}</span>
                                    <select id="prefVisualizerStyle">
                                        <option value="bars" ${this.data.preferences.visualizerStyle === 'bars' ? 'selected' : ''}>📊 Bars</option>
                                        <option value="wave" ${this.data.preferences.visualizerStyle === 'wave' ? 'selected' : ''}>🌊 Wave</option>
                                        <option value="circular" ${this.data.preferences.visualizerStyle === 'circular' ? 'selected' : ''}>⭕ Circular</option>
                                        <option value="particles" ${this.data.preferences.visualizerStyle === 'particles' ? 'selected' : ''}>✨ Particles</option>
                                        <option value="spectrum" ${this.data.preferences.visualizerStyle === 'spectrum' ? 'selected' : ''}>🌈 Spectrum</option>
                                        <option value="couple" ${this.data.preferences.visualizerStyle === 'couple' ? 'selected' : ''}>💃 Dancing Couple</option>
                                        <option value="kids" ${this.data.preferences.visualizerStyle === 'kids' ? 'selected' : ''}>🧒 Kids Dancing</option>
                                        <option value="shiva" ${this.data.preferences.visualizerStyle === 'shiva' ? 'selected' : ''}>🔱 Shiva Tandava</option>
                                        <option value="matrix" ${this.data.preferences.visualizerStyle === 'matrix' ? 'selected' : ''}>🟢 Matrix Rain</option>
                                        <option value="fireworks" ${this.data.preferences.visualizerStyle === 'fireworks' ? 'selected' : ''}>🎆 Fireworks</option>
                                        <option value="aurora" ${this.data.preferences.visualizerStyle === 'aurora' ? 'selected' : ''}>🌌 Aurora Borealis</option>
                                        <option value="bubbles" ${this.data.preferences.visualizerStyle === 'bubbles' ? 'selected' : ''}>🫧 Bubbles</option>
                                        <option value="flames" ${this.data.preferences.visualizerStyle === 'flames' ? 'selected' : ''}>🔥 Flames</option>
                                        <option value="galaxy" ${this.data.preferences.visualizerStyle === 'galaxy' ? 'selected' : ''}>🌀 Galaxy</option>
                                        <option value="pulse" ${this.data.preferences.visualizerStyle === 'pulse' ? 'selected' : ''}>💓 Heartbeat</option>
                                        <option value="disco" ${this.data.preferences.visualizerStyle === 'disco' ? 'selected' : ''}>🪩 Disco Ball</option>
                                    </select>
                                </div>
                                <div class="pref-item">
                                    <span>${t('idleTimeout')}</span>
                                    <select id="prefIdleTimeout">
                                        <option value="3" ${this.data.preferences.idleTimeout === 3 ? 'selected' : ''}>3 ${t('seconds')}</option>
                                        <option value="5" ${this.data.preferences.idleTimeout === 5 ? 'selected' : ''}>5 ${t('seconds')}</option>
                                        <option value="10" ${this.data.preferences.idleTimeout === 10 ? 'selected' : ''}>10 ${t('seconds')}</option>
                                        <option value="15" ${this.data.preferences.idleTimeout === 15 ? 'selected' : ''}>15 ${t('seconds')}</option>
                                        <option value="30" ${this.data.preferences.idleTimeout === 30 ? 'selected' : ''}>30 ${t('seconds')}</option>
                                    </select>
                                </div>
                                
                                <!-- Visualizer Genre Filter -->
                                <div class="pref-item pref-item-vertical">
                                    <span>Show visualizer for genres:</span>
                                    <div class="genre-checkboxes" id="visualizerGenreCheckboxes">
                                        ${this.renderVisualizerGenreCheckboxes()}
                                    </div>
                                    <div class="genre-checkbox-actions">
                                        <button type="button" id="selectAllGenres" class="link-btn">Select All</button>
                                        <span class="divider">|</span>
                                        <button type="button" id="selectNoneGenres" class="link-btn">Select None</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Tab 6: Account -->
                        <div class="profile-tab-content" id="profileTabAccount" hidden>
                            <!-- App Install (hidden via CSS/JS once running standalone) -->
                            <div class="profile-data-management" id="profileInstallSection">
                                <h4>📲 App</h4>
                                <div class="data-management-buttons">
                                    <button id="profileInstallBtn" class="data-btn">
                                        ⬇️ Install App
                                    </button>
                                </div>
                                <p class="data-hint">Install Radio Explorer for a faster, full-screen experience with offline access.</p>
                            </div>

                            <!-- Data Management -->
                            <div class="profile-data-management">
                                <h4>☁️ Cloud Sync</h4>
                                <div class="data-management-buttons">
                                    <button id="syncNowBtn" class="data-btn sync-btn" ${!syncEnabled ? 'disabled' : ''}>
                                        🔄 Sync Now
                                    </button>
                                    ${isSignedInWithGoogle ? `
                                        <button id="signOutBtn" class="data-btn">🚪 Sign Out</button>
                                    ` : `
                                        <button id="googleSignInBtn" class="data-btn">🔐 Sign in with Google</button>
                                    `}
                                </div>
                                ${isSignedInWithGoogle ? `
                                    <p class="data-hint">Signed in as ${this.escapeHtml(this.data.email)}</p>
                                ` : `
                                    <p class="data-hint">Sign in to access your favorites and history on other devices.</p>
                                `}
                                <p class="data-hint">
                                    ${syncEnabled
                                        ? `Last synced: ${this.data.lastSyncAt ? new Date(this.data.lastSyncAt).toLocaleString() : 'Never'}`
                                        : 'Cloud sync not available - data stored locally only'
                                    }
                                </p>
                            </div>

                            <!-- App Updates -->
                            <div class="profile-data-management">
                                <h4>🔄 App Updates <span class="app-version-badge" id="appVersionBadge">v${localStorage.getItem('appVersion') || '—'}</span></h4>
                                <div class="data-management-buttons">
                                    <button id="checkUpdatesBtn" class="data-btn update-btn">
                                        🔍 Check for Updates
                                    </button>
                                </div>
                                <p class="data-hint" id="updateHint">Click to check if a newer version is available and refresh your browser to get the latest features and improvements.</p>
                                <div id="updateStatus" style="display:none; margin-top:10px; padding:10px; border-radius:4px;" class="update-status">
                                    <p id="updateMessage"></p>
                                    <button id="applyUpdateBtn" class="data-btn update-btn" style="margin-top:8px; display:none;">
                                        ✅ Apply Update & Reload
                                    </button>
                                </div>
                            </div>

                            <!-- Danger Zone -->
                            <div class="profile-danger-zone">
                                <h4>⚠️ Danger Zone</h4>
                                <p>Reset clears browser data only. Use your ID to recover from cloud.</p>
                                <button id="resetLocalDataBtn" class="reset-btn reset-local-btn">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                                        <path d="M3 3v5h5"/>
                                    </svg>
                                    Reset Local Data
                                </button>
                                <button id="resetAllDataBtn" class="reset-btn">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <polyline points="3 6 5 6 21 6"/>
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                    </svg>
                                    ${t('resetAll')} (Local + Cloud)
                                </button>
                            </div>
                        </div>

                        <!-- Tab 7: Admin Dashboard (only for admins) -->
                        ${isAdmin ? `
                        <div class="profile-tab-content" id="profileTabAdmin" hidden>
                            <div style="padding: 20px;">
                                <h4 style="color: #7c3aed; margin-bottom: 15px;">🔐 Admin Dashboard</h4>
                                <p style="color: #b0b0b0; margin-bottom: 20px; font-size: 14px;">Access the admin dashboard to view users, sessions, favorites, history, and execute custom queries.</p>
                                <button id="openAdminDashboardBtn" style="padding: 10px 20px; background: #7c3aed; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 14px; font-weight: 500;">
                                    📊 Open Admin Dashboard
                                </button>
                            </div>
                        </div>
                        ` : ''}
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            // === TAB SWITCHING LOGIC ===
            const profileTabBtns = modal.querySelectorAll('.profile-tab-btn');
            const profileTabContents = modal.querySelectorAll('.profile-tab-content');
            
            profileTabBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    const tabName = btn.dataset.tab;

                    // Update active button
                    profileTabBtns.forEach(b => {
                        b.classList.remove('active');
                        b.setAttribute('aria-selected', 'false');
                    });
                    btn.classList.add('active');
                    btn.setAttribute('aria-selected', 'true');

                    // Show corresponding content
                    profileTabContents.forEach(content => {
                        content.hidden = true;
                        content.classList.remove('active');
                    });

                    const targetContent = document.getElementById(`profileTab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
                    if (targetContent) {
                        targetContent.hidden = false;
                        targetContent.classList.add('active');
                    }
                });
            });
            
            const closeBtn = modal.querySelector('.close-modal-btn');
            const backdrop = modal.querySelector('.modal-backdrop');
            const resetBtn = document.getElementById('resetAllDataBtn');
            const autoResumeToggle = document.getElementById('prefAutoResume');

            // Close modal
            const closeModal = () => {
                modal.remove();
                resolve();
            };

            closeBtn.addEventListener('click', closeModal);
            backdrop.addEventListener('click', closeModal);

            // Admin Dashboard button
            const adminDashboardBtn = document.getElementById('openAdminDashboardBtn');
            if (adminDashboardBtn) {
                adminDashboardBtn.addEventListener('click', () => {
                    closeModal();
                    setTimeout(() => {
                        if (window.adminDashboard) {
                            window.adminDashboard.open();
                        }
                    }, 100);
                });
            }
            
            // Auto-resume toggle
            autoResumeToggle.addEventListener('change', () => {
                this.setPreference('autoResume', autoResumeToggle.checked);
            });

            // HTTPS-only station filter toggle
            const httpsOnlyToggle = document.getElementById('prefHttpsOnly');
            httpsOnlyToggle?.addEventListener('change', () => {
                this.setPreference('httpsOnly', httpsOnlyToggle.checked);
                window.dispatchEvent(new CustomEvent('httpsOnlyChanged', {
                    detail: { enabled: httpsOnlyToggle.checked }
                }));
            });
            
            // Panel auto-hide toggle
            const panelAutoHideToggle = document.getElementById('prefPanelAutoHide');
            const panelAutoHideDelaySelect = document.getElementById('prefPanelAutoHideDelay');
            const panelAutoHideDelayRow = document.getElementById('panelAutoHideDelayRow');
            
            panelAutoHideToggle?.addEventListener('change', () => {
                this.setPreference('panelAutoHide', panelAutoHideToggle.checked);
                // Enable/disable delay dropdown
                if (panelAutoHideDelayRow) {
                    panelAutoHideDelayRow.style.opacity = panelAutoHideToggle.checked ? '1' : '0.5';
                    panelAutoHideDelayRow.style.pointerEvents = panelAutoHideToggle.checked ? 'auto' : 'none';
                }
                // Dispatch event for UI to handle
                window.dispatchEvent(new CustomEvent('panelAutoHideChanged', { 
                    detail: { enabled: panelAutoHideToggle.checked, delay: parseInt(panelAutoHideDelaySelect?.value || 10) }
                }));
            });
            
            panelAutoHideDelaySelect?.addEventListener('change', () => {
                const delay = parseInt(panelAutoHideDelaySelect.value);
                this.setPreference('panelAutoHideDelay', delay);
                // Dispatch event for UI to handle
                window.dispatchEvent(new CustomEvent('panelAutoHideChanged', { 
                    detail: { enabled: panelAutoHideToggle?.checked, delay }
                }));
            });
            
            // Theme selector
            const themeSelect = document.getElementById('prefTheme');
            themeSelect?.addEventListener('change', () => {
                const theme = themeSelect.value;
                this.setPreference('theme', theme);
                this.applyTheme(theme);
            });
            
            // Language selector
            const languageSelect = document.getElementById('prefLanguage');
            languageSelect?.addEventListener('change', () => {
                const lang = languageSelect.value;
                this.setPreference('language', lang);
                i18n.setLanguage(lang);
                i18n.applyTranslations();
                // Close and reopen modal to refresh its content
                document.getElementById('profileModal')?.remove();
                setTimeout(() => this.showProfileModal(), 100);
            });
            
            // View mode toggle buttons
            const viewGlobeBtn = document.getElementById('prefViewGlobe');
            const viewMapBtn = document.getElementById('prefViewMap');
            
            viewGlobeBtn?.addEventListener('click', () => {
                this.setPreference('viewMode', 'globe');
                viewGlobeBtn.classList.add('active');
                viewMapBtn.classList.remove('active');
                // Dispatch event for globe controller
                window.dispatchEvent(new CustomEvent('viewModeChanged', { detail: 'globe' }));
            });
            
            viewMapBtn?.addEventListener('click', () => {
                this.setPreference('viewMode', 'map');
                viewMapBtn.classList.add('active');
                viewGlobeBtn.classList.remove('active');
                // Dispatch event for globe controller
                window.dispatchEvent(new CustomEvent('viewModeChanged', { detail: 'map' }));
            });
            
            // Visualizer settings
            const visualizerEnabledToggle = document.getElementById('prefVisualizerEnabled');
            const visualizerStyleSelect = document.getElementById('prefVisualizerStyle');
            const idleTimeoutSelect = document.getElementById('prefIdleTimeout');
            
            visualizerEnabledToggle?.addEventListener('change', () => {
                this.setPreference('visualizerEnabled', visualizerEnabledToggle.checked);
                window.dispatchEvent(new CustomEvent('visualizerSettingsChanged'));
            });
            
            visualizerStyleSelect?.addEventListener('change', () => {
                this.setPreference('visualizerStyle', visualizerStyleSelect.value);
                window.dispatchEvent(new CustomEvent('visualizerStyleChanged', { detail: visualizerStyleSelect.value }));
            });
            
            idleTimeoutSelect?.addEventListener('change', () => {
                this.setPreference('idleTimeout', parseInt(idleTimeoutSelect.value));
                window.dispatchEvent(new CustomEvent('visualizerSettingsChanged'));
            });
            
            // Visualizer genre checkboxes
            const genreCheckboxContainer = document.getElementById('visualizerGenreCheckboxes');
            if (genreCheckboxContainer) {
                genreCheckboxContainer.addEventListener('change', (e) => {
                    if (e.target.name === 'visualizerGenre') {
                        this.updateVisualizerGenres();
                    }
                });
            }
            
            // Select All / Select None buttons
            const selectAllBtn = document.getElementById('selectAllGenres');
            const selectNoneBtn = document.getElementById('selectNoneGenres');
            
            selectAllBtn?.addEventListener('click', () => {
                const checkboxes = document.querySelectorAll('#visualizerGenreCheckboxes input[type="checkbox"]');
                checkboxes.forEach(cb => cb.checked = true);
                this.updateVisualizerGenres();
            });
            
            selectNoneBtn?.addEventListener('click', () => {
                const checkboxes = document.querySelectorAll('#visualizerGenreCheckboxes input[type="checkbox"]');
                checkboxes.forEach(cb => cb.checked = false);
                this.updateVisualizerGenres();
            });
            
            // === CLOUD SYNC EVENT LISTENERS ===
            
            // Copy profile ID button
            const copyProfileIdBtn = document.getElementById('copyProfileIdBtn');
            copyProfileIdBtn?.addEventListener('click', () => {
                const id = document.getElementById('profileIdDisplay').textContent;
                navigator.clipboard.writeText(id).then(() => {
                    copyProfileIdBtn.textContent = '✓';
                    setTimeout(() => copyProfileIdBtn.textContent = '📋', 1500);
                });
            });
            
            // Change ID button and form
            const changeIdBtn = document.getElementById('changeIdBtn');
            const changeIdForm = document.getElementById('changeIdForm');
            const newCustomIdInput = document.getElementById('newCustomIdInput');
            const newIdStatus = document.getElementById('newIdStatus');
            const saveNewIdBtn = document.getElementById('saveNewIdBtn');
            const cancelChangeIdBtn = document.getElementById('cancelChangeIdBtn');
            let newIdValid = false;

            changeIdBtn?.addEventListener('click', () => {
                changeIdForm.hidden = !changeIdForm.hidden;
                if (!changeIdForm.hidden) {
                    newCustomIdInput.focus();
                }
            });
            
            cancelChangeIdBtn?.addEventListener('click', () => {
                changeIdForm.hidden = true;
                newCustomIdInput.value = '';
                newIdStatus.textContent = '';
            });
            
            // Format-only validation, same reasoning as the setup modal's
            // custom-ID field - real availability is only known on submit.
            newCustomIdInput?.addEventListener('input', () => {
                const value = newCustomIdInput.value.trim().toLowerCase();
                newIdStatus.textContent = '';
                newIdStatus.className = 'id-status';
                saveNewIdBtn.disabled = true;

                if (value.length < 8) {
                    newIdValid = false;
                    if (value.length > 0) {
                        newIdStatus.textContent = `${8 - value.length} more characters needed`;
                        newIdStatus.className = 'id-status warning';
                    }
                    return;
                }

                if (!isValidCustomIdFormat(value)) {
                    newIdValid = false;
                    newIdStatus.textContent = 'Must start with a letter; letters, numbers, underscore only';
                    newIdStatus.className = 'id-status error';
                    return;
                }

                newIdValid = true;
                saveNewIdBtn.disabled = false;
            });

            saveNewIdBtn?.addEventListener('click', async () => {
                if (!newIdValid) return;

                const newId = newCustomIdInput.value.trim().toLowerCase();
                saveNewIdBtn.disabled = true;
                saveNewIdBtn.textContent = t('syncing');

                if (this.apiClient?.syncEnabled) {
                    try {
                        await this.apiClient.updateProfile({ customId: newId });
                        this.data.customId = newId;
                        this.save();
                        document.getElementById('profileIdDisplay').textContent = this.getDisplayId();

                        newIdStatus.textContent = '✓ ' + t('idChangedSuccess');
                        newIdStatus.className = 'id-status success';

                        setTimeout(() => {
                            changeIdForm.hidden = true;
                            newCustomIdInput.value = '';
                            newIdStatus.textContent = '';
                            saveNewIdBtn.textContent = t('save');
                        }, 1500);
                    } catch (error) {
                        newIdStatus.textContent = error.message || 'That ID is already taken';
                        newIdStatus.className = 'id-status error';
                        saveNewIdBtn.textContent = t('save');
                        saveNewIdBtn.disabled = false;
                    }
                } else {
                    // Offline - save locally only; save()'s debounce will
                    // push it once the backend is reachable again.
                    this.data.customId = newId;
                    this.save();
                    document.getElementById('profileIdDisplay').textContent = this.getDisplayId();

                    newIdStatus.textContent = '✓ ' + t('savedLocally');
                    newIdStatus.className = 'id-status success';

                    setTimeout(() => {
                        changeIdForm.hidden = true;
                        newCustomIdInput.value = '';
                        newIdStatus.textContent = '';
                        saveNewIdBtn.textContent = t('save');
                    }, 1500);
                }
            });
            
            // Sync Now button - re-fetches from the backend and reconciles,
            // rather than a one-way local->cloud push like before.
            const syncNowBtn = document.getElementById('syncNowBtn');
            syncNowBtn?.addEventListener('click', async () => {
                if (!this.apiClient?.syncEnabled) return;

                syncNowBtn.disabled = true;
                syncNowBtn.textContent = '🔄 ' + t('syncing');

                try {
                    const { profile } = await this.apiClient.getProfile();
                    this.mergeServerProfile(profile);
                    if (window.favorites?.reconcileWithBackend) {
                        await window.favorites.reconcileWithBackend();
                    }
                    syncNowBtn.textContent = '✓ ' + t('synced');
                } catch (error) {
                    console.warn('⚠️ Sync Now failed:', error.message);
                    syncNowBtn.textContent = '⚠️ Failed';
                }

                setTimeout(() => {
                    syncNowBtn.textContent = '🔄 ' + t('syncNow');
                    syncNowBtn.disabled = false;
                }, 1500);
            });

            // Sign in with Google / Sign out (replaces the old "Import
            // Profile by ID" flow, which had zero real security)
            document.getElementById('googleSignInBtn')?.addEventListener('click', () => {
                this.apiClient?.signInWithGoogle();
            });

            document.getElementById('signOutBtn')?.addEventListener('click', async () => {
                if (!confirm('Sign out? This device will get a fresh anonymous profile - your data stays under your Google account.')) {
                    return;
                }
                await this.apiClient?.logout();
                location.reload();
            });
            
            // Install App button — hide the whole section if already running
            // standalone (installed) or if this platform/browser gives us no way
            // to trigger install (no beforeinstallprompt support and not iOS).
            const installSection = document.getElementById('profileInstallSection');
            const installCtrl = window.app?.install;
            if (installSection) {
                const canOfferInstall = installCtrl && !installCtrl.isStandalone
                    && (installCtrl.isIOS || installCtrl.deferredPrompt);
                installSection.hidden = !canOfferInstall;
            }
            document.getElementById('profileInstallBtn')?.addEventListener('click', () => {
                window.app?.install?.promptInstall();
            });

            // === APP UPDATE EVENT LISTENERS ===
            const checkUpdatesBtn = document.getElementById('checkUpdatesBtn');
            const applyUpdateBtn = document.getElementById('applyUpdateBtn');
            const updateStatus = document.getElementById('updateStatus');
            const updateMessage = document.getElementById('updateMessage');

            checkUpdatesBtn?.addEventListener('click', async () => {
                checkUpdatesBtn.disabled = true;
                checkUpdatesBtn.textContent = '🔍 Checking...';
                updateStatus.style.display = 'none';

                try {
                    // Primary path: compare against version.json, the same
                    // source of truth the automatic on-open check uses. If
                    // this finds a newer release it clears caches and
                    // reloads on its own — nothing left to do here.
                    if (typeof window.checkAppVersion === 'function') {
                        const result = await window.checkAppVersion();
                        if (result?.updated) {
                            updateStatus.style.display = 'block';
                            updateStatus.style.backgroundColor = 'var(--color-success, #4CAF50)';
                            updateStatus.style.color = 'white';
                            updateMessage.innerHTML = `✅ <strong>New version found (${result.latestVersion})!</strong> Reloading now...`;
                            return;
                        }
                        if (result) {
                            updateStatus.style.display = 'block';
                            updateStatus.style.backgroundColor = 'var(--color-info, #2196F3)';
                            updateStatus.style.color = 'white';
                            updateMessage.innerHTML = `✓ You're on the latest version (${result.latestVersion})`;
                            const versionBadge = document.getElementById('appVersionBadge');
                            if (versionBadge) versionBadge.textContent = `v${result.latestVersion}`;
                            return;
                        }
                    }

                    // Fallback (version.json unreachable): fall back to
                    // asking the service worker directly whether it has a
                    // waiting update.
                    if ('serviceWorker' in navigator) {
                        const registration = await navigator.serviceWorker.getRegistration();
                        if (registration) {
                            await registration.update();

                            if (registration.waiting) {
                                updateStatus.style.display = 'block';
                                updateStatus.style.backgroundColor = 'var(--color-success, #4CAF50)';
                                updateStatus.style.color = 'white';
                                updateMessage.innerHTML = '✅ <strong>New version available!</strong> Click below to install the latest update and refresh the app.';
                                applyUpdateBtn.style.display = 'inline-block';

                                window.waitingServiceWorker = registration.waiting;
                            } else {
                                updateStatus.style.display = 'block';
                                updateStatus.style.backgroundColor = 'var(--color-info, #2196F3)';
                                updateStatus.style.color = 'white';
                                updateMessage.innerHTML = '✓ You are running the latest version!';
                                applyUpdateBtn.style.display = 'none';
                            }
                        } else {
                            updateStatus.style.display = 'block';
                            updateStatus.style.backgroundColor = 'var(--color-warning, #FF9800)';
                            updateStatus.style.color = 'white';
                            updateMessage.innerHTML = '⚠️ Service worker not active. Try refreshing the page.';
                            applyUpdateBtn.style.display = 'none';
                        }
                    } else {
                        updateStatus.style.display = 'block';
                        updateStatus.style.backgroundColor = 'var(--color-error, #F44336)';
                        updateStatus.style.color = 'white';
                        updateMessage.innerHTML = '❌ Could not check for updates in this browser.';
                        applyUpdateBtn.style.display = 'none';
                    }
                } catch (error) {
                    console.error('Update check failed:', error);
                    updateStatus.style.display = 'block';
                    updateStatus.style.backgroundColor = 'var(--color-error, #F44336)';
                    updateStatus.style.color = 'white';
                    updateMessage.innerHTML = '❌ Failed to check for updates. Please try again later.';
                    applyUpdateBtn.style.display = 'none';
                } finally {
                    checkUpdatesBtn.disabled = false;
                    checkUpdatesBtn.textContent = '🔍 Check for Updates';
                }
            });

            applyUpdateBtn?.addEventListener('click', () => {
                if (window.waitingServiceWorker) {
                    // Tell the waiting service worker to take control
                    window.waitingServiceWorker.postMessage({ type: 'SKIP_WAITING' });

                    // Listen for the service worker to take control
                    navigator.serviceWorker.controller = null;
                    window.location.reload();
                }
            });

            // Listen for service worker updates in the background
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.addEventListener('controllerchange', () => {
                    // Service worker has been updated
                    const banner = document.createElement('div');
                    banner.className = 'toast toast-success';
                    banner.innerHTML = '<strong>App Updated!</strong><p>The latest version has been installed.</p>';
                    document.getElementById('toastContainer')?.appendChild(banner);
                });
            }

            // Reset Local Data button
            const resetLocalBtn = document.getElementById('resetLocalDataBtn');
            resetLocalBtn?.addEventListener('click', () => {
                if (confirm('Reset local cache? Your profile will be re-downloaded from the server on reload.')) {
                    this.resetLocal();
                    closeModal();
                }
            });

            // Reset all data (local + backend)
            resetBtn.addEventListener('click', async () => {
                if (confirm('Are you sure you want to reset ALL data including your account? This cannot be undone.')) {
                    if (confirm('This will permanently delete your account, favorites, history, and preferences. Continue?')) {
                        await this.resetAll();
                        closeModal();
                    }
                }
            });
        });
    }

    /**
     * Reset the local cache only (browser localStorage). The backend
     * account is untouched and the session token is deliberately kept -
     * reloading re-fetches the same profile from the server, since that's
     * now the single source of truth for anything worth recovering.
     */
    resetLocal() {
        localStorage.removeItem(this.storageKey);
        localStorage.removeItem('globeRadio_favorites');
        // Show toast before reload
        const toast = document.createElement('div');
        toast.className = 'toast toast-info';
        toast.innerHTML = '<strong>Local Cache Reset</strong><p>Reloading to re-sync from your account...</p>';
        document.getElementById('toastContainer')?.appendChild(toast);
        setTimeout(() => location.reload(), 1000);
    }

    /**
     * Delete the account (backend + local) entirely
     */
    async resetAll() {
        // Delete from the backend first if available
        if (this.apiClient?.syncEnabled) {
            try {
                await this.apiClient.deleteProfile();
            } catch (error) {
                console.warn('⚠️ Failed to delete backend profile (continuing with local reset anyway):', error.message);
            }
        }

        // Then clear local, including the now-invalid session token
        localStorage.removeItem(this.storageKey);
        localStorage.removeItem('globeRadio_favorites');
        localStorage.removeItem('globeRadio_sessionToken');

        // Show toast before reload
        const toast = document.createElement('div');
        toast.className = 'toast toast-info';
        toast.innerHTML = '<strong>All Data Reset</strong><p>Reloading...</p>';
        document.getElementById('toastContainer')?.appendChild(toast);
        setTimeout(() => location.reload(), 500);
    }
    
    /**
     * Get the list of genre categories for visualizer settings
     */
    getVisualizerGenreCategories() {
        return [
            { id: 'Pop', icon: '🎤', label: 'Pop' },
            { id: 'Rock', icon: '🎸', label: 'Rock' },
            { id: 'Electronic', icon: '🎧', label: 'Electronic' },
            { id: 'Hip-Hop & R&B', icon: '🎤', label: 'Hip-Hop & R&B' },
            { id: 'Jazz & Blues', icon: '🎷', label: 'Jazz & Blues' },
            { id: 'Classical', icon: '🎻', label: 'Classical' },
            { id: 'Country & Folk', icon: '🤠', label: 'Country & Folk' },
            { id: 'World Music', icon: '🌍', label: 'World Music' },
            { id: 'News & Talk', icon: '📰', label: 'News & Talk' },
            { id: 'Religious', icon: '🙏', label: 'Religious' },
            { id: 'Decades', icon: '📅', label: 'Decades' },
            { id: 'Ambient & Chill', icon: '😌', label: 'Ambient & Chill' },
            { id: 'Funk & Soul', icon: '🕺', label: 'Funk & Soul' },
            { id: 'Reggae & Dub', icon: '🇯🇲', label: 'Reggae & Dub' },
            { id: 'Other', icon: '📻', label: 'Other' }
        ];
    }
    
    /**
     * Render the genre checkboxes for visualizer settings
     */
    renderVisualizerGenreCheckboxes() {
        const categories = this.getVisualizerGenreCategories();
        const enabledGenres = this.data.preferences.visualizerGenres || this.getDefaultVisualizerGenres();
        
        return categories.map(cat => `
            <label class="genre-checkbox">
                <input type="checkbox" 
                       name="visualizerGenre" 
                       value="${cat.id}" 
                       ${enabledGenres.includes(cat.id) ? 'checked' : ''}>
                <span class="genre-checkbox-label">${cat.icon} ${cat.label}</span>
            </label>
        `).join('');
    }
    
    /**
     * Get default genres for visualizer (music-related only)
     * Excludes: News & Talk, Religious, Other
     */
    getDefaultVisualizerGenres() {
        const musicGenres = [
            'Pop',
            'Rock', 
            'Electronic',
            'Hip-Hop & R&B',
            'Jazz & Blues',
            'Classical',
            'Country & Folk',
            'World Music',
            'Decades',
            'Ambient & Chill',
            'Funk & Soul',
            'Reggae & Dub'
        ];
        return musicGenres;
    }
    
    /**
     * Check if visualizer should be shown for a given genre
     */
    shouldShowVisualizerForGenre(genre) {
        if (!genre) return true; // Show for stations without genre
        
        const enabledGenres = this.data.preferences.visualizerGenres || this.getDefaultVisualizerGenres();
        
        // Get the category for this genre
        const category = typeof getGenreCategory === 'function' ? getGenreCategory(genre) : null;
        
        if (category) {
            return enabledGenres.includes(category);
        }
        
        // If no category match, check "Other"
        return enabledGenres.includes('Other');
    }
    
    /**
     * Update visualizer genres from checkboxes
     */
    updateVisualizerGenres() {
        const checkboxes = document.querySelectorAll('#visualizerGenreCheckboxes input[type="checkbox"]:checked');
        const selectedGenres = Array.from(checkboxes).map(cb => cb.value);
        this.setPreference('visualizerGenres', selectedGenres);
        window.dispatchEvent(new CustomEvent('visualizerGenresChanged', { detail: selectedGenres }));
    }
    
    /**
     * Escape HTML for safe display as text content. NOT safe inside an
     * attribute value (doesn't escape quotes) - use escapeAttr() for that.
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Escape a value for safe use inside an HTML attribute (also escapes
     * quotes) - e.g. the profile name inside `value="..."` below.
     */
    escapeAttr(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    
    /**
     * Load data from localStorage
     */
    load() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            return stored ? JSON.parse(stored) : {};
        } catch (e) {
            console.warn('Failed to load user data:', e);
            return {};
        }
    }
    
    /**
     * Save data to localStorage and trigger a debounced backend sync
     */
    save() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.data));

            // Best-effort, debounced push of displayName/customId/preferences
            // to the backend - never blocks the local save, never throws to
            // the caller. Favorites are NOT synced here - FavoritesController
            // is the sole source of truth for those (see favorites.js).
            if (this.apiClient && this.apiClient.syncEnabled) {
                if (this._syncPreferencesTimer) clearTimeout(this._syncPreferencesTimer);
                this._syncPreferencesTimer = setTimeout(() => {
                    const patch = { preferences: this.data.preferences };
                    if (this.data.displayName) patch.displayName = this.data.displayName;
                    if (this.data.customId) patch.customId = this.data.customId;
                    this.apiClient.updateProfile(patch).catch((error) => {
                        console.warn('⚠️ Failed to sync profile to backend:', error.message);
                    });
                }, 500);
            }
        } catch (e) {
            console.warn('Failed to save user data:', e);
        }
    }
    
    /**
     * Update preferences
     */
    setPreference(key, value) {
        this.data.preferences[key] = value;
        this.save();
    }
    
    /**
     * Get preference
     */
    getPreference(key) {
        return this.data.preferences[key];
    }
    
    /**
     * Apply theme to document
     */
    applyTheme(theme) {
        const validThemes = ['light', 'midnight', 'forest', 'purple', 'sunset', 'ocean', 'rosegold', 'rathore'];

        // Remove all theme classes
        document.body.classList.remove(
            'theme-light', 'theme-midnight', 'theme-forest',
            'theme-purple', 'theme-sunset', 'theme-ocean',
            'theme-rosegold', 'theme-rathore', 'light-theme'
        );

        // Apply new theme (if not default dark, and a known theme name)
        if (theme && theme !== 'dark' && validThemes.includes(theme)) {
            document.body.classList.add(`theme-${theme}`);
        }
        
        // Dispatch event for components that need to update
        window.dispatchEvent(new CustomEvent('themeChanged', { detail: theme }));
    }
    
    /**
     * Record station play
     */
    recordPlay(station) {
        if (!station) return;
        
        // End previous session if any
        this.endSession();
        
        // Start new session
        this.sessionStart = Date.now();
        this.currentStation = station;
        
        // Update last session
        this.data.lastSession = {
            stationId: station.id,
            stationName: station.name,
            timestamp: Date.now()
        };
        
        // Update history
        const historyEntry = this.data.history.find(h => h.stationId === station.id);
        if (historyEntry) {
            historyEntry.playCount++;
            historyEntry.lastPlayed = Date.now();
        } else {
            this.data.history.unshift({
                stationId: station.id,
                stationName: station.name,
                country: station.country,
                genre: station.genre,
                language: station.language,
                playCount: 1,
                lastPlayed: Date.now(),
                totalTime: 0
            });
        }
        
        // Keep only last 100 entries
        this.data.history = this.data.history.slice(0, 100);
        
        // Update genre stats
        if (station.genre) {
            this.data.genreStats[station.genre] = (this.data.genreStats[station.genre] || 0) + 1;
        }
        
        // Update country stats
        if (station.country) {
            this.data.countryStats[station.country] = (this.data.countryStats[station.country] || 0) + 1;
        }
        
        // Update language stats
        if (station.language) {
            this.data.languageStats[station.language] = (this.data.languageStats[station.language] || 0) + 1;
        }
        
        this.save();
    }
    
    /**
     * End current listening session
     */
    endSession() {
        if (this.sessionStart && this.currentStation) {
            const duration = Math.floor((Date.now() - this.sessionStart) / 1000);

            // Update total listening time
            this.data.totalListeningTime += duration;

            // Update station history time
            const historyEntry = this.data.history.find(h => h.stationId === this.currentStation.id);
            if (historyEntry) {
                historyEntry.totalTime += duration;
            }

            this.save();

            // Best-effort push to the backend's history/stats (see
            // POST /api/v1/history) - never blocks, never throws.
            if (duration > 0 && this.apiClient && this.apiClient.syncEnabled) {
                this.apiClient.addHistoryEntry({
                    stationId: this.currentStation.id,
                    genre: this.currentStation.genre || undefined,
                    country: this.currentStation.country || undefined,
                    durationSeconds: duration
                }).catch((error) => {
                    console.warn('⚠️ Failed to sync history entry to backend:', error.message);
                });
            }
        }

        this.sessionStart = null;
        this.currentStation = null;
    }
    
    /**
     * Get last played station ID
     */
    getLastStation() {
        return this.data.lastSession?.stationId || null;
    }
    
    // Favorites live solely in FavoritesController (favorites.js) now -
    // this used to be a second, independently-maintained store here
    // (addFavorite/removeFavorite/toggleFavorite/isFavorite/getFavorites),
    // kept in sync only by call-ordering convention in app.js's
    // handleFavoriteToggle(). Removed rather than fixed, per the plan:
    // one source of truth, not two synchronized ones.

    /**
     * Save current filters
     */
    saveFilters(filters) {
        this.data.savedFilters = { ...filters };
        this.save();
    }
    
    /**
     * Get saved filters
     */
    getSavedFilters() {
        return this.data.savedFilters;
    }
    
    /**
     * Get top genres (for recommendations)
     */
    getTopGenres(limit = 5) {
        return Object.entries(this.data.genreStats)
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([genre]) => genre);
    }
    
    /**
     * Get top countries (for recommendations)
     */
    getTopCountries(limit = 5) {
        return Object.entries(this.data.countryStats)
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([country]) => country);
    }
    
    /**
     * Get top languages
     */
    getTopLanguages(limit = 3) {
        return Object.entries(this.data.languageStats)
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([lang]) => lang);
    }
    
    /**
     * Get recently played stations
     */
    getRecentlyPlayed(limit = 10) {
        return this.data.history
            .sort((a, b) => b.lastPlayed - a.lastPlayed)
            .slice(0, limit);
    }
    
    /**
     * Get most played stations
     */
    getMostPlayed(limit = 10) {
        return this.data.history
            .sort((a, b) => b.playCount - a.playCount)
            .slice(0, limit);
    }
    
    /**
     * Get personalized recommendations based on listening history
     */
    getRecommendations(allStations, limit = 20) {
        if (this.data.history.length === 0) {
            // No history - return popular stations
            return allStations
                .filter(s => s.status === 'active')
                .sort((a, b) => (b.votes || 0) - (a.votes || 0))
                .slice(0, limit);
        }
        
        const topGenres = this.getTopGenres(3);
        const topCountries = this.getTopCountries(3);
        const topLanguages = this.getTopLanguages(2);
        const playedIds = new Set(this.data.history.map(h => h.stationId));
        const favoriteIds = new Set(window.favorites ? window.favorites.getFavoriteIds() : []);
        
        // Score each station
        const scored = allStations
            .filter(s => s.status === 'active' && !playedIds.has(s.id))
            .map(station => {
                let score = 0;
                
                // Genre match (highest weight)
                if (station.genre && topGenres.includes(station.genre)) {
                    score += 30 * (topGenres.length - topGenres.indexOf(station.genre));
                }
                
                // Country match
                if (station.country && topCountries.includes(station.country)) {
                    score += 20 * (topCountries.length - topCountries.indexOf(station.country));
                }
                
                // Language match
                if (station.language && topLanguages.includes(station.language)) {
                    score += 15 * (topLanguages.length - topLanguages.indexOf(station.language));
                }
                
                // Boost popular stations
                score += Math.min(10, (station.votes || 0) / 1000);
                
                // Small random factor for variety
                score += Math.random() * 5;
                
                return { station, score };
            })
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(item => item.station);
        
        return scored;
    }
    
    /**
     * Generate shareable data (encoded)
     */
    generateShareData() {
        const favoriteIds = window.favorites ? window.favorites.getFavoriteIds() : [];
        const shareData = {
            favorites: favoriteIds.slice(0, 50), // Limit to 50
            filters: this.data.savedFilters,
            theme: this.data.preferences.theme,
            currentStation: this.data.lastSession?.stationId
        };

        try {
            const encoded = btoa(JSON.stringify(shareData));
            return encoded;
        } catch (e) {
            console.error('Failed to encode share data:', e);
            return null;
        }
    }

    /**
     * Import shared data
     */
    importShareData(encoded) {
        try {
            const decoded = JSON.parse(atob(encoded));

            // Merge favorites (don't replace) - via FavoritesController,
            // the sole source of truth (also handles its own backend sync).
            let favoritesAdded = 0;
            if (decoded.favorites && Array.isArray(decoded.favorites) && window.favorites) {
                decoded.favorites.forEach(id => {
                    if (!window.favorites.isFavorite(id)) {
                        window.favorites.add(id);
                        favoritesAdded++;
                    }
                });
            }

            // Apply filters
            if (decoded.filters) {
                this.data.savedFilters = { ...this.data.savedFilters, ...decoded.filters };
            }

            // Apply theme if present and it's a known theme name
            const validThemes = ['dark', 'light', 'midnight', 'forest', 'purple', 'sunset', 'ocean', 'rosegold', 'rathore'];
            if (decoded.theme && validThemes.includes(decoded.theme)) {
                this.data.preferences.theme = decoded.theme;
            }

            this.save();

            return {
                success: true,
                currentStation: decoded.currentStation,
                favoritesAdded
            };
        } catch (e) {
            console.error('Failed to import share data:', e);
            return { success: false, error: e.message };
        }
    }
    
    /**
     * Get user stats for display
     */
    getStats() {
        const hours = Math.floor(this.data.totalListeningTime / 3600);
        const minutes = Math.floor((this.data.totalListeningTime % 3600) / 60);

        return {
            totalListeningTime: this.data.totalListeningTime,
            formattedTime: hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`,
            stationsPlayed: this.data.history.length,
            // Reads live from FavoritesController (the sole source of truth
            // now) instead of a second, independently-tracked count here -
            // this fixes the long-standing "stale/0 favoritesCount" bug
            // noted in PROJECT_REFERENCE.md's tech debt, as a side effect
            // of removing the duplicate store entirely rather than syncing it.
            favoritesCount: window.favorites ? window.favorites.getCount() : 0,
            topGenre: this.getTopGenres(1)[0] || 'None yet',
            topCountry: this.getTopCountries(1)[0] || 'None yet',
            memberSince: new Date(this.data.createdAt).toLocaleDateString()
        };
    }

    /**
     * Clear all user data
     */
    clearAll() {
        localStorage.removeItem(this.storageKey);
        this.data = {};
        location.reload();
    }
}

// Export for use in app.js
window.UserProfile = UserProfile;
