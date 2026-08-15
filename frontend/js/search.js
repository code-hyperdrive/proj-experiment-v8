/**
 * search.js - Search and Filtering
 * Implements in-memory search index with typeahead and advanced filtering for stations
 */

// Genre Categories Configuration
const GENRE_CATEGORIES = {
    "Pop": {
        icon: "🎤",
        keywords: ["pop", "top 40", "charts", "hits", "mainstream", "adult contemporary", "contemporary hit"]
    },
    "Rock": {
        icon: "🎸",
        keywords: ["rock", "classic rock", "hard rock", "soft rock", "alternative", "indie", "punk", "metal", "grunge", "progressive"]
    },
    "Electronic": {
        icon: "🎧",
        keywords: ["electronic", "edm", "dance", "techno", "house", "trance", "dubstep", "electro", "drum and bass", "dnb", "synthwave"]
    },
    "Hip-Hop & R&B": {
        icon: "🎤",
        keywords: ["hip hop", "hip-hop", "hiphop", "rap", "r&b", "rnb", "urban", "trap", "soul"]
    },
    "Jazz & Blues": {
        icon: "🎷",
        keywords: ["jazz", "smooth jazz", "blues", "swing", "bebop", "fusion"]
    },
    "Classical": {
        icon: "🎻",
        keywords: ["classical", "orchestra", "opera", "symphony", "baroque", "chamber", "piano"]
    },
    "Country & Folk": {
        icon: "🤠",
        keywords: ["country", "bluegrass", "americana", "folk", "acoustic", "singer-songwriter"]
    },
    "World Music": {
        icon: "🌍",
        keywords: ["world", "latin", "reggae", "african", "indian", "hindi", "arabic", "asian", "caribbean", "salsa", "brazilian", "french", "german", "spanish", "russian"]
    },
    "News & Talk": {
        icon: "📰",
        keywords: ["news", "talk", "sports", "politics", "business", "information", "public radio", "npr"]
    },
    "Religious": {
        icon: "🙏",
        keywords: ["religious", "christian", "gospel", "worship", "islamic", "quran", "spiritual", "devotional"]
    },
    "Decades": {
        icon: "📅",
        keywords: ["60s", "70s", "80s", "90s", "00s", "oldies", "retro", "vintage", "golden"]
    },
    "Ambient & Chill": {
        icon: "😌",
        keywords: ["ambient", "chill", "chillout", "lounge", "relaxation", "meditation", "sleep", "spa", "new age", "easy listening"]
    },
    "Funk & Soul": {
        icon: "🕺",
        keywords: ["funk", "soul", "disco", "motown", "groove"]
    },
    "Reggae & Dub": {
        icon: "🇯🇲",
        keywords: ["reggae", "dub", "ska", "dancehall", "roots"]
    }
};

/**
 * Get the category for a given genre string
 * @param {string} genre - The station's genre
 * @returns {string|null} - The category name or null
 */
function getGenreCategory(genre) {
    if (!genre) return null;
    const lower = genre.toLowerCase();
    
    for (const [category, config] of Object.entries(GENRE_CATEGORIES)) {
        for (const keyword of config.keywords) {
            if (lower.includes(keyword)) {
                return category;
            }
        }
    }
    return null; // No category match
}

class SearchController {
    constructor(stations) {
        this.allStations = stations || [];
        this.stations = [];
        this.index = [];
        this.searchInput = document.getElementById('searchInput');
        this.searchResults = document.getElementById('searchResults');
        this.stationList = document.getElementById('searchStations');
        this.currentResults = [];
        this.selectedIndex = -1;
        this.debounceTimer = null;
        this.debounceDelay = 150; // ms
        
        // Pagination
        this.currentPage = 1;
        this.pageSize = 30;
        
        // Sorting
        this.sortField = 'votes';
        this.sortOrder = 'desc'; // 'asc' or 'desc'
        
        // View mode
        this.viewMode = 'cards';
        
        // Filter state
        this.filters = {
            region: '',
            country: '',
            genre: '',
            language: '',
            status: ''
        };
        
        // Region to countries mapping
        this.regionMap = {
            'africa': ['South Africa', 'Egypt', 'Nigeria', 'Kenya', 'Morocco', 'Ghana', 'Ethiopia', 'Tanzania'],
            'asia': ['Japan', 'South Korea', 'China', 'India', 'Thailand', 'Singapore', 'Philippines', 'Indonesia', 'Vietnam', 'Malaysia', 'Taiwan', 'Hong Kong'],
            'europe': ['United Kingdom', 'France', 'Germany', 'Italy', 'Spain', 'Netherlands', 'Belgium', 'Austria', 'Switzerland', 'Sweden', 'Norway', 'Denmark', 'Finland', 'Poland', 'Czech Republic', 'Ireland', 'Portugal', 'Greece', 'Russia', 'Ukraine', 'Hungary', 'Romania'],
            'north-america': ['United States', 'Canada', 'Mexico'],
            'south-america': ['Brazil', 'Argentina', 'Chile', 'Peru', 'Colombia', 'Venezuela', 'Ecuador', 'Uruguay'],
            'oceania': ['Australia', 'New Zealand', 'Fiji'],
            'middle-east': ['United Arab Emirates', 'Israel', 'Turkey', 'Saudi Arabia', 'Qatar', 'Lebanon', 'Jordan', 'Kuwait']
        };
        
        this.applyStationPool();
        this.attachEventListeners();
        this.initializeFilters();
        this.initializeControls();
        this.updateStats();
        // Don't call applyFilters here - wait for app to fully initialize
        // It will be called when setStations is called or when user interacts
    }
    
    /**
     * Build search index for fast lookups
     */
    buildIndex() {
        this.index = this.stations.map(station => ({
            id: station.id,
            station: station,
            searchText: [
                station.name,
                station.city,
                station.country,
                station.genre || '',
                station.language || '',
                ...(station.tags || [])
            ].join(' ').toLowerCase()
        }));
        
        console.log(`📇 Built search index for ${this.index.length} stations`);
    }
    
    /**
     * Initialize filter dropdowns and event listeners
     */
    initializeFilters() {
        // Populate country dropdown
        this.populateCountryFilter();
        
        // Populate genre dropdown
        this.populateGenreFilter();
        
        // Populate language dropdown
        this.populateLanguageFilter();
        
        // Filter toggle button
        const filterToggleBtn = document.getElementById('filterToggleBtn');
        const filterPanel = document.getElementById('filterPanel');
        
        if (filterToggleBtn && filterPanel) {
            filterToggleBtn.addEventListener('click', () => {
                const isExpanded = filterToggleBtn.getAttribute('aria-expanded') === 'true';
                filterToggleBtn.setAttribute('aria-expanded', !isExpanded);
                filterPanel.hidden = isExpanded;
            });
        }
        
        // Clear all filters button
        const clearFiltersBtn = document.getElementById('clearFiltersBtn');
        if (clearFiltersBtn) {
            clearFiltersBtn.addEventListener('click', () => {
                this.clearAllFilters();
            });
        }
        
        // Region filter
        const regionFilter = document.getElementById('regionFilter');
        if (regionFilter) {
            regionFilter.addEventListener('change', (e) => {
                this.filters.region = e.target.value;
                // Reset country filter when region changes
                this.filters.country = '';
                const countryEl = document.getElementById('countryFilter');
                if (countryEl) countryEl.value = '';
                this.populateCountryFilter();
                this.applyFilters();
            });
        }
        
        // Country filter
        const countryFilter = document.getElementById('countryFilter');
        if (countryFilter) {
            countryFilter.addEventListener('change', (e) => {
                this.filters.country = e.target.value;
                this.applyFilters();
            });
        }
        
        // Genre filter
        const genreFilter = document.getElementById('genreFilter');
        if (genreFilter) {
            genreFilter.addEventListener('change', (e) => {
                this.filters.genre = e.target.value;
                this.applyFilters();
            });
        }
        
        // Language filter
        const languageFilter = document.getElementById('languageFilter');
        if (languageFilter) {
            languageFilter.addEventListener('change', (e) => {
                this.filters.language = e.target.value;
                this.applyFilters();
            });
        }
        
        // Status filter
        const statusFilter = document.getElementById('statusFilter');
        if (statusFilter) {
            statusFilter.addEventListener('change', (e) => {
                this.filters.status = e.target.value;
                this.applyFilters();
            });
        }
    }
    
    /**
     * Initialize additional controls (sort, view, pagination)
     */
    initializeControls() {
        // Sort field select
        const sortSelect = document.getElementById('sortSelect');
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                this.sortField = e.target.value;
                this.currentPage = 1;
                this.applyFilters();
            });
        }
        
        // Sort order toggle button
        const sortOrderBtn = document.getElementById('sortOrderBtn');
        if (sortOrderBtn) {
            sortOrderBtn.addEventListener('click', () => {
                this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
                sortOrderBtn.classList.toggle('desc', this.sortOrder === 'desc');
                sortOrderBtn.title = this.sortOrder === 'asc' ? 'Sort ascending' : 'Sort descending';
                this.applyFilters();
            });
            // Set initial state
            sortOrderBtn.classList.add('desc'); // Default is descending for popularity
        }
        
        // View mode toggle
        document.querySelectorAll('.view-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const view = btn.getAttribute('data-view');
                this.setViewMode(view);
            });
        });
        
        // Pagination buttons
        const prevBtn = document.getElementById('prevPageBtn');
        const nextBtn = document.getElementById('nextPageBtn');
        
        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                if (this.currentPage > 1) {
                    this.currentPage--;
                    this.renderStations();
                    this.scrollToTop();
                }
            });
        }
        
        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                const totalPages = Math.ceil(this.currentResults.length / this.pageSize);
                if (this.currentPage < totalPages) {
                    this.currentPage++;
                    this.renderStations();
                    this.scrollToTop();
                }
            });
        }
    }
    
    /**
     * Scroll to top of station list
     */
    scrollToTop() {
        const container = document.querySelector('.tab-content');
        if (container) {
            container.scrollTop = 0;
        }
    }
    
    /**
     * Update stats display in bottom bar
     */
    updateStats() {
        const total = this.allStations.length;
        const active = this.allStations.filter(s => s.status === 'active').length;
        const inactive = this.allStations.filter(s => s.status === 'inactive' || s.status === 'down').length;
        const countries = new Set(this.allStations.map(s => s.country).filter(Boolean)).size;
        
        // Update bottom bar stats
        const totalEl = document.getElementById('statTotalStations');
        const activeEl = document.getElementById('statActiveStations');
        const offlineEl = document.getElementById('statOfflineStations');
        const countriesEl = document.getElementById('statCountries');
        
        if (totalEl) totalEl.innerHTML = `<strong>${this.formatNumber(total)}</strong> stations`;
        if (activeEl) activeEl.innerHTML = `<strong>${this.formatNumber(active)}</strong> active`;
        if (offlineEl) offlineEl.innerHTML = `<strong>${this.formatNumber(inactive)}</strong> offline`;
        if (countriesEl) countriesEl.innerHTML = `<strong>${countries}</strong> countries`;
    }
    
    /**
     * Format number (e.g., 1234 -> 1.2k)
     */
    formatNumber(num) {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        }
        if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'k';
        }
        return num.toString();
    }
    
    /**
     * Set view mode
     */
    setViewMode(mode) {
        this.viewMode = mode;
        
        // Update button states
        document.querySelectorAll('.view-mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-view') === mode);
        });
        
        // Update container class
        if (this.stationList) {
            this.stationList.className = `station-list ${mode === 'list' ? 'compact' : ''}`;
        }
        
        this.renderStations();
    }
    
    /**
     * Set all stations (for loading from directory)
     */
    setStations(stations) {
        this.allStations = stations || [];
        this.applyStationPool();
        this.populateCountryFilter();
        this.populateGenreFilter();
        this.populateLanguageFilter();
        this.updateStats();
        this.applyFilters();
    }

    /**
     * Apply HTTPS-only preference to the searchable station pool
     */
    applyStationPool() {
        let pool = filterExceptedStations(this.allStations);

        if (window.app?.user?.getPreference('httpsOnly')) {
            pool = filterOutHttpOnlyStations(pool);
        }

        this.stations = pool;
        this.buildIndex();
    }
    
    /**
     * Populate country filter dropdown
     */
    populateCountryFilter() {
        const countryFilter = document.getElementById('countryFilter');
        if (!countryFilter) return;
        
        let countries;
        
        if (this.filters.region && this.regionMap[this.filters.region]) {
            // Filter countries by selected region
            const regionCountries = new Set(this.regionMap[this.filters.region]);
            countries = this.getCountries().filter(c => regionCountries.has(c));
        } else {
            countries = this.getCountries();
        }
        
        // Extra safety: filter out any empty/blank values
        countries = countries.filter(c => c && typeof c === 'string' && c.trim().length > 0);
        
        countryFilter.innerHTML = '<option value="">All Countries</option>' +
            countries.map(country => `<option value="${this.escapeHtml(country)}">${this.escapeHtml(country)}</option>`).join('');
    }
    
    /**
     * Populate genre filter with searchable categories dropdown
     */
    populateGenreFilter() {
        const genreFilterContainer = document.getElementById('genreFilterContainer');
        if (!genreFilterContainer) return;
        
        // Get all unique genres for search
        this.allGenres = this.getGenres().filter(g => g && typeof g === 'string' && g.trim().length > 0);
        
        // Count stations per category
        const categoryCounts = {};
        for (const category of Object.keys(GENRE_CATEGORIES)) {
            categoryCounts[category] = 0;
        }
        categoryCounts['Other'] = 0;
        
        for (const station of this.stations) {
            const category = getGenreCategory(station.genre);
            if (category) {
                categoryCounts[category]++;
            } else if (station.genre) {
                categoryCounts['Other']++;
            }
        }
        
        // Build the searchable dropdown HTML
        genreFilterContainer.innerHTML = `
            <div class="searchable-dropdown" id="genreDropdown">
                <button type="button" class="dropdown-toggle" id="genreDropdownToggle" aria-expanded="false">
                    <span class="dropdown-value" data-i18n="allGenres">All Genres</span>
                    <svg class="dropdown-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="6 9 12 15 18 9"/>
                    </svg>
                </button>
                <div class="dropdown-menu" id="genreDropdownMenu" hidden>
                    <div class="dropdown-search">
                        <input type="text" id="genreSearchInput" placeholder="Search genres..." autocomplete="off">
                    </div>
                    <div class="dropdown-options" id="genreOptions">
                        <div class="dropdown-option selected" data-value="" data-type="all">
                            <span class="option-icon">🎵</span>
                            <span class="option-label">All Genres</span>
                        </div>
                        <div class="dropdown-divider">Categories</div>
                        ${Object.entries(GENRE_CATEGORIES).map(([category, config]) => `
                            <div class="dropdown-option" data-value="${category}" data-type="category">
                                <span class="option-icon">${config.icon}</span>
                                <span class="option-label">${category}</span>
                                <span class="option-count">${categoryCounts[category] || 0}</span>
                            </div>
                        `).join('')}
                        ${categoryCounts['Other'] > 0 ? `
                            <div class="dropdown-option" data-value="Other" data-type="category">
                                <span class="option-icon">📻</span>
                                <span class="option-label">Other</span>
                                <span class="option-count">${categoryCounts['Other']}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
        
        // Attach event listeners
        this.initGenreDropdown();
    }
    
    /**
     * Initialize genre dropdown interactions
     */
    initGenreDropdown() {
        const toggle = document.getElementById('genreDropdownToggle');
        const menu = document.getElementById('genreDropdownMenu');
        const searchInput = document.getElementById('genreSearchInput');
        const optionsContainer = document.getElementById('genreOptions');
        
        if (!toggle || !menu) return;
        
        // Toggle dropdown
        toggle.addEventListener('click', () => {
            const isOpen = toggle.getAttribute('aria-expanded') === 'true';
            toggle.setAttribute('aria-expanded', !isOpen);
            menu.hidden = isOpen;
            if (!isOpen && searchInput) {
                searchInput.value = '';
                this.renderGenreOptions('');
                setTimeout(() => searchInput.focus(), 50);
            }
        });
        
        // Close on outside click — attached once and looks up the current
        // toggle/menu by ID, since populateGenreFilter() rebuilds this
        // dropdown's innerHTML (and would otherwise stack a stale-closure
        // document listener on every rebuild).
        if (!this._genreDropdownOutsideClickBound) {
            this._genreDropdownOutsideClickBound = true;
            document.addEventListener('click', (e) => {
                if (e.target.closest('#genreDropdown')) return;
                const currentToggle = document.getElementById('genreDropdownToggle');
                const currentMenu = document.getElementById('genreDropdownMenu');
                currentToggle?.setAttribute('aria-expanded', 'false');
                if (currentMenu) currentMenu.hidden = true;
            });
        }
        
        // Search input
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.renderGenreOptions(e.target.value);
            });
            
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    toggle.setAttribute('aria-expanded', 'false');
                    menu.hidden = true;
                }
            });
        }
        
        // Option selection (using event delegation)
        if (optionsContainer) {
            optionsContainer.addEventListener('click', (e) => {
                const option = e.target.closest('.dropdown-option');
                if (!option) return;
                
                const value = option.dataset.value;
                const type = option.dataset.type;
                const label = option.querySelector('.option-label')?.textContent || 'All Genres';
                const icon = option.querySelector('.option-icon')?.textContent || '🎵';
                
                // Update display
                toggle.querySelector('.dropdown-value').innerHTML = `${icon} ${label}`;
                
                // Update selection
                optionsContainer.querySelectorAll('.dropdown-option').forEach(opt => {
                    opt.classList.remove('selected');
                });
                option.classList.add('selected');
                
                // Close dropdown
                toggle.setAttribute('aria-expanded', 'false');
                menu.hidden = true;
                
                // Apply filter
                this.filters.genre = value;
                this.filters.genreType = type; // 'all', 'category', or 'specific'
                this.applyFilters();
            });
        }
    }
    
    /**
     * Render genre options based on search query
     */
    renderGenreOptions(query) {
        const optionsContainer = document.getElementById('genreOptions');
        if (!optionsContainer) return;
        
        const lowerQuery = query.toLowerCase().trim();
        
        // Count stations per category
        const categoryCounts = {};
        for (const category of Object.keys(GENRE_CATEGORIES)) {
            categoryCounts[category] = 0;
        }
        categoryCounts['Other'] = 0;
        
        for (const station of this.stations) {
            const category = getGenreCategory(station.genre);
            if (category) {
                categoryCounts[category]++;
            } else if (station.genre) {
                categoryCounts['Other']++;
            }
        }
        
        let html = '';
        
        // Always show "All Genres" option
        html += `
            <div class="dropdown-option ${this.filters.genre === '' ? 'selected' : ''}" data-value="" data-type="all">
                <span class="option-icon">🎵</span>
                <span class="option-label">All Genres</span>
            </div>
        `;
        
        if (lowerQuery === '') {
            // Show categories when not searching
            html += '<div class="dropdown-divider">Categories</div>';
            
            for (const [category, config] of Object.entries(GENRE_CATEGORIES)) {
                const count = categoryCounts[category] || 0;
                if (count > 0) {
                    html += `
                        <div class="dropdown-option ${this.filters.genre === category ? 'selected' : ''}" data-value="${category}" data-type="category">
                            <span class="option-icon">${config.icon}</span>
                            <span class="option-label">${category}</span>
                            <span class="option-count">${count}</span>
                        </div>
                    `;
                }
            }
            
            if (categoryCounts['Other'] > 0) {
                html += `
                    <div class="dropdown-option ${this.filters.genre === 'Other' ? 'selected' : ''}" data-value="Other" data-type="category">
                        <span class="option-icon">📻</span>
                        <span class="option-label">Other</span>
                        <span class="option-count">${categoryCounts['Other']}</span>
                    </div>
                `;
            }
        } else {
            // Search mode - show matching categories first, then specific genres
            html += '<div class="dropdown-divider">Matching Categories</div>';
            
            let foundCategories = false;
            for (const [category, config] of Object.entries(GENRE_CATEGORIES)) {
                const matchesCategory = category.toLowerCase().includes(lowerQuery);
                const matchesKeyword = config.keywords.some(k => k.includes(lowerQuery));
                
                if (matchesCategory || matchesKeyword) {
                    foundCategories = true;
                    const count = categoryCounts[category] || 0;
                    html += `
                        <div class="dropdown-option" data-value="${category}" data-type="category">
                            <span class="option-icon">${config.icon}</span>
                            <span class="option-label">${category}</span>
                            <span class="option-count">${count}</span>
                        </div>
                    `;
                }
            }
            
            if (!foundCategories) {
                html += '<div class="dropdown-empty">No matching categories</div>';
            }
            
            // Show specific matching genres
            const matchingGenres = this.allGenres.filter(g => 
                g.toLowerCase().includes(lowerQuery)
            ).slice(0, 20); // Limit to 20 results
            
            if (matchingGenres.length > 0) {
                html += '<div class="dropdown-divider">Specific Genres</div>';
                
                for (const genre of matchingGenres) {
                    const count = this.stations.filter(s => s.genre === genre).length;
                    html += `
                        <div class="dropdown-option" data-value="${this.escapeHtml(genre)}" data-type="specific">
                            <span class="option-icon">•</span>
                            <span class="option-label">${this.escapeHtml(genre)}</span>
                            <span class="option-count">${count}</span>
                        </div>
                    `;
                }
                
                if (this.allGenres.filter(g => g.toLowerCase().includes(lowerQuery)).length > 20) {
                    html += '<div class="dropdown-empty">...and more. Keep typing to narrow down.</div>';
                }
            }
        }
        
        optionsContainer.innerHTML = html;
    }
    
    /**
     * Populate language filter dropdown
     */
    populateLanguageFilter() {
        const languageFilter = document.getElementById('languageFilter');
        if (!languageFilter) return;
        
        // Get languages and filter out any empty values
        const languages = this.getLanguages().filter(l => l && typeof l === 'string' && l.trim().length > 0);
        
        languageFilter.innerHTML = '<option value="">All Languages</option>' +
            languages.map(lang => `<option value="${this.escapeHtml(lang)}">${this.escapeHtml(lang)}</option>`).join('');
    }
    
    /**
     * Apply all active filters
     */
    applyFilters() {
        // A new search/filter result set almost never has the same number
        // of pages as whatever was previously shown - without resetting,
        // paging to page 5 then typing a narrower query silently slices
        // past the end of the new (shorter) result array, showing a blank
        // list while the count still reports real matches.
        this.currentPage = 1;

        const query = this.searchInput?.value?.trim() || '';
        let results = query ? this.search(query) : [...this.stations];
        
        // Apply region filter
        if (this.filters.region && this.regionMap[this.filters.region]) {
            const regionCountries = new Set(this.regionMap[this.filters.region]);
            results = results.filter(station => regionCountries.has(station.country));
        }
        
        // Apply country filter
        if (this.filters.country) {
            results = results.filter(station => 
                station.country.toLowerCase() === this.filters.country.toLowerCase()
            );
        }
        
        // Apply genre filter (supports categories and specific genres)
        if (this.filters.genre) {
            const genreValue = this.filters.genre;
            const genreType = this.filters.genreType || 'specific';
            
            if (genreType === 'category') {
                // Filter by category
                if (genreValue === 'Other') {
                    // "Other" means genres that don't match any category
                    results = results.filter(station => {
                        if (!station.genre) return false;
                        return getGenreCategory(station.genre) === null;
                    });
                } else {
                    // Match stations whose genre belongs to this category
                    results = results.filter(station => {
                        const stationCategory = getGenreCategory(station.genre);
                        return stationCategory === genreValue;
                    });
                }
            } else {
                // Specific genre match (original behavior)
                results = results.filter(station => 
                    station.genre && station.genre.toLowerCase() === genreValue.toLowerCase()
                );
            }
        }
        
        // Apply language filter
        if (this.filters.language) {
            results = results.filter(station => 
                station.language && station.language.toLowerCase() === this.filters.language.toLowerCase()
            );
        }
        
        // Apply status filter (all, active, inactive)
        if (this.filters.status) {
            if (this.filters.status === 'active') {
                // Show only active stations
                results = results.filter(station => station.status === 'active');
            } else if (this.filters.status === 'inactive') {
                // Show inactive/down/offline stations
                results = results.filter(station => 
                    station.status === 'inactive' || station.status === 'down' || station.status === 'offline'
                );
            }
            // If 'all' (empty string), show everything - no filter needed
        }
        
        // Apply sorting
        results = this.sortStations(results);
        
        this.currentResults = results;
        
        // Update UI
        this.updateActiveFiltersUI();
        this.updateResultsCount(results.length);
        this.renderStations();
        
        // Update map/globe to show only filtered stations
        if (window.app?.globe?.updateDisplayedStations) {
            window.app.globe.updateDisplayedStations(results);
        }
        
        // Emit event for updating station list
        this.emit('searchResults', { query, results, filters: this.filters });
    }
    
    /**
     * Sort stations based on current sort setting
     */
    sortStations(stations) {
        const field = this.sortField;
        const isAsc = this.sortOrder === 'asc';
        
        return [...stations].sort((a, b) => {
            let valA, valB;
            
            switch (field) {
                case 'votes':
                    valA = a.votes || 0;
                    valB = b.votes || 0;
                    return isAsc ? valA - valB : valB - valA;
                case 'name':
                    valA = (a.name || '').toLowerCase();
                    valB = (b.name || '').toLowerCase();
                    return isAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
                case 'country':
                    valA = (a.country || '').toLowerCase();
                    valB = (b.country || '').toLowerCase();
                    return isAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
                case 'bitrate':
                    valA = a.bitrate || 0;
                    valB = b.bitrate || 0;
                    return isAsc ? valA - valB : valB - valA;
                default:
                    return 0;
            }
        });
    }
    
    /**
     * Render stations to the list
     */
    renderStations() {
        if (!this.stationList) return;
        
        // If no results yet, show loading or empty state
        if (!this.currentResults || this.currentResults.length === 0) {
            if (this.allStations.length === 0) {
                this.stationList.innerHTML = `
                    <div class="empty-state">
                        <p>Loading stations...</p>
                    </div>
                `;
            } else {
                this.stationList.innerHTML = `
                    <div class="empty-state">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                            <circle cx="11" cy="11" r="8"/>
                            <path d="m21 21-4.35-4.35"/>
                        </svg>
                        <p>No stations found</p>
                        <span class="help-text">Try adjusting your filters or search terms</span>
                    </div>
                `;
            }
            this.updatePagination(0);
            return;
        }
        
        const totalPages = Math.ceil(this.currentResults.length / this.pageSize);
        const start = (this.currentPage - 1) * this.pageSize;
        const end = start + this.pageSize;
        const pageStations = this.currentResults.slice(start, end);
        
        // Use the app's UI renderStationList if available, otherwise render directly
        if (window.app && window.app.ui && window.app.favorites) {
            // Get favorites array - the controller stores IDs in this.favorites
            const favoritesArray = window.app.favorites.favorites || [];
            window.app.ui.renderStationList(this.stationList, pageStations, {
                currentStationId: window.app.audio?.currentStation?.id,
                favorites: favoritesArray,
                onStationClick: (station) => {
                    window.app.playStation(station);
                },
                onFavoriteToggle: (stationId) => {
                    if (window.app.handleFavoriteToggle) {
                        window.app.handleFavoriteToggle(stationId);
                    }
                }
            });
        } else {
            // Fallback simple render when app not fully initialized
            this.stationList.innerHTML = pageStations.map(station => this.renderStationCard(station)).join('');
            this.bindStationEvents();
        }
        
        // Update pagination controls
        this.updatePagination(totalPages);
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
     * Render a single station card (fallback)
     */
    renderStationCard(station) {
        const baseStatus = station.status || 'active';
        const isHttpOnly = this.isHttpOnlyStation(station);
        const status = isHttpOnly ? 'http' : baseStatus;
        const votes = this.formatNumber(station.votes || 0);
        const firstLetter = (station.name || 'R')[0].toUpperCase();
        const statusLabel = this.getStatusLabel(status);
        const coordsInfo = this.getCoordsPrecisionInfo(station);
        
        return `
            <div class="station-card ${baseStatus !== 'active' ? 'status-' + baseStatus : ''}" data-station-id="${this.escapeAttr(station.id)}">
                <div class="station-card-header">
                    <div class="station-card-icon">
                        ${station.favicon && this.isSafeUrl(station.favicon) ? `
                            <img src="${this.escapeAttr(station.favicon)}" alt=""
                                 onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
                                 loading="lazy">
                            <div class="station-card-icon-placeholder" style="display:none">${firstLetter}</div>
                        ` : `
                            <div class="station-card-icon-placeholder">${firstLetter}</div>
                        `}
                    </div>
                    <div class="station-card-info">
                        <div class="station-card-name">
                            ${this.escapeHtml(station.name || 'Unknown')}
                            <span class="status-indicator status-${status}" title="${this.escapeAttr(statusLabel)}"></span>
                        </div>
                        <div class="station-card-location">
                            ${this.escapeHtml(station.city || '')}${station.city && station.country ? ', ' : ''}${this.escapeHtml(station.country || '')}
                        </div>
                    </div>
                </div>
                <div class="station-card-meta">
                    ${station.genre ? `<span class="badge badge-genre">${this.escapeHtml(station.genre.split(/[,;]/)[0].trim())}</span>` : ''}
                    ${station.language ? `<span class="badge badge-language">${this.escapeHtml(station.language)}</span>` : ''}
                    ${isHttpOnly ? `<span class="badge badge-status badge-http">HTTP</span>` : ''}
                    <span class="badge badge-votes" title="${this.escapeAttr(station.votes || 0)} votes">★ ${votes}</span>
                    <span class="badge badge-coords ${coordsInfo.class}" title="${this.escapeAttr(coordsInfo.tooltip)}">${coordsInfo.icon}</span>
                </div>
            </div>
        `;
    }
    
    /**
     * Bind click events to station cards
     */
    bindStationEvents() {
        if (!this.stationList) return;
        
        this.stationList.querySelectorAll('.station-card').forEach(card => {
            card.addEventListener('click', () => {
                const stationId = card.getAttribute('data-station-id');
                const station = this.allStations.find(s => s.id === stationId);
                if (station && window.app) {
                    window.app.playStation(station);
                }
            });
        });
    }
    
    /**
     * Update pagination controls
     */
    updatePagination(totalPages) {
        const prevBtn = document.getElementById('prevPageBtn');
        const nextBtn = document.getElementById('nextPageBtn');
        const pageInfo = document.getElementById('pageInfo');
        const paginationControls = document.getElementById('paginationControls');
        
        if (paginationControls) {
            paginationControls.hidden = totalPages <= 1;
        }
        
        if (prevBtn) {
            prevBtn.disabled = this.currentPage <= 1;
        }
        
        if (nextBtn) {
            nextBtn.disabled = this.currentPage >= totalPages;
        }
        
        if (pageInfo) {
            pageInfo.textContent = `Page ${this.currentPage} of ${totalPages || 1}`;
        }
    }
    
    /**
     * Escape HTML entities. Delegates to stations-utils.js's shared
     * implementation so this can't silently diverge from ui.js's copy
     * again (it previously did: this one returned '' for falsy input like
     * 0, where ui.js's returned the literal string "undefined").
     */
    escapeHtml(str) {
        return escapeHtml(str);
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
            'http': 'HTTP Only (No HTTPS)'
        };
        return labels[status] || status;
    }
    
    /**
     * Update active filters UI
     */
    updateActiveFiltersUI() {
        const activeFilters = document.getElementById('activeFilters');
        const clearFiltersBtn = document.getElementById('clearFiltersBtn');
        const filterCount = document.getElementById('activeFilterCount');
        
        const activeFiltersList = [];
        
        if (this.filters.region) {
            activeFiltersList.push({ type: 'region', value: this.filters.region, label: this.formatRegionName(this.filters.region) });
        }
        if (this.filters.country) {
            activeFiltersList.push({ type: 'country', value: this.filters.country, label: this.filters.country });
        }
        if (this.filters.genre) {
            activeFiltersList.push({ type: 'genre', value: this.filters.genre, label: this.filters.genre });
        }
        if (this.filters.language) {
            activeFiltersList.push({ type: 'language', value: this.filters.language, label: this.filters.language });
        }
        if (this.filters.status) {
            activeFiltersList.push({ type: 'status', value: this.filters.status, label: this.formatStatusName(this.filters.status) });
        }
        
        // Update filter count badge
        if (filterCount) {
            if (activeFiltersList.length > 0) {
                filterCount.textContent = activeFiltersList.length;
                filterCount.hidden = false;
            } else {
                filterCount.hidden = true;
            }
        }
        
        // Show/hide clear button
        if (clearFiltersBtn) {
            clearFiltersBtn.hidden = activeFiltersList.length === 0;
        }
        
        // Render active filter tags
        if (activeFilters) {
            if (activeFiltersList.length === 0) {
                activeFilters.hidden = true;
                activeFilters.innerHTML = '';
            } else {
                activeFilters.hidden = false;
                activeFilters.innerHTML = activeFiltersList.map(filter => `
                    <span class="filter-tag" data-filter-type="${this.escapeAttr(filter.type)}">
                        ${this.escapeHtml(filter.label)}
                        <button class="filter-tag-remove" data-filter-type="${this.escapeAttr(filter.type)}" aria-label="Remove ${this.escapeAttr(filter.label)} filter">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="18" y1="6" x2="6" y2="18"/>
                                <line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                        </button>
                    </span>
                `).join('');
                
                // Add click handlers for remove buttons
                activeFilters.querySelectorAll('.filter-tag-remove').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const filterType = btn.getAttribute('data-filter-type');
                        this.removeFilter(filterType);
                    });
                });
            }
        }
    }
    
    /**
     * Format region name for display
     */
    formatRegionName(region) {
        return region.split('-').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
    }
    
    /**
     * Format status name for display
     */
    formatStatusName(status) {
        const statusMap = {
            'active': '🟢 Active',
            'inactive': '🟡 Inactive',
            'down': '🔴 Down'
        };
        return statusMap[status] || status.charAt(0).toUpperCase() + status.slice(1);
    }
    
    /**
     * Remove a specific filter
     */
    removeFilter(filterType) {
        this.filters[filterType] = '';
        
        // Reset the select element
        const selectId = filterType + 'Filter';
        const selectElement = document.getElementById(selectId);
        if (selectElement) {
            selectElement.value = '';
        }
        
        // If removing region, update country options
        if (filterType === 'region') {
            this.populateCountryFilter();
        }
        
        this.applyFilters();
    }
    
    /**
     * Clear all filters
     */
    clearAllFilters() {
        this.filters = {
            region: '',
            country: '',
            genre: '',
            genreType: '',
            language: '',
            status: ''
        };
        
        // Reset all select elements
        ['regionFilter', 'countryFilter', 'languageFilter', 'statusFilter'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        
        // Reset genre dropdown display
        const genreToggle = document.getElementById('genreDropdownToggle');
        if (genreToggle) {
            genreToggle.querySelector('.dropdown-value').innerHTML = '🎵 All Genres';
        }
        
        // Reset genre options selection
        const genreOptions = document.querySelectorAll('#genreOptions .dropdown-option');
        genreOptions.forEach(opt => {
            opt.classList.remove('selected');
            if (opt.dataset.value === '') {
                opt.classList.add('selected');
            }
        });
        
        this.populateCountryFilter();
        this.applyFilters();
    }
    
    /**
     * Update results count display
     */
    updateResultsCount(count) {
        const resultsCount = document.getElementById('resultsCount');
        if (resultsCount) {
            // Show detailed count with status breakdown
            const results = this.currentResults || [];
            const active = results.filter(s => s.status === 'active').length;
            const inactive = results.filter(s => s.status === 'inactive' || s.status === 'down').length;
            
            if (count === results.length && count > 0) {
                // Show breakdown when showing all results
                resultsCount.innerHTML = `<span class="results-total">${count}</span> stations 
                    <span class="results-breakdown">
                        (<span class="status-active-count">✓ ${active}</span> 
                        <span class="status-inactive-count">· ${inactive} offline</span>)
                    </span>`;
            } else {
                resultsCount.textContent = `${count} station${count !== 1 ? 's' : ''}`;
            }
        }
    }
    
    /**
     * Attach event listeners
     */
    attachEventListeners() {
        // Check if searchInput exists
        if (!this.searchInput) {
            console.error('Search input element not found');
            return;
        }
        
        // Search input - apply filters on each keystroke
        this.searchInput.addEventListener('input', (e) => {
            const query = e.target.value;
            
            // Clear existing timer
            if (this.debounceTimer) {
                clearTimeout(this.debounceTimer);
            }
            
            // Short debounce for typeahead dropdown only
            this.debounceTimer = setTimeout(() => {
                if (query.trim().length >= 2) {
                    this.handleSearch(query);
                } else {
                    this.hideResults();
                }
            }, 100);
            
            // Apply filters immediately for the main grid
            this.applyFilters();
        });
        
        // Also trigger search on Enter key
        this.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.hideResults();
                this.applyFilters();
            }
        });
        
        // Keyboard navigation
        this.searchInput.addEventListener('keydown', (e) => {
            this.handleKeyboard(e);
        });
        
        // Close results on outside click
        document.addEventListener('click', (e) => {
            if (!this.searchResults) return;
            if (!this.searchInput.contains(e.target) && !this.searchResults.contains(e.target)) {
                this.hideResults();
            }
        });
        
        // Focus management
        this.searchInput.addEventListener('focus', () => {
            if (this.currentResults.length > 0) {
                this.showResults();
            }
        });
    }
    
    /**
     * Handle search query (for typeahead dropdown only)
     */
    handleSearch(query) {
        const trimmedQuery = query.trim();
        
        if (trimmedQuery.length === 0) {
            this.hideResults();
            return;
        }
        
        // Perform search for dropdown
        const results = this.search(trimmedQuery);
        this.selectedIndex = -1;
        
        if (results.length > 0) {
            this.renderResults(results.slice(0, 10)); // Show top 10 in dropdown
            this.showResults();
        } else {
            this.renderNoResults();
            this.showResults();
        }
    }
    
    /**
     * Search stations
     */
    search(query) {
        const lowerQuery = query.toLowerCase();
        const words = lowerQuery.split(/\s+/);
        
        return this.index
            .filter(item => {
                // All words must match somewhere in the search text
                return words.every(word => item.searchText.includes(word));
            })
            .map(item => item.station)
            .sort((a, b) => {
                // Prioritize matches in station name
                const aNameMatch = (a.name || '').toLowerCase().includes(lowerQuery);
                const bNameMatch = (b.name || '').toLowerCase().includes(lowerQuery);

                if (aNameMatch && !bNameMatch) return -1;
                if (!aNameMatch && bNameMatch) return 1;

                // Then by city
                const aCityMatch = (a.city || '').toLowerCase().includes(lowerQuery);
                const bCityMatch = (b.city || '').toLowerCase().includes(lowerQuery);

                if (aCityMatch && !bCityMatch) return -1;
                if (!aCityMatch && bCityMatch) return 1;

                // Finally alphabetically
                return (a.name || '').localeCompare(b.name || '');
            });
    }
    
    /**
     * Render search results dropdown
     */
    renderResults(results) {
        this.searchResults.innerHTML = results.map((station, index) => `
            <div class="search-result-item" data-index="${index}" data-station-id="${this.escapeAttr(station.id)}">
                <div class="search-result-name">${this.highlightMatch(station.name, this.searchInput.value)}</div>
                <div class="search-result-location">
                    ${this.highlightMatch(station.city, this.searchInput.value)}, 
                    ${this.highlightMatch(station.country, this.searchInput.value)}
                </div>
            </div>
        `).join('');
        
        // Add click handlers
        this.searchResults.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', () => {
                const stationId = item.getAttribute('data-station-id');
                // Use allStations to ensure we find the station even if filters are active
                const station = this.allStations.find(s => s.id === stationId);
                if (station) {
                    this.selectStation(station);
                }
            });
            
            item.addEventListener('mouseenter', () => {
                this.selectedIndex = parseInt(item.getAttribute('data-index'));
                this.updateSelection();
            });
        });
    }
    
    /**
     * Render no results message
     */
    renderNoResults() {
        this.searchResults.innerHTML = `
            <div class="search-result-item" style="cursor: default; color: var(--text-secondary);">
                No stations found
            </div>
        `;
    }
    
    /**
     * Highlight matching text
     */
    highlightMatch(text, query) {
        const safeText = this.escapeHtml(text);
        if (!query) return safeText;

        const regex = new RegExp(`(${this.escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return safeText.replace(regex, '<strong>$1</strong>');
    }
    
    /**
     * Handle keyboard navigation
     */
    handleKeyboard(e) {
        if (!this.searchResults || this.searchResults.hidden) return;
        
        const items = this.searchResults.querySelectorAll('.search-result-item');
        
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                this.selectedIndex = Math.min(this.selectedIndex + 1, items.length - 1);
                this.updateSelection();
                break;
                
            case 'ArrowUp':
                e.preventDefault();
                this.selectedIndex = Math.max(this.selectedIndex - 1, -1);
                this.updateSelection();
                break;
                
            case 'Enter':
                e.preventDefault();
                if (this.selectedIndex >= 0) {
                    // Get the actual station from the dropdown item
                    const items = this.searchResults.querySelectorAll('.search-result-item');
                    if (this.selectedIndex < items.length) {
                        const stationId = items[this.selectedIndex].getAttribute('data-station-id');
                        const station = this.allStations.find(s => s.id === stationId);
                        if (station) {
                            this.selectStation(station);
                        }
                    }
                }
                break;
                
            case 'Escape':
                e.preventDefault();
                this.hideResults();
                this.searchInput.blur();
                break;
        }
    }
    
    /**
     * Update visual selection in dropdown
     */
    updateSelection() {
        const items = this.searchResults.querySelectorAll('.search-result-item');
        items.forEach((item, index) => {
            if (index === this.selectedIndex) {
                item.classList.add('active');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('active');
            }
        });
    }
    
    /**
     * Select a station from search results (dropdown or grid)
     */
    selectStation(station) {
        this.hideResults();
        this.searchInput.value = station.name;
        
        // IMPORTANT: Actually play the station, not just emit events
        if (window.app && window.app.playStation) {
            window.app.playStation(station);
        } else {
            // Fallback to event-based approach
            this.emit('stationSelected', { station });
            window.dispatchEvent(new CustomEvent('stationSelected', { detail: station }));
        }
    }
    
    /**
     * Show results dropdown
     */
    showResults() {
        this.searchResults.hidden = false;
    }
    
    /**
     * Hide results dropdown
     */
    hideResults() {
        this.searchResults.hidden = true;
        this.selectedIndex = -1;
    }
    
    /**
     * Clear search
     */
    clear() {
        this.searchInput.value = '';
        this.hideResults();
        this.currentResults = [];
        this.clearAllFilters();
    }
    
    /**
     * Event emitter
     */
    emit(event, data) {
        window.dispatchEvent(new CustomEvent(`search:${event}`, { detail: data }));
    }
    
    /**
     * Filter stations by criteria
     */
    filterBy(criteria) {
        // Example: { country: 'United States', genre: 'Jazz' }
        return this.stations.filter(station => {
            return Object.entries(criteria).every(([key, value]) => {
                return station[key] && station[key].toLowerCase() === value.toLowerCase();
            });
        });
    }
    
    /**
     * Get all unique countries (excluding empty values)
     */
    getCountries() {
        const countries = new Set(
            this.stations
                .map(s => s.country)
                .filter(c => c && c.trim() !== '') // Filter out empty/null/whitespace
        );
        return Array.from(countries).sort();
    }
    
    /**
     * Get all unique cities
     */
    getCities() {
        const cities = new Set(
            this.stations
                .filter(s => s.city && s.city.trim() !== '')
                .map(s => `${s.city}, ${s.country}`)
        );
        return Array.from(cities).sort();
    }
    
    /**
     * Get all unique genres (excluding empty values)
     */
    getGenres() {
        const genres = new Set(
            this.stations
                .map(s => s.genre)
                .filter(g => g && g.trim() !== '')
        );
        return Array.from(genres).sort();
    }
    
    /**
     * Get all unique languages (excluding empty values)
     */
    getLanguages() {
        const languages = new Set(
            this.stations
                .map(s => s.language)
                .filter(l => l && l.trim() !== '')
        );
        return Array.from(languages).sort();
    }
    
    /**
     * Get station count by status
     */
    getStatusCounts() {
        const counts = { active: 0, inactive: 0, down: 0 };
        this.stations.forEach(station => {
            const status = station.status || 'active';
            if (counts[status] !== undefined) {
                counts[status]++;
            }
        });
        return counts;
    }
    
    /**
     * Get current filters
     */
    getFilters() {
        return { ...this.filters };
    }
    
    /**
     * Check if any filters are active
     */
    hasActiveFilters() {
        return this.filters.region || this.filters.country || this.filters.genre || 
               this.filters.language || this.filters.status;
    }
}

// Export for use in app.js
window.SearchController = SearchController;
