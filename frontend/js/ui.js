/**
 * ui.js - UI Rendering and Management
 * Handles DOM updates, tab switching, station cards, toasts, and theme
 */

class UIController {
    constructor() {
        this.currentTab = 'explore';
        this.theme = 'dark';
        this.toastTimeout = null;
        this.toastQueue = [];
        
        this.init();
    }
    
    /**
     * Initialize UI
     */
    init() {
        // Load theme preference
        this.loadTheme();
        
        // Setup tab switching
        this.setupTabs();
        
        // Setup mobile panel
        this.setupMobilePanel();
    }
    
    /**
     * Setup tab navigation
     */
    setupTabs() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        const tabPanes = document.querySelectorAll('.tab-pane');
        
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabName = button.getAttribute('data-tab');
                this.switchTab(tabName);
            });
        });
    }
    
    /**
     * Switch to a specific tab
     */
    switchTab(tabName) {
        this.currentTab = tabName;
        
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            const isActive = btn.getAttribute('data-tab') === tabName;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-selected', isActive);
        });
        
        // Update tab panes
        document.querySelectorAll('.tab-pane').forEach(pane => {
            const paneId = pane.id.replace('Tab', '');
            const isActive = paneId === tabName;
            pane.classList.toggle('active', isActive);
            pane.hidden = !isActive;
        });
        
        // Update map markers based on active tab
        if (window.app?.globe?.updateDisplayedStations) {
            if (tabName === 'search') {
                // Show search filter results on map
                if (!window.app.search?.currentResults?.length) {
                    window.app.search?.applyFilters?.();
                }
                const searchResults = window.app.search?.currentResults || window.app.stations || [];
                window.app.globe.updateDisplayedStations(searchResults);
            } else {
                // Show all enabled stations for other tabs
                window.app.globe.updateDisplayedStations(window.app.stations || []);
            }
        }
        
        // Emit tab change event
        window.dispatchEvent(new CustomEvent('tabChanged', { detail: { tab: tabName } }));
    }
    
    /**
     * Setup mobile panel toggle
     */
    setupMobilePanel() {
        const panel = document.getElementById('sidePanel');
        const closeBtn = document.getElementById('closePanelBtn');
        const expandBtn = document.getElementById('mobileExpandBtn');
        
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                panel.classList.remove('open');
            });
        }
        
        if (expandBtn) {
            expandBtn.addEventListener('click', () => {
                panel.classList.add('open');
                this.switchTab('nowPlaying');
            });
        }
    }
    
    /**
     * Render station list in a container
     */
    renderStationList(container, stations, options = {}) {
        const {
            showPlayingIndicator = true,
            currentStationId = null,
            favorites = [],
            onStationClick = null,
            onFavoriteToggle = null
        } = options;
        
        if (!stations || stations.length === 0) {
            container.innerHTML = `
                <div class="no-station">
                    <p>No stations found</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = stations.map(station => {
            const isPlaying = station.id === currentStationId;
            const isFavorite = favorites.includes(station.id);
            const baseStatus = station.status || 'active';
            
            // Check if station only has HTTP streams (no HTTPS)
            const isHttpOnly = this.isHttpOnlyStation(station);
            const status = isHttpOnly ? 'http' : baseStatus;
            const statusClass = `status-${baseStatus}`;
            const hasFavicon = station.favicon && station.favicon.length > 5 && this.isSafeUrl(station.favicon);
            const votes = station.votes || 0;
            const votesDisplay = votes > 1000 ? `${(votes/1000).toFixed(1)}k` : votes;
            
            // Get coordinate precision info
            const coordsInfo = this.getCoordsPrecisionInfo(station);
            
            return `
                <div class="station-card ${isPlaying ? 'playing' : ''} ${statusClass}" data-station-id="${this.escapeAttr(station.id)}">
                    <div class="station-card-header">
                        ${hasFavicon ? `
                            <div class="station-card-icon">
                                <img src="${this.escapeAttr(station.favicon)}" alt=""
                                     onerror="this.parentElement.innerHTML='<div class=\\'station-card-icon-placeholder\\'>${this.escapeAttr(station.name.charAt(0).toUpperCase())}</div>'"
                                     loading="lazy">
                            </div>
                        ` : `
                            <div class="station-card-icon">
                                <div class="station-card-icon-placeholder">${this.escapeHtml(station.name.charAt(0).toUpperCase())}</div>
                            </div>
                        `}
                        <div class="station-card-info">
                            <div class="station-card-name-row">
                                <span class="station-card-name">${this.escapeHtml(station.name)}</span>
                                <span class="status-indicator status-${status}" title="${this.escapeAttr(this.getStatusLabel(status))}"></span>
                            </div>
                            <div class="station-card-location">
                                ${this.escapeHtml(station.city)}, ${this.escapeHtml(station.country)}
                            </div>
                        </div>
                        <div class="station-card-actions">
                            <button class="icon-btn favorite-btn ${isFavorite ? 'active' : ''}"
                                    data-station-id="${this.escapeAttr(station.id)}"
                                    aria-label="${isFavorite ? 'Remove from favorites' : 'Add to favorites'}"
                                    title="${isFavorite ? 'Remove from favorites' : 'Add to favorites'} (F)">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="${isFavorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div class="station-card-meta">
                        ${station.genre ? `<span class="badge badge-genre">${this.escapeHtml(station.genre)}</span>` : ''}
                        ${station.language ? `<span class="badge badge-language">${this.escapeHtml(station.language)}</span>` : ''}
                        ${votes > 0 ? `<span class="badge badge-votes" title="${votes} votes">★ ${votesDisplay}</span>` : ''}
                        ${station.streams?.[0]?.type === 'web-player' ? `<span class="badge badge-webplayer" title="Web-based player with global synchronization">🌍 Sync</span>` : ''}
                        <span class="badge badge-coords ${coordsInfo.class}" title="${this.escapeAttr(coordsInfo.tooltip)}">${coordsInfo.icon}</span>
                    </div>
                </div>
            `;
        }).join('');
        
        // Attach event listeners
        container.querySelectorAll('.station-card').forEach(card => {
            const stationId = card.getAttribute('data-station-id');
            const station = stations.find(s => s.id === stationId);
            
            card.addEventListener('click', (e) => {
                // Don't trigger if clicking favorite button
                if (!e.target.closest('.favorite-btn')) {
                    if (onStationClick) {
                        onStationClick(station);
                    }
                }
            });
        });
        
        container.querySelectorAll('.favorite-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const stationId = btn.getAttribute('data-station-id');
                if (onFavoriteToggle) {
                    onFavoriteToggle(stationId);
                }
            });
        });
    }
    
    /**
     * Render now playing detail view
     */
    renderNowPlaying(station, isPlaying, volume, isFavorite) {
        const container = document.getElementById('nowPlayingContent');
        if (!container) return;

        if (!station) {
            container.innerHTML = `
                <div class="no-station">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="2"/>
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                    </svg>
                    <p>${t('noStationPlaying')}</p>
                    <p class="help-text">${t('selectStation')}</p>
                </div>
            `;
            return;
        }

        const currentStream = station.streams?.[0];
        const isWebPlayer = currentStream?.type === 'web-player';
        const streamType = isWebPlayer ? 'WEB PLAYER' : (currentStream?.type ? currentStream.type.split('/')[1].toUpperCase() : 'AUDIO');
        const isHttpOnly = this.isHttpOnlyStation(station);
        
        container.innerHTML = `
            <div class="now-playing-detail">
                <div class="now-playing-visual ${isPlaying ? 'playing' : ''}">
                    <div class="equalizer ${isPlaying ? '' : 'paused'}" id="nowPlayingEqualizer">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                </div>
                
                <h2 class="now-playing-title">${this.escapeHtml(station.name)}</h2>
                <div class="now-playing-location">
                    ${this.escapeHtml(station.city)}, ${this.escapeHtml(station.country)}
                </div>
                
                <div class="now-playing-controls">
                    <button id="nowPlayingPlayPause" class="play-pause-btn" aria-label="${isPlaying ? 'Pause' : 'Play'}">
                        ${isPlaying ? `
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                                <rect x="6" y="4" width="4" height="16"/>
                                <rect x="14" y="4" width="4" height="16"/>
                            </svg>
                        ` : `
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                                <polygon points="5 3 19 12 5 21 5 3"/>
                            </svg>
                        `}
                    </button>
                    <button id="nowPlayingFavoriteBtn" class="icon-btn now-playing-favorite-btn ${isFavorite ? 'active' : ''}" aria-label="${isFavorite ? 'Remove from favorites' : 'Add to favorites'}" title="${isFavorite ? 'Remove from favorites' : 'Add to favorites'}">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="${isFavorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                        </svg>
                    </button>
                    <button id="nowPlayingShareBtn" class="icon-btn now-playing-share-btn" aria-label="Share this station" title="Share this station">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="18" cy="5" r="3"/>
                            <circle cx="6" cy="12" r="3"/>
                            <circle cx="18" cy="19" r="3"/>
                            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                        </svg>
                    </button>
                </div>

                <div class="volume-control" ${isWebPlayer ? 'style="display:none"' : ''}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
                    </svg>
                    <input type="range" id="volumeSlider" class="volume-slider"
                           min="0" max="100" value="${Math.round(volume * 100)}"
                           aria-label="Volume">
                    <button id="muteBtn" class="icon-btn" aria-label="Mute">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                            <line x1="23" y1="9" x2="17" y2="15"/>
                            <line x1="17" y1="9" x2="23" y2="15"/>
                        </svg>
                    </button>
                </div>
                
                <div class="now-playing-info">
                    ${isWebPlayer ? `
                        <div class="info-row">
                            <span class="info-label">Sync Type</span>
                            <span class="info-value">🌍 Global UTC Synchronized</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Listeners</span>
                            <span class="info-value">Unlimited (Worldwide)</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Uptime</span>
                            <span class="info-value">24/7 Continuous</span>
                        </div>
                    ` : ``}
                    <div class="info-row">
                        <span class="info-label">Genre</span>
                        <span class="info-value">${this.escapeHtml(station.genre || 'N/A')}</span>
                    </div>
                    ${false ? `` : ''}
                </div>
            </div>
        `;
    }
    
    /**
     * Update mobile player
     */
    updateMobilePlayer(station, isPlaying) {
        const mobilePlayer = document.getElementById('mobilePlayer');
        if (!mobilePlayer) return;
        
        const stationName = mobilePlayer.querySelector('.mobile-player-station');
        const location = mobilePlayer.querySelector('.mobile-player-location');
        const playIcon = mobilePlayer.querySelector('.play-icon');
        const pauseIcon = mobilePlayer.querySelector('.pause-icon');
        const equalizer = document.getElementById('mobileEqualizer');
        
        if (station) {
            mobilePlayer.hidden = false;
            if (stationName) stationName.textContent = station.name;
            if (location) location.textContent = `${station.city}, ${station.country}`;
            
            if (isPlaying) {
                if (playIcon) playIcon.hidden = true;
                if (pauseIcon) pauseIcon.hidden = false;
                equalizer?.classList.remove('paused');
            } else {
                if (playIcon) playIcon.hidden = false;
                if (pauseIcon) pauseIcon.hidden = true;
                equalizer?.classList.add('paused');
            }
        } else {
            mobilePlayer.hidden = true;
        }
    }
    
    /**
     * Show picker when multiple stations share the same map marker
     */
    showStationPicker(stations, clientX, clientY, onSelect) {
        this.closeStationPicker();

        if (!stations?.length) return;

        const picker = document.createElement('div');
        picker.id = 'stationPicker';
        picker.className = 'station-picker';
        picker.innerHTML = `
            <div class="station-picker-header">
                <span>${stations.length} stations here</span>
                <button type="button" class="station-picker-close" aria-label="Close">×</button>
            </div>
            <div class="station-picker-list">
                ${stations.map(station => {
                    const isInactive = station._statusWarn === true;
                    const httpBadge = typeof isHttpOnlyStation === 'function' && isHttpOnlyStation(station)
                        ? '<span class="badge badge-status badge-http">HTTP</span>' : '';
                    const offlineBadge = isInactive
                        ? '<span class="badge badge-status badge-offline">● offline</span>' : '';
                    return `
                        <button type="button" class="station-picker-item${isInactive ? ' station-picker-item--inactive' : ''}" data-station-id="${this.escapeAttr(station.id)}">
                            <span class="station-picker-name">${this.escapeHtml(station.name)}</span>
                            <span class="station-picker-meta">${this.escapeHtml(station.city || '')}${station.city && station.country ? ', ' : ''}${this.escapeHtml(station.country || '')} ${httpBadge}${offlineBadge}</span>
                        </button>
                    `;
                }).join('')}
            </div>
        `;

        document.body.appendChild(picker);

        const margin = 12;
        const rect = picker.getBoundingClientRect();
        let left = clientX + margin;
        let top = clientY + margin;
        if (left + rect.width > window.innerWidth - margin) {
            left = clientX - rect.width - margin;
        }
        if (top + rect.height > window.innerHeight - margin) {
            top = clientY - rect.height - margin;
        }
        picker.style.left = `${Math.max(margin, left)}px`;
        picker.style.top = `${Math.max(margin, top)}px`;

        const close = () => this.closeStationPicker();
        picker.querySelector('.station-picker-close')?.addEventListener('click', close);

        picker.querySelectorAll('.station-picker-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const station = stations.find(s => s.id === btn.dataset.stationId);
                close();
                if (station && onSelect) {
                    onSelect(station);
                }
            });
        });

        this._stationPickerOutsideClick = (event) => {
            if (!picker.contains(event.target)) {
                close();
            }
        };
        setTimeout(() => {
            document.addEventListener('click', this._stationPickerOutsideClick);
        }, 0);
    }

    closeStationPicker() {
        document.getElementById('stationPicker')?.remove();
        if (this._stationPickerOutsideClick) {
            document.removeEventListener('click', this._stationPickerOutsideClick);
            this._stationPickerOutsideClick = null;
        }
    }

    /**
     * Show toast notification
     */
    showToast(options) {
        const {
            type = 'info', // 'info', 'success', 'warning', 'error'
            title = '',
            message = '',
            duration = 5000,
            action = null,
            actionLabel = 'Try Another',
            secondaryAction = null,
            secondaryActionLabel = 'Retry'
        } = options;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const iconSvg = this.getToastIcon(type);

        const actionsHtml = (action || secondaryAction) ? `
            <div class="toast-actions">
                ${secondaryAction ? `<button class="toast-action toast-action-secondary" data-action="${secondaryAction}">${this.escapeHtml(secondaryActionLabel)}</button>` : ''}
                ${action ? `<button class="toast-action" data-action="${action}">${this.escapeHtml(actionLabel)}</button>` : ''}
            </div>
        ` : '';

        toast.innerHTML = `
            ${iconSvg}
            <div class="toast-content">
                ${title ? `<div class="toast-title">${this.escapeHtml(title)}</div>` : ''}
                <div>${this.escapeHtml(message)}</div>
                ${actionsHtml}
            </div>
            <button class="toast-close" aria-label="Close">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/>
                    <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        `;

        const container = document.getElementById('toastContainer');
        container.appendChild(toast);

        // Close button
        const closeBtn = toast.querySelector('.toast-close');
        closeBtn.addEventListener('click', () => {
            this.removeToast(toast);
        });

        // Action buttons
        toast.querySelectorAll('.toast-action').forEach(btn => {
            btn.addEventListener('click', () => {
                window.dispatchEvent(new CustomEvent('toastAction', { detail: btn.dataset.action }));
                this.removeToast(toast);
            });
        });
        
        // Auto-remove after duration (with hover pause)
        if (duration > 0) {
            let timeoutId = null;
            let remainingTime = duration;
            let startTime = Date.now();
            
            const startTimer = () => {
                startTime = Date.now();
                timeoutId = setTimeout(() => {
                    this.removeToast(toast);
                }, remainingTime);
            };
            
            const pauseTimer = () => {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                    remainingTime -= (Date.now() - startTime);
                }
            };
            
            // Pause on hover
            toast.addEventListener('mouseenter', pauseTimer);
            toast.addEventListener('mouseleave', startTimer);
            
            // Start timer
            startTimer();
        }
        
        return toast;
    }
    
    /**
     * Get icon for toast type
     */
    getToastIcon(type) {
        const icons = {
            info: '<svg class="toast-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
            success: '<svg class="toast-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
            warning: '<svg class="toast-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
            error: '<svg class="toast-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
        };
        
        return icons[type] || icons.info;
    }
    
    /**
     * Remove toast
     */
    removeToast(toast) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => {
            toast.remove();
        }, 300);
    }
    
    /**
     * Toggle theme between light and dark (or current theme)
     */
    toggleTheme() {
        // Get current theme from user profile or body class
        const currentTheme = this.getCurrentTheme();
        
        // Toggle between light and dark
        const newTheme = this.isLightTheme(currentTheme) ? 'rathore' : 'light';
        
        // Apply via user profile system if available
        if (window.app && window.app.user) {
            window.app.user.setPreference('theme', newTheme);
            window.app.user.applyTheme(newTheme);
        } else {
            // Fallback: apply directly
            this.applyThemeClass(newTheme);
        }
        
        this.updateThemeIcons(newTheme);
        return newTheme;
    }
    
    /**
     * Get current theme
     */
    getCurrentTheme() {
        if (window.app && window.app.user) {
            return window.app.user.getPreference('theme') || 'rathore';
        }
        // Fallback: check body classes
        const classList = document.body.classList;
        if (classList.contains('theme-light')) return 'light';
        if (classList.contains('theme-midnight')) return 'midnight';
        if (classList.contains('theme-forest')) return 'forest';
        if (classList.contains('theme-purple')) return 'purple';
        if (classList.contains('theme-sunset')) return 'sunset';
        if (classList.contains('theme-ocean')) return 'ocean';
        if (classList.contains('theme-rosegold')) return 'rosegold';
        if (classList.contains('theme-rathore')) return 'rathore';
        return 'dark';
    }
    
    /**
     * Check if theme is a light theme
     */
    isLightTheme(theme) {
        return theme === 'light';
    }
    
    /**
     * Apply theme class directly
     */
    applyThemeClass(theme) {
        document.body.classList.remove(
            'theme-light', 'theme-midnight', 'theme-forest', 
            'theme-purple', 'theme-sunset', 'theme-ocean', 
            'theme-rosegold', 'theme-rathore', 'light-theme'
        );
        if (theme && theme !== 'dark') {
            document.body.classList.add(`theme-${theme}`);
        }
    }
    
    /**
     * Update theme toggle icons
     */
    updateThemeIcons(theme) {
        const sunIcon = document.querySelector('#themeToggleBtn .sun-icon');
        const moonIcon = document.querySelector('#themeToggleBtn .moon-icon');
        
        if (this.isLightTheme(theme)) {
            // Show moon icon in light mode (to indicate switching to dark)
            if (sunIcon) sunIcon.style.display = 'none';
            if (moonIcon) moonIcon.style.display = 'block';
        } else {
            // Show sun icon in dark mode (to indicate switching to light)
            if (sunIcon) sunIcon.style.display = 'block';
            if (moonIcon) moonIcon.style.display = 'none';
        }
    }
    
    /**
     * Apply theme (called on init)
     */
    applyTheme() {
        const theme = this.getCurrentTheme();
        this.updateThemeIcons(theme);
    }
    
    /**
     * Load theme preference and update icons
     */
    loadTheme() {
        // Wait a bit for user profile to be ready, then update icons
        setTimeout(() => {
            const theme = this.getCurrentTheme();
            this.updateThemeIcons(theme);
        }, 100);
    }
    
    /**
     * Escape HTML to prevent XSS. Delegates to stations-utils.js's shared
     * implementation so this can't silently diverge from search.js's copy
     * again (it previously did: this one returned the literal string
     * "undefined" for a null/undefined input where search.js's didn't).
     */
    escapeHtml(text) {
        return escapeHtml(text);
    }

    /**
     * Escape a value for safe use inside an HTML attribute (also escapes
     * quotes). Delegates to stations-utils.js's shared implementation.
     */
    escapeAttr(str) {
        return escapeAttr(str);
    }

    /**
     * Only allow http(s) URLs to be used in href/src attributes (blocks
     * javascript:/data: injection). Delegates to stations-utils.js.
     */
    isSafeUrl(url) {
        return isSafeUrl(url);
    }

    /**
     * Get human-readable status label
     */
    getStatusLabel(status) {
        const labels = {
            'active': 'Active',
            'inactive': 'Offline',
            'unverified': 'Unverified',
            'down': 'Down',
            'http': 'HTTP Only'
        };
        return labels[status] || status;
    }
    
    /**
     * Check if station only has HTTP streams (no HTTPS)
     */
    isHttpOnlyStation(station) {
        return isHttpOnlyStation(station);
    }
    
    /**
     * Check if station has valid geographic coordinates
     * (0,0) is "Null Island" and indicates missing/unknown location
     */
    hasValidCoordinates(station) {
        if (!station) return false;
        
        const lat = station.lat;
        const lng = station.lng;
        
        // Must be numbers
        if (typeof lat !== 'number' || typeof lng !== 'number') return false;
        
        // Must not be NaN
        if (isNaN(lat) || isNaN(lng)) return false;
        
        // (0,0) is "Null Island" - typically means unknown location
        if (lat === 0 && lng === 0) return false;
        
        // Valid latitude range: -90 to 90
        if (lat < -90 || lat > 90) return false;
        
        // Valid longitude range: -180 to 180
        if (lng < -180 || lng > 180) return false;
        
        return true;
    }
    
    /**
     * Get coordinate precision info for display
     * Returns icon, class, and tooltip based on coordsPrecision field
     */
    getCoordsPrecisionInfo(station) {
        // Default for missing station
        if (!station) {
            return { icon: '⊘', class: 'badge-coords-unknown', tooltip: 'No location data' };
        }
        
        const precision = station.coordsPrecision || '';
        const lat = station.lat;
        const lng = station.lng;
        const source = station.coordsSource || '';
        
        // Format coordinates safely
        const formatCoord = (val) => {
            if (typeof val === 'number' && !isNaN(val)) {
                return val.toFixed(2);
            }
            return '?';
        };
        
        if (precision === 'precise') {
            return {
                icon: '📍',
                class: 'badge-coords-precise',
                tooltip: `Precise location (${formatCoord(lat)}, ${formatCoord(lng)})`
            };
        }
        
        if (precision === 'approximate') {
            return {
                icon: '📌',
                class: 'badge-coords-approximate',
                tooltip: source ? `${source} (${formatCoord(lat)}, ${formatCoord(lng)})` : `Approximate (${formatCoord(lat)}, ${formatCoord(lng)})`
            };
        }
        
        // Fallback: check if has valid coordinates
        if (this.hasValidCoordinates(station)) {
            return {
                icon: '📍',
                class: 'badge-coords-precise',
                tooltip: `Location (${formatCoord(lat)}, ${formatCoord(lng)})`
            };
        }
        
        return {
            icon: '⊘',
            class: 'badge-coords-unknown',
            tooltip: 'No location available'
        };
    }
    
    /**
     * Show loading screen
     */
    showLoading() {
        document.getElementById('loadingScreen').classList.remove('hidden');
    }
    
    /**
     * Hide loading screen
     */
    hideLoading() {
        const loading = document.getElementById('loadingScreen');
        loading.classList.add('hidden');
    }
    
    /**
     * Update UI based on window size
     */
    updateResponsive() {
        const isMobile = window.innerWidth <= 768;
        // Add any responsive-specific logic here
    }
}

// Export for use in app.js
window.UIController = UIController;
