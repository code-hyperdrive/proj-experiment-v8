/**
 * audio.js - Audio Player Controller
 * Handles HTML5 audio playback, stream management, and error handling
 */

class AudioController {
    constructor() {
        this.audio = document.getElementById('radioPlayer');
        this.currentStation = null;
        this.isPlaying = false;
        // Distinct from isPlaying: reflects the user's last explicit
        // intent (via play()/pause()/stop()), not the audio element's
        // actual current state. The native 'pause' event sets isPlaying
        // false whenever the element pauses for ANY reason, including a
        // silent browser-forced pause while backgrounded - if the stall
        // watchdog gated on isPlaying alone, it would mistake "browser
        // killed it" for "user paused it" and never attempt recovery.
        this.intendedToPlay = false;
        this.volume = 0.7;
        this.isMuted = false;
        this.currentStreamIndex = 0;
        this.loadGeneration = 0; // increments on every loadStation() call so stale retry chains can bail out

        // Active hls.js instance, when the current stream needs it (HLS/.m3u8
        // stream on a browser with no native HLS support — i.e. not
        // Safari). null whenever native <audio> playback is in use. See
        // isHlsStream()/destroyHls() and the branch in tryNextStream().
        this.hls = null;

        // Web-player properties
        this.isWebPlayer = false;
        this.webPlayerStation = null;
        this.currentWebPlayerFrame = null;
        this.webPlayerAPI = null;

        // Proxy URL for HTTP streams on HTTPS pages
        // Set this to your proxy server URL, e.g., 'https://localhost:8444/proxy'
        this.proxyUrl = this.detectProxyUrl();
        // Always enable proxy on HTTPS pages by default
        this.proxyEnabled = window.location.protocol === 'https:';
        
        // Debug mode - show real errors when ?debug=true or ?error=true in URL
        const urlParams = new URLSearchParams(window.location.search);
        this.debugMode = urlParams.get('debug') === 'true' || urlParams.get('error') === 'true';
        
        // Audio states
        this.states = {
            IDLE: 'idle',
            LOADING: 'loading',
            PLAYING: 'playing',
            PAUSED: 'paused',
            ERROR: 'error',
            BUFFERING: 'buffering'
        };
        
        this.currentState = this.states.IDLE;
        this.listeners = {};
        this.stallTimeout = null;
        this.playPromise = null; // Track current play promise

        // Buffering strategy properties
        this.minBufferDuration = 3; // minimum seconds to buffer before playing
        this.bufferMonitorTimeout = null;
        this.lastBufferedTime = 0;
        this.bufferWarnTime = 0;
        this.networkInfo = this.detectNetworkInfo();

        // Background-playback watchdog - mobile browsers (especially when
        // the tab/app is minimized) will sometimes silently stall or pause
        // a live stream without ever firing 'error' or 'ended' (e.g. a
        // brief network hiccup while backgrounded). Without this, the user
        // only discovers it's dead when they come back and nothing is
        // playing. See startStallWatchdog()/checkStreamHealth() below.
        this.watchdogInterval = null;
        this.lastWatchdogCurrentTime = 0;
        this.lastLoadStationAt = 0;
        this.consecutiveRecoveryAttempts = 0;

        this.init();
    }
    
    /**
     * Detect network information for adaptive buffering
     */
    detectNetworkInfo() {
        if (!navigator.connection) {
            return { effectiveType: 'unknown', saveData: false };
        }
        return {
            effectiveType: navigator.connection.effectiveType, // 4g, 3g, 2g, slow-2g
            saveData: navigator.connection.saveData || false,
            downlink: navigator.connection.downlink || null,
            rtt: navigator.connection.rtt || null
        };
    }

    /**
     * Check if connection is slow/unstable based on Network Information API
     */
    isSlowConnection() {
        if (!navigator.connection) return false;
        const effectiveType = navigator.connection.effectiveType;
        return effectiveType === '2g' || effectiveType === '3g' || effectiveType === 'slow-2g';
    }

    /**
     * Adjust minimum buffer duration based on network conditions
     */
    updateMinBufferDuration() {
        if (this.isSlowConnection()) {
            this.minBufferDuration = 8; // Longer buffer for slow connections
        } else if (navigator.connection?.effectiveType === '4g') {
            this.minBufferDuration = 2; // Shorter buffer for fast connections
        } else {
            this.minBufferDuration = 3; // Default
        }
    }

    /**
     * Detect and validate proxy URL
     */
    
    /*
    detectProxyUrl() {
        // Check localStorage for configured proxy
        const savedProxy = localStorage.getItem('globeRadio_proxyUrl');
        if (savedProxy) {
            return savedProxy;
        }
        
        // Check for production proxy URL in environment
        // For GitHub Pages, you can set up an external CORS proxy service
        // Examples: cors-anywhere, allorigins, or your own proxy server
        
        // Check if we're on GitHub Pages (*.github.io)
        const isGitHubPages = window.location.hostname.endsWith('.github.io');
        
        if (isGitHubPages) {
            // On GitHub Pages, we can't run our own proxy
            // Use a public CORS proxy or leave null (HTTPS-only streams will work)
            // You can configure a custom proxy URL in localStorage
            console.log('📡 Running on GitHub Pages - HTTP streams may not work without a proxy');
            return null;
        }
        
        // Default proxy URL (local development)
        const defaultProxy = 'https://localhost:8444/proxy';
        
        // Only use proxy on HTTPS pages
        if (window.location.protocol !== 'https:') {
            return null;
        }
        
        return defaultProxy;
    }
    */

    detectProxyUrl() {
        // Check localStorage for configured proxy
        const savedProxy = localStorage.getItem('globeRadio_proxyUrl');
        if (savedProxy) {
            return savedProxy;
        }
        
        // Production Cloudflare Worker proxy
        const CLOUDFLARE_PROXY = 'https://proxy.ramsharans-rathore.workers.dev';
        
        // Only use proxy on HTTPS pages
        if (window.location.protocol !== 'https:') {
            return null;
        }
        
        return CLOUDFLARE_PROXY;
    }
    
    /**
     * Set custom proxy URL
     */
    setProxyUrl(url) {
        this.proxyUrl = url;
        if (url) {
            localStorage.setItem('globeRadio_proxyUrl', url);
        } else {
            localStorage.removeItem('globeRadio_proxyUrl');
        }
    }
    
    /**
     * Enable or disable proxy
     */
    setProxyEnabled(enabled) {
        this.proxyEnabled = enabled;
        localStorage.setItem('globeRadio_proxyEnabled', enabled ? 'true' : 'false');
    }
    
    /**
     * Check if proxy server is available
     */
    async checkProxyHealth() {
        if (!this.proxyUrl) return false;

        try {
            // Append /health to the base proxy URL — do NOT use string.replace()
            // because the proxy hostname itself contains "proxy" and replace()
            // would corrupt it (e.g. https://proxy.foo.workers.dev →
            // https://health.foo.workers.dev which doesn't exist).
            const base = this.proxyUrl.replace(/\/$/, ''); // strip trailing slash
            const healthUrl = `${base}/health`;
            const response = await fetch(healthUrl, {
                method: 'GET',
                mode: 'cors',
                cache: 'no-cache'
            });

            if (response.ok) {
                return true;
            }
            return false;
        } catch (error) {
            return false;
        }
    }
    
    /**
     * Auto-detect and enable proxy if available
     */
    async autoEnableProxy() {
        const isHealthy = await this.checkProxyHealth();
        if (isHealthy) {
            this.setProxyEnabled(true);
            return true;
        }
        this.setProxyEnabled(false);
        return false;
    }
    
    /**
     * Initialize audio element and event listeners
     */
    init() {
        // Set initial volume
        this.audio.volume = this.volume;

        // Update buffer duration based on network conditions
        this.updateMinBufferDuration();

        // Listen for network changes to adapt buffering strategy
        if (navigator.connection) {
            navigator.connection.addEventListener('change', () => {
                this.networkInfo = this.detectNetworkInfo();
                this.updateMinBufferDuration();
                console.log('📡 Network change detected:', this.networkInfo.effectiveType, 'minBuffer:', this.minBufferDuration + 's');
            });
        }

        // Audio element events
        this.audio.addEventListener('loadstart', () => {
            this.setState(this.states.LOADING);
            this.startBufferMonitoring();
        });

        this.audio.addEventListener('progress', () => {
            // Monitor buffer progress
            const buffered = this.audio.buffered;
            if (buffered.length > 0) {
                const bufferedEnd = buffered.end(buffered.length - 1);
                const currentTime = this.audio.currentTime;
                const bufferedDuration = bufferedEnd - currentTime;

                // Update last buffered time for monitoring
                this.lastBufferedTime = bufferedEnd;

                // Emit progress for UI updates
                this.emit('bufferProgress', {
                    bufferedEnd: bufferedEnd,
                    currentTime: currentTime,
                    bufferedDuration: bufferedDuration
                });
            }
        });

        this.audio.addEventListener('canplay', () => {
            // Ensure minimum buffer before resuming from pause/stall
            const buffered = this.audio.buffered;
            if (buffered.length > 0) {
                const bufferedEnd = buffered.end(buffered.length - 1);
                const bufferedDuration = bufferedEnd - this.audio.currentTime;

                // Only transition to playing if we have sufficient buffer
                if (bufferedDuration >= this.minBufferDuration || this.audio.duration === Infinity) {
                    if (this.currentState === this.states.LOADING || this.currentState === this.states.BUFFERING) {
                        this.setState(this.states.PLAYING);
                    }
                }
            }
        });

        this.audio.addEventListener('playing', () => {
            this.isPlaying = true;
            this.setState(this.states.PLAYING);
            this.startBufferMonitoring();
            // Clear any stall timeout
            if (this.stallTimeout) {
                clearTimeout(this.stallTimeout);
                this.stallTimeout = null;
            }
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
        });

        this.audio.addEventListener('pause', () => {
            this.isPlaying = false;
            this.setState(this.states.PAUSED);
            this.stopBufferMonitoring();
            if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
        });

        this.audio.addEventListener('waiting', () => {
            this.setState(this.states.BUFFERING);
            this.bufferWarnTime = Date.now();
        });

        this.audio.addEventListener('stalled', () => {
            // Detect stall condition
            if (!this.stallTimeout) {
                this.stallTimeout = setTimeout(() => {
                    if (this.currentState === this.states.BUFFERING) {
                        const stallDuration = (Date.now() - this.bufferWarnTime) / 1000;
                        const networkStatus = this.networkInfo.effectiveType || 'unknown';
                        console.warn('⚠️ Stream stalled for', stallDuration.toFixed(1) + 's', '(Network:', networkStatus + ')');

                        this.emit('info', {
                            title: 'Buffering (' + networkStatus + ' network)',
                            message: 'Loading stream, please wait...'
                        });
                    }
                    this.stallTimeout = null;
                }, 3000); // Shorter timeout for faster feedback
            }
        });

        this.audio.addEventListener('error', (e) => {
            this.handleError(e);
        });

        this.audio.addEventListener('ended', () => {
            // Streams typically don't end, but if they do, try to reconnect
            if (this.currentStation) {
                this.emit('info', {
                    title: 'Stream Ended',
                    message: 'Attempting to reconnect...'
                });
                setTimeout(() => this.play(), 2000);
            }
        });

        this.audio.addEventListener('volumechange', () => {
            this.emit('volumeChange', { volume: this.audio.volume, muted: this.audio.muted });
        });

        this.setupMediaSession();
        this.startStallWatchdog();
        this.setupVisibilityRecovery();
    }

    /**
     * Register with the Media Session API so the OS/browser recognizes this
     * as an active, legitimate media session (lock-screen/notification
     * controls, hardware media keys) — mobile browsers are considerably
     * more likely to suspend background audio that isn't tied to a
     * registered media session, so this isn't just cosmetic.
     */
    setupMediaSession() {
        if (!('mediaSession' in navigator)) return;

        try {
            navigator.mediaSession.setActionHandler('play', () => {
                this.play().catch(() => {});
            });
            navigator.mediaSession.setActionHandler('pause', () => {
                this.pause();
            });
            navigator.mediaSession.setActionHandler('stop', () => {
                this.stop();
            });
            navigator.mediaSession.setActionHandler('previoustrack', () => {
                window.app?.playPreviousStation?.();
            });
            navigator.mediaSession.setActionHandler('nexttrack', () => {
                window.app?.playNextStation?.();
            });
        } catch (e) {
            // Some browsers support MediaSession but not every action handler
            console.log('ℹ️ MediaSession action handlers partially unsupported:', e.message);
        }
    }

    /**
     * Update the Media Session metadata (lock screen / notification info)
     * for the station currently loaded.
     */
    updateMediaSessionMetadata(station) {
        if (!('mediaSession' in navigator) || !station || typeof MediaMetadata === 'undefined') return;

        try {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: station.name || 'Radio Explorer',
                artist: [station.city, station.country].filter(Boolean).join(', '),
                album: 'Radio Explorer',
                artwork: station.favicon ? [{ src: station.favicon, sizes: '512x512', type: 'image/png' }] : []
            });
        } catch (e) {
            console.log('ℹ️ Could not set MediaSession metadata:', e.message);
        }
    }

    /**
     * Periodically verify the stream is actually advancing while we expect
     * it to be playing. Backgrounded mobile tabs can silently stall/pause a
     * live stream (network hiccup, OS media focus change, etc.) without
     * ever firing 'error' or 'ended' - left unchecked, the radio just goes
     * silent until the user notices and manually restarts it.
     */
    startStallWatchdog() {
        if (this.watchdogInterval) clearInterval(this.watchdogInterval);
        this.watchdogInterval = setInterval(() => this.checkStreamHealth(), 15000);
    }

    checkStreamHealth() {
        if (this.isWebPlayer) return; // the embedded web-player manages its own playback
        // Gate on intendedToPlay (the user's last explicit request), not
        // isPlaying (the audio element's actual state) - isPlaying gets
        // set false by the native 'pause' event for ANY pause, including a
        // silent browser-forced one, which is exactly the case this
        // watchdog exists to catch and recover from.
        if (!this.currentStation || !this.intendedToPlay) return;

        // Don't treat "still loading" or "buffering" as a stall - a station
        // that's slow to start (autoplay blocked, waiting on the network,
        // still filling the initial buffer) is not what this watchdog is
        // for, and without this gate it would call recoverStream() every
        // 15s (plus on every visibilitychange) against a station that
        // simply hasn't finished loading yet - reloading a slow stream
        // repeatedly only makes it slower.
        if (this.currentState === this.states.LOADING || this.currentState === this.states.BUFFERING) {
            return;
        }

        // Grace period after a fresh loadStation()/recoverStream() call -
        // give a stream at least this long to actually start before the
        // watchdog is allowed to judge it stalled.
        const GRACE_PERIOD_MS = 12000;
        if (Date.now() - this.lastLoadStationAt < GRACE_PERIOD_MS) {
            return;
        }

        const audio = this.audio;
        const currentTime = audio.currentTime;
        // readyState < 3 (HAVE_FUTURE_DATA) means it doesn't have enough
        // data to keep playing right now - combined with the position not
        // having moved since our last check, that's a genuine stall rather
        // than just a slow poll interval.
        const stalled = audio.paused || (currentTime === this.lastWatchdogCurrentTime && audio.readyState < 3);
        this.lastWatchdogCurrentTime = currentTime;

        if (stalled) {
            // Cap consecutive recovery attempts - a station that's blocked
            // by autoplay policy (NotAllowedError) or genuinely dead looks
            // identical to "stalled" from here, and without a cap this
            // would retry it forever every 15s. After a few attempts, stop
            // and let the normal error-handling path (which the user can
            // see and act on) take over instead of silently looping.
            const MAX_CONSECUTIVE_ATTEMPTS = 3;
            if (this.consecutiveRecoveryAttempts >= MAX_CONSECUTIVE_ATTEMPTS) {
                return;
            }
            this.consecutiveRecoveryAttempts++;
            console.warn(`🔄 Background watchdog: stream appears stalled/paused unexpectedly, attempting recovery (${this.consecutiveRecoveryAttempts}/${MAX_CONSECUTIVE_ATTEMPTS})`);
            this.recoverStream();
        } else {
            this.consecutiveRecoveryAttempts = 0;
        }
    }

    /**
     * Re-attempt the current stream from its last-known-good URL (rather
     * than starting over from streams[0]) - if the working fallback stream
     * had already been switched to before the stall, this avoids retrying
     * a stream URL that was already known to be dead.
     */
    recoverStream() {
        if (!this.currentStation || this.isWebPlayer) return;
        this.lastLoadStationAt = Date.now();
        const generation = ++this.loadGeneration;
        this.tryNextStream(generation).catch(() => {});
    }

    /**
     * Immediately re-check stream health the moment the tab/app comes back
     * to the foreground, rather than waiting for the next watchdog tick -
     * background setInterval timers are throttled/frozen by many mobile
     * browsers, but visibilitychange itself always fires promptly.
     */
    setupVisibilityRecovery() {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this.checkStreamHealth();
            }
        });
    }

    /**
     * Monitor buffer health and handle network issues
     */
    startBufferMonitoring() {
        if (this.bufferMonitorTimeout) {
            clearInterval(this.bufferMonitorTimeout);
        }

        this.bufferMonitorTimeout = setInterval(() => {
            if (!this.isPlaying) {
                this.stopBufferMonitoring();
                return;
            }

            const buffered = this.audio.buffered;
            if (buffered.length === 0) return;

            const bufferedEnd = buffered.end(buffered.length - 1);
            const currentTime = this.audio.currentTime;
            const bufferedDuration = bufferedEnd - currentTime;

            // Check if buffer is dropping below minimum
            if (bufferedDuration < this.minBufferDuration * 0.5 && !this.isSlowConnection()) {
                // Likely network issue, increase buffer expectation
                console.warn('⚠️ Buffer dropping:', bufferedDuration.toFixed(1) + 's');
            }

            // Debug: log buffer status for slow connections
            if (this.isSlowConnection() && Math.random() < 0.1) { // Sample 10%
                console.log('📊 Buffer:', bufferedDuration.toFixed(1) + 's', 'Current:', currentTime.toFixed(1) + 's', 'Network:', this.networkInfo.effectiveType);
            }
        }, 1000);
    }

    /**
     * Stop buffer monitoring
     */
    stopBufferMonitoring() {
        if (this.bufferMonitorTimeout) {
            clearInterval(this.bufferMonitorTimeout);
            this.bufferMonitorTimeout = null;
        }
    }
    
    /**
     * Load and play a station
     */
    async loadStation(station) {
        console.log('🎧 AudioController.loadStation called with:', station.name, 'ID:', station.id);

        if (!station || !station.streams || station.streams.length === 0) {
            this.emit('error', {
                title: 'Invalid Station',
                message: 'This station has no available streams.'
            });
            return false;
        }

        // Check if this is a web-player type station
        const firstStream = station.streams[0];
        if (firstStream?.type === 'web-player') {
            return this.loadWebPlayer(station);
        }

        // Invalidate any in-flight retry chain from a previous loadStation() call
        // so it can't act on stale state once this one takes over.
        const generation = ++this.loadGeneration;

        // Stop current playback (non-blocking — don't wait on a possibly-slow pending play())
        this.stop();

        this.currentStation = station;
        this.currentStreamIndex = 0;
        this.updateMediaSessionMetadata(station);
        this.lastLoadStationAt = Date.now();
        this.consecutiveRecoveryAttempts = 0;

        return this.tryNextStream(generation);
    }

    /**
     * Try to play the next available stream
     */
    async tryNextStream(generation = this.loadGeneration) {
        if (generation !== this.loadGeneration) {
            // A newer loadStation() call has superseded this retry chain.
            return false;
        }

        if (!this.currentStation || this.currentStreamIndex >= this.currentStation.streams.length) {
            // Check if all failures were due to HTTP/HTTPS mismatch
            const isSecurePage = window.location.protocol === 'https:';
            const hasOnlyHttpStreams = this.currentStation?.streams?.every(s => s.url?.startsWith('http://'));
            
            let errorTitle, errorMessage;
            
            if (isSecurePage && hasOnlyHttpStreams) {
                errorTitle = t('streamError');
                errorMessage = t('httpOnlyError');
            } else {
                errorTitle = t('streamError');
                errorMessage = t('stationOfflineError');
            }
            
            // Debug mode: show real technical details
            if (this.debugMode) {
                const streamUrls = this.currentStation?.streams?.map(s => s.url).join('\n') || 'No streams';
                errorTitle = 'Stream Error (Debug)';
                errorMessage = `Station: ${this.currentStation?.name}\n\nAll ${this.currentStation?.streams?.length || 0} streams failed.\n\nURLs tried:\n${streamUrls}`;
            }
            
            this.emit('error', {
                title: errorTitle,
                message: errorMessage
            });
            this.setState(this.states.ERROR);
            return false;
        }
        
        let stream = this.currentStation.streams[this.currentStreamIndex];
        let streamUrl = stream.url;
        
        // Check if we should use proxy
        const isSecurePage = window.location.protocol === 'https:';
        const isHttpStream = streamUrl.startsWith('http://');
        const useProxy = this.proxyUrl && this.proxyEnabled;
        
        if (useProxy) {
            // Use proxy for all streams to bypass CORS
            const proxiedUrl = `${this.proxyUrl}?url=${encodeURIComponent(streamUrl)}`;
            streamUrl = proxiedUrl;
            stream = { ...stream, url: proxiedUrl, proxied: true };
        } else if (isSecurePage && isHttpStream) {
            // No proxy available, try HTTPS upgrade
            const httpsUrl = streamUrl.replace('http://', 'https://');
            streamUrl = httpsUrl;
            stream = { ...stream, url: httpsUrl, upgraded: true };
        }
        
        // Check browser support for stream type. HLS (.m3u8) streams get a
        // second path via hls.js (MediaSource-based) rather than handing
        // the .m3u8 straight to <audio>.src.
        //
        // hls.js is *preferred* whenever it's available (Hls.isSupported()
        // — true almost everywhere with MediaSource Extensions), rather
        // than only being a fallback for browsers with zero native HLS
        // support. Two real, confirmed reasons this isn't just extra
        // caution:
        //  1) canPlayType() is not a reliable signal here. It used to
        //     matter mainly for Safari, but Chrome has since added its own
        //     (newer, less battle-tested) native HLS decoder — and
        //     canPlayType('application/vnd.apple.mpegurl') now often
        //     returns 'maybe' in Chrome too, which isn't a real guarantee.
        //     Confirmed against a real broadcasting stream ("Radio Ngāti
        //     Porou"): Chrome's native decoder intermittently failed with
        //     DEMUXER_ERROR_COULD_NOT_PARSE on a playlist hls.js played
        //     back fine every time.
        //  2) stream.type (station-data-supplied) can't be trusted either —
        //     ~half of data/stations.json's .m3u8 streams are mislabeled
        //     "audio/aac" instead of an actual HLS mime type, which used to
        //     make canPlayType(stream.type) wrongly report native support
        //     for a playlist, not an audio file.
        // Native <audio> HLS playback is now only the fallback for a
        // browser that has real native support but no usable hls.js path
        // (old iOS Safari without full MSE).
        const isHls = this.isHlsStream(stream);
        const hlsJsAvailable = typeof Hls !== 'undefined' && Hls.isSupported();
        const needsHlsJs = isHls && hlsJsAvailable;
        const hasNativeHlsSupport = isHls && !hlsJsAvailable && this.canPlayType('application/vnd.apple.mpegurl');

        if (isHls && !needsHlsJs && !hasNativeHlsSupport) {
            this.emit('warning', {
                title: 'Unsupported Format',
                message: 'HLS stream not supported in this browser. Trying next stream...'
            });
            this.currentStreamIndex++;
            return this.tryNextStream(generation);
        }

        // Only skip a stream pre-emptively if the browser explicitly says it
        // cannot play the format AND the type is a known, non-empty MIME type.
        // Unknown / empty types (e.g. stream.type === '' or 'audio/aacp') get
        // a real attempt — canPlayType('') always returns '' even for formats
        // the browser handles fine, so skipping on that result wastes streams.
        const knownType = stream.type && stream.type.trim() !== '';
        if (!isHls && knownType && !this.canPlayType(stream.type)) {
            console.warn(`⚠️ Browser reports no support for ${stream.type} — trying anyway`);
            // Fall through and attempt; don't skip pre-emptively.
        }

        this.setState(this.states.LOADING);
        this.destroyHls(); // clean up any previous instance before starting this one

        try {
            if (needsHlsJs) {
                this.hls = new Hls();
                let manifestParsed = false;
                let rejectManifestLoad = null;

                const manifestPromise = new Promise((resolve, reject) => {
                    rejectManifestLoad = reject;
                    this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
                        manifestParsed = true;
                        resolve();
                    });
                });

                this.hls.on(Hls.Events.ERROR, (event, data) => {
                    if (!data.fatal) return; // hls.js retries non-fatal errors internally
                    if (generation !== this.loadGeneration) return; // superseded chain

                    if (!manifestParsed) {
                        // Still inside the initial load — reject so this
                        // falls into the same catch block below as a native
                        // play() failure would, reusing its "try next
                        // stream, else give up" logic rather than duplicating it.
                        rejectManifestLoad(new Error(`HLS load failed: ${data.type}/${data.details}`));
                        return;
                    }

                    // A fatal error AFTER we were already playing successfully.
                    // Native 'error' events don't fire the same way for
                    // hls.js-sourced media (handleError() explicitly skips
                    // while this.hls is set) — mirror handleError()'s own
                    // "try next stream, else show final error" pattern here.
                    console.error('hls.js fatal error during playback:', data.type, data.details);
                    this.destroyHls();
                    this.currentStreamIndex++;
                    if (this.currentStation && this.currentStreamIndex < this.currentStation.streams.length) {
                        this.emit('info', {
                            title: t('tryingAlternative') || 'Trying Alternative Stream',
                            message: t('streamFailedTryingNext') || 'First stream failed, trying backup...'
                        });
                        this.tryNextStream(generation);
                    } else {
                        this.emit('error', {
                            title: t('stationUnavailable') || 'Station Unavailable',
                            message: t('stationOfflineError') || 'This station appears to be offline.'
                        });
                        this.setState(this.states.ERROR);
                    }
                });

                this.hls.loadSource(streamUrl);
                this.hls.attachMedia(this.audio);
                await manifestPromise;
            } else {
                this.audio.src = streamUrl;
                this.audio.load();
            }

            await this.play();
            if (generation !== this.loadGeneration) {
                // Superseded while play() was pending — let the newer chain own the UI state.
                return false;
            }
            this.emit('stationChanged', { station: this.currentStation, stream });
            return true;
        } catch (error) {
            if (generation !== this.loadGeneration) {
                return false;
            }
            console.error('Playback error:', error);
            this.destroyHls(); // don't leak a failed instance into the next attempt
            this.currentStreamIndex++;

            if (this.currentStreamIndex < this.currentStation.streams.length) {
                this.emit('info', {
                    title: t('tryingAlternative') || 'Trying Alternative',
                    message: t('streamFailedTryingNext') || 'Stream failed, trying next...'
                });
                return this.tryNextStream(generation);
            } else {
                // All streams exhausted — show final error
                this.emit('error', {
                    title: t('stationUnavailable') || 'Station Unavailable',
                    message: t('stationNotAvailable') || 'This station is currently unavailable. Please try another station.',
                    action: 'tryAnother'
                });
                this.setState(this.states.ERROR);
                return false;
            }
        }
    }
    
    /**
     * Check if browser can play the stream type
     */
    canPlayType(mimeType) {
        const canPlay = this.audio.canPlayType(mimeType);
        return canPlay === 'probably' || canPlay === 'maybe';
    }

    /**
     * Detect an HLS (.m3u8) stream — checks the declared mime type first,
     * falling back to the URL extension for entries with a missing/generic
     * type. ~150 stations in data/stations.json are HLS-only.
     */
    isHlsStream(stream) {
        const type = (stream.type || '').toLowerCase();
        const url = (stream.url || '').toLowerCase();
        return type.includes('mpegurl') || url.includes('.m3u8');
    }

    /**
     * Tear down the active hls.js instance, if any. Safe to call whenever —
     * a no-op if nothing's attached. Called before starting a new stream
     * attempt and from stop(), so an old instance never keeps feeding data
     * into an <audio> element a newer loadStation() call has moved on from.
     */
    destroyHls() {
        if (this.hls) {
            this.hls.destroy();
            this.hls = null;
        }
    }

    /**
     * Play audio with buffering optimization
     */
    async play() {
        this.intendedToPlay = true;

        // Handle web-player stations
        if (this.isWebPlayer) {
            this.playWebPlayer();
            this.isPlaying = true;
            this.setState(this.states.PLAYING);
            this.emit('stateChange', { state: this.states.PLAYING });
            return true;
        }

        try {
            // For slow connections or when resuming from buffer, wait for sufficient buffer
            if (this.isSlowConnection() && this.audio.duration === Infinity) {
                await this.waitForBuffer();
            }

            // Store the play promise so we can handle interruptions
            this.playPromise = this.audio.play();
            await this.playPromise;
            this.playPromise = null;
            this.isPlaying = true;
            return true;
        } catch (error) {
            this.playPromise = null;

            // AbortError happens when play() is interrupted by pause() or new load
            // This is normal behavior, not an error to show to users
            if (error.name === 'AbortError') {
                console.log('Play request was interrupted (normal behavior)');
                return false;
            }

            // Handle autoplay policy
            if (error.name === 'NotAllowedError') {
                this.emit('error', {
                    title: 'Autoplay Blocked',
                    message: 'Please click the play button to start playback. Browser autoplay policy requires user interaction.'
                });
            } else if (error.name === 'NotSupportedError') {
                // Throw silently — tryNextStream()'s catch will either
                // show a warning and try the next stream, or show a final
                // error if all streams are exhausted. Emitting here would
                // show an error toast even when a backup stream is about
                // to succeed.
            } else {
                // Don't show error for interrupted play requests
                if (!error.message?.includes('interrupted')) {
                    this.emit('error', {
                        title: 'Playback Error',
                        message: error.message || 'Failed to play stream.',
                        action: 'tryAnother'
                    });
                }
            }
            throw error;
        }
    }

    /**
     * Wait for minimum buffer before playing on slow connections
     */
    async waitForBuffer(maxWait = 15000) {
        const startTime = Date.now();
        const pollInterval = 200;

        while (Date.now() - startTime < maxWait) {
            const buffered = this.audio.buffered;
            if (buffered.length > 0) {
                const bufferedEnd = buffered.end(buffered.length - 1);
                const bufferedDuration = bufferedEnd - this.audio.currentTime;

                if (bufferedDuration >= this.minBufferDuration) {
                    console.log('✓ Sufficient buffer acquired:', bufferedDuration.toFixed(1) + 's');
                    return true;
                }
            }

            await new Promise(resolve => setTimeout(resolve, pollInterval));
        }

        console.warn('⚠️ Buffer timeout after', (maxWait / 1000).toFixed(1) + 's, proceeding anyway');
        return false;
    }
    
    /**
     * Pause audio
     */
    async pause() {
        this.intendedToPlay = false;

        // Handle web-player stations
        if (this.isWebPlayer) {
            this.pauseWebPlayer();
            this.isPlaying = false;
            this.setState(this.states.PAUSED);
            this.emit('stateChange', { state: this.states.PAUSED });
            return;
        }

        // Wait for any pending play promise before pausing
        if (this.playPromise) {
            try {
                await this.playPromise;
            } catch (e) {
                // Ignore - play was already failing
            }
        }
        this.audio.pause();
        this.isPlaying = false;
    }

    /**
     * Stop audio
     */
    stop() {
        this.intendedToPlay = false;

        // Handle web-player stations
        if (this.isWebPlayer) {
            this.pauseWebPlayer();
            const webPlayerFrame = document.getElementById('webPlayerFrame');
            if (webPlayerFrame) {
                webPlayerFrame.remove();
            }
            this.isWebPlayer = false;
            this.webPlayerStation = null;
            this.webPlayerAPI = null;
            this.currentWebPlayerFrame = null;
            // Show native audio element again
            if (this.audio) {
                this.audio.style.display = 'block';
            }
        } else {
            // Don't await a pending play() here — for a slow/stalled stream that promise can take
            // a long time to settle, which would block switching to a new station. Clearing src
            // below naturally interrupts it (rejects with AbortError, already handled in play()).
            this.destroyHls();
            this.audio.pause();
            this.audio.src = '';
        }

        this.isPlaying = false;
        this.currentStation = null;
        this.setState(this.states.IDLE);
    }
    
    /**
     * Toggle play/pause
     */
    async togglePlayPause() {
        if (this.isPlaying) {
            await this.pause();
        } else {
            try {
                await this.play();
            } catch (e) {
                // Error already handled in play()
            }
        }
    }
    
    /**
     * Set volume (0-1)
     */
    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
        this.audio.volume = this.volume;
    }
    
    /**
     * Toggle mute
     */
    toggleMute() {
        this.isMuted = !this.isMuted;
        this.audio.muted = this.isMuted;
        return this.isMuted;
    }
    
    /**
     * Get current volume
     */
    getVolume() {
        return this.audio.volume;
    }
    
    /**
     * Handle audio errors
     */
    handleError(event) {
        // Skip error handling for web-player stations (iframe handles its own errors)
        if (this.isWebPlayer) {
            console.log('ℹ️ Suppressing audio error for web-player station');
            return;
        }

        // Skip for HLS streams — hls.js owns error handling/recovery for
        // MediaSource-fed playback (see its Hls.Events.ERROR handler in
        // tryNextStream()); letting the native error handler also react
        // here would double up the "move to next stream" logic.
        if (this.hls) {
            console.log('ℹ️ Suppressing native audio error — hls.js owns this stream');
            return;
        }

        const generation = this.loadGeneration;
        const error = this.audio.error;
        let message = 'An unknown error occurred.';
        let userFriendlyMessage = '';
        let errorType = 'unknown';
        
        // Check if this was an HTTPS upgrade attempt
        const currentStreamUrl = this.audio.src;
        const isSecurePage = window.location.protocol === 'https:';
        const originalStream = this.currentStation?.streams?.[this.currentStreamIndex];
        const wasHttpUpgrade = isSecurePage && originalStream?.url?.startsWith('http://');
        
        if (error) {
            switch (error.code) {
                case error.MEDIA_ERR_ABORTED:
                    message = 'Playback was aborted.';
                    userFriendlyMessage = 'Playback stopped.';
                    errorType = 'aborted';
                    break;
                case error.MEDIA_ERR_NETWORK:
                    message = 'Network error while loading stream.';
                    if (wasHttpUpgrade) {
                        userFriendlyMessage = t('httpOnlyError');
                        errorType = 'https_upgrade_failed';
                    } else {
                        userFriendlyMessage = 'Network error. Check your connection and try again.';
                        errorType = 'network';
                    }
                    break;
                case error.MEDIA_ERR_DECODE:
                    message = 'Stream format error.';
                    userFriendlyMessage = t('stationNotAvailable') || 'This station is currently unavailable. Please try another station.';
                    errorType = 'decode';
                    break;
                case error.MEDIA_ERR_SRC_NOT_SUPPORTED:
                    message = 'Stream not supported.';
                    if (wasHttpUpgrade) {
                        userFriendlyMessage = t('stationNotAvailable') || 'This station is currently unavailable. Please try another station.';
                        errorType = 'https_upgrade_failed';
                        console.warn(`HTTPS upgrade failed for: ${currentStreamUrl}`);
                    } else {
                        userFriendlyMessage = t('stationNotAvailable') || 'This station is currently unavailable. Please try another station.';
                        errorType = 'cors_or_offline';
                    }
                    break;
            }
        }
        
        console.log(`Stream error [${errorType}]: ${message}`);
        console.log(`   URL: ${currentStreamUrl}`);
        console.log(`   Station: ${this.currentStation?.name}`);

        if (generation !== this.loadGeneration) {
            // This error belongs to a stream a newer loadStation() call already superseded.
            return;
        }

        // Try next stream if available
        if (this.currentStation && this.currentStreamIndex < this.currentStation.streams.length - 1) {
            this.currentStreamIndex++;
            this.emit('info', {
                title: t('tryingAlternative') || 'Trying Alternative Stream',
                message: t('streamFailedTryingNext') || 'First stream failed, trying backup...'
            });
            setTimeout(() => this.tryNextStream(generation), 1000);
        } else {
            // All streams exhausted - show final error
            let finalTitle = t('stationUnavailable') || 'Station Unavailable';
            let finalMessage = userFriendlyMessage || message;
            
            // Use generic message for all error types (unless debug mode)
            finalTitle = t('stationUnavailable') || 'Station Unavailable';
            finalMessage = t('stationNotAvailable') || 'This station is currently unavailable. Please try another station.';
            
            // Debug mode: show real technical error with full details
            if (this.debugMode) {
                finalTitle = `Error: ${errorType}`;
                finalMessage = `${message}\n\nURL: ${currentStreamUrl}\n\nStation: ${this.currentStation?.name}\n\nStreams tried: ${this.currentStreamIndex + 1}`;
            }
            
            this.emit('error', {
                title: finalTitle,
                message: finalMessage,
                action: 'tryAnother',
                errorType: errorType,
                debugInfo: {
                    url: currentStreamUrl,
                    station: this.currentStation?.name,
                    streamIndex: this.currentStreamIndex,
                    wasHttpUpgrade: wasHttpUpgrade,
                    originalUrl: originalStream?.url
                }
            });
            this.setState(this.states.ERROR);
        }
    }
    
    /**
     * Set current state
     */
    setState(state) {
        this.currentState = state;
        this.emit('stateChange', { state });
    }
    
    /**
     * Get current state
     */
    getState() {
        return this.currentState;
    }
    
    /**
     * Event emitter - register listener
     */
    on(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }
    
    /**
     * Event emitter - remove listener
     */
    off(event, callback) {
        if (!this.listeners[event]) return;
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
    
    /**
     * Event emitter - emit event
     */
    emit(event, data) {
        if (!this.listeners[event]) return;
        this.listeners[event].forEach(callback => callback(data));
    }
    
    /**
     * Get current station
     */
    getCurrentStation() {
        return this.currentStation;
    }
    
    /**
     * Check if playing
     */
    getIsPlaying() {
        return this.isPlaying;
    }

    /**
     * Load a web-player type station (iframe-based)
     */
    async loadWebPlayer(station) {
        console.log('🌐 Loading web-player station:', station.name);

        // Stop regular audio playback
        this.audio.pause();
        this.audio.src = '';

        // Store station info
        this.currentStation = station;
        this.isWebPlayer = true;
        this.intendedToPlay = true;
        this.updateMediaSessionMetadata(station);
        this.webPlayerStation = station;

        // Get player container
        const playerContainer = document.getElementById('radioPlayer')?.parentElement;
        if (!playerContainer) {
            console.error('Player container not found');
            return false;
        }

        // Hide native audio element
        this.audio.style.display = 'none';

        // Remove any existing web player
        const existingFrame = document.getElementById('webPlayerFrame');
        if (existingFrame) {
            existingFrame.remove();
        }

        // Create iframe for embedded player
        const iframe = document.createElement('iframe');
        iframe.id = 'webPlayerFrame';
        iframe.src = station.streams[0].url;
        iframe.style.cssText = `
            width: 100%;
            height: 100%;
            border: none;
            border-radius: 8px;
            background: #2a2a2a;
        `;
        iframe.setAttribute('allow', 'autoplay');
        iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-popups');

        // Add iframe to container
        playerContainer.appendChild(iframe);

        // Set up event listeners for iframe load
        iframe.onload = () => {
            this.setupWebPlayerAPI(iframe, station);
        };

        iframe.onerror = () => {
            console.error('Failed to load web player iframe');
            this.emit('error', {
                title: 'Player Load Error',
                message: 'Failed to load the web player. Please try again.'
            });
        };

        this.currentWebPlayerFrame = iframe;

        // Update state
        this.setState(this.states.PLAYING);
        this.isPlaying = true;

        // Emit station changed event
        this.emit('stationChanged', { station, stream: station.streams[0] });

        return true;
    }

    /**
     * Set up communication with web player API
     */
    setupWebPlayerAPI(iframe, station) {
        try {
            // Try to access the embedded player's API
            const api = iframe.contentWindow.syncRadioAPI;
            if (api && typeof api.getStatus === 'function') {
                this.webPlayerAPI = api;
                const status = api.getStatus();
                console.log('✅ Web player API connected:', status);
                this.setState(this.states.PLAYING);
            } else {
                console.log('⚠️ Web player API not available, but iframe loaded');
                this.setState(this.states.PLAYING);
            }
        } catch (e) {
            // Cross-origin iframe - API may not be accessible
            console.log('📡 Web player loaded (API access restricted by CORS)');
            this.setState(this.states.PLAYING);
        }
    }

    /**
     * Play web player (if API available)
     */
    playWebPlayer() {
        try {
            if (this.webPlayerAPI && typeof this.webPlayerAPI.play === 'function') {
                this.webPlayerAPI.play();
            }
            this.isPlaying = true;
        } catch (e) {
            console.log('Web player play unavailable');
        }
    }

    /**
     * Pause web player (if API available)
     */
    pauseWebPlayer() {
        try {
            if (this.webPlayerAPI && typeof this.webPlayerAPI.pause === 'function') {
                this.webPlayerAPI.pause();
            }
            this.isPlaying = false;
        } catch (e) {
            console.log('Web player pause unavailable');
        }
    }
}

// Export for use in app.js
window.AudioController = AudioController;
