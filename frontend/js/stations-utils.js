/**
 * stations-utils.js - Shared station helpers
 */

/**
 * Escape text for safe insertion as HTML *content* (innerHTML of an
 * element, not inside an attribute). This does NOT escape quotes - it is
 * NOT safe to use inside an attribute value. Use escapeAttr() for that.
 */
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

/**
 * Escape text for safe insertion inside an HTML attribute value
 * (e.g. `data-id="${escapeAttr(x)}"`, `title="${escapeAttr(x)}"`). Escapes
 * quotes in addition to the base HTML entities, unlike escapeHtml().
 */
function escapeAttr(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Only allow http:/https: URLs into href/src - blocks javascript:/data:
 * URI injection from station-supplied fields (favicon, website, stream url).
 */
function isSafeUrl(url) {
    if (!url) return false;
    try {
        const parsed = new URL(url, window.location.href);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

const DEFAULT_STATION_EXCEPTIONS = {
    version: 1,
    stationIds: [
        'defa0e5c-f689-4db1-97db-87ebb759f7d1',
        '4d01c3fb-75d8-11ea-b1cf-52543be04c81',
        '332f6491-d62d-48a4-b44a-fa8020896949',
        '6bfb7a7c-b811-472b-b091-5e27cb098bac',
        '97d830f4-c35f-11e9-8502-52543be04c81',
        '2c260d07-110c-473c-8a7f-df4b937b31a8',
        'dfc627d6-5bb2-11ea-be63-52543be04c81',
        'a722ad53-b10d-4087-85d8-5fabe061f758',
        '5c781485-ee91-47bc-aa2d-bbe66024ff52',
        '69cdf0f5-ed69-4bf2-be17-719a17c5681f',
        'f48ce4f1-3f31-11e8-b74d-52543be04c81',
        'f940cc74-1673-4bc8-adbc-832d5d51a012',
        'f872bfc4-b09a-405f-9c7f-d535adba238e'
    ],
    streamUrlPatterns: [
        'listen.radioking.com',
        'www.radioking.com/play/'
    ]
};

let stationExceptions = null;
let stationExceptionsLoadPromise = null;

function normalizeExceptions(data) {
    const source = data || DEFAULT_STATION_EXCEPTIONS;
    const stationIds = new Set(source.stationIds || []);
    const streamUrlPatterns = [...(source.streamUrlPatterns || [])];
    const streamUrls = new Set(
        (source.streamUrls || []).map(url => url.toLowerCase())
    );

    return { stationIds, streamUrlPatterns, streamUrls };
}

function getStationExceptions() {
    if (!stationExceptions) {
        stationExceptions = normalizeExceptions(DEFAULT_STATION_EXCEPTIONS);
    }
    return stationExceptions;
}

async function loadStationExceptions() {
    // Share the in-flight (or already-settled) fetch across every caller -
    // globe.js and search.js both call this during init. The old
    // implementation set a "loaded" boolean *before* the fetch resolved, so
    // a second concurrent caller would see "loaded" and fall back to
    // getStationExceptions()'s lazy default (the built-in list) instead of
    // waiting for the real remote data - silently skipping the actual
    // block list for that caller. Gating on the promise itself, always,
    // means every caller (concurrent or later) gets the same resolved data.
    if (!stationExceptionsLoadPromise) {
        stationExceptionsLoadPromise = (async () => {
            try {
                const response = await fetch(`data/station-exceptions.json?v=${Date.now()}`);
                if (response.ok) {
                    const data = await response.json();
                    stationExceptions = normalizeExceptions(data);
                    const blockedCount = stationExceptions.stationIds.size;
                    console.log(`🚫 Loaded station exception list (${blockedCount} IDs, ${stationExceptions.streamUrlPatterns.length} URL patterns)`);
                    return stationExceptions;
                }
            } catch (error) {
                console.warn('Could not load station-exceptions.json, using built-in fallback:', error.message);
            }

            stationExceptions = normalizeExceptions(DEFAULT_STATION_EXCEPTIONS);
            return stationExceptions;
        })();
    }

    return stationExceptionsLoadPromise;
}

function getStationStreamUrls(station) {
    return (station?.streams || [])
        .map(stream => stream?.url)
        .filter(Boolean);
}

function isStreamUrlExcepted(url, exceptions) {
    if (!url) return false;

    const lowerUrl = url.toLowerCase();
    const ex = exceptions || getStationExceptions();

    if (ex.streamUrls.has(lowerUrl)) {
        return true;
    }

    return ex.streamUrlPatterns.some(pattern =>
        lowerUrl.includes(pattern.toLowerCase())
    );
}

function isStationExcepted(station, exceptions) {
    if (!station) return false;

    const ex = exceptions || getStationExceptions();

    if (station.id && ex.stationIds.has(station.id)) {
        return true;
    }

    return getStationStreamUrls(station).some(url => isStreamUrlExcepted(url, ex));
}

function filterExceptedStations(stations, exceptions) {
    const ex = exceptions || getStationExceptions();
    const input = stations || [];
    const filtered = input.filter(station => !isStationExcepted(station, ex));
    const removed = input.length - filtered.length;

    if (removed > 0) {
        console.log(`🚫 Excluded ${removed} blocked station(s) (login-required / unsupported stream)`);
    }

    return filtered;
}

function filterLoadableStations(stations, exceptions) {
    const enabled = (stations || []).filter(station => station.enabled !== false);
    return filterExceptedStations(enabled, exceptions);
}

function isHttpOnlyStation(station) {
    if (!station?.streams?.length) {
        return false;
    }

    // Web-player streams are not HTTP-only (they're embedded iframes)
    const hasWebPlayer = station.streams.some(stream => stream.type === 'web-player');
    if (hasWebPlayer) {
        return false;
    }

    const hasHttps = station.streams.some(stream =>
        stream.url && stream.url.toLowerCase().startsWith('https://')
    );

    return !hasHttps;
}

function filterOutHttpOnlyStations(stations) {
    return (stations || []).filter(station => !isHttpOnlyStation(station));
}

/**
 * Angular distance in degrees between two coordinates (fast approximation)
 */
function angularDistanceDegrees(lat1, lng1, lat2, lng2) {
    const dLat = lat2 - lat1;
    let dLng = lng2 - lng1;
    if (dLng > 180) dLng -= 360;
    if (dLng < -180) dLng += 360;
    return Math.sqrt(dLat * dLat + dLng * dLng);
}

/**
 * Find stations near a geographic click, sorted by distance then popularity
 */
function findStationsNearLocation(stations, lat, lng, maxDegrees = 4) {
    return (stations || [])
        .filter(station => {
            if (typeof station?.lat !== 'number' || typeof station?.lng !== 'number') {
                return false;
            }
            return angularDistanceDegrees(station.lat, station.lng, lat, lng) <= maxDegrees;
        })
        .sort((a, b) => {
            const distA = angularDistanceDegrees(a.lat, a.lng, lat, lng);
            const distB = angularDistanceDegrees(b.lat, b.lng, lat, lng);
            if (Math.abs(distA - distB) > 0.001) {
                return distA - distB;
            }
            return (b.votes || 0) - (a.votes || 0);
        });
}

/**
 * Resolve which station(s) match a map/globe click at lat/lng
 */
function resolveStationsAtClick(stations, lat, lng, maxDegrees = 4) {
    const candidates = findStationsNearLocation(stations, lat, lng, maxDegrees);
    if (candidates.length === 0) {
        return { station: null, candidates: [], needsPicker: false };
    }
    if (candidates.length === 1) {
        return { station: candidates[0], candidates, needsPicker: false };
    }

    const nearest = candidates[0];
    const stacked = candidates.filter(station =>
        angularDistanceDegrees(station.lat, station.lng, nearest.lat, nearest.lng) < 0.08
    );

    if (stacked.length > 1) {
        return { station: null, candidates: stacked, needsPicker: true };
    }

    return { station: nearest, candidates, needsPicker: false };
}

/**
 * Apply user visibility filters for map/globe display
 */
function filterStationsForDisplay(stations) {
    let pool = filterExceptedStations(stations || []);
    if (window.app?.user?.getPreference('httpsOnly')) {
        pool = filterOutHttpOnlyStations(pool);
    }
    return pool;
}
