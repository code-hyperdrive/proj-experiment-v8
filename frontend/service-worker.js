/**
 * Service Worker for Radio Explorer PWA
 * Provides offline caching and background audio support
 *
 * Release checklist: every deploy that changes cached files (JS/CSS/HTML)
 * should bump BOTH the cache suffix below AND the "version" field in
 * version.json (at the repo root) to the same release number — index.html
 * polls version.json on load to detect a stale client and force a refresh.
 */

// Single source of truth for the static-asset cache version - bump this
// (and version.json's "version" field, to the same value) on every deploy
// that changes any cached JS/CSS/HTML. There used to be a separate,
// never-read CACHE_NAME constant here that looked like the thing to bump -
// don't reintroduce that trap.
const RELEASE = '1.2.7';
const STATIC_CACHE = `radio-explorer-static-v${RELEASE}`;
const DATA_CACHE = 'radio-explorer-data-v5';

// Files to cache for offline use
const STATIC_FILES = [
    './',
    './index.html',
    './assets/styles.css',
    './assets/images/logo.png',
    './assets/images/logo-16.png',
    './assets/images/logo-32.png',
    './assets/images/logo-180.png',
    './assets/images/logo-192.png',
    './assets/images/logo-512.png',
    './js/api-client.js',
    './js/app.js',
    './js/audio.js',
    './js/favorites.js',
    './js/globe.js',
    './js/i18n.js',
    './js/install.js',
    './js/logger.js',
    './js/mobile.js',
    './js/search.js',
    './js/stations-utils.js',
    './js/ui.js',
    './js/user.js',
    './js/visualizer.js',
    './manifest.json'
];

// Files that can be cached on demand
const CACHEABLE_PATTERNS = [
    /\.js$/,
    /\.css$/,
    /\.png$/,
    /\.jpg$/,
    /\.svg$/,
    /\.woff2?$/,
    /\.json$/
];

/**
 * Install event - cache static files
 */
self.addEventListener('install', (event) => {
    console.log('[ServiceWorker] Installing...');
    
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                console.log('[ServiceWorker] Caching static files');
                return cache.addAll(STATIC_FILES);
            })
            .then(() => {
                console.log('[ServiceWorker] Static files cached');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[ServiceWorker] Failed to cache static files:', error);
            })
    );
});

/**
 * Activate event - clean up old caches
 */
self.addEventListener('activate', (event) => {
    console.log('[ServiceWorker] Activating...');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== STATIC_CACHE && name !== DATA_CACHE)
                        .map((name) => {
                            console.log('[ServiceWorker] Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => {
                console.log('[ServiceWorker] Activated');
                return self.clients.claim();
            })
    );
});

/**
 * Fetch event - serve from cache, fallback to network
 */
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }
    
    // Skip cross-origin requests (except CDN resources)
    if (url.origin !== location.origin && 
        !url.hostname.includes('unpkg.com') &&
        !url.hostname.includes('gstatic.com') &&
        !url.hostname.includes('googleapis.com') &&
        !url.hostname.includes('fonts.googleapis.com')) {
        return;
    }
    
    // Skip audio streams - they should not be cached
    if (url.pathname.includes('/stream') ||
        url.pathname.includes('/proxy') ||
        request.headers.get('range')) {
        return;
    }

    // version.json is the source of truth the app polls to detect new
    // releases — it must always hit the network uncached, otherwise the
    // client can never notice an update happened.
    if (url.pathname.endsWith('/version.json')) {
        return;
    }

    // For API/data requests, use network-first strategy
    if (url.pathname.includes('/data/') || url.pathname.includes('stations.json')) {
        event.respondWith(networkFirst(request, DATA_CACHE));
        return;
    }

    // Page navigations must always be network-first. _headers sets
    // no-cache/no-store on '/' and '/index.html', but that only governs the
    // HTTP/edge cache - this service worker sits in front of it, and a
    // cache-first strategy here would silently serve a stale index.html
    // (and therefore stale, un-updated ?v=N script URLs) forever, bypassing
    // those headers entirely and defeating checkAppVersion()'s update check.
    if (request.mode === 'navigate') {
        event.respondWith(networkFirst(request, STATIC_CACHE));
        return;
    }

    // For static assets, use cache-first strategy
    event.respondWith(cacheFirst(request, STATIC_CACHE));
});

/**
 * Cache-first strategy
 */
async function cacheFirst(request, cacheName) {
    try {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        
        const networkResponse = await fetch(request);
        
        // Cache successful responses
        if (networkResponse.ok && shouldCache(request)) {
            const cache = await caches.open(cacheName);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.error('[ServiceWorker] Cache-first failed:', error);
        
        // Return offline fallback for navigation requests
        if (request.mode === 'navigate') {
            const cache = await caches.open(STATIC_CACHE);
            return cache.match('./index.html');
        }
        
        throw error;
    }
}

/**
 * Network-first strategy
 */
async function networkFirst(request, cacheName) {
    try {
        const networkResponse = await fetch(request);
        
        // Cache successful responses
        if (networkResponse.ok) {
            const cache = await caches.open(cacheName);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.log('[ServiceWorker] Network failed, trying cache:', request.url);
        
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        
        throw error;
    }
}

/**
 * Check if request should be cached
 */
function shouldCache(request) {
    const url = new URL(request.url);
    return CACHEABLE_PATTERNS.some(pattern => pattern.test(url.pathname));
}

/**
 * Handle messages from the main thread
 */
self.addEventListener('message', (event) => {
    if (event.data === 'skipWaiting' || event.data?.type === 'SKIP_WAITING') {
        console.log('[ServiceWorker] SKIP_WAITING received');
        self.skipWaiting();
    }

    if (event.data === 'clearCache') {
        caches.keys().then((names) => {
            names.forEach((name) => caches.delete(name));
        });
    }
});

/**
 * Background sync for favorites
 */
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-favorites') {
        event.waitUntil(syncFavorites());
    }
});

async function syncFavorites() {
    // This would sync favorites to the server
    // Implementation depends on your backend
    console.log('[ServiceWorker] Syncing favorites...');
}

console.log('[ServiceWorker] Loaded');
