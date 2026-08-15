/**
 * app.js - Main Application Controller
 * Coordinates all modules and manages application state
 */

class GlobeRadioApp {
    constructor() {
        this.stations = [];
        this.allStations = [];
        this.globe = null;
        this.audio = null;
        this.search = null;
        this.favorites = null;
        this.ui = null;
        this.user = null;
        this.visualizer = null;
        this.install = null;
        
        // Initialization flag for E2E tests
        this.initialized = false;
        
        this.state = {
            currentStation: null,
            isPlaying: false,
            volume: 0.7
        };
        
        // Idle tracking
        this.idleTimer = null;
        this.isIdle = false;
        this.lastActivity = Date.now();
    }
    
    /**
     * Initialize the application
     */
    async init() {
        // Track loading start time for logo animation
        this.loadingStartTime = Date.now();
        
        const updateLoadingMessage = (msg) => {
            const el = document.getElementById('loadingMessage');
            if (el) el.textContent = msg;
        };
        
        try {
            console.log(`Starting ${window.APP_NAME || 'Radio Explorer'} initialization...`);
            
            // Initialize user profile first (for preferences)
            console.log('Initializing user profile...');
            this.user = new UserProfile();
            // Exposed globally so other modules (favorites.js's backend
            // sync in particular) can reach the same api-client.js
            // instance without deep-chaining through window.app.user.
            window.apiClient = this.user.apiClient;

            // PWA install prompt handling — self-contained, no dependency on
            // station data, so it's safe to wire up this early. Guarded
            // separately from the main try/catch: if install.js failed to
            // load (stale service worker cache, network hiccup, ad blocker),
            // that's a lost nice-to-have, not a reason to fail the whole app.
            try {
                if (typeof InstallController !== 'undefined') {
                    this.install = new InstallController();
                    this.install.init();
                } else {
                    console.warn('InstallController not available — skipping PWA install prompt setup.');
                }
            } catch (installError) {
                console.warn('PWA install prompt setup failed (non-fatal):', installError);
            }

            // Show loading screen
            this.ui = new UIController();
            this.ui.showLoading();
            
            // Apply saved preferences
            this.state.volume = this.user.getPreference('volume') || 0.7;
            
            updateLoadingMessage('Loading radio stations...');
            console.log('Loading station exception list...');
            await loadStationExceptions();

            console.log('Loading stations data...');
            // Load stations data
            await this.loadStations();
            console.log(`Loaded ${this.stations.length} stations`);
            
            console.log('Initializing audio controller...');
            // Initialize modules
            this.audio = new AudioController();
            this.audio.setVolume(this.state.volume);
            
            // Auto-detect proxy server for HTTP streams
            if (window.location.protocol === 'https:') {
                this.audio.autoEnableProxy().then(enabled => {
                    if (enabled) {
                        console.log('🔄 Proxy server detected - HTTP streams will be proxied');
                    }
                });
            }
            
            updateLoadingMessage('Building station index...');
            console.log('Initializing search controller...');
            // Initialize search without calling applyFilters yet
            this.search = new SearchController(this.allStations);
            
            console.log('Initializing favorites controller...');
            this.favorites = new FavoritesController(this.allStations);
            window.favorites = this.favorites;

            // Reconcile with the backend once its own session/profile
            // fetch has settled - fire-and-forget (not awaited) so a slow
            // network doesn't delay the rest of init(); the eventual
            // result updates the UI via the same favorites:favoritesChanged
            // event any other favorites change already triggers.
            this.user.waitForApiClient().then(() => {
                this.favorites.reconcileWithBackend();
            });
            
            updateLoadingMessage('Initializing world view...');
            console.log('Initializing 3D globe...');
            // Initialize globe BEFORE loading all stations (so updateDisplayedStations is available)
            this.globe = new GlobeController();
            await this.globe.init(this.stations);
            console.log('Globe initialized successfully');
            
            // NOW load all stations into search controller (after globe is ready)
            console.log('Loading all stations for directory...');
            try {
                const response = await fetch(`data/stations.json?v=${Date.now()}`);
                if (response.ok) {
                    const allStations = await response.json();
                    
                    // Filter to only enabled stations
                    // Update main stations array (used by Popular tab)
                    this.setStationData(allStations);
                    
                    // Update search controller
                    if (this.search) {
                        this.search.setStations(this.allStations);
                        console.log(`Search/Directory loaded with ${this.allStations.length} stations`);
                    }
                    
                    // Update favorites with new station data
                    if (this.favorites) {
                        this.favorites.stations = this.allStations;
                    }
                    
                    // Update bottom bar stats after loading all stations
                    this.updateBottomBarStats(this.stations);
                    
                    // Update globe with new station data
                    if (this.globe && typeof this.globe.updateDisplayedStations === 'function') {
                        this.globe.updateDisplayedStations(this.stations);
                    }
                    
                    console.log(`✅ All components updated with ${this.allStations.length} stations from stations.json (${this.stations.length} visible)`);
                    
                    // Force re-render of UI with new station data
                    // (renderUI will be called later, but let's ensure data is synced)
                    this.stationsLoaded = true;
                }
            } catch (e) {
                console.log('Using filtered stations for search');
                // Still apply filters with initial stations
                if (this.search) {
                    this.search.applyFilters();
                }
                // Update stats with current stations
                this.updateBottomBarStats(this.stations);
            }
            
            // Apply saved view mode (defaults to 'map' if not set)
            const savedViewMode = this.user.getPreference('viewMode') || 'map';
            this.globe.setViewMode(savedViewMode);

            // Nothing is playing yet (auto-resume never autoplays, only offers a banner) —
            // open focused on the user's approximate region instead of a fixed default point.
            // If the user resumes/picks a station, handleStationSelected's focusOnStation
            // call re-centers on that station instead.
            if (typeof this.globe.focusOnDefaultRegion === 'function') {
                this.globe.focusOnDefaultRegion();
            }

            // Setup event listeners
            this.setupEventListeners();
            
            // Setup keyboard shortcuts
            this.setupKeyboardShortcuts();
            
            // Setup share functionality
            this.setupShareFeatures();
            
            // Setup user profile button
            this.setupUserProfile();
            
            // Initialize visualizer
            this.setupVisualizer();
            
            // Setup bottom player bar
            this.setupBottomPlayer();
            this.updateBottomPlayer(); // Initialize with stats visible
            
            // Initialize user stats display (will update when backend data arrives)
            this.initUserStats();
            
            // Setup idle detection
            this.setupIdleDetection();
            
            // Check for shared data in URL
            this.checkSharedData();
            
            // Render initial UI
            this.renderUI();
            
            updateLoadingMessage('Ready!');
            
            // Calculate how long the loading took
            const loadingEndTime = Date.now();
            const loadingDuration = loadingEndTime - this.loadingStartTime;
            const minDisplayTime = 3000; // Show logo animation for at least 3 seconds
            const remainingTime = Math.max(0, minDisplayTime - loadingDuration);
            
            // Hide loading screen after logo animation completes
            setTimeout(() => {
                this.ui.hideLoading();
                
                // Check if user needs setup (first visit) - after loading is hidden
                if (this.user.needsSetup()) {
                    this.user.showSetupModal('get started');
                }
                
                // Check for last playing station and offer to resume
                this.checkAutoResume();
            }, remainingTime + 300);
            
            // Mark app as initialized for E2E tests
            this.initialized = true;
            console.log(`✅ ${window.APP_NAME || 'Radio Explorer'} initialized successfully!`);
        } catch (error) {
            console.error('❌ Failed to initialize app:', error);
            console.error('Error details:', error.message, error.stack);
            
            // Always hide loading screen
            if (this.ui) {
                this.ui.hideLoading();
            } else {
                document.getElementById('loadingScreen')?.classList.add('hidden');
            }
            
            // Show error toast
            if (this.ui) {
                this.ui.showToast({
                    type: 'error',
                    title: 'Initialization Error',
                    message: `Failed to load: ${error.message}. Please check the console and refresh the page.`,
                    duration: 0
                });
            } else {
                alert(`Failed to initialize ${window.APP_NAME || 'Radio Explorer'}: ${error.message}\n\nPlease open the browser console (F12) for more details and refresh the page.`);
            }
        }
    }
    
    /**
     * Load stations from Radio Browser API - fetches thousands of stations worldwide
     */
    async loadStations() {
        try {
            console.log('🌍 Loading stations...');
            
            // PRIMARY: Load from stations.json (has coordsPrecision data)
            // Add cache-busting to ensure fresh data
            const cacheBuster = `?v=${Date.now()}`;
            console.log('📂 Loading from stations.json...');
            const localResponse = await fetch(`data/stations.json${cacheBuster}`);
            if (localResponse.ok) {
                const localStations = await localResponse.json();
                this.setStationData(localStations);
                
                // Verify data has coordsPrecision
                const withPrecision = this.stations.filter(s => s.coordsPrecision).length;
                console.log(`✅ Loaded ${this.stations.length} stations (${withPrecision} with coordsPrecision)`);
                return;
            }
            
            console.warn('⚠️ stations.json not available, trying fallback...');
            
            // FALLBACK: Check for cached stations
            const cached = this.getCachedStations();
            if (cached) {
                this.setStationData(cached);
                console.log(`✅ Loaded ${this.stations.length} stations from cache (fallback)`);
                this.refreshStationsCache();
                return;
            }
            
            // Radio Browser API servers (use multiple for reliability)
            const apiServers = [
                'https://de1.api.radio-browser.info',
                'https://nl1.api.radio-browser.info', 
                'https://at1.api.radio-browser.info'
            ];
            
            const apiBase = apiServers[0];
            
            // Add timeout to fetch requests
            const fetchWithTimeout = (url, timeout = 10000) => {
                return Promise.race([
                    fetch(url),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Request timeout')), timeout)
                    )
                ]);
            };
            
            // Fetch stations in parallel from multiple endpoints for maximum coverage
            const fetchPromises = [
                // Top voted stations (most popular globally)
                fetchWithTimeout(`${apiBase}/json/stations/topvote/3000`),
                // Top clicked stations (most listened)
                fetchWithTimeout(`${apiBase}/json/stations/topclick/2000`)
            ];
            
            console.log('📡 Fetching from API endpoints...');
            const responses = await Promise.allSettled(fetchPromises);
            
            // Collect all stations
            const allStations = [];
            const seenIds = new Set();
            
            for (const result of responses) {
                if (result.status === 'fulfilled' && result.value.ok) {
                    try {
                        const data = await result.value.json();
                        console.log(`  ↳ Got ${data.length} stations from endpoint`);
                        
                        for (const station of data) {
                            if (!seenIds.has(station.stationuuid)) {
                                seenIds.add(station.stationuuid);
                                allStations.push(station);
                            }
                        }
                    } catch (parseError) {
                        console.warn('Failed to parse API response:', parseError.message);
                    }
                }
            }
            
            console.log(`📊 Total unique stations fetched: ${allStations.length}`);
            
            // Transform and filter stations
            this.setStationData(this.transformApiStations(allStations));
            
            if (!Array.isArray(this.stations) || this.stations.length === 0) {
                throw new Error('No valid stations returned from API');
            }
            
            // Cache stations for faster future loads
            this.cacheStations(this.stations);
            
            console.log(`✅ Loaded ${this.stations.length} verified radio stations worldwide!`);
            
        } catch (error) {
            console.warn('⚠️ Failed to load from Radio Browser API:', error.message);
            console.log('💡 Trying local stations.json...');
            
            try {
                const response = await fetch('data/stations.json');
                if (response.ok) {
                    const allStations = await response.json();
                    
                    // Filter out disabled stations only (HTTP streams go through proxy)
                    this.setStationData(allStations);
                    
                    const disabledCount = allStations.length - this.allStations.length;
                    console.log(`✅ Loaded ${this.allStations.length} stations from local JSON file (${disabledCount} filtered out, ${this.stations.length} visible)`);
                    return;
                }
            } catch (localError) {
                console.warn('⚠️ Failed to load stations.json:', localError.message);
            }
            
            console.log('💡 Loading embedded fallback stations...');
            
            // Fallback to embedded data (useful when opening file:// directly)
            const embeddedStations = this.getEmbeddedStations();
            // Filter out disabled stations (embedded stations are all enabled by default)
            this.setStationData(embeddedStations);
            
            if (this.stations.length === 0) {
                throw new Error('No stations available. Please use a local web server (python -m http.server 8000)');
            }
            
            console.log(`✅ Loaded ${this.stations.length} stations from embedded data`);
        }
    }
    
    /**
     * Get cached stations from localStorage
     */
    getCachedStations() {
        try {
            const cached = localStorage.getItem('globeRadio_stationsCache');
            if (!cached) return null;
            
            const { stations, timestamp } = JSON.parse(cached);
            const age = Date.now() - timestamp;
            const maxAge = 24 * 60 * 60 * 1000; // 24 hours
            
            if (age > maxAge) {
                console.log('📦 Cache expired, will refresh');
                return null;
            }
            
            console.log('📦 Using cached stations');
            return stations;
        } catch (e) {
            return null;
        }
    }
    
    /**
     * Cache stations to localStorage
     */
    cacheStations(stations) {
        try {
            const data = {
                stations: stations.slice(0, 3000), // Limit cache size
                timestamp: Date.now()
            };
            localStorage.setItem('globeRadio_stationsCache', JSON.stringify(data));
            console.log('📦 Stations cached for faster loading');
        } catch (e) {
            console.warn('Could not cache stations:', e.message);
        }
    }
    
    /**
     * Refresh stations cache in background
     */
    async refreshStationsCache() {
        try {
            const apiBase = 'https://de1.api.radio-browser.info';
            const response = await fetch(`${apiBase}/json/stations/topvote/3000`);
            if (response.ok) {
                const data = await response.json();
                const stations = this.transformApiStations(data);
                this.cacheStations(stations);
                console.log('📦 Cache refreshed in background');
            }
        } catch (e) {
            // Silent fail - we have cached data
        }
    }
    
    /**
     * Transform API stations to our format with filtering
     */
    transformApiStations(apiStations) {
        const supportedCodecs = ['MP3', 'AAC', 'AAC+', 'OGG', 'OPUS', 'FLAC'];

        return filterExceptedStations(apiStations
            .filter(s => {
                const url = s.url_resolved || s.url || '';
                const codec = (s.codec || '').toUpperCase();
                const lat = parseFloat(s.geo_lat);
                const lng = parseFloat(s.geo_long);

                return url &&
                       url.length > 10 &&
                       !isStreamUrlExcepted(url) &&
                       supportedCodecs.some(c => codec.includes(c)) &&
                       !isNaN(lat) && !isNaN(lng) &&
                       Math.abs(lat) <= 90 &&
                       Math.abs(lng) <= 180 &&
                       !url.toLowerCase().includes('.m3u') &&
                       !url.toLowerCase().includes('.pls') &&
                       (s.lastcheckok === 1 || (s.votes && s.votes > 100));
            })
            .map((station, index) => {
                const tags = station.tags ? station.tags.split(',').map(t => t.trim()).filter(t => t) : [];
                const genre = tags[0] || station.language || 'General';
                const votes = station.votes || 0;
                const lastCheck = station.lastchecktime ? new Date(station.lastchecktime) : null;
                const daysSinceCheck = lastCheck ? (Date.now() - lastCheck.getTime()) / (1000 * 60 * 60 * 24) : 999;

                let status = 'active';
                if (station.lastcheckok !== 1) {
                    status = daysSinceCheck > 30 ? 'down' : 'inactive';
                } else if (daysSinceCheck > 7 && votes < 50) {
                    status = 'inactive';
                }

                return {
                    id: station.stationuuid || `station-${index}`,
                    name: station.name || 'Unknown Station',
                    city: station.state || station.country || 'Unknown',
                    country: station.country || 'Unknown',
                    countryCode: station.countrycode || '',
                    lat: parseFloat(station.geo_lat),
                    lng: parseFloat(station.geo_long),
                    streams: [{
                        url: station.url_resolved || station.url,
                        type: this.getStreamType(station.codec)
                    }],
                    website: station.homepage || '',
                    genre: genre,
                    language: station.language || 'Unknown',
                    tags: tags.slice(0, 5),
                    votes: votes,
                    bitrate: station.bitrate || 0,
                    status: status,
                    favicon: station.favicon || '',
                    enabled: true
                };
            })
            .sort((a, b) => {
                if (a.status === 'active' && b.status !== 'active') return -1;
                if (a.status !== 'active' && b.status === 'active') return 1;
                return b.votes - a.votes;
            }));
    }
    
    /**
     * Get MIME type for codec
     */
    getStreamType(codec) {
        const codecUpper = (codec || '').toUpperCase();
        if (codecUpper.includes('AAC')) return 'audio/aac';
        if (codecUpper.includes('OGG') || codecUpper.includes('OPUS')) return 'audio/ogg';
        if (codecUpper.includes('FLAC')) return 'audio/flac';
        return 'audio/mpeg'; // Default to MP3
    }
    
    /**
     * Get embedded stations as fallback
     */
    getEmbeddedStations() {
        // Embedded station data with verified working HTTPS streams
        return [
            {"id":"somafm-groovesalad","name":"SomaFM Groove Salad","city":"San Francisco","country":"United States","lat":37.7749,"lng":-122.4194,"streams":[{"url":"https://ice2.somafm.com/groovesalad-128-mp3","type":"audio/mpeg"}],"website":"https://somafm.com/groovesalad/","genre":"Ambient","language":"English","status":"active","enabled":true},
            {"id":"somafm-deepspaceone","name":"SomaFM Deep Space One","city":"San Francisco","country":"United States","lat":37.7749,"lng":-122.4194,"streams":[{"url":"https://ice1.somafm.com/deepspaceone-128-mp3","type":"audio/mpeg"}],"website":"https://somafm.com/","genre":"Ambient","language":"English","status":"active","enabled":true},
            {"id":"somafm-dronezone","name":"SomaFM Drone Zone","city":"San Francisco","country":"United States","lat":37.7749,"lng":-122.4194,"streams":[{"url":"https://ice1.somafm.com/dronezone-128-mp3","type":"audio/mpeg"}],"website":"https://somafm.com/","genre":"Ambient","language":"English","status":"active","enabled":true},
            {"id":"somafm-defcon","name":"SomaFM DEF CON Radio","city":"San Francisco","country":"United States","lat":37.7749,"lng":-122.4194,"streams":[{"url":"https://ice1.somafm.com/defcon-128-mp3","type":"audio/mpeg"}],"website":"https://somafm.com/","genre":"Electronic","language":"English","status":"active","enabled":true},
            {"id":"somafm-secretagent","name":"SomaFM Secret Agent","city":"San Francisco","country":"United States","lat":37.7749,"lng":-122.4194,"streams":[{"url":"https://ice1.somafm.com/secretagent-128-mp3","type":"audio/mpeg"}],"website":"https://somafm.com/","genre":"Lounge","language":"English","status":"active","enabled":true},
            {"id":"radio-swiss-jazz","name":"Radio Swiss Jazz","city":"Zurich","country":"Switzerland","lat":47.3769,"lng":8.5417,"streams":[{"url":"https://stream.srg-ssr.ch/m/rsj/mp3_128","type":"audio/mpeg"}],"website":"https://www.radioswissjazz.ch","genre":"Jazz","language":"German","status":"active","enabled":true},
            {"id":"radio-swiss-classic","name":"Radio Swiss Classic","city":"Zurich","country":"Switzerland","lat":47.3769,"lng":8.5417,"streams":[{"url":"https://stream.srg-ssr.ch/m/rsc_de/mp3_128","type":"audio/mpeg"}],"website":"https://www.radioswissclassic.ch","genre":"Classical","language":"German","status":"active","enabled":true},
            {"id":"kexp-seattle","name":"KEXP 90.3 FM","city":"Seattle","country":"United States","lat":47.6062,"lng":-122.3321,"streams":[{"url":"https://kexp-mp3-128.streamguys1.com/kexp128.mp3","type":"audio/mpeg"}],"website":"https://www.kexp.org","genre":"Alternative","language":"English","status":"active","enabled":true},
            {"id":"fip-paris","name":"FIP","city":"Paris","country":"France","lat":48.8566,"lng":2.3522,"streams":[{"url":"https://icecast.radiofrance.fr/fip-midfi.mp3","type":"audio/mpeg"}],"website":"https://www.fip.fr","genre":"Eclectic","language":"French","status":"active","enabled":true},
            {"id":"bbc-radio-1","name":"BBC Radio 1","city":"London","country":"United Kingdom","lat":51.5074,"lng":-0.1278,"streams":[{"url":"https://stream.live.vc.bbcmedia.co.uk/bbc_radio_one","type":"audio/mpeg"}],"website":"https://www.bbc.co.uk/radio1","genre":"Pop","language":"English","status":"active","enabled":true},
            {"id":"bbc-radio-6","name":"BBC Radio 6 Music","city":"London","country":"United Kingdom","lat":51.5074,"lng":-0.1278,"streams":[{"url":"https://stream.live.vc.bbcmedia.co.uk/bbc_6music","type":"audio/mpeg"}],"website":"https://www.bbc.co.uk/6music","genre":"Alternative","language":"English","status":"active","enabled":true},
            {"id":"wnyc-fm","name":"WNYC FM","city":"New York","country":"United States","lat":40.7128,"lng":-74.006,"streams":[{"url":"https://fm939.wnyc.org/wnycfm","type":"audio/mpeg"}],"website":"https://www.wnyc.org","genre":"News","language":"English","status":"active","enabled":true},
            {"id":"abc-jazz","name":"ABC Jazz","city":"Sydney","country":"Australia","lat":-33.8688,"lng":151.2093,"streams":[{"url":"https://live-radio01.mediahubaustralia.com/2RAJ/mp3/","type":"audio/mpeg"}],"website":"https://www.abc.net.au/jazz","genre":"Jazz","language":"English","status":"active","enabled":true},
            {"id":"triple-j","name":"Triple J","city":"Sydney","country":"Australia","lat":-33.8688,"lng":151.2093,"streams":[{"url":"https://live-radio01.mediahubaustralia.com/2TJW/mp3/","type":"audio/mpeg"}],"website":"https://www.abc.net.au/triplej","genre":"Alternative","language":"English","status":"active","enabled":true},
            {"id":"kcrw-la","name":"KCRW 89.9 FM","city":"Los Angeles","country":"United States","lat":34.0522,"lng":-118.2437,"streams":[{"url":"https://kcrw.streamguys1.com/kcrw_192k_mp3_on_air","type":"audio/mpeg"}],"website":"https://www.kcrw.com","genre":"Eclectic","language":"English","status":"active","enabled":true},
            {"id":"npr-one","name":"NPR News","city":"Washington","country":"United States","lat":38.9072,"lng":-77.0369,"streams":[{"url":"https://npr-ice.streamguys1.com/live.mp3","type":"audio/mpeg"}],"website":"https://www.npr.org","genre":"News","language":"English","status":"active","enabled":true}
        ];
    }
    
    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Station selection (from globe or search)
        window.addEventListener('stationSelected', (e) => {
            this.handleStationSelected(e.detail);
        });
        
        // Search filter changes - update globe markers
        window.addEventListener('search:searchResults', (e) => {
            if (this.globe && typeof this.globe.updateDisplayedStations === 'function') {
                const results = e.detail?.results || [];
                this.globe.updateDisplayedStations(results);
            }
        });

        // HTTPS-only filter preference changed
        window.addEventListener('httpsOnlyChanged', () => {
            this.onHttpsOnlyChanged();
        });
        
        // Global stats updated (connected/active users from the backend)
        window.addEventListener('globalStatsUpdated', (e) => {
            const { connectedUsers, activeUsers } = e.detail || {};
            // Only update if we have valid values
            if (connectedUsers > 0 || activeUsers > 0) {
                this.updateUserStats(connectedUsers, activeUsers);
            }
        });

        // Returned from the Google OAuth redirect (see api-client.js's
        // consumeAuthRedirectParams() and backend's /auth/google/callback)
        window.addEventListener('signedInWithGoogle', (e) => {
            const { isNewUser, wasLinked } = e.detail || {};
            this.ui.showToast({
                type: 'success',
                title: 'Signed in with Google',
                message: wasLinked
                    ? 'Your favorites and history are now backed up to your Google account.'
                    : (isNewUser ? 'Welcome!' : 'Welcome back!'),
                duration: 4000
            });
            this.renderUI();
        });

        window.addEventListener('authSignInError', (e) => {
            this.ui.showToast({
                type: 'error',
                title: 'Sign-in failed',
                message: e.detail?.message || 'Something went wrong signing in with Google.',
                duration: 5000
            });
        });

        // Audio events
        this.audio.on('stationChanged', (data) => {
            this.state.currentStation = data.station;
            this.state.isPlaying = true;
            this.updateUI();
            this.updateBottomPlayer();

            // Relay as a window event for mobile.js's mini-player, which
            // listens for a plain 'stationChanged' window event (not the
            // AudioController's own internal emitter - those are two
            // different mechanisms with the same name, easy to conflate).
            // This event was never actually dispatched before, so the
            // mini-player's name/location text never updated.
            window.dispatchEvent(new CustomEvent('stationChanged', { detail: data.station }));

            // Reset idle timer
            this.resetIdleTimer();

            // Switch to Now Playing tab on mobile
            if (window.innerWidth <= 768) {
                this.ui.switchTab('nowPlaying');
                document.getElementById('sidePanel').classList.add('open');
            }
        });

        this.audio.on('stateChange', (data) => {
            this.state.isPlaying = data.state === this.audio.states.PLAYING;
            this.updatePlaybackUI();
            this.updateBottomPlayer();

            // Relay for mobile.js's mini-player play/pause icon - see the
            // 'stationChanged' dispatch above for why this is needed
            // ('playStateChanged' was never dispatched anywhere either).
            window.dispatchEvent(new CustomEvent('playStateChanged', { detail: this.state.isPlaying }));

            // Update globe audio visualization
            if (this.globe) {
                this.globe.setPlaying(this.state.isPlaying);
            }

            // Reset idle timer when playback state changes
            if (this.state.isPlaying) {
                this.resetIdleTimer();
            } else {
                this.hideVisualizer();
            }
        });
        
        this.audio.on('error', (data) => {
            this.ui.showToast({
                type: 'error',
                title: data.title,
                message: data.message,
                duration: 8000,
                action: data.action || null,
                actionLabel: 'Try Another Station'
            });
        });
        
        // Handle toast actions
        window.addEventListener('toastAction', (e) => {
            if (e.detail === 'tryAnother') {
                this.playNextStation();
            }
        });
        
        this.audio.on('warning', (data) => {
            this.ui.showToast({
                type: 'warning',
                title: data.title,
                message: data.message,
                duration: 5000
            });
        });
        
        this.audio.on('info', (data) => {
            this.ui.showToast({
                type: 'info',
                title: data.title,
                message: data.message,
                duration: 4000
            });
        });
        
        // (search:searchResults used to also be handled here via
        // handleSearchResults(), which re-rendered #searchStations with its
        // own unpaginated slice of the full result set - immediately
        // overwriting the correctly-paginated page search.js itself had
        // just rendered into that same container a moment earlier. That
        // duplicate render is what made the pagination controls look
        // "decorative" - the visible list was always this listener's
        // un-paginated version, not search.js's paginated one. Removed;
        // search.js owns rendering its own results, this file only needs
        // to react to the event for the globe-marker update above.)

        // Favorites events — fires from ANY favorite toggle anywhere (station cards,
        // Now Playing star, bottom-bar star), so this is the single place that keeps
        // every surface showing favorite state in sync with each other.
        window.addEventListener('favorites:favoritesChanged', () => {
            this.renderFavorites();
            this.renderExplore(); // Update favorite indicators
            this.renderSearch(); // Update favorite indicators
            this.renderNowPlaying(); // Update Now Playing star
            this.updateBottomPlayer(); // Update bottom-bar star
        });
        
        // Globe controls
        document.getElementById('autoRotateBtn').addEventListener('click', () => {
            const isRotating = this.globe.toggleAutoRotate();
            const btn = document.getElementById('autoRotateBtn');
            btn.classList.toggle('active', isRotating);
            btn.setAttribute('aria-pressed', isRotating);
        });
        
        // Theme toggle
        document.getElementById('themeToggleBtn').addEventListener('click', () => {
            this.ui.toggleTheme();
        });
        
        // Mobile play/pause button
        document.getElementById('mobilePlayPauseBtn')?.addEventListener('click', () => {
            this.audio.togglePlayPause();
        });

        // Mobile previous/next station buttons
        document.getElementById('mobilePrevBtn')?.addEventListener('click', () => this.playPreviousStation());
        document.getElementById('mobileNextBtn')?.addEventListener('click', () => this.playNextStation());
        
        // Side panel collapse/expand
        const sidePanel = document.getElementById('sidePanel');
        const collapseBtn = document.getElementById('collapsePanelBtn');
        const expandBtn = document.getElementById('expandPanelBtn');
        
        const collapsePanel = () => {
            sidePanel.classList.add('collapsed');
            document.body.classList.add('panel-collapsed');
            this.user.setPreference('panelCollapsed', true);
        };
        
        const expandPanel = () => {
            sidePanel.classList.remove('collapsed');
            document.body.classList.remove('panel-collapsed');
            this.user.setPreference('panelCollapsed', false);
        };
        
        collapseBtn?.addEventListener('click', collapsePanel);
        expandBtn?.addEventListener('click', expandPanel);
        
        // Apply saved panel state (body class already applied by inline script)
        if (this.user.getPreference('panelCollapsed') || document.body.classList.contains('panel-collapsed')) {
            sidePanel?.classList.add('collapsed');
            document.body.classList.add('panel-collapsed');
        }
        
        // Panel auto-collapse: always-on 15-second idle timer + click-outside
        const PANEL_IDLE_TIMEOUT = 15000; // 15 seconds
        let panelIdleTimer = null;

        const startPanelIdleTimer = () => {
            if (panelIdleTimer) clearTimeout(panelIdleTimer);
            // Only run when panel is expanded
            if (!document.body.classList.contains('panel-collapsed')) {
                panelIdleTimer = setTimeout(() => {
                    collapsePanel();
                }, PANEL_IDLE_TIMEOUT);
            }
        };

        const resetPanelIdleTimer = () => {
            if (panelIdleTimer) clearTimeout(panelIdleTimer);
            panelIdleTimer = null;
            startPanelIdleTimer();
        };

        // Pause idle timer while mouse is inside the panel; restart on leave
        sidePanel?.addEventListener('mouseenter', () => {
            if (panelIdleTimer) {
                clearTimeout(panelIdleTimer);
                panelIdleTimer = null;
            }
        });

        sidePanel?.addEventListener('mouseleave', () => {
            startPanelIdleTimer();
        });

        // Any interaction inside the panel resets the idle clock
        sidePanel?.addEventListener('click', () => resetPanelIdleTimer());
        sidePanel?.addEventListener('keydown', () => resetPanelIdleTimer());

        // Restart idle timer each time the panel is expanded
        expandBtn?.addEventListener('click', () => {
            setTimeout(startPanelIdleTimer, 100);
        });

        // Click outside the panel → collapse immediately
        document.addEventListener('click', (e) => {
            if (document.body.classList.contains('panel-collapsed')) return;
            const isInsidePanel   = sidePanel?.contains(e.target);
            const isExpandBtn     = e.target.closest('#expandPanelBtn');
            if (!isInsidePanel && !isExpandBtn) {
                collapsePanel();
            }
        });

        // Start idle timer on initial load if panel is already expanded
        startPanelIdleTimer();
        
        // Setup random flip animation for floating logo
        this.setupFloatingLogoAnimation();
        
        // Window resize
        window.addEventListener('resize', () => {
            this.ui.updateResponsive();
        });
    }
    
    /**
     * Setup keyboard shortcuts
     */
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ignore if typing in input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }
            
            switch (e.key.toLowerCase()) {
                case ' ':
                case 'k':
                    e.preventDefault();
                    this.audio.togglePlayPause();
                    break;
                    
                case 'f':
                    e.preventDefault();
                    if (this.state.currentStation) {
                        this.favorites.toggle(this.state.currentStation.id);
                    }
                    break;
                    
                case 'r':
                    e.preventDefault();
                    const isRotating = this.globe.toggleAutoRotate();
                    document.getElementById('autoRotateBtn').classList.toggle('active', isRotating);
                    break;
                    
                case 'm':
                    e.preventDefault();
                    this.audio.toggleMute();
                    break;
                    
                case 'arrowup':
                    e.preventDefault();
                    const currentVol = this.audio.getVolume();
                    this.audio.setVolume(Math.min(1, currentVol + 0.1));
                    break;
                    
                case 'arrowdown':
                    e.preventDefault();
                    const currentVol2 = this.audio.getVolume();
                    this.audio.setVolume(Math.max(0, currentVol2 - 0.1));
                    break;
            }
        });
    }
    
    // syncFavorites() removed - favorites.js is the sole source of truth
    // now (see FavoritesController.reconcileWithBackend(), awaited via
    // this.user.waitForApiClient() in init()); there's no second store on
    // UserProfile left to sync from.


    /**
     * Setup user profile button
     */
    setupUserProfile() {
        const profileBtn = document.getElementById('userProfileBtn');
        const languageBtn = document.getElementById('languageBtn');
        const shareAppBtn = document.getElementById('shareAppBtn');

        // Update profile display
        this.user.updateProfileUI();

        // Profile button click
        profileBtn?.addEventListener('click', () => {
            this.user.showProfileModal();
        });

        // Language button click
        languageBtn?.addEventListener('click', () => {
            this.user.showLanguageModal();
        });

        // Share button click — shares whatever is currently playing, or the app itself
        shareAppBtn?.addEventListener('click', () => {
            this.showShareStationModal(this.state.currentStation);
        });
    }
    
    /**
     * Setup audio visualizer
     */
    setupVisualizer() {
        this.visualizer = new AudioVisualizer();
        
        // Set initial style from user preferences
        const style = this.user.getPreference('visualizerStyle') || 'bars';
        this.visualizer.setStyle(style);
        
        // Listen for style changes
        window.addEventListener('visualizerStyleChanged', (e) => {
            this.visualizer.setStyle(e.detail);
        });
        
        // Listen for settings changes
        window.addEventListener('visualizerSettingsChanged', () => {
            this.resetIdleTimer();
        });
        
        // Visualizer toggle button
        const toggleBtn = document.getElementById('visualizerToggleBtn');
        toggleBtn?.addEventListener('click', () => {
            if (this.visualizer.isActive) {
                this.hideVisualizer();
            } else {
                // Manual click is an explicit request - always honor it,
                // regardless of the genre auto-show preference (that
                // preference only governs automatic idle-triggered display).
                this.showVisualizer({ ignoreGenreFilter: true });
            }
            toggleBtn.classList.toggle('active', this.visualizer.isActive);
        });
    }
    
    /**
     * Setup bottom player bar
     */
    setupBottomPlayer() {
        const playerBar = document.getElementById('bottomPlayerBar');
        const playPauseBtn = document.getElementById('bottomPlayPauseBtn');
        const prevBtn = document.getElementById('bottomPrevBtn');
        const nextBtn = document.getElementById('bottomNextBtn');
        const favoriteBtn = document.getElementById('bottomFavoriteBtn');
        const muteBtn = document.getElementById('bottomMuteBtn');
        const volumeSlider = document.getElementById('bottomVolumeSlider');
        
        // Set initial volume
        if (volumeSlider) {
            volumeSlider.value = this.state.volume * 100;
        }
        
        // Play/Pause
        playPauseBtn?.addEventListener('click', () => {
            // Get current state BEFORE toggle
            const wasPlaying = this.audio.isPlaying;
            
            // Toggle playback
            this.audio.togglePlayPause();
            
            // Immediately toggle is-playing class for visual feedback
            // If was playing, remove class (now paused, show play icon)
            // If was paused, add class (now playing, show pause icon)
            playPauseBtn.classList.toggle('is-playing', !wasPlaying);
        });
        
        // Previous station (from history)
        prevBtn?.addEventListener('click', () => this.playPreviousStation());
        
        // Next station (random from same genre or favorites)
        nextBtn?.addEventListener('click', () => {
            this.playNextStation();
        });

        // Favorite toggle — the favorites:favoritesChanged listener (in
        // setupEventListeners) handles refreshing every surface, including this bar.
        favoriteBtn?.addEventListener('click', () => {
            if (!this.state.currentStation) return;
            this.handleFavoriteToggle(this.state.currentStation.id);
        });

        // Mute
        muteBtn?.addEventListener('click', () => {
            this.audio.toggleMute();
            const isMuted = this.audio.isMuted;
            muteBtn.querySelector('.volume-icon').hidden = isMuted;
            muteBtn.querySelector('.mute-icon').hidden = !isMuted;
        });
        
        // Volume
        volumeSlider?.addEventListener('input', (e) => {
            const volume = parseFloat(e.target.value) / 100;
            this.audio.setVolume(volume);
            this.state.volume = volume;
            this.user.setPreference('volume', volume);
        });
    }
    
    /**
     * Play previous station (from listening history)
     */
    playPreviousStation() {
        const recent = this.user.getRecentlyPlayed(10);
        if (recent.length > 1) {
            const prevStation = this.stations.find(s => s.id === recent[1].stationId);
            if (prevStation) {
                this.handleStationSelected(prevStation);
            }
        }
    }

    /**
     * Play next station (smart selection)
     */
    playNextStation() {
        if (!this.state.currentStation) return;
        
        // Try to find similar station
        const currentGenre = this.state.currentStation.genre;
        const currentCountry = this.state.currentStation.country;
        
        const candidates = this.stations.filter(s => 
            s.id !== this.state.currentStation.id &&
            s.status === 'active' &&
            (s.genre === currentGenre || s.country === currentCountry)
        );
        
        if (candidates.length > 0) {
            const randomIndex = Math.floor(Math.random() * candidates.length);
            this.handleStationSelected(candidates[randomIndex]);
        } else {
            // Fallback to any active station
            const activeStations = this.stations.filter(s => s.status === 'active' && s.id !== this.state.currentStation.id);
            if (activeStations.length > 0) {
                const randomIndex = Math.floor(Math.random() * activeStations.length);
                this.handleStationSelected(activeStations[randomIndex]);
            }
        }
    }
    
    /**
     * Update bottom player bar
     */
    updateBottomPlayer() {
        const playerBar = document.getElementById('bottomPlayerBar');
        const playerInfo = document.getElementById('bottomPlayerInfo');
        const statsInfo = document.getElementById('bottomStatsInfo');
        const nameEl = document.getElementById('bottomPlayerName');
        const locationEl = document.getElementById('bottomPlayerLocation');
        const playPauseBtn = document.getElementById('bottomPlayPauseBtn');
        const favoriteBtn = document.getElementById('bottomFavoriteBtn');
        const playerControls = document.querySelector('.bottom-player-controls');
        const playerVolume = document.querySelector('.bottom-player-volume');
        const visualizerBtn = document.getElementById('visualizerToggleBtn');

        // Bottom bar is always visible
        playerBar.hidden = false;
        
        // Stats are ALWAYS visible on the left
        if (statsInfo) statsInfo.style.display = 'flex';
        
        if (this.state.currentStation) {
            // Show player info and controls on the right
            playerBar.classList.add('playing');
            playerBar.setAttribute('data-playing', this.state.isPlaying);
            document.body.classList.add('player-active');
            
            if (playerInfo) playerInfo.hidden = false;
            if (playerControls) playerControls.style.display = 'flex';
            if (playerVolume) playerVolume.style.display = 'flex';
            if (visualizerBtn) visualizerBtn.style.display = 'flex';
            
            nameEl.textContent = this.state.currentStation.name;
            locationEl.textContent = `${this.state.currentStation.city}, ${this.state.currentStation.country}`;
            
            // Toggle is-playing class: shows pause icon when playing, play icon when paused
            playPauseBtn?.classList.toggle('is-playing', this.state.isPlaying);

            // Reflect favorite state
            if (favoriteBtn) {
                const isFavorite = this.favorites.isFavorite(this.state.currentStation.id);
                favoriteBtn.classList.toggle('active', isFavorite);
                favoriteBtn.setAttribute('aria-label', isFavorite ? 'Remove from favorites' : 'Add to favorites');
                favoriteBtn.setAttribute('title', isFavorite ? 'Remove from favorites' : 'Add to favorites');
                const svg = favoriteBtn.querySelector('svg');
                if (svg) svg.setAttribute('fill', isFavorite ? 'currentColor' : 'none');
            }
        } else {
            // No station selected — hide station info but keep controls visible
            playerBar.classList.remove('playing');
            document.body.classList.remove('player-active');

            if (playerInfo) playerInfo.hidden = true;
            if (playerControls) playerControls.style.display = 'flex';
            if (playerVolume) playerVolume.style.display = 'flex';
            if (visualizerBtn) visualizerBtn.style.display = 'flex';
        }
    }
    
    /**
     * Update bottom bar stats directly
     */
    updateBottomBarStats(stations) {
        if (!stations || !Array.isArray(stations)) return;
        
        const total = stations.length;
        const active = stations.filter(s => s.status === 'active' || s.enabled === true).length;
        const inactive = stations.filter(s => s.status === 'inactive' || s.status === 'down' || s.enabled === false).length;
        const countries = new Set(stations.map(s => s.country).filter(Boolean)).size;
        
        // Update station stats display
        const stationStatsEl = document.getElementById('stationStatsDisplay');
        if (stationStatsEl) {
            stationStatsEl.textContent = `${total}•${active}•${inactive}•${countries}`;
            stationStatsEl.title = `${t('stations')}: ${total} | ${t('active')}: ${active} | ${t('inactive')}: ${inactive} | Countries: ${countries}`;
        }
        
        console.log(`📊 Station stats: ${total}•${active}•${inactive}•${countries}`);
    }

    /**
     * Store full station list and apply HTTPS-only visibility filter
     */
    setStationData(stations) {
        this.allStations = filterLoadableStations(stations);
        this.stations = this.applyHttpsFilter(this.allStations);
        return this.stations;
    }

    /**
     * Filter out HTTP-only stations when user preference is enabled
     */
    applyHttpsFilter(stations) {
        if (this.user?.getPreference('httpsOnly')) {
            return filterOutHttpOnlyStations(stations);
        }
        return stations || [];
    }

    /**
     * Refresh visible stations after HTTPS-only preference changes
     */
    onHttpsOnlyChanged() {
        this.stations = this.applyHttpsFilter(this.allStations);

        if (this.search) {
            this.search.setStations(this.allStations);
        }

        if (this.favorites) {
            this.favorites.stations = this.allStations;
        }

        this.updateBottomBarStats(this.stations);

        const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
        if (activeTab === 'search' && this.search) {
            this.search.applyFilters();
        } else if (this.globe?.updateDisplayedStations) {
            this.globe.updateDisplayedStations(this.stations);
        }

        this.renderUI();

        this.ui?.showToast?.({
            type: 'info',
            title: this.user.getPreference('httpsOnly') ? t('httpsOnly') : t('stations'),
            message: this.user.getPreference('httpsOnly')
                ? `${this.stations.length} HTTPS stations visible`
                : `${this.stations.length} stations visible`,
            duration: 2500
        });
    }
    
    /**
     * Update user stats display (connected/active users)
     */
    updateUserStats(connectedUsers, activeUsers) {
        const userStatsEl = document.getElementById('userStatsDisplay');
        if (userStatsEl) {
            if (connectedUsers > 0 || activeUsers > 0) {
                userStatsEl.hidden = false;
                userStatsEl.innerHTML = `<span class="user-stat connected">${connectedUsers}</span>•<span class="user-stat active">${activeUsers}</span>`;
                userStatsEl.title = `Connected: ${connectedUsers} • Active: ${activeUsers}`;
            } else {
                userStatsEl.hidden = true;
            }
        }

        console.log(`👥 User stats: ${connectedUsers}•${activeUsers}`);
    }
    
    /**
     * Initialize user stats display with defaults or existing data
     */
    initUserStats() {
        // Check if user already has stats (from the early backend profile fetch)
        const stats = this.user.getGlobalStats();
        this.updateUserStats(stats.connectedUsers || 0, stats.activeUsers || 0);
    }
    
    /**
     * Setup idle detection for visualizer
     */
    setupIdleDetection() {
        const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
        
        events.forEach(event => {
            document.addEventListener(event, () => this.resetIdleTimer(), { passive: true });
        });
        
        // Start idle timer
        this.resetIdleTimer();
    }
    
    /**
     * Setup random flip animation for floating logo
     */
    setupFloatingLogoAnimation() {
        const logoFlip = document.querySelector('.floating-logo-flip');
        if (!logoFlip) return;
        
        // Remove CSS animation - we'll control it with JS
        logoFlip.style.animation = 'none';
        
        const doFlip = () => {
            // Add flip class
            logoFlip.style.transition = 'transform 0.6s ease-in-out';
            logoFlip.style.transform = 'rotateY(180deg)';
            
            // Flip back after 600ms
            setTimeout(() => {
                logoFlip.style.transform = 'rotateY(360deg)';
                
                // Reset for next flip
                setTimeout(() => {
                    logoFlip.style.transition = 'none';
                    logoFlip.style.transform = 'rotateY(0deg)';
                }, 600);
            }, 600);
            
            // Schedule next flip at random interval (3-8 seconds)
            const nextFlip = 3000 + Math.random() * 5000;
            setTimeout(doFlip, nextFlip);
        };
        
        // Start first flip after random delay
        setTimeout(doFlip, 2000 + Math.random() * 3000);
    }
    
    /**
     * Reset idle timer
     */
    resetIdleTimer() {
        this.lastActivity = Date.now();
        
        // Hide visualizer if showing
        if (this.isIdle) {
            this.hideVisualizer();
        }
        
        this.isIdle = false;
        
        // Clear existing timer
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
        }
        
        // Don't start timer if visualizer is disabled or no station playing
        if (!this.user.getPreference('visualizerEnabled') || !this.state.isPlaying) {
            return;
        }
        
        // Start new timer
        const timeout = (this.user.getPreference('idleTimeout') || 5) * 1000;
        this.idleTimer = setTimeout(() => {
            this.onIdle();
        }, timeout);
    }
    
    /**
     * Called when user becomes idle
     */
    onIdle() {
        if (!this.state.isPlaying) return;
        if (!this.user.getPreference('visualizerEnabled')) return;
        
        this.isIdle = true;
        this.showVisualizer();
    }
    
    /**
     * Show visualizer
     */
    showVisualizer({ ignoreGenreFilter = false } = {}) {
        if (!this.visualizer) return;

        // Check if visualizer should be shown for the current station's genre
        // (only applies to automatic/idle-triggered display - an explicit
        // manual toggle click should always work, see setupVisualizer())
        const currentStation = this.audio?.currentStation;
        if (!ignoreGenreFilter && currentStation && this.user) {
            const shouldShow = this.user.shouldShowVisualizerForGenre(currentStation.genre);
            if (!shouldShow) {
                console.log(`🎵 Visualizer hidden for genre: ${currentStation.genre}`);
                return;
            }
        }
        
        // Initialize if not already
        const audioElement = document.getElementById('radioPlayer');
        if (!this.visualizer.audioContext) {
            this.visualizer.init(audioElement);
        }
        
        this.visualizer.resize();
        this.visualizer.start();
        
        document.getElementById('visualizerToggleBtn')?.classList.add('active');
    }
    
    /**
     * Hide visualizer
     */
    hideVisualizer() {
        if (!this.visualizer) return;
        
        this.visualizer.stop();
        document.getElementById('visualizerToggleBtn')?.classList.remove('active');
    }
    
    /**
     * Setup share functionality
     */
    setupShareFeatures() {
        const shareBtn = document.getElementById('shareFavoritesBtn');
        const shareModal = document.getElementById('shareModal');
        const closeModalBtn = document.getElementById('closeShareModal');
        const backdrop = shareModal?.querySelector('.modal-backdrop');
        const copyBtn = document.getElementById('copyShareLink');
        const shareTwitter = document.getElementById('shareTwitter');
        const shareWhatsApp = document.getElementById('shareWhatsApp');
        
        shareBtn?.addEventListener('click', () => {
            this.showShareModal();
        });
        
        const closeShareModal = () => {
            shareModal.hidden = true;
            shareBtn?.focus();
        };

        closeModalBtn?.addEventListener('click', closeShareModal);
        backdrop?.addEventListener('click', closeShareModal);
        
        copyBtn?.addEventListener('click', () => {
            const input = document.getElementById('shareLink');
            input.select();
            navigator.clipboard.writeText(input.value).then(() => {
                copyBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
                copyBtn.setAttribute('aria-label', 'Copied!');
                copyBtn.setAttribute('title', 'Copied!');
                setTimeout(() => {
                    copyBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
                    copyBtn.setAttribute('aria-label', 'Copy link');
                    copyBtn.setAttribute('title', 'Copy link');
                }, 2000);
            });
        });
        
        shareTwitter?.addEventListener('click', () => {
            const text = `Check out my favorite radio stations on ${window.APP_NAME || window.location.hostname}!`;
            const url = document.getElementById('shareLink').value;
            window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
        });
        
        shareWhatsApp?.addEventListener('click', () => {
            const text = `Check out my favorite radio stations on ${window.APP_NAME || window.location.hostname}! ${document.getElementById('shareLink').value}`;
            window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
        });

        // Share station modal (WhatsApp + QR code)
        const shareStationModal = document.getElementById('shareStationModal');
        const closeShareStationModalBtn = document.getElementById('closeShareStationModal');
        const shareStationBackdrop = shareStationModal?.querySelector('.modal-backdrop');
        const copyShareStationBtn = document.getElementById('copyShareStationLink');
        const shareStationWhatsApp = document.getElementById('shareStationWhatsApp');

        const closeShareStationModal = () => {
            if (shareStationModal) shareStationModal.hidden = true;
            this._shareStationTrigger?.focus();
        };

        closeShareStationModalBtn?.addEventListener('click', closeShareStationModal);
        shareStationBackdrop?.addEventListener('click', closeShareStationModal);

        // Escape closes whichever share modal is open, and returns focus to its trigger
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            if (shareModal && !shareModal.hidden) {
                closeShareModal();
            } else if (shareStationModal && !shareStationModal.hidden) {
                closeShareStationModal();
            }
        });

        copyShareStationBtn?.addEventListener('click', () => {
            const input = document.getElementById('shareStationLink');
            input.select();
            navigator.clipboard.writeText(input.value).then(() => {
                copyShareStationBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
                copyShareStationBtn.setAttribute('aria-label', 'Copied!');
                copyShareStationBtn.setAttribute('title', 'Copied!');
                setTimeout(() => {
                    copyShareStationBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
                    copyShareStationBtn.setAttribute('aria-label', 'Copy link');
                    copyShareStationBtn.setAttribute('title', 'Copy link');
                }, 2000);
            });
        });

        shareStationWhatsApp?.addEventListener('click', () => {
            const url = document.getElementById('shareStationLink').value;
            const stationName = document.getElementById('shareStationName')?.dataset.name || 'this station';
            const text = `Listen to ${stationName} on ${window.APP_NAME || window.location.hostname}! ${url}`;
            window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
        });
    }

    /**
     * Show the share modal for the currently playing (or given) station —
     * a shareable link, a WhatsApp button, and a QR code to scan on another device.
     */
    showShareStationModal(station) {
        const modal = document.getElementById('shareStationModal');
        if (!modal) return;

        this._shareStationTrigger = document.activeElement;

        const baseUrl = `${window.location.origin}${window.location.pathname}`;
        const shareUrl = station ? `${baseUrl}?station=${encodeURIComponent(station.id)}` : baseUrl;

        const titleEl = document.getElementById('shareStationModalTitle');
        if (titleEl) titleEl.textContent = station ? 'Share This Station' : 'Share This App';

        const nameEl = document.getElementById('shareStationName');
        if (nameEl) {
            nameEl.textContent = station ? `Share "${station.name}" with a friend:` : 'Share this app with a friend:';
            nameEl.dataset.name = station?.name || '';
        }

        const linkInput = document.getElementById('shareStationLink');
        if (linkInput) linkInput.value = shareUrl;

        modal.hidden = false;

        const qrContainer = document.getElementById('shareStationQr');
        if (qrContainer && window.QRCode) {
            try {
                if (this._shareQrCode) {
                    // Reuse the existing instance rather than re-instantiating, which
                    // would stack a second QR image inside the container.
                    this._shareQrCode.clear();
                    this._shareQrCode.makeCode(shareUrl);
                } else {
                    qrContainer.innerHTML = '';
                    this._shareQrCode = new window.QRCode(qrContainer, {
                        text: shareUrl,
                        width: 200,
                        height: 200,
                        colorDark: '#000000',
                        colorLight: '#ffffff',
                        // High error correction — the logo overlay covers part of the
                        // code, and this level tolerates ~30% obstruction/damage.
                        correctLevel: window.QRCode.CorrectLevel.H
                    });
                }
            } catch (error) {
                console.error('Failed to generate QR code:', error);
            }
        }
    }

    /**
     * Show share modal with generated link
     */
    showShareModal() {
        const shareData = this.user.generateShareData();
        if (!shareData) return;
        
        const baseUrl = window.location.origin + window.location.pathname;
        const shareUrl = `${baseUrl}?share=${shareData}`;
        
        document.getElementById('shareLink').value = shareUrl;
        document.getElementById('shareModal').hidden = false;
    }
    
    /**
     * Check for shared data in URL
     */
    checkSharedData() {
        const urlParams = new URLSearchParams(window.location.search);
        const shareData = urlParams.get('share');
        
        if (shareData) {
            const result = this.user.importShareData(shareData);
            if (result.success) {
                this.ui.showToast({
                    type: 'success',
                    title: 'Profile Imported!',
                    message: `Added ${result.favoritesAdded} stations to your favorites`,
                    duration: 5000
                });
                
                // importShareData() already wrote new favorites straight
                // into window.favorites (the sole source of truth) -
                // just refresh the UI.
                this.renderFavorites();
                
                // Play shared station if any
                if (result.currentStation) {
                    const station = this.stations.find(s => s.id === result.currentStation);
                    if (station) {
                        setTimeout(() => this.handleStationSelected(station), 1000);
                    }
                }
                
                // Clean URL
                window.history.replaceState({}, '', window.location.pathname);
            }
            return;
        }

        // Direct station share link (from the Now Playing share button)
        const stationId = urlParams.get('station');
        if (stationId) {
            const station = this.stations.find(s => s.id === stationId);
            if (station) {
                setTimeout(() => this.handleStationSelected(station), 500);
            }
            window.history.replaceState({}, '', window.location.pathname);
        }
    }

    /**
     * Check for last playing station and show resume banner
     */
    checkAutoResume() {
        if (!this.user.getPreference('autoResume')) return;
        
        const lastStationId = this.user.getLastStation();
        if (!lastStationId) return;
        
        const station = this.stations.find(s => s.id === lastStationId);
        if (!station) return;
        
        console.log('🔄 Showing resume banner for:', station.name);
        this.showResumeBanner(station);
    }
    
    /**
     * Show resume banner for last played station
     */
    showResumeBanner(station) {
        // Remove any existing banner
        const existingBanner = document.querySelector('.resume-banner');
        if (existingBanner) existingBanner.remove();
        
        // Create banner
        const banner = document.createElement('div');
        banner.className = 'resume-banner';
        banner.innerHTML = `
            <div class="resume-banner-content">
                <span class="resume-banner-text">${t('continueListening')} <strong>${this.ui.escapeHtml(station.name)}</strong></span>
                <button class="resume-btn" id="resumeBtn">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z"/>
                    </svg>
                    ${t('resume')}
                </button>
                <button class="resume-dismiss-btn" id="dismissResumeBtn">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        `;
        
        document.body.appendChild(banner);
        
        // Animate in
        requestAnimationFrame(() => {
            banner.classList.add('show');
        });
        
        // Resume button click
        document.getElementById('resumeBtn').addEventListener('click', () => {
            // Immediately hide banner
            banner.remove();
            
            // Show loading feedback immediately
            this.ui.showToast({
                type: 'info',
                title: 'Loading...',
                message: station.name,
                duration: 2000
            });
            
            // Start playback (don't await - let it load in background)
            this.handleStationSelected(station).catch(error => {
                console.error('Failed to resume:', error);
            });
        });
        
        // Dismiss button click
        document.getElementById('dismissResumeBtn').addEventListener('click', () => {
            banner.classList.remove('show');
            setTimeout(() => banner.remove(), 300);
        });
    }
    
    /**
     * Public method to play a station (alias for handleStationSelected)
     * Called from search.js and other components
     */
    playStation(station) {
        // Dispatch event for logger tracking
        window.dispatchEvent(new CustomEvent('station:playRequested', { 
            detail: { 
                name: station?.name, 
                id: station?.id,
                lat: station?.lat,
                lng: station?.lng,
                hasCoords: station?.lat !== 0 && station?.lng !== 0
            } 
        }));
        return this.handleStationSelected(station);
    }
    
    /**
     * Handle station selection
     */
    async handleStationSelected(station) {
        if (!station) return;

        if (typeof isStationExcepted === 'function' && isStationExcepted(station)) {
            this.ui.showToast({
                type: 'warning',
                title: t('stationUnavailable') || 'Station Unavailable',
                message: t('stationAuthRequired') || 'This station requires login and has been blocked from playback.',
                duration: 4000
            });
            return;
        }
        
        // Record play in user profile
        this.user.recordPlay(station);
        
        // Load and play station
        const success = await this.audio.loadStation(station);
        
        if (success) {
            this.state.currentStation = station;
            this.state.isPlaying = true;
            
            // Focus on station (updates marker + pans to station)
            if (this.globe && typeof this.globe.focusOnStation === 'function') {
                this.globe.focusOnStation(station);
            } else if (this.globe) {
            this.globe.updateMarker(station.id);
            }
            
            // Update UI
            this.updateUI();
            this.updateBottomPlayer();
            
            // Show success toast
            this.ui.showToast({
                type: 'success',
                title: 'Now Playing',
                message: `${station.name} - ${station.city}`,
                duration: 3000
            });
        }
    }
    
    /**
     * Handle favorite toggle
     */
    handleFavoriteToggle(stationId) {
        // FavoritesController is the sole source of truth now (no more
        // second copy on UserProfile to keep in step) - it handles its
        // own localStorage write, favorites:favoritesChanged event, and
        // best-effort backend sync internally.
        const isFavorite = this.favorites.toggle(stationId);
        const station = this.stations.find(s => s.id === stationId);

        if (station) {
            this.ui.showToast({
                type: 'success',
                title: isFavorite ? 'Added to Favorites' : 'Removed from Favorites',
                message: station.name,
                duration: 2000
            });
        }
    }
    
    /**
     * Render all UI components
     */
    renderUI() {
        this.renderExplore();
        this.renderSearch();
        this.renderFavorites();
        this.renderNowPlaying();
    }
    
    /**
     * Render explore tab - shows 10 random music stations from top 100 most popular
     */
    renderExplore() {
        const container = document.getElementById('exploreStations');
        
        // Non-music genres/tags to exclude
        const nonMusicKeywords = [
            'news', 'talk', 'sports', 'spoken', 'speech', 'podcast', 
            'politics', 'weather', 'traffic', 'comedy', 'drama',
            'religious', 'christian talk', 'public radio', 'npr',
            'education', 'business', 'finance', 'audiobook'
        ];
        
        // Filter for music stations only
        const musicStations = this.stations.filter(station => {
            const genre = (station.genre || '').toLowerCase();
            const tags = (station.tags || []).map(t => t.toLowerCase()).join(' ');
            const name = (station.name || '').toLowerCase();
            const combined = `${genre} ${tags} ${name}`;
            
            // Exclude if contains non-music keywords
            return !nonMusicKeywords.some(keyword => combined.includes(keyword));
        });
        
        // Get top 100 most popular music stations (sorted by votes)
        const top100Music = [...musicStations]
            .sort((a, b) => (b.votes || 0) - (a.votes || 0))
            .slice(0, 100);
        
        // Pick 10 random from top 100
        const shuffled = [...top100Music];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        const randomFromTop = shuffled.slice(0, 10);
        
        this.ui.renderStationList(container, randomFromTop, {
            currentStationId: this.state.currentStation?.id,
            favorites: this.favorites.getFavoriteIds(),
            onStationClick: (station) => this.handleStationSelected(station),
            onFavoriteToggle: (stationId) => this.handleFavoriteToggle(stationId)
        });
    }
    
    /**
     * Render search tab (initially shows a limited subset for performance)
     */
    renderSearch() {
        // Trigger initial filter application which will render the stations
        if (this.search) {
            this.search.applyFilters();
        } else {
            // Fallback if search not initialized yet
        const container = document.getElementById('searchStations');
            const displayStations = this.stations.slice(0, 50);
        
            this.ui.renderStationList(container, displayStations, {
            currentStationId: this.state.currentStation?.id,
            favorites: this.favorites.getFavoriteIds(),
            onStationClick: (station) => this.handleStationSelected(station),
            onFavoriteToggle: (stationId) => this.handleFavoriteToggle(stationId)
        });
            
            // Update results count
            const resultsCount = document.getElementById('resultsCount');
            if (resultsCount) {
                resultsCount.textContent = `${this.stations.length} stations`;
            }
        }
        
        // Render personalized recommendations
        this.renderRecommendations();
    }
    
    /**
     * Render favorites tab
     */
    renderFavorites() {
        const container = document.getElementById('favoriteStations');
        let favoriteStations = this.favorites.getFavoriteStations();

        if (this.user?.getPreference('httpsOnly')) {
            favoriteStations = filterOutHttpOnlyStations(favoriteStations);
        }
        
        // Render user stats
        this.renderUserStats();
        
        // Render recently played
        this.renderRecentlyPlayed();
        
        if (favoriteStations.length === 0) {
            container.innerHTML = `
                <div class="no-station">
                    <p>No favorite stations yet</p>
                    <p class="help-text">Click the star icon on any station to add it to your favorites</p>
                </div>
            `;
            return;
        }
        
        this.ui.renderStationList(container, favoriteStations, {
            currentStationId: this.state.currentStation?.id,
            favorites: this.favorites.getFavoriteIds(),
            onStationClick: (station) => this.handleStationSelected(station),
            onFavoriteToggle: (stationId) => this.handleFavoriteToggle(stationId)
        });
    }
    
    /**
     * Render user stats
     */
    renderUserStats() {
        const container = document.getElementById('userStats');
        if (!container || !this.user) return;
        
        const stats = this.user.getStats();
        
        container.innerHTML = `
            <div class="user-stat">
                <span class="user-stat-value">${stats.formattedTime}</span>
                <span class="user-stat-label">Listening</span>
            </div>
            <div class="user-stat">
                <span class="user-stat-value">${stats.stationsPlayed}</span>
                <span class="user-stat-label">Stations</span>
            </div>
            <div class="user-stat">
                <span class="user-stat-value">${stats.favoritesCount}</span>
                <span class="user-stat-label">Favorites</span>
            </div>
            <div class="user-stat">
                <span class="user-stat-value">${escapeHtml(stats.topGenre)}</span>
                <span class="user-stat-label">Top Genre</span>
            </div>
        `;
    }
    
    /**
     * Render recently played stations
     */
    renderRecentlyPlayed() {
        const section = document.getElementById('recentlyPlayedSection');
        const container = document.getElementById('recentlyPlayedStations');
        if (!section || !container || !this.user) return;
        
        const recentlyPlayed = this.user.getRecentlyPlayed(5);
        
        if (recentlyPlayed.length === 0) {
            section.hidden = true;
            return;
        }
        
        section.hidden = false;
        
        // Get full station objects
        const stations = recentlyPlayed
            .map(h => this.stations.find(s => s.id === h.stationId))
            .filter(Boolean);
        
        this.ui.renderStationList(container, stations, {
            currentStationId: this.state.currentStation?.id,
            favorites: this.favorites.getFavoriteIds(),
            onStationClick: (station) => this.handleStationSelected(station),
            onFavoriteToggle: (stationId) => this.handleFavoriteToggle(stationId)
        });
    }
    
    /**
     * Render recommendations based on user listening history
     */
    renderRecommendations() {
        const section = document.getElementById('recommendationsSection');
        const container = document.getElementById('recommendedStations');
        if (!section || !container || !this.user) return;
        
        const recommendations = this.user.getRecommendations(this.stations, 10);
        
        if (recommendations.length === 0) {
            section.hidden = true;
            return;
        }
        
        section.hidden = false;
        
        // Update subtitle based on user's preferences
        const topGenres = this.user.getTopGenres(2);
        const subtitle = section.querySelector('.recommendations-subtitle');
        if (subtitle && topGenres.length > 0) {
            subtitle.textContent = `Based on your love for ${topGenres.join(', ')}`;
        }
        
        this.ui.renderStationList(container, recommendations, {
            currentStationId: this.state.currentStation?.id,
            favorites: this.favorites.getFavoriteIds(),
            onStationClick: (station) => this.handleStationSelected(station),
            onFavoriteToggle: (stationId) => this.handleFavoriteToggle(stationId)
        });
    }
    
    /**
     * Render now playing tab
     */
    renderNowPlaying() {
        const focusedId = document.activeElement?.id;
        const nowPlayingFocusIds = ['nowPlayingPlayPause', 'nowPlayingFavoriteBtn', 'nowPlayingShareBtn', 'volumeSlider', 'muteBtn'];

        this.ui.renderNowPlaying(
            this.state.currentStation,
            this.state.isPlaying,
            this.state.volume,
            this.state.currentStation ? this.favorites.isFavorite(this.state.currentStation.id) : false
        );

        // Attach event listeners for now playing controls
        this.attachNowPlayingListeners();

        // Update mobile player
        this.ui.updateMobilePlayer(this.state.currentStation, this.state.isPlaying);

        // Restore keyboard focus if it was on a control we just rebuilt
        if (focusedId && nowPlayingFocusIds.includes(focusedId)) {
            document.getElementById(focusedId)?.focus();
        }
    }
    
    /**
     * Attach event listeners for now playing controls
     */
    attachNowPlayingListeners() {
        const playPauseBtn = document.getElementById('nowPlayingPlayPause');
        const favoriteBtn = document.getElementById('nowPlayingFavoriteBtn');
        const shareBtn = document.getElementById('nowPlayingShareBtn');
        const volumeSlider = document.getElementById('volumeSlider');
        const muteBtn = document.getElementById('muteBtn');

        if (playPauseBtn) {
            playPauseBtn.addEventListener('click', () => {
                this.audio.togglePlayPause();
            });
        }

        if (favoriteBtn) {
            favoriteBtn.addEventListener('click', () => {
                if (!this.state.currentStation) return;
                this.handleFavoriteToggle(this.state.currentStation.id);
            });
        }

        if (shareBtn) {
            shareBtn.addEventListener('click', () => {
                this.showShareStationModal(this.state.currentStation);
            });
        }

        if (volumeSlider) {
            volumeSlider.addEventListener('input', (e) => {
                const volume = parseFloat(e.target.value) / 100;
                this.audio.setVolume(volume);
                this.state.volume = volume;
                
                // Save volume preference
                if (this.user) {
                    this.user.setPreference('volume', volume);
                }
            });
        }
        
        if (muteBtn) {
            muteBtn.addEventListener('click', () => {
                this.audio.toggleMute();
            });
        }
    }
    
    /**
     * Update UI when station or playback state changes
     */
    updateUI() {
        this.renderNowPlaying();
        this.renderExplore();
        this.renderSearch();
        this.updatePlaybackUI();
    }
    
    /**
     * Update only playback-related UI elements
     */
    updatePlaybackUI() {
        // Update now playing tab
        const playPauseBtn = document.getElementById('nowPlayingPlayPause');
        if (playPauseBtn) {
            const isPlaying = this.state.isPlaying;
            playPauseBtn.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
            playPauseBtn.innerHTML = isPlaying ? `
                <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16"/>
                    <rect x="14" y="4" width="4" height="16"/>
                </svg>
            ` : `
                <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3"/>
                </svg>
            `;
        }
        
        // Update equalizer animations
        const equalizers = document.querySelectorAll('.equalizer');
        equalizers.forEach(eq => {
            if (this.state.isPlaying) {
                eq.classList.remove('paused');
            } else {
                eq.classList.add('paused');
            }
        });
        
        // Update visual indicator
        const visual = document.querySelector('.now-playing-visual');
        if (visual) {
            if (this.state.isPlaying) {
                visual.classList.add('playing');
            } else {
                visual.classList.remove('playing');
            }
        }
        
        // Update mobile player
        this.ui.updateMobilePlayer(this.state.currentStation, this.state.isPlaying);
        
        // Update station cards
        document.querySelectorAll('.station-card').forEach(card => {
            const stationId = card.getAttribute('data-station-id');
            if (stationId === this.state.currentStation?.id) {
                card.classList.add('playing');
            } else {
                card.classList.remove('playing');
            }
        });
    }
    
    /**
     * Get random stations using Fisher-Yates shuffle (more efficient)
     */
    getRandomStations(count) {
        // Use Fisher-Yates shuffle on a copy for better randomization
        const shuffled = [...this.stations];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled.slice(0, Math.min(count, shuffled.length));
    }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.app = new GlobeRadioApp();
        window.app.init();
    });
} else {
    window.app = new GlobeRadioApp();
    window.app.init();
}

// Safety timeout - hide loading screen after 30 seconds no matter what
setTimeout(() => {
    const loadingScreen = document.getElementById('loadingScreen');
    if (loadingScreen && !loadingScreen.classList.contains('hidden')) {
        console.warn('⚠️ Loading timeout - forcing loading screen to hide');
        loadingScreen.classList.add('hidden');
        // Don't show alert, just let the app continue
        console.log('App may still be loading in background...');
    }
}, 30000);
