/**
 * mobile.js - Mobile Web Enhancements
 * Handles mobile-specific UI, navigation, and gestures
 */

class MobileHandler {
    constructor() {
        this.isMobile = window.innerWidth <= 768;
        this.isPlaying = false;
        this.currentStation = null;
        this.sidePanel = null;
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.swipeThreshold = 50;
        
        // Bind methods
        this.handleResize = this.handleResize.bind(this);
        this.handleTouchStart = this.handleTouchStart.bind(this);
        this.handleTouchEnd = this.handleTouchEnd.bind(this);
    }
    
    /**
     * Initialize mobile handler
     */
    init() {
        // Cache DOM elements
        this.sidePanel = document.getElementById('sidePanel');
        this.mobileHeader = document.getElementById('mobileHeader');
        this.mobileBottomNav = document.getElementById('mobileBottomNav');
        this.mobileMiniPlayer = document.getElementById('mobileMiniPlayer');
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Handle initial state
        this.handleResize();
        
        // Update mobile avatar
        this.updateMobileAvatar();
        
        console.log('Mobile handler initialized');
    }
    
    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Window resize
        window.addEventListener('resize', this.handleResize);
        
        // Mobile bottom nav buttons
        const navBtns = document.querySelectorAll('.mobile-nav-btn');
        navBtns.forEach(btn => {
            btn.addEventListener('click', (e) => this.handleNavClick(e));
        });
        
        // Mobile profile button
        const mobileProfileBtn = document.getElementById('mobileProfileBtn');
        mobileProfileBtn?.addEventListener('click', () => {
            if (window.app?.user) {
                window.app.user.showProfileModal();
            }
        });
        
        // Close panel button (mobile - in header)
        const closePanelBtn = document.getElementById('closePanelBtn');
        closePanelBtn?.addEventListener('click', () => {
            this.goToMap();
        });
        
        // Floating close button (mobile - always visible)
        const mobileCloseBtn = document.getElementById('mobileCloseBtn');
        mobileCloseBtn?.addEventListener('click', () => {
            this.goToMap();
        });
        
        // Mobile language button
        const mobileLanguageBtn = document.getElementById('mobileLanguageBtn');
        mobileLanguageBtn?.addEventListener('click', () => {
            if (window.app?.user) {
                window.app.user.showLanguageModal();
            }
        });
        
        // Mobile theme button
        const mobileThemeBtn = document.getElementById('mobileThemeBtn');
        mobileThemeBtn?.addEventListener('click', () => {
            const themeToggleBtn = document.getElementById('themeToggleBtn');
            themeToggleBtn?.click();
        });

        // Mobile share button
        const mobileShareBtn = document.getElementById('mobileShareBtn');
        mobileShareBtn?.addEventListener('click', () => {
            window.app?.showShareStationModal(window.app.state.currentStation);
        });

        // Mobile mini player play/pause
        const mobileMiniPlayPauseBtn = document.getElementById('mobileMiniPlayPauseBtn');
        mobileMiniPlayPauseBtn?.addEventListener('click', () => {
            const bottomPlayPauseBtn = document.getElementById('bottomPlayPauseBtn');
            bottomPlayPauseBtn?.click();
        });
        
        // Swipe gestures for side panel
        if (this.isMobile) {
            document.addEventListener('touchstart', this.handleTouchStart, { passive: true });
            document.addEventListener('touchend', this.handleTouchEnd, { passive: true });
        }
        
        // Listen for station changes
        window.addEventListener('stationChanged', (e) => this.updateMiniPlayer(e.detail));
        window.addEventListener('playStateChanged', (e) => this.updatePlayState(e.detail));
    }
    
    /**
     * Handle window resize
     */
    handleResize() {
        const wasMobile = this.isMobile;
        this.isMobile = window.innerWidth <= 768;
        
        // Toggle mobile-specific body class
        document.body.classList.toggle('is-mobile', this.isMobile);
        
        // If switching between mobile and desktop
        if (wasMobile !== this.isMobile) {
            if (this.isMobile) {
                // Switched to mobile
                this.enableMobileMode();
            } else {
                // Switched to desktop
                this.disableMobileMode();
            }
        }
    }
    
    /**
     * Enable mobile mode
     */
    enableMobileMode() {
        // Close side panel on mobile — also drop the desktop 'collapsed' state, which
        // has its own transform rule that would otherwise fight the mobile open/close CSS.
        this.sidePanel?.classList.remove('open', 'collapsed');
        document.body.classList.remove('panel-open', 'panel-collapsed');

        // Add touch event listeners
        document.addEventListener('touchstart', this.handleTouchStart, { passive: true });
        document.addEventListener('touchend', this.handleTouchEnd, { passive: true });
    }
    
    /**
     * Disable mobile mode
     */
    disableMobileMode() {
        // Remove touch event listeners
        document.removeEventListener('touchstart', this.handleTouchStart);
        document.removeEventListener('touchend', this.handleTouchEnd);
    }
    
    /**
     * Handle mobile nav button click
     */
    handleNavClick(e) {
        const btn = e.currentTarget;
        const tab = btn.dataset.tab;
        
        // Update active state
        document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        if (tab === 'map') {
            // Close side panel to show map
            this.closeSidePanel();
        } else {
            // Open side panel with specific tab
            this.openSidePanel(tab);
        }
    }
    
    /**
     * Open side panel on mobile
     */
    openSidePanel(tabName) {
        if (!this.sidePanel) return;

        // 'collapsed'/'panel-collapsed' are the desktop collapse/expand state and can be
        // left over from a saved desktop preference — body.panel-collapsed .side-panel
        // sets its own transform that takes effect independently of the mobile 'open'
        // positioning, otherwise keeping the panel hidden off-screen despite 'open' being set.
        this.sidePanel.classList.remove('collapsed');
        document.body.classList.remove('panel-collapsed');
        this.sidePanel.classList.add('open');
        document.body.classList.add('panel-open');
        
        // Switch to the specified tab
        if (tabName) {
            const tabBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
            tabBtn?.click();
        }
    }
    
    /**
     * Close side panel on mobile
     */
    closeSidePanel() {
        if (!this.sidePanel) return;
        
        this.sidePanel.classList.remove('open');
        document.body.classList.remove('panel-open');
    }
    
    /**
     * Go to map view - close panel and update nav
     */
    goToMap() {
        this.closeSidePanel();
        
        // Update nav button states
        document.querySelectorAll('.mobile-nav-btn').forEach(b => b.classList.remove('active'));
        const mapBtn = document.querySelector('.mobile-nav-btn[data-tab="map"]');
        mapBtn?.classList.add('active');
    }
    
    /**
     * Handle touch start for swipe detection
     */
    handleTouchStart(e) {
        this.touchStartX = e.touches[0].clientX;
        this.touchStartY = e.touches[0].clientY;
    }
    
    /**
     * Handle touch end for swipe detection
     */
    handleTouchEnd(e) {
        if (!this.isMobile) return;
        
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        
        const deltaX = touchEndX - this.touchStartX;
        const deltaY = touchEndY - this.touchStartY;
        
        // Only handle horizontal swipes
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > this.swipeThreshold) {
            if (deltaX < 0) {
                // Swipe left - close panel
                this.closeSidePanel();
            } else if (deltaX > 0 && this.touchStartX < 50) {
                // Swipe right from edge - open panel on the currently active tab
                const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab || 'popular';
                this.openSidePanel(activeTab);
            }
        }
    }
    
    /**
     * Update mobile mini player
     */
    updateMiniPlayer(station) {
        this.currentStation = station;
        
        const nameEl = document.getElementById('mobileMiniPlayerName');
        const locationEl = document.getElementById('mobileMiniPlayerLocation');
        
        if (station) {
            if (nameEl) nameEl.textContent = station.name || 'Unknown Station';
            if (locationEl) locationEl.textContent = [station.city, station.country].filter(Boolean).join(', ');
            document.body.classList.add('player-active');
        } else {
            if (nameEl) nameEl.textContent = t('noStationPlaying');
            if (locationEl) locationEl.textContent = '';
            document.body.classList.remove('player-active');
        }
    }
    
    /**
     * Update play state
     */
    updatePlayState(isPlaying) {
        this.isPlaying = isPlaying;
        
        const playIcon = document.querySelector('#mobileMiniPlayPauseBtn .play-icon');
        const pauseIcon = document.querySelector('#mobileMiniPlayPauseBtn .pause-icon');
        
        if (playIcon && pauseIcon) {
            playIcon.hidden = isPlaying;
            pauseIcon.hidden = !isPlaying;
        }
    }
    
    /**
     * Update mobile avatar initials
     */
    updateMobileAvatar() {
        const mobileAvatarEl = document.getElementById('mobileAvatarInitials');
        const desktopAvatarEl = document.getElementById('userAvatarInitials');

        if (mobileAvatarEl && desktopAvatarEl) {
            // innerHTML (not textContent) - the desktop element may contain
            // a Google photo <img>, not just initials text.
            mobileAvatarEl.innerHTML = desktopAvatarEl.innerHTML;
            mobileAvatarEl.classList.toggle('has-photo', desktopAvatarEl.classList.contains('has-photo'));
        }
    }
}

// Create and export instance
window.MobileHandler = MobileHandler;

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.mobileHandler = new MobileHandler();
    window.mobileHandler.init();
});
