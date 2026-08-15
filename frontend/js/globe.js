/**
 * globe.js - Globe and Map Visualization
 * Handles 3D globe rendering, 2D map view, station markers, camera controls, and interactions
 */

// Polyfill for roundRect if not supported
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
        if (w < 2 * r) r = w / 2;
        if (h < 2 * r) r = h / 2;
        this.moveTo(x + r, y);
        this.arcTo(x + w, y, x + w, y + h, r);
        this.arcTo(x + w, y + h, x, y + h, r);
        this.arcTo(x, y + h, x, y, r);
        this.arcTo(x, y, x + w, y, r);
        this.closePath();
        return this;
    };
}

class GlobeController {
    constructor() {
        this.globe = null;
        this.renderer = null;
        this.camera = null;
        this.scene = null;
        this.controls = null;
        this.stations = [];
        this.displayedStations = []; // Filtered stations to show on map
        this.currentStation = null;
        this.autoRotate = true;
        this.markers = [];
        this.mouseDownPos = null;
        this.touchStartPos = null;
        
        // View mode: 'globe' or 'map' - default to map
        this.viewMode = 'map';
        
        // Map view state
        this.mapCanvas = null;
        this.mapCtx = null;
        this.mapImage = null;
        this.mapZoom = 1;
        this.mapOffset = { x: 0, y: 0 };
        this.mapDragging = false;
        this.mapLastPos = { x: 0, y: 0 };
        
        // Globe settings
        this.settings = {
            globeRadius: 100,
            cameraDistance: 300,
            atmosphereAltitude: 0.15,
            markerRadius: 0.35,
            activeMarkerRadius: 0.8,
            rotationSpeed: 0.001,
            minZoom: 1, // 1 = map's cover-fit size; below this the poles would show blank space top/bottom
            maxZoom: 4
        };
        
        this.animationFrameId = null;
        this.mapAnimationFrameId = null;
        
        // Audio visualization state
        this.isPlaying = false;
        
        this.audioVisualization = {
            enabled: true,
            beat: 0,
            beatDecay: 0.95,
            lastBeatTime: 0,
            bpm: 120,
            ripples: [],
            particles: [],
            wavePhase: 0,
            bassLevel: 0,
            midLevel: 0,
            highLevel: 0
        };
    }
    
    /**
     * Initialize the globe and Three.js scene
     */
    async init(stations) {
        const allowed = typeof filterExceptedStations === 'function'
            ? filterExceptedStations(stations || [])
            : (stations || []);
        // Filter stations with valid coordinates (excluding 0,0 which means unknown)
        this.stations = allowed.filter(s => this.hasValidCoordinates(s));
        this.displayedStations = this.stations; // Initially show all stations
        
        const container = document.getElementById('globeContainer');
        const canvas = document.getElementById('globeCanvas');
        
        // Validate required elements
        if (!container || !canvas) {
            console.error('Globe initialization failed: container or canvas not found');
            return this;
        }
        
        // Get container dimensions with fallbacks
        const containerWidth = container.clientWidth || 800;
        const containerHeight = container.clientHeight || 600;
        
        try {
            // Set up renderer
            this.renderer = new THREE.WebGLRenderer({
                canvas: canvas,
                antialias: true,
                alpha: true
            });
            this.renderer.setSize(containerWidth, containerHeight);
            this.renderer.setPixelRatio(window.devicePixelRatio || 1);
            
            // Set up scene
            this.scene = new THREE.Scene();
            
            // Set up camera
            this.camera = new THREE.PerspectiveCamera(
                45,
                containerWidth / containerHeight,
                1,
                1000
            );
            this.camera.position.z = this.settings?.cameraDistance || 300;
            
            // Initialize globe
            this.globe = new ThreeGlobe()
                .globeImageUrl('https://unpkg.com/three-globe@2.30.0/example/img/earth-blue-marble.jpg')
                .bumpImageUrl('https://unpkg.com/three-globe@2.30.0/example/img/earth-topology.png')
                .atmosphereColor('#4a9eff')
                .atmosphereAltitude(this.settings?.atmosphereAltitude || 0.15)
                .showAtmosphere(true);
            
            // Add globe to scene
            this.scene.add(this.globe);
            this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
            this.scene.add(new THREE.DirectionalLight(0xffffff, 0.6));
            
            // Set up camera controls (basic orbit)
            this.setupGlobeControls();
            
        } catch (e) {
            console.error('Globe 3D initialization error:', e);
        }
        
        // Initialize map view (always, as fallback)
        try {
            await this.initMapView();
        } catch (e) {
            console.error('Map view initialization error:', e);
        }

        // Sync markers with filtered station list (HTTPS, exceptions, coords)
        this.updateDisplayedStations(allowed);
        
        // Setup view toggle
        this.setupViewToggle();
        
        // Setup zoom controls
        this.setupZoomControls();
        
        // Listen for view mode changes from user settings
        window.addEventListener('viewModeChanged', (e) => {
            this.setViewMode(e.detail);
        });
        
        // Handle window resize - store bound handler for cleanup
        this._resizeHandler = () => this.onWindowResize();
        window.addEventListener('resize', this._resizeHandler);
        
        // Handle mouse move for tooltip — throttled to at most once per
        // animation frame, since getHoverStation() scans every displayed
        // station and raw mousemove can fire far faster than that.
        if (canvas) {
            let hoverRafPending = false;
            canvas.addEventListener('mousemove', (e) => {
                if (hoverRafPending) return;
                hoverRafPending = true;
                requestAnimationFrame(() => {
                    hoverRafPending = false;
                    this.onMouseMove(e);
                });
            });
        }
        
        // Initialize dimensions before first render
        this.onWindowResize();
        
        // Start animation loop
        this.animate();
        
        return this;
    }
    
    /**
     * Initialize the 2D map view
     */
    async initMapView() {
        this.mapCanvas = document.getElementById('mapCanvas');
        if (!this.mapCanvas) {
            console.error('Map canvas not found');
            return;
        }
        this.mapCtx = this.mapCanvas.getContext('2d');
        
        // Load world map image with timeout
        this.mapImage = new Image();
        this.mapImage.crossOrigin = 'anonymous';
        
        return new Promise((resolve) => {
            let resolved = false;
            
            const finishLoad = (success = true) => {
                if (resolved) return;
                resolved = true;
                if (!success) {
                    console.log('⚠️ Using fallback map rendering');
                    this.mapImage = null;
                }
                resolve();
            };
            
            this.mapImage.onload = () => {
                console.log('✅ Map image loaded');
                finishLoad(true);
            };
            this.mapImage.onerror = () => finishLoad(false);
            
            // Timeout after 8 seconds
            setTimeout(() => finishLoad(false), 8000);
            
            // Use a public domain world map
            this.mapImage.src = 'https://unpkg.com/three-globe@2.30.0/example/img/earth-blue-marble.jpg';
        });
    }
    
    /**
     * Setup view toggle buttons
     */
    setupViewToggle() {
        const globeBtn = document.getElementById('globeViewBtn');
        const mapBtn = document.getElementById('mapViewBtn');
        
        globeBtn?.addEventListener('click', () => this.setViewMode('globe'));
        mapBtn?.addEventListener('click', () => this.setViewMode('map'));
    }
    
    /**
     * Setup zoom controls
     */
    setupZoomControls() {
        const zoomInBtn = document.getElementById('zoomInBtn');
        const zoomOutBtn = document.getElementById('zoomOutBtn');
        const resetZoomBtn = document.getElementById('resetZoomBtn');
        
        zoomInBtn?.addEventListener('click', () => this.zoomIn());
        zoomOutBtn?.addEventListener('click', () => this.zoomOut());
        resetZoomBtn?.addEventListener('click', () => this.resetView());
    }
    
    /**
     * Zoom in
     */
    zoomIn() {
        if (this.viewMode === 'globe' && this.camera?.position) {
            this.camera.position.z = Math.max(150, this.camera.position.z - 30);
        } else {
            this.mapZoom = Math.min(this.settings?.maxZoom || 4, (this.mapZoom || 1) * 1.3);
            this.renderMap();
        }
    }
    
    /**
     * Zoom out
     */
    zoomOut() {
        if (this.viewMode === 'globe' && this.camera?.position) {
            this.camera.position.z = Math.min(500, this.camera.position.z + 30);
        } else {
            this.mapZoom = Math.max(this.settings?.minZoom || 1, (this.mapZoom || 1) / 1.3);
            this.renderMap();
        }
    }
    
    /**
     * Reset view - focuses back on the currently playing station if there
     * is one (this.currentStation is kept up to date by focusOnStation(),
     * which app.js calls whenever a station starts playing), otherwise
     * falls back to the original default-position reset.
     */
    resetView() {
        if (this.currentStation && this.hasValidCoordinates(this.currentStation)) {
            this.focusOnStation(this.currentStation);
            return;
        }

        if (this.viewMode === 'globe') {
            if (this.camera?.position) {
                this.camera.position.z = this.settings?.cameraDistance || 300;
            }
            if (this.globe?.rotation) {
                this.globe.rotation.x = 0;
                this.globe.rotation.y = 0;
            }
        } else {
            this.mapZoom = 1;
            this.mapOffset = { x: 0, y: 0 };
            this.renderMap();
        }
    }
    
    /**
     * Set view mode (globe or map)
     */
    setViewMode(mode) {
        this.viewMode = mode;
        
        const globeCanvas = document.getElementById('globeCanvas');
        const mapCanvas = document.getElementById('mapCanvas');
        const globeBtn = document.getElementById('globeViewBtn');
        const mapBtn = document.getElementById('mapViewBtn');
        const autoRotateBtn = document.getElementById('autoRotateBtn');
        
        if (mode === 'globe') {
            if (globeCanvas) globeCanvas.hidden = false;
            if (mapCanvas) mapCanvas.hidden = true;
            globeBtn?.classList.add('active');
            mapBtn?.classList.remove('active');
            globeBtn?.setAttribute('aria-selected', 'true');
            mapBtn?.setAttribute('aria-selected', 'false');
            if (autoRotateBtn) autoRotateBtn.style.display = 'flex';

            // Refresh 3D markers when switching to globe (respects HTTPS/exception filters)
            if (window.app?.stations?.length) {
                this.updateDisplayedStations(window.app.stations);
            }
            
            // Resume globe animation
            if (!this.animationFrameId) {
                this.animate();
            }
        } else {
            if (globeCanvas) globeCanvas.hidden = true;
            if (mapCanvas) mapCanvas.hidden = false;
            globeBtn?.classList.remove('active');
            mapBtn?.classList.add('active');
            globeBtn?.setAttribute('aria-selected', 'false');
            mapBtn?.setAttribute('aria-selected', 'true');
            if (autoRotateBtn) autoRotateBtn.style.display = 'none';
            
            // Reset map to center position
            this.mapOffset = { x: 0, y: 0 };
            this.mapZoom = 1;
            
            // Setup map controls and render
            this.setupMapControls();
            this.onWindowResize();
            this.renderMap();
        }
    }
    
    /**
     * Setup map controls (pan and zoom)
     */
    setupMapControls() {
        if (this._mapControlsSetup) return;
        this._mapControlsSetup = true;
        
        const canvas = this.mapCanvas;
        
        // Mouse drag for panning
        canvas.addEventListener('mousedown', (e) => {
            this.mapDragging = true;
            this.mapLastPos = { x: e.clientX, y: e.clientY };
            this.mouseDownPos = { x: e.clientX, y: e.clientY };
        });
        
        canvas.addEventListener('mousemove', (e) => {
            if (this.viewMode !== 'map') return;
            
            if (this.mapDragging) {
                const dx = e.clientX - this.mapLastPos.x;
                const dy = e.clientY - this.mapLastPos.y;
                this.mapOffset.x += dx;
                this.mapOffset.y += dy;
                this.mapLastPos = { x: e.clientX, y: e.clientY };
                this.renderMap();
            } else {
                // Tooltip handling
                this.onMapMouseMove(e);
            }
        });
        
        canvas.addEventListener('mouseup', (e) => {
            if (this.mapDragging && this.mouseDownPos) {
                const distance = Math.sqrt(
                    Math.pow(e.clientX - this.mouseDownPos.x, 2) +
                    Math.pow(e.clientY - this.mouseDownPos.y, 2)
                );
                
                // If movement is less than 10 pixels, treat as click
                if (distance < 10) {
                    this.onMapClick(e);
                }
            }
            this.mapDragging = false;
            this.mouseDownPos = null;
        });
        
        canvas.addEventListener('mouseleave', () => {
            this.mapDragging = false;
            document.getElementById('stationTooltip').style.display = 'none';
        });
        
        // Touch support - pan and pinch-to-zoom
        const getTouchDistance = (touch1, touch2) => {
            const dx = touch1.clientX - touch2.clientX;
            const dy = touch1.clientY - touch2.clientY;
            return Math.sqrt(dx * dx + dy * dy);
        };

        const getTouchCenter = (touches) => {
            let sumX = 0, sumY = 0;
            for (let touch of touches) {
                sumX += touch.clientX;
                sumY += touch.clientY;
            }
            return { x: sumX / touches.length, y: sumY / touches.length };
        };

        canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                this.mapDragging = true;
                this.mapLastPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                this.touchStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                this.pinchDistance = null;
            } else if (e.touches.length === 2) {
                this.mapDragging = false;
                this.pinchDistance = getTouchDistance(e.touches[0], e.touches[1]);
                this.touchStartPos = null;
            }
        });

        canvas.addEventListener('touchmove', (e) => {
            if (this.viewMode !== 'map') return;
            e.preventDefault();

            if (e.touches.length === 1 && this.mapDragging) {
                // Single touch - pan
                const dx = e.touches[0].clientX - this.mapLastPos.x;
                const dy = e.touches[0].clientY - this.mapLastPos.y;
                this.mapOffset.x += dx;
                this.mapOffset.y += dy;
                this.mapLastPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                this.renderMap();
            } else if (e.touches.length === 2 && this.pinchDistance) {
                // Two finger pinch - zoom
                const newDistance = getTouchDistance(e.touches[0], e.touches[1]);
                const zoomFactor = newDistance / this.pinchDistance;
                const newZoom = this.mapZoom * zoomFactor;

                if (newZoom >= this.settings.minZoom && newZoom <= this.settings.maxZoom) {
                    const rect = canvas.getBoundingClientRect();
                    const center = getTouchCenter(e.touches);
                    const centerX = rect.width / 2 + this.mapOffset.x;
                    const centerY = rect.height / 2 + this.mapOffset.y;

                    this.mapOffset.x = (center.x - rect.left - (center.x - rect.left - centerX) * zoomFactor) - rect.width / 2;
                    this.mapOffset.y = (center.y - rect.top - (center.y - rect.top - centerY) * zoomFactor) - rect.height / 2;

                    this.mapZoom = newZoom;
                    this.pinchDistance = newDistance;
                    this.renderMap();
                }
            }
        });

        canvas.addEventListener('touchend', (e) => {
            if (e.touches.length === 0) {
                // All touches ended
                if (this.touchStartPos && e.changedTouches.length > 0) {
                    const touch = e.changedTouches[0];
                    const distance = Math.sqrt(
                        Math.pow(touch.clientX - this.touchStartPos.x, 2) +
                        Math.pow(touch.clientY - this.touchStartPos.y, 2)
                    );

                    if (distance < 10) {
                        this.onMapClick({ clientX: touch.clientX, clientY: touch.clientY });
                    }
                }
            } else if (e.touches.length === 1) {
                // One finger still down after two fingers
                this.mapDragging = true;
                this.mapLastPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                this.touchStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                this.pinchDistance = null;
            }

            if (e.touches.length === 0) {
                this.mapDragging = false;
                this.touchStartPos = null;
                this.pinchDistance = null;
            }
        });
        
        // Mouse wheel zoom
        canvas.addEventListener('wheel', (e) => {
            if (this.viewMode !== 'map') return;
            e.preventDefault();
            
            const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
            const newZoom = this.mapZoom * zoomFactor;
            
            if (newZoom >= this.settings.minZoom && newZoom <= this.settings.maxZoom) {
                // Zoom towards mouse position
                const rect = canvas.getBoundingClientRect();
                const mouseX = e.clientX - rect.left;
                const mouseY = e.clientY - rect.top;
                
                // Adjust offset to zoom towards mouse
                const centerX = rect.width / 2 + this.mapOffset.x;
                const centerY = rect.height / 2 + this.mapOffset.y;
                
                this.mapOffset.x = (mouseX - (mouseX - centerX) * zoomFactor) - rect.width / 2;
                this.mapOffset.y = (mouseY - (mouseY - centerY) * zoomFactor) - rect.height / 2;
                
                this.mapZoom = newZoom;
                this.renderMap();
            }
        }, { passive: false });
    }
    
    /**
     * Render the 2D map view
     */
    /**
     * Compute the map image's draw rect using "cover" fit — preserves the world
     * map's true aspect ratio (~2:1 equirectangular) instead of stretching it to
     * exactly match the container, which badly distorts it on tall/narrow screens.
     * Shared by renderMap() (drawing) and mapClientToLatLng() (click hit-testing)
     * so markers and taps stay aligned with what's actually drawn.
     */
    getMapLayout(width, height) {
        const zoom = this.mapZoom || 1;
        const offset = this.mapOffset || { x: 0, y: 0 };
        const imageAspect = (this.mapImage && this.mapImage.naturalWidth && this.mapImage.naturalHeight)
            ? this.mapImage.naturalWidth / this.mapImage.naturalHeight
            : 2; // standard equirectangular world map aspect ratio as a fallback

        // Base (zoom=1) size that fully covers the container while keeping aspect ratio
        let baseWidth = height * imageAspect;
        let baseHeight = height;
        if (baseWidth < width) {
            baseWidth = width;
            baseHeight = width / imageAspect;
        }

        const mapWidth = baseWidth * zoom;
        const mapHeight = baseHeight * zoom;

        // Vertical panning has real edges (the poles) — clamp so the image can never
        // reveal blank space above/below itself. Horizontal has no such limit (it wraps).
        const maxOffsetY = Math.max(0, (mapHeight - height) / 2);
        const clampedOffsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, offset.y || 0));
        if (this.mapOffset) this.mapOffset.y = clampedOffsetY;

        const mapX = (width - mapWidth) / 2 + (offset.x || 0);
        const mapY = (height - mapHeight) / 2 + clampedOffsetY;

        return { mapWidth, mapHeight, mapX, mapY };
    }

    renderMap() {
        if (!this.mapCanvas || this.viewMode !== 'map') return;

        const ctx = this.mapCtx;
        if (!ctx) return;

        try {
            // Use CSS dimensions (context is already scaled by DPR)
            const width = this._mapCSSWidth || this.mapCanvas.clientWidth || 800;
            const height = this._mapCSSHeight || this.mapCanvas.clientHeight || 600;

            // Validate dimensions
            if (!width || !height || isNaN(width) || isNaN(height)) return;

            // Clear canvas
            ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-primary').trim() || '#0a0e27';
            ctx.fillRect(0, 0, width, height);

            // Calculate map dimensions (cover-fit, preserves aspect ratio)
            const { mapWidth, mapHeight, mapX, mapY } = this.getMapLayout(width, height);

            // Draw world map — repeat it horizontally (map wraps like longitude) so panning
            // past an edge shows a continuous world instead of running out of image.
            // Bring mapX to the copy nearest the canvas, then also draw its immediate
            // left/right neighbors so there's never a gap at the seam.
            const nearestMapX = mapWidth > 0 ? mapX - mapWidth * Math.round((mapX - width / 2) / mapWidth) : mapX;
            const tileXs = [nearestMapX - mapWidth, nearestMapX, nearestMapX + mapWidth];

            if (this.mapImage && this.mapImage.complete) {
                tileXs.forEach(tileX => {
                    ctx.drawImage(this.mapImage, tileX, mapY, mapWidth, mapHeight);
                });

                // Add overlay for better visibility
                ctx.fillStyle = 'rgba(10, 14, 39, 0.3)';
                ctx.fillRect(0, mapY, width, mapHeight);
            } else {
                // Fallback: draw a simple grid
                tileXs.forEach(tileX => {
                    this.drawMapGrid(ctx, tileX, mapY, mapWidth, mapHeight);
                });
            }
            
            // Draw station markers (wrapped in its own try-catch)
            try {
                this.drawMapMarkers(ctx, mapX, mapY, mapWidth, mapHeight);
            } catch (markerError) {
                console.error('Error drawing markers:', markerError);
                // Still show map even if markers fail
            }
        } catch (e) {
            console.error('Error in renderMap:', e);
        }
    }
    
    /**
     * Draw map grid as fallback
     */
    drawMapGrid(ctx, mapX, mapY, mapWidth, mapHeight) {
        ctx.strokeStyle = 'rgba(74, 158, 255, 0.2)';
        ctx.lineWidth = 1;
        
        // Vertical lines (longitude)
        for (let i = 0; i <= 36; i++) {
            const x = mapX + (mapWidth * i) / 36;
            ctx.beginPath();
            ctx.moveTo(x, mapY);
            ctx.lineTo(x, mapY + mapHeight);
            ctx.stroke();
        }
        
        // Horizontal lines (latitude)
        for (let i = 0; i <= 18; i++) {
            const y = mapY + (mapHeight * i) / 18;
            ctx.beginPath();
            ctx.moveTo(mapX, y);
            ctx.lineTo(mapX + mapWidth, y);
            ctx.stroke();
        }
        
        // Draw continents outline (simplified)
        ctx.fillStyle = 'rgba(30, 40, 71, 0.8)';
        ctx.fillRect(mapX, mapY, mapWidth, mapHeight);
    }
    
    /**
     * Draw station markers on map with audio-reactive effects
     */
    drawMapMarkers(ctx, mapX, mapY, mapWidth, mapHeight) {
        if (!ctx) return;
        
        // Validate all parameters
        if (isNaN(mapX) || isNaN(mapY) || isNaN(mapWidth) || isNaN(mapHeight)) {
            console.warn('Invalid map dimensions in drawMapMarkers');
            return;
        }
        
        try {
        // Cache of radial gradients for this frame, keyed by a rounded radius+color
        // signature — most markers share the same status/size, so this avoids
        // re-allocating a gradient (an expensive canvas op) per marker per frame.
        const gradientCache = new Map();
        const getCachedGradient = (key, radius, colorStops) => {
            let gradient = gradientCache.get(key);
            if (!gradient) {
                gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
                colorStops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
                gradientCache.set(key, gradient);
            }
            return gradient;
        };

        // Ensure audioVisualization exists with all required properties
        const defaultAv = { ripples: [], particles: [], beat: 0, bassLevel: 0, midLevel: 0, highLevel: 0, wavePhase: 0 };
        const av = this.audioVisualization ? {
            ...defaultAv,
            ...this.audioVisualization,
            ripples: this.audioVisualization.ripples || [],
            particles: this.audioVisualization.particles || []
        } : defaultAv;
        const markerSize = Math.max(2, 3 * (this.mapZoom || 1));
        const width = this._mapCSSWidth || this.mapCanvas?.clientWidth || 800;
        const height = this._mapCSSHeight || this.mapCanvas?.clientHeight || 600;
        const time = Date.now() / 1000;
        
        // Get playing station position for effects (only if valid coordinates)
        let playingPos = null;
        if (this.currentStation && this.hasValidCoordinates(this.currentStation)) {
            playingPos = this.latLngToMapPosition(
                this.currentStation.lat, 
                this.currentStation.lng, 
                mapX, mapY, mapWidth, mapHeight
            );
        }
        
        // Draw ripple waves from playing station
        if (playingPos && this.isPlaying && !isNaN(playingPos.x) && !isNaN(playingPos.y)) {
            av.ripples.forEach(ripple => {
                // Skip if radius is too small (prevents gradient issues)
                if (!ripple || ripple.radius < 1) return;
                
                try {
                    const gradient = ctx.createRadialGradient(
                        playingPos.x, playingPos.y, ripple.radius * 0.8,
                        playingPos.x, playingPos.y, ripple.radius
                    );
                    gradient.addColorStop(0, `rgba(118, 255, 3, 0)`);
                    gradient.addColorStop(0.5, `rgba(118, 255, 3, ${ripple.opacity * 0.3})`);
                    gradient.addColorStop(1, `rgba(118, 255, 3, 0)`);
                    
                    ctx.strokeStyle = `rgba(118, 255, 3, ${ripple.opacity})`;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(playingPos.x, playingPos.y, ripple.radius, 0, Math.PI * 2);
                    ctx.stroke();
                } catch (e) {
                    // Ignore gradient errors
                }
            });
        }
        
        // Draw audio wave circle around playing station
        if (playingPos && this.isPlaying && !isNaN(playingPos.x) && !isNaN(playingPos.y)) {
            const waveRadius = 40 + (av.bassLevel || 0) * 20;
            const segments = 64;
            const wavePhase = av.wavePhase || 0;
            const midLevel = av.midLevel || 0;
            const highLevel = av.highLevel || 0;
            const beat = av.beat || 0;
            
            ctx.beginPath();
            for (let i = 0; i <= segments; i++) {
                const angle = (i / segments) * Math.PI * 2;
                const waveOffset = Math.sin(angle * 8 + wavePhase) * midLevel * 8;
                const r = waveRadius + waveOffset;
                const x = playingPos.x + Math.cos(angle) * r;
                const y = playingPos.y + Math.sin(angle) * r;
                
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.strokeStyle = `rgba(118, 255, 3, ${0.3 + beat * 0.4})`;
            ctx.lineWidth = 2;
            ctx.stroke();
            
            // Inner wave
            ctx.beginPath();
            for (let i = 0; i <= segments; i++) {
                const angle = (i / segments) * Math.PI * 2;
                const waveOffset = Math.sin(angle * 12 - wavePhase * 1.5) * highLevel * 6;
                const r = waveRadius * 0.6 + waveOffset;
                const x = playingPos.x + Math.cos(angle) * r;
                const y = playingPos.y + Math.sin(angle) * r;
                
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.strokeStyle = `rgba(0, 230, 118, ${0.4 + beat * 0.3})`;
            ctx.lineWidth = 1.5;
            ctx.stroke();
        }
        
        // Draw particles
        if (playingPos && this.isPlaying && !isNaN(playingPos.x) && !isNaN(playingPos.y)) {
            av.particles.forEach(p => {
                if (!p || isNaN(p.x) || isNaN(p.y)) return;
                ctx.fillStyle = `hsla(${p.hue || 100}, 100%, 60%, ${p.life || 0})`;
                ctx.beginPath();
                ctx.arc(playingPos.x + p.x, playingPos.y + p.y, p.size || 2, 0, Math.PI * 2);
                ctx.fill();
            });
        }
        
        // Sort stations - active last (on top) - use displayed (filtered) stations
        let stationsToShow = this.getDisplayedStations() || [];
        
        // IMPORTANT: Always include current playing station in the render list
        // This ensures the playing station marker + animation shows even if it's not in filtered results
        if (this.currentStation && !stationsToShow.some(s => s && s.id === this.currentStation.id)) {
            stationsToShow = [...stationsToShow, this.currentStation];
        }
        
        // Filter out stations with invalid coordinates (including 0,0)
        const validStations = stationsToShow.filter(s => this.hasValidCoordinates(s));
        
        const sortedStations = [...validStations].sort((a, b) => {
            const aActive = this.currentStation && this.currentStation.id === a.id;
            const bActive = this.currentStation && this.currentStation.id === b.id;
            return aActive ? 1 : (bActive ? -1 : 0);
        });
        
        sortedStations.forEach(station => {
            if (!station) return;
            const pos = this.latLngToMapPosition(station.lat, station.lng, mapX, mapY, mapWidth, mapHeight);
            
            // Check if marker is visible
            if (pos.x < -20 || pos.x > width + 20 || pos.y < -20 || pos.y > height + 20) {
                return;
            }
            
            const isPlaying = this.currentStation && this.currentStation.id === station.id;
            const status = station.status || 'active';
            const isHttpOnly = this.isHttpOnlyStation(station);
            
            // Calculate distance from playing station for "dancing" effect
            let danceOffset = { x: 0, y: 0 };
            if (playingPos && this.isPlaying && !isPlaying && status === 'active') {
                const dx = pos.x - playingPos.x;
                const dy = pos.y - playingPos.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                // Nearby stations dance with the beat
                if (distance < 150) {
                    const influence = (1 - distance / 150) * av.beat * 3;
                    danceOffset.x = Math.sin(time * 10 + pos.x * 0.1) * influence;
                    danceOffset.y = Math.cos(time * 10 + pos.y * 0.1) * influence;
                }
            }
            
            const drawX = pos.x + danceOffset.x;
            const drawY = pos.y + danceOffset.y;
            
            if (isPlaying) {
                // Animated playing station with audio reactivity
                const baseSize = markerSize * 2.5;
                const beatSize = baseSize * (1 + av.beat * 0.5);
                
                // Glow effect that pulses with bass
                const glowRadius = beatSize * 4 + av.bassLevel * 15;
                const glowRadiusRounded = Math.round(glowRadius);
                const beatBucket = Math.round(av.beat * 20);
                const glowGradient = getCachedGradient(`playing_${glowRadiusRounded}_${beatBucket}`, glowRadiusRounded, [
                    [0, `rgba(118, 255, 3, ${0.3 + av.beat * 0.3})`],
                    [0.5, `rgba(118, 255, 3, ${0.1 + av.beat * 0.1})`],
                    [1, 'rgba(118, 255, 3, 0)']
                ]);
                ctx.save();
                ctx.translate(drawX, drawY);
                ctx.fillStyle = glowGradient;
                ctx.beginPath();
                ctx.arc(0, 0, glowRadiusRounded, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                
                // Outer pulsing ring
                ctx.strokeStyle = `rgba(118, 255, 3, ${0.4 + av.beat * 0.4})`;
                ctx.lineWidth = 2 + av.beat * 2;
                ctx.beginPath();
                ctx.arc(drawX, drawY, beatSize * 2.5, 0, Math.PI * 2);
                ctx.stroke();
                
                // Middle ring
                ctx.strokeStyle = `rgba(118, 255, 3, ${0.6 + av.beat * 0.2})`;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(drawX, drawY, beatSize * 1.5, 0, Math.PI * 2);
                ctx.stroke();
                
                // Inner filled circle that pulses
                ctx.fillStyle = '#76ff03';
                ctx.beginPath();
                ctx.arc(drawX, drawY, beatSize, 0, Math.PI * 2);
                ctx.fill();
                
                // Center highlight
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(drawX - beatSize * 0.2, drawY - beatSize * 0.2, beatSize * 0.3, 0, Math.PI * 2);
                ctx.fill();
                
            } else {
                // Regular station marker with subtle pulse when nearby station is playing
                let pulseScale = 1;
                if (playingPos && this.isPlaying) {
                    const dx = pos.x - playingPos.x;
                    const dy = pos.y - playingPos.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);
                    if (distance < 100) {
                        pulseScale = 1 + (1 - distance / 100) * av.beat * 0.3;
                    }
                }
                
                const currentSize = markerSize * pulseScale;
                const glowRadius = Math.round(currentSize * 2);
                const pulseBucket = Math.round(pulseScale * 20);

                // Glow effect
                let gradient;
                if (isHttpOnly) {
                    gradient = getCachedGradient(`httponly_${glowRadius}_${pulseBucket}`, glowRadius, [
                        [0, `rgba(251, 146, 60, ${0.4 * pulseScale})`],
                        [1, 'rgba(251, 146, 60, 0)']
                    ]);
                } else if (status === 'active') {
                    gradient = getCachedGradient(`active_${glowRadius}_${pulseBucket}`, glowRadius, [
                        [0, `rgba(0, 230, 118, ${0.4 * pulseScale})`],
                        [1, 'rgba(0, 230, 118, 0)']
                    ]);
                } else if (status === 'inactive') {
                    gradient = getCachedGradient(`inactive_${glowRadius}`, glowRadius, [
                        [0, 'rgba(245, 158, 11, 0.3)'],
                        [1, 'rgba(245, 158, 11, 0)']
                    ]);
                } else {
                    gradient = getCachedGradient(`down_${glowRadius}`, glowRadius, [
                        [0, 'rgba(239, 68, 68, 0.3)'],
                        [1, 'rgba(239, 68, 68, 0)']
                    ]);
                }

                ctx.save();
                ctx.translate(drawX, drawY);
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
                
                // Solid dot - HTTP only gets orange, otherwise based on status
                let dotColor = '#00e676'; // Default green
                if (isHttpOnly) {
                    dotColor = '#fb923c'; // Orange for HTTP only
                } else if (status === 'inactive') {
                    dotColor = '#f59e0b'; // Yellow-orange for inactive
                } else if (status === 'down') {
                    dotColor = '#ef4444'; // Red for down
                }
                ctx.fillStyle = dotColor;
                ctx.beginPath();
                ctx.arc(drawX, drawY, currentSize, 0, Math.PI * 2);
                ctx.fill();
            }
        });
        
        // Draw frequency bars around playing station
        if (playingPos && this.isPlaying && !isNaN(playingPos.x) && !isNaN(playingPos.y)) {
            const barCount = 24;
            const bassLevel = av.bassLevel || 0;
            const midLevel = av.midLevel || 0;
            const highLevel = av.highLevel || 0;
            const beat = av.beat || 0;
            const barMaxHeight = 20 + bassLevel * 10;
            const innerRadius = 60 + bassLevel * 10;
            
            for (let i = 0; i < barCount; i++) {
                const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
                
                // Simulate different frequency levels for each bar
                const freqIndex = i / barCount;
                let barHeight;
                if (freqIndex < 0.33) {
                    barHeight = barMaxHeight * bassLevel * (0.8 + Math.sin(time * 8 + i) * 0.2);
                } else if (freqIndex < 0.66) {
                    barHeight = barMaxHeight * midLevel * (0.8 + Math.sin(time * 12 + i) * 0.2);
                } else {
                    barHeight = barMaxHeight * highLevel * (0.8 + Math.sin(time * 16 + i) * 0.2);
                }
                
                const x1 = playingPos.x + Math.cos(angle) * innerRadius;
                const y1 = playingPos.y + Math.sin(angle) * innerRadius;
                const x2 = playingPos.x + Math.cos(angle) * (innerRadius + barHeight);
                const y2 = playingPos.y + Math.sin(angle) * (innerRadius + barHeight);
                
                // Color gradient based on height
                const hue = 100 + (barMaxHeight > 0 ? (barHeight / barMaxHeight) * 40 : 0); // Green to yellow
                ctx.strokeStyle = `hsla(${hue}, 100%, 50%, ${0.6 + beat * 0.3})`;
                ctx.lineWidth = 3;
                ctx.lineCap = 'round';
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            }
        }
        
        } catch (e) {
            console.error('Error in drawMapMarkers:', e);
        }
    }
    
    /**
     * Convert lat/lng to map canvas position
     */
    latLngToMapPosition(lat, lng, mapX, mapY, mapWidth, mapHeight) {
        // Equirectangular projection
        let x = mapX + ((lng + 180) / 360) * mapWidth;
        const y = mapY + ((90 - lat) / 180) * mapHeight;

        // The map wraps horizontally (panning left/right loops around, like longitude
        // itself) — shift x by whole map-widths to whichever repeated copy sits nearest
        // the visible canvas, so markers line up with the copy of the map actually drawn there.
        const width = this._mapCSSWidth || this.mapCanvas?.clientWidth || 800;
        if (mapWidth > 0) {
            x -= mapWidth * Math.round((x - width / 2) / mapWidth);
        }

        return { x, y };
    }
    
    /**
     * Convert 3D globe surface point to lat/lng (matches three-globe cartesian2Polar)
     */
    vector3ToLatLng(vec) {
        if (this.globe?.toGeoCoords) {
            return this.globe.toGeoCoords(vec);
        }

        const x = vec.x;
        const y = vec.y;
        const z = vec.z;
        const r = Math.sqrt(x * x + y * y + z * z);
        if (!r) return null;

        const phi = Math.acos(Math.max(-1, Math.min(1, y / r)));
        const theta = Math.atan2(z, x);
        return {
            lat: 90 - phi * 180 / Math.PI,
            lng: 90 - theta * 180 / Math.PI - (theta < -Math.PI / 2 ? 360 : 0)
        };
    }

    /**
     * Convert lat/lng to Vector3 on globe surface (matches three-globe polar2Cartesian)
     */
    latLngToVector3(lat, lng, altitude = 0) {
        if (this.globe?.getCoords) {
            const coords = this.globe.getCoords(lat, lng, altitude);
            return new THREE.Vector3(coords.x, coords.y, coords.z);
        }

        const phi = (90 - lat) * (Math.PI / 180);
        const theta = (90 - lng) * (Math.PI / 180);
        const radius = (this.settings?.globeRadius || 100) * (1 + altitude);

        return new THREE.Vector3(
            radius * Math.sin(phi) * Math.cos(theta),
            radius * Math.cos(phi),
            radius * Math.sin(phi) * Math.sin(theta)
        );
    }

    /**
     * Raycast directly against visible three-globe point markers
     */
    raycastGlobePoint(clientX, clientY) {
        if (!this.camera || !this.renderer || !this.globe) return null;

        const canvas = this.renderer.domElement;
        const rect = canvas.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1
        );

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.camera);

        const pointMeshes = [];
        this.globe.traverse((child) => {
            if (child.__globeObjType === 'point' && child.visible) {
                pointMeshes.push(child);
            }
        });

        if (pointMeshes.length === 0) return null;

        const hits = raycaster.intersectObjects(pointMeshes, false);
        if (hits.length === 0) return null;

        const data = hits[0].object.__data;
        return data?.station || null;
    }

    /**
     * Raycast to globe sphere surface (ignores marker sprites)
     */
    raycastGlobeLatLng(clientX, clientY) {
        if (!this.camera || !this.renderer) return null;

        const canvas = this.renderer.domElement;
        const rect = canvas.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((clientX - rect.left) / rect.width) * 2 - 1,
            -((clientY - rect.top) / rect.height) * 2 + 1
        );

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.camera);

        const radius = this.settings?.globeRadius || 100;
        const sphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), radius);
        const hit = new THREE.Vector3();

        // Globe mesh rotates when dragged — transform ray into globe-local space
        if (this.globe) {
            this.globe.updateMatrixWorld(true);
            const invMatrix = new THREE.Matrix4().copy(this.globe.matrixWorld).invert();
            const localRay = raycaster.ray.clone();
            localRay.applyMatrix4(invMatrix);

            if (!localRay.intersectSphere(sphere, hit)) {
                return null;
            }
            return this.vector3ToLatLng(hit);
        }

        if (!raycaster.ray.intersectSphere(sphere, hit)) {
            return null;
        }

        return this.vector3ToLatLng(hit);
    }

    /**
     * Convert map click position to lat/lng
     */
    mapClientToLatLng(clientX, clientY) {
        if (!this.mapCanvas) return null;

        const rect = this.mapCanvas.getBoundingClientRect();
        const width = this._mapCSSWidth || rect.width || 800;
        const height = this._mapCSSHeight || rect.height || 600;
        const mouseX = clientX - rect.left;
        const mouseY = clientY - rect.top;

        const { mapWidth, mapHeight, mapX, mapY } = this.getMapLayout(width, height);

        // The map wraps horizontally, so there's no left/right edge to reject a click
        // against — only vertical (latitude) bounds are real edges.
        if (mouseY < mapY || mouseY > mapY + mapHeight) {
            return null;
        }

        let lng = ((mouseX - mapX) / mapWidth) * 360 - 180;
        lng = ((lng + 180) % 360 + 360) % 360 - 180; // normalize into -180..180
        const lat = 90 - ((mouseY - mapY) / mapHeight) * 180;
        return { lat, lng };
    }

    /**
     * Resolve station(s) at a screen click using geographic coordinates
     */
    resolveClickStations(clientX, clientY, viewMode = this.viewMode) {
        const stations = this.getDisplayedStations();
        let latLng = null;
        let maxDegrees = 4;

        if (viewMode === 'globe') {
            const directHit = this.raycastGlobePoint(clientX, clientY);
            if (directHit && typeof resolveStationsAtClick === 'function') {
                latLng = { lat: directHit.lat, lng: directHit.lng };
                const stacked = stations.filter(station =>
                    typeof angularDistanceDegrees === 'function' &&
                    angularDistanceDegrees(station.lat, station.lng, directHit.lat, directHit.lng) < 0.08
                );
                if (stacked.length > 1) {
                    return { station: null, candidates: stacked, needsPicker: true, latLng };
                }
                return { station: directHit, candidates: [directHit], needsPicker: false, latLng };
            }

            latLng = this.raycastGlobeLatLng(clientX, clientY);
            const zoomFactor = (this.camera?.position?.z || 300) / 300;
            maxDegrees = Math.max(2, 6 * zoomFactor);
        } else {
            latLng = this.mapClientToLatLng(clientX, clientY);
            maxDegrees = Math.max(0.8, 5 / (this.mapZoom || 1));
        }

        if (!latLng || typeof resolveStationsAtClick !== 'function') {
            return { station: null, candidates: [], needsPicker: false, latLng: null };
        }

        return { ...resolveStationsAtClick(stations, latLng.lat, latLng.lng, maxDegrees), latLng };
    }

    /**
     * Pick station for hover tooltip
     */
    getHoverStation(clientX, clientY) {
        if (this.viewMode === 'globe') {
            const directHit = this.raycastGlobePoint(clientX, clientY);
            if (directHit) {
                const stations = this.getDisplayedStations();
                const stacked = stations.filter(station =>
                    typeof angularDistanceDegrees === 'function' &&
                    angularDistanceDegrees(station.lat, station.lng, directHit.lat, directHit.lng) < 0.08
                );
                if (stacked.length > 1) {
                    const station = { ...directHit };
                    station._stackCount = stacked.length;
                    return station;
                }
                return directHit;
            }
        }

        const result = this.resolveClickStations(clientX, clientY, this.viewMode);
        if (result.needsPicker && result.candidates.length) {
            const station = { ...result.candidates[0] };
            station._stackCount = result.candidates.length;
            return station;
        }
        return result.station;
    }

    /**
     * Play station or show picker when multiple share a location
     */
    commitStationSelection(result, event) {
        if (result.needsPicker && result.candidates.length > 1) {
            window.app?.ui?.showStationPicker(
                result.candidates,
                event.clientX,
                event.clientY,
                (station) => {
                    this.currentStation = station;
                    if (this.viewMode === 'map') {
                        this.renderMap();
                    } else if (typeof this.focusOnStation === 'function') {
                        this.focusOnStation(station);
                    }
                    window.dispatchEvent(new CustomEvent('stationSelected', { detail: station }));
                }
            );
            return;
        }

        if (result.station) {
            this.currentStation = result.station;
            if (this.viewMode === 'map') {
                this.renderMap();
            } else if (typeof this.focusOnStation === 'function') {
                this.focusOnStation(result.station);
            }
            window.dispatchEvent(new CustomEvent('stationSelected', { detail: result.station }));
        }
    }

    /**
     * Get station at map position
     */
    getStationAtMapPosition(clientX, clientY) {
        const result = this.resolveClickStations(clientX, clientY, 'map');
        if (result.station) return result.station;
        if (result.needsPicker && result.candidates.length) return result.candidates[0];
        return null;
    }
    
    /**
     * Handle mouse move on map
     */
    onMapMouseMove(event) {
        const station = this.getHoverStation(event.clientX, event.clientY);
        const tooltip = document.getElementById('stationTooltip');
        
        if (station) {
            const status = station.status || 'active';
            const statusIcon = status === 'active' ? '🟢' : (status === 'inactive' ? '🟡' : '🔴');
            const httpLabel = this.isHttpOnlyStation(station) ? ' • 🔶 HTTP' : '';
            const stackLabel = station._stackCount > 1 ? ` (+${station._stackCount - 1} more)` : '';
            tooltip.textContent = `${statusIcon} ${station.name} - ${station.city}, ${station.country}${httpLabel}${stackLabel}`;
            tooltip.style.left = event.clientX + 'px';
            tooltip.style.top = event.clientY + 'px';
            tooltip.style.display = 'block';
            this.mapCanvas.style.cursor = 'pointer';
        } else {
            tooltip.style.display = 'none';
            this.mapCanvas.style.cursor = 'grab';
        }
    }
    
    /**
     * Handle click on map
     */
    onMapClick(event) {
        const result = this.resolveClickStations(event.clientX, event.clientY, 'map');
        this.commitStationSelection(result, event);
    }
    
    /**
     * Add station markers to the globe
     */
    addStationMarkers() {
        // Filter out stations with invalid coordinates (including 0,0)
        const validStations = (this.stations || []).filter(s => this.hasValidCoordinates(s));
        
        const pointsData = validStations.map(station => ({
            lat: station.lat,
            lng: station.lng,
            size: this.settings?.markerRadius || 0.35,
            color: '#00e676',
            station: station
        }));
        
        if (this.globe) {
            try {
                this.globe
                    .pointsData(pointsData)
                    .pointAltitude(0.01)
                    .pointRadius('size')
                    .pointColor('color')
                    .pointsMerge(false)
                    .pointsTransitionDuration(300);
            } catch (e) {
                console.error('Error adding station markers:', e);
            }
        }
    }
    
    /**
     * Update displayed stations based on filter results
     * @param {Array} filteredStations - Array of stations to display on map
     */
    updateDisplayedStations(filteredStations) {
        if (typeof filterStationsForDisplay === 'function') {
            filteredStations = filterStationsForDisplay(filteredStations || []);
        } else if (typeof filterExceptedStations === 'function') {
            filteredStations = filterExceptedStations(filteredStations || []);
        }

        if (!filteredStations || filteredStations.length === 0) {
            // If no stations, clear the markers
            if (this.globe) {
                this.globe.pointsData([]);
            }
            this.displayedStations = [];
            this.renderMap();
            return;
        }
        
        // Filter out stations with invalid coordinates (including 0,0)
        const validStations = filteredStations.filter(s => this.hasValidCoordinates(s));
        
        // Keep internal lists in sync with visible markers
        this.stations = validStations;
        this.displayedStations = validStations;
        
        // Update 3D globe markers
        if (this.globe) {
            const pointsData = validStations.map(station => {
                const isActive = station.id === this.currentStation?.id;
                const status = station.status || 'active';
                const isHttpOnly = this.isHttpOnlyStation(station);
                let color = '#00e676'; // Default active color (green)
                
                if (isActive) {
                    color = '#76ff03'; // Playing station (bright green)
                } else if (isHttpOnly) {
                    color = '#fb923c'; // HTTP only (orange)
                } else if (status === 'inactive') {
                    color = '#f59e0b'; // Inactive (yellow-orange)
                } else if (status === 'down') {
                    color = '#ef4444'; // Down (red)
                }
                
                return {
                    lat: station.lat,
                    lng: station.lng,
                    size: isActive ? (this.settings?.activeMarkerRadius || 0.8) : (this.settings?.markerRadius || 0.35),
                    color: color,
                    station: station
                };
            });
            
            try {
                this.globe
                    .pointsData(pointsData)
                    .pointAltitude(0.01)
                    .pointRadius('size')
                    .pointColor('color')
                    .pointsMerge(false)
                    .pointsTransitionDuration(300);
            } catch (e) {
                console.error('Globe update error:', e);
            }
        }
        
        // Re-render map view
        this.renderMap();
    }
    
    /**
     * Get stations to display (filtered or all)
     */
    getDisplayedStations() {
        return this.displayedStations || this.stations;
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
     * Update marker appearance (e.g., when station is playing or favorited)
     */
    updateMarker(stationId, options = {}) {
        if (!stationId) return;
        
        // Find station from all stations (not just displayed)
        this.currentStation = (this.stations || []).find(s => s && s.id === stationId) || null;
        
        // Use displayed (filtered) stations, but ensure current station is included
        let stationsToShow = this.getDisplayedStations() || [];
        
        // If current station is not in displayed list and has valid coords, add it temporarily
        if (this.currentStation && this.hasValidCoordinates(this.currentStation) && 
            !stationsToShow.some(s => s && s.id === stationId)) {
            stationsToShow = [...stationsToShow, this.currentStation];
        }
        
        // Filter out stations with invalid coordinates (including 0,0)
        const validStations = stationsToShow.filter(s => this.hasValidCoordinates(s));
        
        const pointsData = validStations.map(station => {
            const isActive = station.id === stationId;
            const status = station.status || 'active';
            const isHttpOnly = this.isHttpOnlyStation(station);
            let color = '#00e676'; // Default active color (green)
            
            if (isActive) {
                color = '#76ff03'; // Playing station - bright green
            } else if (isHttpOnly) {
                color = '#fb923c'; // HTTP only - orange
            } else if (status === 'inactive') {
                color = '#f59e0b'; // Inactive - yellow/orange
            } else if (status === 'down') {
                color = '#ef4444'; // Down - red
            }
            
            return {
                lat: station.lat,
                lng: station.lng,
                size: isActive ? (this.settings?.activeMarkerRadius || 0.8) : (this.settings?.markerRadius || 0.35),
                color: color,
                station: station
            };
        });
        
        // Update 3D globe if available
        if (this.globe) {
            this.globe.pointsData(pointsData);
            
            // Add ring around playing station
            if (this.currentStation) {
                this.globe
                    .ringsData([{
                        lat: this.currentStation.lat,
                        lng: this.currentStation.lng
                    }])
                    .ringColor(() => '#76ff03')
                    .ringMaxRadius(4)
                    .ringPropagationSpeed(2)
                    .ringRepeatPeriod(1000);
            } else {
                this.globe.ringsData([]);
            }
        }
        
        // Re-render map view to show updated markers
        this.renderMap();
    }
    
    /**
     * Setup basic orbit controls for globe
     */
    setupGlobeControls() {
        // Check if renderer is available
        if (!this.renderer?.domElement) return;
        
        // We'll implement simple drag controls manually
        let isDragging = false;
        let previousMousePosition = { x: 0, y: 0 };
        const canvas = this.renderer.domElement;
        
        canvas.addEventListener('mousedown', (e) => {
            if (this.viewMode !== 'globe') return;
            isDragging = true;
            previousMousePosition = { x: e.clientX, y: e.clientY };
            this.mouseDownPos = { x: e.clientX, y: e.clientY };
            this.autoRotate = false;
        });
        
        canvas.addEventListener('mousemove', (e) => {
            if (this.viewMode !== 'globe' || !isDragging) return;
            if (!this.globe?.rotation) return;
            
            const deltaMove = {
                x: e.clientX - previousMousePosition.x,
                y: e.clientY - previousMousePosition.y
            };
            
            const rotationSpeed = 0.005;
            this.globe.rotation.y += deltaMove.x * rotationSpeed;
            this.globe.rotation.x += deltaMove.y * rotationSpeed;
            
            // Clamp vertical rotation
            this.globe.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.globe.rotation.x));
            
            previousMousePosition = { x: e.clientX, y: e.clientY };
        });
        
        canvas.addEventListener('mouseup', (e) => {
            if (this.viewMode !== 'globe') return;
            isDragging = false;
            
            // Check if this is a click (not a drag)
            if (this.mouseDownPos) {
                const distance = Math.sqrt(
                    Math.pow(e.clientX - this.mouseDownPos.x, 2) +
                    Math.pow(e.clientY - this.mouseDownPos.y, 2)
                );
                
                // If movement is less than 10 pixels, treat as click
                if (distance < 10) {
                    this.onMouseClick(e);
                }
                
                this.mouseDownPos = null;
            }
        });
        
        canvas.addEventListener('mouseleave', () => {
            isDragging = false;
            this.mouseDownPos = null;
        });
        
        // Touch support
        canvas.addEventListener('touchstart', (e) => {
            if (this.viewMode !== 'globe') return;
            if (e.touches.length === 1) {
                isDragging = true;
                previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                this.touchStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                this.autoRotate = false;
            }
        });
        
        canvas.addEventListener('touchmove', (e) => {
            if (this.viewMode !== 'globe' || !isDragging || e.touches.length !== 1) return;
            if (!this.globe?.rotation) return;
            e.preventDefault();
            
            const deltaMove = {
                x: e.touches[0].clientX - previousMousePosition.x,
                y: e.touches[0].clientY - previousMousePosition.y
            };
            
            const rotationSpeed = 0.005;
            this.globe.rotation.y += deltaMove.x * rotationSpeed;
            this.globe.rotation.x += deltaMove.y * rotationSpeed;
            
            this.globe.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.globe.rotation.x));
            
            previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        });
        
        canvas.addEventListener('touchend', (e) => {
            if (this.viewMode !== 'globe') return;
            isDragging = false;
            
            // Check if this is a tap (not a swipe) - use last touch position
            if (this.touchStartPos && e.changedTouches.length > 0) {
                const touch = e.changedTouches[0];
                const distance = Math.sqrt(
                    Math.pow(touch.clientX - this.touchStartPos.x, 2) +
                    Math.pow(touch.clientY - this.touchStartPos.y, 2)
                );
                
                // If movement is less than 10 pixels, treat as tap
                if (distance < 10) {
                    this.onMouseClick({ clientX: touch.clientX, clientY: touch.clientY });
                }
                
                this.touchStartPos = null;
            }
        });
        
        // Zoom with mouse wheel
        canvas.addEventListener('wheel', (e) => {
            if (this.viewMode !== 'globe') return;
            if (!this.camera?.position) return;
            e.preventDefault();
            const zoomSpeed = 0.1;
            this.camera.position.z += e.deltaY * zoomSpeed;
            this.camera.position.z = Math.max(150, Math.min(500, this.camera.position.z));
        }, { passive: false });
    }
    
    /**
     * Get station at mouse position (globe view) — uses geographic hit test
     */
    getStationAtPosition(clientX, clientY) {
        const result = this.resolveClickStations(clientX, clientY, 'globe');
        if (result.station) return result.station;
        if (result.needsPicker && result.candidates.length) return result.candidates[0];
        return null;
    }
    
    /**
     * Handle mouse move for tooltip (globe view)
     */
    onMouseMove(event) {
        if (this.viewMode !== 'globe') return;
        
        const station = this.getHoverStation(event.clientX, event.clientY);
        const tooltip = document.getElementById('stationTooltip');
        
        if (station) {
            const status = station.status || 'active';
            const statusIcon = status === 'active' ? '🟢' : (status === 'inactive' ? '🟡' : '🔴');
            const httpLabel = this.isHttpOnlyStation(station) ? ' • 🔶 HTTP' : '';
            const stackLabel = station._stackCount > 1 ? ` (+${station._stackCount - 1} more)` : '';
            tooltip.textContent = `${statusIcon} ${station.name} - ${station.city}, ${station.country}${httpLabel}${stackLabel}`;
            tooltip.style.left = event.clientX + 'px';
            tooltip.style.top = event.clientY + 'px';
            tooltip.style.display = 'block';
            this.renderer.domElement.style.cursor = 'pointer';
        } else {
            tooltip.style.display = 'none';
            this.renderer.domElement.style.cursor = 'grab';
        }
    }
    
    /**
     * Handle mouse click on station (globe view)
     */
    onMouseClick(event) {
        if (this.viewMode !== 'globe') return;

        const result = this.resolveClickStations(event.clientX, event.clientY, 'globe');
        this.commitStationSelection(result, event);
    }
    
    /**
     * Focus camera on a specific station
     */
    focusOnStation(station) {
        if (!station) return;
        
        // Check if station has valid coordinates (not 0,0 which is "Null Island" - invalid)
        const hasValidCoords = this.hasValidCoordinates(station);
        
        // Dispatch event for logger tracking
        window.dispatchEvent(new CustomEvent('globe:focusStation', { 
            detail: { 
                name: station.name, 
                lat: station.lat, 
                lng: station.lng,
                hasValidCoords,
                viewMode: this.viewMode
            } 
        }));
        
        // Always set as current station (for audio visualization state tracking)
        this.currentStation = station;
        
        // If no valid coordinates, still update the marker (for the station list highlighting)
        // but we won't show map animation since we don't know where to put it
        if (!hasValidCoords) {
            // Still mark as playing in the state but don't try to show on map
            return;
        }
        
        try {
            this.updateMarker(station.id);

            if (this.viewMode === 'globe' && this.globe) {
                this.rotateGlobeTo(station.lat, station.lng);
            } else if (this.mapCanvas) {
                this.animateMapTo(station.lat, station.lng);
            }
        } catch (e) {
            console.error('Error focusing on station:', e);
        }
    }

    /**
     * Smoothly rotate the 3D globe to face the given coordinates.
     */
    rotateGlobeTo(lat, lng) {
        if (!this.globe?.quaternion) return;

        // Auto-rotate runs on every animation frame via globe.rotation.y — left on, it
        // keeps nudging the globe throughout (and after) this slerp, so the target never
        // actually settles centered on camera. Stop it, same as manual drag does.
        this.autoRotate = false;

        const coords = this.globe.getCoords
            ? this.globe.getCoords(lat, lng)
            : this.latLngToVector3(lat, lng);

        const pos = new THREE.Vector3(coords.x, coords.y, coords.z);
        const dir = pos.clone().normalize();
        const front = new THREE.Vector3(0, 0, 1);
        const targetQuat = new THREE.Quaternion().setFromUnitVectors(dir, front);
        const startQuat = this.globe.quaternion.clone();

        const duration = 1000;
        const startTime = Date.now();
        const globe = this.globe;

        const animate = () => {
            if (!globe?.quaternion) return;

            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = this.easeInOutCubic(progress);

            globe.quaternion.slerpQuaternions(startQuat, targetQuat, eased);

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        animate();
    }

    /**
     * Compute the mapOffset that centers the given lat/lng at the given zoom,
     * without touching current state (pure — safe to call for a target preview).
     */
    computeCenteredOffset(lat, lng, zoom) {
        const width = this._mapCSSWidth || this.mapCanvas?.clientWidth || 800;
        const height = this._mapCSSHeight || this.mapCanvas?.clientHeight || 600;
        const imageAspect = (this.mapImage && this.mapImage.naturalWidth && this.mapImage.naturalHeight)
            ? this.mapImage.naturalWidth / this.mapImage.naturalHeight
            : 2;

        let baseWidth = height * imageAspect;
        let baseHeight = height;
        if (baseWidth < width) {
            baseWidth = width;
            baseHeight = width / imageAspect;
        }

        const mapWidth = baseWidth * zoom;
        const mapHeight = baseHeight * zoom;

        const x = mapWidth * (0.5 - (lng + 180) / 360);
        const y = mapHeight * (0.5 - (90 - lat) / 180);
        return { x, y };
    }

    /**
     * Smoothly pan/zoom the 2D map to center on the given coordinates.
     */
    animateMapTo(lat, lng, targetZoom) {
        if (!this.mapCanvas || this.viewMode !== 'map') return;

        const zoom = targetZoom || Math.max(this.mapZoom || 1, 1.5);
        const target = this.computeCenteredOffset(lat, lng, zoom);

        const startZoom = this.mapZoom || 1;
        const startX = this.mapOffset.x || 0;
        const startY = this.mapOffset.y || 0;
        const duration = 800;
        const startTime = Date.now();

        const animate = () => {
            if (!this.mapCanvas) return;

            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = this.easeInOutCubic(progress);

            this.mapZoom = startZoom + (zoom - startZoom) * eased;
            this.mapOffset.x = startX + (target.x - startX) * eased;
            this.mapOffset.y = startY + (target.y - startY) * eased;
            this.renderMap();

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        animate();
    }

    /**
     * Guess an approximate {lat, lng} for the user from their browser timezone —
     * no permission prompt, no network call. Falls back to deriving a rough
     * longitude from the UTC offset if the specific zone isn't in the table.
     */
    getApproxLocationFromTimezone() {
        const TZ_LOCATIONS = {
            'America/New_York': { lat: 40.7, lng: -74.0 },
            'America/Chicago': { lat: 41.9, lng: -87.6 },
            'America/Denver': { lat: 39.7, lng: -104.9 },
            'America/Los_Angeles': { lat: 34.1, lng: -118.2 },
            'America/Anchorage': { lat: 61.2, lng: -149.9 },
            'America/Toronto': { lat: 43.7, lng: -79.4 },
            'America/Vancouver': { lat: 49.3, lng: -123.1 },
            'America/Mexico_City': { lat: 19.4, lng: -99.1 },
            'America/Bogota': { lat: 4.7, lng: -74.1 },
            'America/Lima': { lat: -12.0, lng: -77.0 },
            'America/Sao_Paulo': { lat: -23.5, lng: -46.6 },
            'America/Argentina/Buenos_Aires': { lat: -34.6, lng: -58.4 },
            'America/Buenos_Aires': { lat: -34.6, lng: -58.4 }, // legacy alias
            'America/Santiago': { lat: -33.4, lng: -70.7 },
            'Europe/London': { lat: 51.5, lng: -0.1 },
            'Europe/Dublin': { lat: 53.3, lng: -6.3 },
            'Europe/Lisbon': { lat: 38.7, lng: -9.1 },
            'Europe/Paris': { lat: 48.9, lng: 2.3 },
            'Europe/Berlin': { lat: 52.5, lng: 13.4 },
            'Europe/Madrid': { lat: 40.4, lng: -3.7 },
            'Europe/Rome': { lat: 41.9, lng: 12.5 },
            'Europe/Amsterdam': { lat: 52.4, lng: 4.9 },
            'Europe/Moscow': { lat: 55.8, lng: 37.6 },
            'Europe/Istanbul': { lat: 41.0, lng: 28.9 },
            'Asia/Istanbul': { lat: 41.0, lng: 28.9 }, // legacy alias
            'Europe/Athens': { lat: 38.0, lng: 23.7 },
            'Europe/Warsaw': { lat: 52.2, lng: 21.0 },
            'Africa/Cairo': { lat: 30.0, lng: 31.2 },
            'Africa/Lagos': { lat: 6.5, lng: 3.4 },
            'Africa/Johannesburg': { lat: -26.2, lng: 28.0 },
            'Africa/Nairobi': { lat: -1.3, lng: 36.8 },
            'Asia/Dubai': { lat: 25.2, lng: 55.3 },
            'Asia/Kolkata': { lat: 20.6, lng: 78.9 },
            'Asia/Calcutta': { lat: 20.6, lng: 78.9 }, // legacy alias, still reported by some browsers/OSes
            'Asia/Karachi': { lat: 30.4, lng: 69.3 },
            'Asia/Dhaka': { lat: 23.8, lng: 90.4 },
            'Asia/Bangkok': { lat: 15.9, lng: 100.9 },
            'Asia/Jakarta': { lat: -6.2, lng: 106.8 },
            'Asia/Singapore': { lat: 1.35, lng: 103.8 },
            'Asia/Shanghai': { lat: 31.2, lng: 121.5 },
            'Asia/Hong_Kong': { lat: 22.3, lng: 114.2 },
            'Asia/Tokyo': { lat: 35.7, lng: 139.7 },
            'Asia/Seoul': { lat: 37.6, lng: 127.0 },
            'Asia/Manila': { lat: 14.6, lng: 121.0 },
            'Australia/Sydney': { lat: -33.9, lng: 151.2 },
            'Australia/Perth': { lat: -31.9, lng: 115.9 },
            'Pacific/Auckland': { lat: -36.8, lng: 174.8 }
        };

        let tz = null;
        try {
            tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        } catch (e) {
            tz = null;
        }

        if (tz && TZ_LOCATIONS[tz]) {
            return TZ_LOCATIONS[tz];
        }

        // Fallback: each hour of UTC offset is roughly 15° of longitude
        const offsetMinutes = -new Date().getTimezoneOffset();
        const lng = Math.max(-180, Math.min(180, (offsetMinutes / 60) * 15));
        return { lat: 20, lng };
    }

    /**
     * Focus the globe/map on the user's approximate region — used when nothing
     * is playing yet, so the view opens somewhere relevant instead of a fixed
     * default point.
     */
    focusOnDefaultRegion() {
        const { lat, lng } = this.getApproxLocationFromTimezone();
        if (this.viewMode === 'globe') {
            this.rotateGlobeTo(lat, lng);
        } else {
            this.animateMapTo(lat, lng, this.mapZoom || 1.5);
        }
    }
    
    /**
     * Easing function
     */
    easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }
    
    /**
     * Toggle auto-rotate
     */
    toggleAutoRotate() {
        this.autoRotate = !this.autoRotate;
        return this.autoRotate;
    }
    
    /**
     * Handle window resize
     */
    onWindowResize() {
        const container = document.getElementById('globeContainer');
        if (!container) return;
        
        // Get dimensions from container
        let width = container.clientWidth;
        let height = container.clientHeight;
        
        // Ensure valid dimensions
        if (!width || width < 100) width = 800;
        if (!height || height < 100) height = 600;
        
        // Resize globe (with null checks)
        if (this.camera) {
            this.camera.aspect = width / height;
            this.camera.updateProjectionMatrix();
        }
        if (this.renderer) {
            this.renderer.setSize(width, height);
        }
        
        // Resize map - store CSS dimensions for calculations
        if (this.mapCanvas) {
            const dpr = window.devicePixelRatio || 1;
            this.mapCanvas.width = width * dpr;
            this.mapCanvas.height = height * dpr;
            this.mapCanvas.style.width = width + 'px';
            this.mapCanvas.style.height = height + 'px';
            
            // Reset transform and apply DPR scale
            if (this.mapCtx) {
                this.mapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
            }
            
            // Store CSS dimensions for use in calculations - ALWAYS set these
            this._mapCSSWidth = width;
            this._mapCSSHeight = height;
            
            if (this.viewMode === 'map') {
                this.renderMap();
            }
        } else {
            // Even if mapCanvas doesn't exist yet, store dimensions
            this._mapCSSWidth = width;
            this._mapCSSHeight = height;
        }
    }
    
    /**
     * Set playing state for audio visualization
     */
    setPlaying(isPlaying) {
        // Dispatch event for logger tracking
        window.dispatchEvent(new CustomEvent('globe:setPlaying', { 
            detail: { 
                isPlaying, 
                currentStation: this.currentStation?.name,
                hasValidCoords: this.currentStation ? this.hasValidCoordinates(this.currentStation) : false
            } 
        }));
        
        this.isPlaying = isPlaying;
        if (isPlaying && this.audioVisualization) {
            this.audioVisualization.lastBeatTime = Date.now();
        }
    }
    
    /**
     * Update simulated audio levels (creates realistic-looking audio reactivity)
     */
    updateAudioSimulation() {
        try {
            // Ensure audioVisualization exists with defaults
            if (!this.audioVisualization) {
                this.audioVisualization = {
                    enabled: true, beat: 0, beatDecay: 0.95, lastBeatTime: 0, bpm: 120,
                    ripples: [], particles: [], wavePhase: 0, bassLevel: 0, midLevel: 0, highLevel: 0
                };
            }
            const av = this.audioVisualization;
            av.ripples = av.ripples || [];
            av.particles = av.particles || [];
            
            const now = Date.now();
            const time = now / 1000;
            
            if (!this.isPlaying) {
                // Decay to zero when not playing
                av.bassLevel = (av.bassLevel || 0) * 0.9;
                av.midLevel = (av.midLevel || 0) * 0.9;
                av.highLevel = (av.highLevel || 0) * 0.9;
                av.beat = (av.beat || 0) * (av.beatDecay || 0.95);
                return;
            }
            
            // Simulate BPM-based beats (with some randomness for natural feel)
            const beatInterval = 60000 / (av.bpm || 120);
            if (now - (av.lastBeatTime || 0) > beatInterval) {
                av.beat = 0.8 + Math.random() * 0.2; // Strong beat
                av.lastBeatTime = now;
                
                // Add ripple on beat
                if (this.currentStation) {
                    this.addRipple();
                }
                
                // Occasionally add particles
                if (Math.random() > 0.5) {
                    this.addParticles(3 + Math.floor(Math.random() * 5));
                }
            }
            
            // Decay beat
            av.beat = (av.beat || 0) * (av.beatDecay || 0.95);
            
            // Simulate frequency bands with smooth noise
            av.bassLevel = 0.5 + 0.5 * Math.sin(time * 2.1) * Math.sin(time * 0.7) + (av.beat || 0) * 0.5;
            av.midLevel = 0.4 + 0.4 * Math.sin(time * 3.7 + 1) * Math.cos(time * 1.3) + (av.beat || 0) * 0.3;
            av.highLevel = 0.3 + 0.3 * Math.sin(time * 5.3 + 2) * Math.sin(time * 2.1) + (av.beat || 0) * 0.2;
            
            // Update wave phase
            av.wavePhase = (av.wavePhase || 0) + 0.05;
            
            // Update ripples
            if (av.ripples && av.ripples.length > 0) {
                av.ripples = av.ripples.filter(r => {
                    if (!r) return false;
                    r.radius = (r.radius || 0) + (r.speed || 2);
                    r.opacity = (r.opacity || 0) - 0.015;
                    return r.opacity > 0;
                });
            }
            
            // Update particles
            if (av.particles && av.particles.length > 0) {
                av.particles = av.particles.filter(p => {
                    if (!p) return false;
                    p.x = (p.x || 0) + (p.vx || 0);
                    p.y = (p.y || 0) + (p.vy || 0);
                    p.vy = (p.vy || 0) + 0.02; // Gravity
                    p.life = (p.life || 0) - 0.02;
                    p.size = (p.size || 2) * 0.98;
                    return p.life > 0;
                });
            }
        } catch (e) {
            console.error('Error in updateAudioSimulation:', e);
        }
    }
    
    /**
     * Add a ripple wave from the playing station
     */
    addRipple() {
        if (!this.audioVisualization) return;
        if (!this.audioVisualization.ripples) this.audioVisualization.ripples = [];
        this.audioVisualization.ripples.push({
            radius: 0,
            opacity: 0.8,
            speed: 2 + Math.random() * 2
        });
    }
    
    /**
     * Add particles around the playing station
     */
    addParticles(count) {
        if (!this.audioVisualization) return;
        if (!this.audioVisualization.particles) this.audioVisualization.particles = [];
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 2;
            this.audioVisualization.particles.push({
                x: 0,
                y: 0,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 1,
                size: 2 + Math.random() * 3,
                life: 1,
                hue: 100 + Math.random() * 60 // Green to yellow range
            });
        }
    }
    
    /**
     * Animation loop
     */
    animate() {
        this.animationFrameId = requestAnimationFrame(() => this.animate());
        
        try {
            // Update audio simulation
            this.updateAudioSimulation();
            
            if (this.viewMode === 'globe') {
                // Auto-rotate globe (with null checks)
                if (this.autoRotate && this.globe && this.globe.rotation) {
                    this.globe.rotation.y += (this.settings?.rotationSpeed || 0.001);
                }
                
                // Render scene (with null checks)
                if (this.renderer && this.scene && this.camera) {
                    this.renderer.render(this.scene, this.camera);
                }
            } else if (this.viewMode === 'map') {
                // Always re-render map for smooth animations
                this.renderMap();
            }
        } catch (e) {
            console.error('Animation loop error:', e);
        }
    }
    
    /**
     * Cleanup
     */
    destroy() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        
        if (this.renderer) {
            this.renderer.dispose();
        }
        
        // Use bound handler reference for proper removal
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
        }
    }
}

// Export for use in app.js
window.GlobeController = GlobeController;
