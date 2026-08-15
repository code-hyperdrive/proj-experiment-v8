/**
 * visualizer.js - Audio Visualizer
 * Creates audio-reactive visualizations with multiple styles
 */

class AudioVisualizer {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.source = null;
        this.isActive = false;
        this.animationId = null;
        this.currentStyle = 'bars'; // bars, wave, circular, particles
        
        // Visualizer settings
        this.settings = {
            barCount: 64,
            barWidth: 4,
            barGap: 2,
            smoothing: 0.8,
            colorMode: 'gradient', // gradient, solid, rainbow
            primaryColor: '#00e676',
            secondaryColor: '#76ff03',
            sensitivity: 1.5
        };
        
        // Available styles
        this.styles = {
            bars: { name: 'Bars', icon: '📊' },
            wave: { name: 'Wave', icon: '🌊' },
            circular: { name: 'Circular', icon: '⭕' },
            particles: { name: 'Particles', icon: '✨' },
            spectrum: { name: 'Spectrum', icon: '🌈' },
            couple: { name: 'Dancing Couple', icon: '💃' },
            kids: { name: 'Kids Dancing', icon: '🧒' },
            shiva: { name: 'Shiva Tandava', icon: '🔱' },
            matrix: { name: 'Matrix Rain', icon: '🟢' },
            fireworks: { name: 'Fireworks', icon: '🎆' },
            aurora: { name: 'Aurora Borealis', icon: '🌌' },
            bubbles: { name: 'Bubbles', icon: '🫧' },
            flames: { name: 'Flames', icon: '🔥' },
            galaxy: { name: 'Galaxy', icon: '🌀' },
            pulse: { name: 'Heartbeat', icon: '💓' },
            disco: { name: 'Disco Ball', icon: '🪩' }
        };
        
        // Particles for particle mode
        this.particles = [];
        
        // Matrix rain drops
        this.matrixDrops = [];
        
        // Fireworks
        this.fireworks = [];
        
        // Aurora waves
        this.auroraWaves = [];
        
        // Bubbles
        this.bubbles = [];
        
        // Flames
        this.flameParticles = [];
        
        // Galaxy stars
        this.stars = [];
        
        // Disco ball facets
        this.discoFacets = [];
        
        // Dancing couple state
        this.dancer = {
            x: 0.5,
            y: 0.5,
            targetX: 0.5,
            targetY: 0.5,
            moveTimer: 0,
            beat: 0
        };

        // 100 unique dance steps - various styles from around the world
        this.danceSteps = this.initDanceSteps();

        // Kids dancing state (playful, innocent hopping - not the adult dance steps)
        this.kids = {
            x: 0.5,
            y: 0.5,
            targetX: 0.5,
            targetY: 0.5,
            moveTimer: 0,
            beat: 0,
            // Separation between the two kids (in local, pre-scale units) -
            // sometimes they drift apart, sometimes they come back close
            // together, independent of the group's own wandering.
            separation: 15,
            targetSeparation: 15,
            separationTimer: 0
        };

        // Shiva Tandava state - a centered, temple-idol-style cosmic dance
        // within a ring of fire (classic Nataraja iconography)
        this.shiva = {
            beat: 0
        };
    }
    
    /**
     * Initialize the visualizer
     */
    init(audioElement) {
        // Create canvas
        this.createCanvas();
        
        // Initialize data array for visualization
        this.dataArray = new Uint8Array(128);
        
        // Try to setup real audio analysis (may fail due to CORS)
        this.useSimulation = true;
        
        try {
            if (audioElement && !audioElement.crossOrigin) {
                // Try adding crossorigin for audio analysis
                const testAudio = audioElement.cloneNode();
                testAudio.crossOrigin = 'anonymous';
                
                // Most streams won't support CORS, so we use simulation
                console.log('ℹ️ Using simulated visualizer (CORS not available for most streams)');
            }
        } catch (e) {
            console.log('ℹ️ Using simulated visualizer');
        }
        
        console.log('✅ Audio visualizer initialized (simulation mode)');
    }
    
    /**
     * Start audio simulation for visualization
     */
    startSimulation() {
        if (this.simulationInterval) return;
        
        // Generate smooth random data that looks like audio
        this.simulationPhase = 0;
        this.simulationBass = 0;
        this.simulationTreble = 0;
        
        this.simulationInterval = setInterval(() => {
            if (!this.isActive) return;
            
            this.simulationPhase += 0.1;
            
            // Simulate bass and treble with smooth transitions
            this.simulationBass += (Math.random() - 0.5) * 30;
            this.simulationBass = Math.max(50, Math.min(200, this.simulationBass));
            
            this.simulationTreble += (Math.random() - 0.5) * 20;
            this.simulationTreble = Math.max(30, Math.min(150, this.simulationTreble));
            
            // Generate frequency data
            for (let i = 0; i < this.dataArray.length; i++) {
                const freq = i / this.dataArray.length;
                
                // Bass frequencies (low index)
                if (freq < 0.2) {
                    this.dataArray[i] = this.simulationBass * (1 - freq * 2) + 
                                        Math.sin(this.simulationPhase * 2 + i * 0.5) * 30;
                }
                // Mid frequencies
                else if (freq < 0.6) {
                    this.dataArray[i] = (this.simulationBass + this.simulationTreble) / 2 * 0.7 +
                                        Math.sin(this.simulationPhase * 3 + i * 0.3) * 25;
                }
                // Treble frequencies (high index)
                else {
                    this.dataArray[i] = this.simulationTreble * (1 - (freq - 0.6) * 2) +
                                        Math.sin(this.simulationPhase * 5 + i * 0.2) * 20;
                }
                
                // Add some randomness
                this.dataArray[i] += Math.random() * 15;
                
                // Clamp values
                this.dataArray[i] = Math.max(0, Math.min(255, this.dataArray[i]));
            }
        }, 50); // 20fps data generation
    }
    
    /**
     * Stop simulation
     */
    stopSimulation() {
        if (this.simulationInterval) {
            clearInterval(this.simulationInterval);
            this.simulationInterval = null;
        }
    }
    
    /**
     * Create visualizer canvas
     */
    createCanvas() {
        // Remove existing if any
        document.getElementById('visualizerCanvas')?.remove();
        
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'visualizerCanvas';
        this.canvas.className = 'visualizer-canvas';
        this.ctx = this.canvas.getContext('2d');
        
        const container = document.getElementById('globeContainer');
        if (container) {
            container.appendChild(this.canvas);
            this.resize();
        }
    }
    
    /**
     * Resize canvas
     */
    resize() {
        if (!this.canvas) return;
        
        const container = document.getElementById('globeContainer');
        if (!container) return;
        
        const dpr = window.devicePixelRatio || 1;
        const width = container.clientWidth;
        const height = container.clientHeight;
        
        this.canvas.width = width * dpr;
        this.canvas.height = height * dpr;
        this.canvas.style.width = width + 'px';
        this.canvas.style.height = height + 'px';
        // setTransform (not scale()) - scale() is cumulative on top of
        // whatever transform is already set, and resize() is called every
        // time the visualizer is shown (app.js's showVisualizer()). A
        // second show on a 2x display compounded to 4x effective scale,
        // third show to 8x, etc., drawing everything progressively further
        // off-screen. setTransform replaces the transform outright instead
        // of compounding it. (globe.js's equivalent resize already does
        // this correctly - this file just didn't match it.)
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        
        this._width = width;
        this._height = height;
    }
    
    /**
     * Start visualizer
     */
    start() {
        if (this.isActive) return;
        
        this.isActive = true;
        this.canvas.classList.add('active');
        
        // Start simulation
        this.startSimulation();
        
        this.animate();
    }
    
    /**
     * Stop visualizer
     */
    stop() {
        this.isActive = false;
        this.canvas?.classList.remove('active');
        
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }

        this.stopSimulation();
    }
    
    /**
     * Set visualizer style
     */
    setStyle(style) {
        if (this.styles[style]) {
            this.currentStyle = style;
            // Reset particles when switching to particle mode
            if (style === 'particles') {
                this.initParticles();
            }
        }
    }
    
    /**
     * Get available styles
     */
    getStyles() {
        return this.styles;
    }
    
    /**
     * Animation loop
     */
    animate() {
        if (!this.isActive) return;
        
        this.animationId = requestAnimationFrame(() => this.animate());
        
        // Data is updated by simulation interval
        
        // Clear canvas with fade effect
        this.ctx.fillStyle = 'rgba(10, 14, 39, 0.2)';
        this.ctx.fillRect(0, 0, this._width, this._height);
        
        // Draw based on style
        switch (this.currentStyle) {
            case 'bars':
                this.drawBars();
                break;
            case 'wave':
                this.drawWave();
                break;
            case 'circular':
                this.drawCircular();
                break;
            case 'particles':
                this.drawParticles();
                break;
            case 'spectrum':
                this.drawSpectrum();
                break;
            case 'couple':
                this.drawCouple();
                break;
            case 'kids':
                this.drawKids();
                break;
            case 'shiva':
                this.drawShiva();
                break;
            case 'matrix':
                this.drawMatrix();
                break;
            case 'fireworks':
                this.drawFireworks();
                break;
            case 'aurora':
                this.drawAurora();
                break;
            case 'bubbles':
                this.drawBubbles();
                break;
            case 'flames':
                this.drawFlames();
                break;
            case 'galaxy':
                this.drawGalaxy();
                break;
            case 'pulse':
                this.drawPulse();
                break;
            case 'disco':
                this.drawDisco();
                break;
        }
    }
    
    /**
     * Draw bars visualizer
     */
    drawBars() {
        const barCount = this.settings.barCount;
        const barWidth = (this._width / barCount) - this.settings.barGap;
        const heightScale = this._height / 255 * this.settings.sensitivity;
        
        for (let i = 0; i < barCount; i++) {
            const dataIndex = Math.floor(i * this.dataArray.length / barCount);
            const value = this.dataArray[dataIndex] || 0;
            const barHeight = value * heightScale;
            
            const x = i * (barWidth + this.settings.barGap);
            const y = this._height - barHeight;
            
            // Create gradient
            const gradient = this.ctx.createLinearGradient(x, this._height, x, y);
            gradient.addColorStop(0, this.settings.primaryColor);
            gradient.addColorStop(1, this.settings.secondaryColor);
            
            this.ctx.fillStyle = gradient;
            this.ctx.fillRect(x, y, barWidth, barHeight);
            
            // Reflection
            this.ctx.fillStyle = `rgba(0, 230, 118, ${0.1 * (value / 255)})`;
            this.ctx.fillRect(x, this._height, barWidth, barHeight * 0.3);
        }
    }
    
    /**
     * Draw wave visualizer
     */
    drawWave() {
        const sliceWidth = this._width / this.dataArray.length;
        const centerY = this._height / 2;
        
        this.ctx.beginPath();
        this.ctx.moveTo(0, centerY);
        
        for (let i = 0; i < this.dataArray.length; i++) {
            const value = this.dataArray[i] / 255;
            const y = centerY + (value - 0.5) * this._height * this.settings.sensitivity;
            const x = i * sliceWidth;
            
            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        }
        
        // Create gradient stroke
        const gradient = this.ctx.createLinearGradient(0, 0, this._width, 0);
        gradient.addColorStop(0, this.settings.primaryColor);
        gradient.addColorStop(0.5, this.settings.secondaryColor);
        gradient.addColorStop(1, this.settings.primaryColor);
        
        this.ctx.strokeStyle = gradient;
        this.ctx.lineWidth = 3;
        this.ctx.stroke();
        
        // Draw mirrored wave
        this.ctx.beginPath();
        for (let i = 0; i < this.dataArray.length; i++) {
            const value = this.dataArray[i] / 255;
            const y = centerY - (value - 0.5) * this._height * this.settings.sensitivity;
            const x = i * sliceWidth;
            
            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        }
        
        this.ctx.strokeStyle = `rgba(0, 230, 118, 0.5)`;
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
    }
    
    /**
     * Draw circular visualizer
     */
    drawCircular() {
        const centerX = this._width / 2;
        const centerY = this._height / 2;
        const radius = Math.min(this._width, this._height) * 0.3;
        const barCount = 64;
        
        for (let i = 0; i < barCount; i++) {
            const dataIndex = Math.floor(i * this.dataArray.length / barCount);
            const value = this.dataArray[dataIndex] || 0;
            const barHeight = (value / 255) * radius * this.settings.sensitivity;
            
            const angle = (i / barCount) * Math.PI * 2 - Math.PI / 2;
            const x1 = centerX + Math.cos(angle) * radius;
            const y1 = centerY + Math.sin(angle) * radius;
            const x2 = centerX + Math.cos(angle) * (radius + barHeight);
            const y2 = centerY + Math.sin(angle) * (radius + barHeight);
            
            // Color based on frequency
            const hue = (i / barCount) * 120; // Green spectrum
            this.ctx.strokeStyle = `hsla(${hue}, 100%, 50%, ${0.5 + value / 510})`;
            this.ctx.lineWidth = 4;
            this.ctx.beginPath();
            this.ctx.moveTo(x1, y1);
            this.ctx.lineTo(x2, y2);
            this.ctx.stroke();
        }
        
        // Inner circle glow
        const avgValue = this.dataArray.reduce((a, b) => a + b, 0) / this.dataArray.length;
        const glowRadius = radius * 0.8 + (avgValue / 255) * 20;
        
        const gradient = this.ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, glowRadius);
        gradient.addColorStop(0, `rgba(0, 230, 118, ${0.3 + avgValue / 510})`);
        gradient.addColorStop(1, 'rgba(0, 230, 118, 0)');
        
        this.ctx.fillStyle = gradient;
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, glowRadius, 0, Math.PI * 2);
        this.ctx.fill();
    }
    
    /**
     * Initialize particles
     */
    initParticles() {
        this.particles = [];
        for (let i = 0; i < 100; i++) {
            this.particles.push({
                x: Math.random() * this._width,
                y: Math.random() * this._height,
                size: Math.random() * 3 + 1,
                speedX: (Math.random() - 0.5) * 2,
                speedY: (Math.random() - 0.5) * 2,
                hue: Math.random() * 60 + 100 // Green-ish
            });
        }
    }
    
    /**
     * Draw particles visualizer
     */
    drawParticles() {
        if (this.particles.length === 0) {
            this.initParticles();
        }
        
        const avgValue = this.dataArray.reduce((a, b) => a + b, 0) / this.dataArray.length;
        const intensity = avgValue / 255;
        
        this.particles.forEach((particle, index) => {
            // Update position based on audio
            const freqIndex = index % this.dataArray.length;
            const freqValue = this.dataArray[freqIndex] / 255;
            
            particle.x += particle.speedX * (1 + freqValue * 3);
            particle.y += particle.speedY * (1 + freqValue * 3);
            
            // Wrap around
            if (particle.x < 0) particle.x = this._width;
            if (particle.x > this._width) particle.x = 0;
            if (particle.y < 0) particle.y = this._height;
            if (particle.y > this._height) particle.y = 0;
            
            // Draw particle
            const size = particle.size * (1 + freqValue * 2);
            this.ctx.beginPath();
            this.ctx.arc(particle.x, particle.y, size, 0, Math.PI * 2);
            this.ctx.fillStyle = `hsla(${particle.hue}, 100%, 50%, ${0.3 + intensity * 0.7})`;
            this.ctx.fill();
        });
        
        // Connect nearby particles
        this.ctx.strokeStyle = `rgba(0, 230, 118, ${0.1 + intensity * 0.2})`;
        this.ctx.lineWidth = 0.5;
        
        for (let i = 0; i < this.particles.length; i++) {
            for (let j = i + 1; j < this.particles.length; j++) {
                const dx = this.particles[i].x - this.particles[j].x;
                const dy = this.particles[i].y - this.particles[j].y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance < 80 + intensity * 50) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(this.particles[i].x, this.particles[i].y);
                    this.ctx.lineTo(this.particles[j].x, this.particles[j].y);
                    this.ctx.stroke();
                }
            }
        }
    }
    
    /**
     * Draw spectrum visualizer
     */
    drawSpectrum() {
        const gradient = this.ctx.createLinearGradient(0, this._height, 0, 0);
        gradient.addColorStop(0, '#ff0000');
        gradient.addColorStop(0.25, '#ff7f00');
        gradient.addColorStop(0.5, '#00ff00');
        gradient.addColorStop(0.75, '#00ffff');
        gradient.addColorStop(1, '#0000ff');
        
        const barCount = 128;
        const barWidth = this._width / barCount;
        
        for (let i = 0; i < barCount; i++) {
            const dataIndex = Math.floor(i * this.dataArray.length / barCount);
            const value = this.dataArray[dataIndex] || 0;
            const barHeight = (value / 255) * this._height * this.settings.sensitivity;
            
            const x = i * barWidth;
            const y = this._height - barHeight;
            
            this.ctx.fillStyle = gradient;
            this.ctx.fillRect(x, y, barWidth - 1, barHeight);
        }
    }
    
    /**
     * Initialize 100 unique dance steps
     */
    initDanceSteps() {
        return [
            // === BOLLYWOOD CLASSICS (0-19) ===
            { name: 'Thumka', bounce: 5, hipSway: 12, maleArmL: -0.5, maleArmR: 0.8, femaleArmL: 0.8, femaleArmR: -0.5, maleHeadTilt: 0.1, femaleHeadTilt: -0.1 },
            { name: 'Shoulder Shimmy', bounce: 3, sway: 0.08, maleArmL: 0.6, maleArmR: 0.6, femaleArmL: 0.6, femaleArmR: 0.6, hipSway: 4 },
            { name: 'Jai Ho Arms', bounce: 8, maleArmL: -1.5, maleArmR: -1.5, femaleArmL: -1.5, femaleArmR: -1.5 },
            { name: 'Jhatka', bounce: 10, hipSway: 15, maleArmL: 0.3, maleArmR: -0.3, femaleArmL: -0.3, femaleArmR: 0.3 },
            { name: 'Latka', bounce: 2, hipSway: 18, sway: 0.15, femaleArmL: 0.5, femaleArmR: -0.8 },
            { name: 'Disco Step', bounce: 12, maleArmL: -1.0, maleArmR: 0.5, femaleArmL: 0.5, femaleArmR: -1.0, lunge: 8 },
            { name: 'Filmi Pose', bounce: 0, maleArmL: 0.8, maleArmR: -0.5, femaleArmL: -1.2, femaleArmR: 0.3, femaleHeadTilt: 0.2 },
            { name: 'Dil Se', bounce: 5, spin: 0.3, femaleArmL: -0.8, femaleArmR: 0.8, maleArmL: 0.5, maleArmR: -0.5 },
            { name: 'Chaiyya Chaiyya', bounce: 8, maleLegL: 0.2, maleLegR: -0.2, maleArmL: -0.6, maleArmR: -0.6 },
            { name: 'Kajra Re', hipSway: 20, femaleArmL: 0.4, femaleArmR: -0.4, femaleHeadTilt: -0.15, sway: 0.1 },
            { name: 'Munni Badnaam', bounce: 6, hipSway: 14, femaleArmL: 0.7, femaleArmR: 0.7, lunge: 5 },
            { name: 'Sheila Ki Jawani', hipSway: 16, bounce: 4, femaleArmL: -0.5, femaleArmR: -0.5, spin: 0.15 },
            { name: 'Chikni Chameli', bounce: 7, hipSway: 12, femaleArmL: 0.3, femaleArmR: -1.0, femaleLegL: 10 },
            { name: 'Balam Pichkari', bounce: 15, maleArmL: -1.2, maleArmR: -1.2, femaleArmL: -1.2, femaleArmR: -1.2, lunge: 10 },
            { name: 'Badtameez Dil', bounce: 10, hipSway: 8, maleArmL: 0.5, maleArmR: -0.8, spin: 0.2 },
            { name: 'Lungi Dance', bounce: 12, maleLegL: 0.3, maleLegR: -0.3, maleArmL: 0.8, maleArmR: 0.8, hipSway: 10 },
            { name: 'Saturday Night', bounce: 8, maleArmL: -0.7, maleArmR: 0.7, femaleArmL: 0.7, femaleArmR: -0.7, sway: 0.12 },
            { name: 'Kala Chashma', bounce: 6, hipSway: 10, maleArmL: 0.4, maleArmR: 0.4, femaleArmL: -0.6, femaleArmR: -0.6 },
            { name: 'Kar Gayi Chull', bounce: 9, femaleArmL: -0.8, femaleArmR: 0.5, hipSway: 12, spin: 0.1 },
            { name: 'Aankh Marey', hipSway: 14, femaleHeadTilt: 0.2, femaleArmL: 0.3, femaleArmR: -0.7, bounce: 3 },
            
            // === CLASSICAL INDIAN (20-34) ===
            { name: 'Bharatanatyam Aramandi', bounce: 0, femaleLegL: 15, femaleArmL: 0.8, femaleArmR: -0.8, femaleHeadTilt: 0.1 },
            { name: 'Kathak Chakkar', spin: 0.5, femaleArmL: 0.6, femaleArmR: 0.6, bounce: 2 },
            { name: 'Odissi Tribhanga', sway: 0.2, hipSway: 8, femaleArmL: -0.5, femaleArmR: 0.8, femaleHeadTilt: -0.15 },
            { name: 'Mudra Pose', femaleArmL: 0.3, femaleArmR: -1.0, femaleHeadTilt: -0.12, maleArmL: -0.5, maleArmR: 0.3, sway: 0.1 },
            { name: 'Kathak Tatkar', bounce: 4, maleLegL: 0.15, maleLegR: -0.15, maleArmL: 0.5, maleArmR: 0.5 },
            { name: 'Kuchipudi Jump', bounce: 18, femaleArmL: -1.0, femaleArmR: -1.0, femaleLegL: 20 },
            { name: 'Mohiniattam Sway', sway: 0.18, hipSway: 6, femaleArmL: 0.4, femaleArmR: -0.4, bounce: 1 },
            { name: 'Manipuri Grace', sway: 0.12, femaleArmL: 0.6, femaleArmR: 0.3, femaleHeadTilt: 0.1, bounce: 2 },
            { name: 'Sattriya Pose', maleArmL: -0.8, maleArmR: 0.5, maleHeadTilt: 0.08, bounce: 3 },
            { name: 'Chhau Warrior', bounce: 8, maleArmL: -1.2, maleArmR: 0.8, maleLegL: 0.25, lunge: 12 },
            { name: 'Nataraja Pose', femaleLegL: 25, femaleArmL: 0.9, femaleArmR: -0.9, spin: 0.1 },
            { name: 'Abhinaya Expression', femaleHeadTilt: 0.2, femaleArmL: 0.5, femaleArmR: 0.5, sway: 0.08 },
            { name: 'Adavu Basic', bounce: 5, femaleLegL: 8, femaleArmL: 0.6, femaleArmR: -0.6 },
            { name: 'Alarippu Opening', femaleArmL: -0.3, femaleArmR: -0.3, bounce: 3, femaleHeadTilt: 0.1 },
            { name: 'Tillana Finale', bounce: 10, spin: 0.3, femaleArmL: -1.0, femaleArmR: -1.0, hipSway: 8 },
            
            // === BHANGRA & FOLK (35-49) ===
            { name: 'Bhangra Jump', bounce: 20, maleLegL: 0.4, maleLegR: -0.4, maleArmL: -0.9, maleArmR: -0.9 },
            { name: 'Bhangra Shoulder', bounce: 8, maleArmL: -0.7, maleArmR: -0.7, sway: 0.1, hipSway: 6 },
            { name: 'Giddha Clap', bounce: 6, femaleArmL: 0.3, femaleArmR: -0.3, hipSway: 10, lunge: 5 },
            { name: 'Garba Spin', spin: 0.4, femaleArmL: 0.7, femaleArmR: -0.5, bounce: 4 },
            { name: 'Dandiya Strike', lunge: 12, maleArmL: -0.8, maleArmR: 0.8, femaleArmL: 0.8, femaleArmR: -0.8, bounce: 5 },
            { name: 'Lavani Hip', hipSway: 22, femaleArmL: 0.5, femaleArmR: -0.6, bounce: 3, femaleHeadTilt: -0.1 },
            { name: 'Bihu Step', bounce: 7, hipSway: 8, maleArmL: 0.4, maleArmR: 0.4, femaleArmL: 0.4, femaleArmR: 0.4 },
            { name: 'Kolata Cross', maleArmL: 0.6, maleArmR: -0.6, femaleArmL: -0.6, femaleArmR: 0.6, lunge: 8, bounce: 4 },
            { name: 'Chari Balance', femaleArmL: 0.8, femaleArmR: 0.8, bounce: 2, sway: 0.05, femaleHeadTilt: 0.15 },
            { name: 'Kalbelia Snake', sway: 0.25, hipSway: 15, femaleArmL: 0.3, femaleArmR: -0.3, spin: 0.1 },
            { name: 'Ghoomar Twirl', spin: 0.45, femaleArmL: 0.5, femaleArmR: 0.5, bounce: 3, hipSway: 5 },
            { name: 'Fugdi Circle', bounce: 8, femaleArmL: 0.4, femaleArmR: 0.4, spin: 0.2, hipSway: 6 },
            { name: 'Rouf Grace', sway: 0.15, femaleArmL: 0.6, femaleArmR: 0.6, bounce: 2, femaleHeadTilt: 0.1 },
            { name: 'Dumhal Stomp', bounce: 15, maleArmL: -0.5, maleArmR: -0.5, maleLegL: 0.3, maleLegR: 0.3 },
            { name: 'Jhumar Sway', hipSway: 12, sway: 0.12, maleArmL: 0.5, maleArmR: -0.5, bounce: 4 },
            
            // === WESTERN BALLROOM (50-64) ===
            { name: 'Waltz Box', sway: 0.15, lunge: 6, maleArmL: 0.5, maleArmR: -0.3, femaleArmL: -0.3, femaleArmR: 0.5, bounce: 3 },
            { name: 'Waltz Turn', spin: 0.25, sway: 0.1, bounce: 2, maleArmL: 0.4, femaleArmR: 0.4 },
            { name: 'Tango Walk', lunge: 15, maleArmL: 0.6, femaleArmL: -0.4, maleHeadTilt: -0.1, femaleHeadTilt: 0.15 },
            { name: 'Tango Dip', lunge: -12, sway: 0.25, femaleArmL: -1.3, femaleHeadTilt: 0.25, bounce: -8 },
            { name: 'Tango Corte', lunge: 10, maleArmR: 0.7, femaleArmL: -0.5, bounce: 2 },
            { name: 'Salsa Basic', bounce: 6, hipSway: 10, lunge: 5, femaleArmL: 0.3, maleArmR: -0.3 },
            { name: 'Salsa Turn', spin: 0.35, hipSway: 8, femaleArmL: -0.6, femaleArmR: 0.6, bounce: 4 },
            { name: 'Salsa Cross Body', lunge: 8, hipSway: 6, spin: 0.15, bounce: 5 },
            { name: 'Cha Cha Lock', bounce: 7, hipSway: 12, lunge: 4, maleArmL: 0.4, femaleArmR: -0.4 },
            { name: 'Cha Cha Chase', lunge: 10, bounce: 8, hipSway: 8, spin: 0.1 },
            { name: 'Rumba Box', hipSway: 14, sway: 0.1, femaleArmL: 0.5, femaleArmR: -0.5, bounce: 2 },
            { name: 'Foxtrot Glide', lunge: 8, sway: 0.08, bounce: 3, maleArmL: 0.3, femaleArmR: 0.3 },
            { name: 'Quickstep Hop', bounce: 12, lunge: 6, spin: 0.15, maleArmL: 0.5, maleArmR: -0.5 },
            { name: 'Jive Kick', bounce: 15, maleLegL: 0.35, femaleLegL: 0.35, maleArmL: -0.7, femaleArmL: -0.7 },
            { name: 'Swing Out', spin: 0.3, lunge: 10, femaleArmL: -0.8, maleArmR: 0.6, bounce: 6 },
            
            // === HIP HOP & STREET (65-79) ===
            { name: 'Body Wave', sway: 0.2, bounce: 5, hipSway: 8, maleArmL: 0.3, maleArmR: 0.3 },
            { name: 'Pop Lock', bounce: 0, maleArmL: -0.9, maleArmR: 0.9, maleHeadTilt: 0.15, hipSway: 2 },
            { name: 'Robot', bounce: 0, maleArmL: 0.8, maleArmR: -0.8, maleHeadTilt: -0.1, sway: 0 },
            { name: 'Moonwalk Prep', lunge: -8, maleLegL: -0.1, maleLegR: 0.1, maleArmL: 0.4, maleArmR: -0.4 },
            { name: 'Breakdance Freeze', bounce: -5, maleArmL: -1.3, maleArmR: 0.8, maleLegL: 0.4, spin: 0.1 },
            { name: 'Dougie', hipSway: 15, maleArmL: 0.6, maleArmR: -0.5, maleHeadTilt: -0.12, bounce: 3 },
            { name: 'Nae Nae', maleArmL: -1.0, maleArmR: 0.3, hipSway: 10, bounce: 5, maleHeadTilt: 0.1 },
            { name: 'Whip', bounce: 8, maleArmL: 0.7, maleArmR: 0.7, hipSway: 6, lunge: 5 },
            { name: 'Dab', maleArmL: -1.4, maleArmR: 0.8, maleHeadTilt: -0.2, bounce: 0 },
            { name: 'Floss', hipSway: 18, maleArmL: 0.5, maleArmR: -0.5, bounce: 2 },
            { name: 'Orange Justice', bounce: 10, maleArmL: -0.6, maleArmR: 0.6, hipSway: 12, maleLegL: 0.2 },
            { name: 'Shoot', maleArmL: 0.8, maleArmR: 0.8, maleLegL: 0.3, bounce: 5, hipSway: 4 },
            { name: 'Renegade', bounce: 6, maleArmL: -0.5, maleArmR: 0.7, hipSway: 8, spin: 0.1 },
            { name: 'Griddy', bounce: 8, maleArmL: 0.6, maleArmR: -0.6, maleLegL: 0.25, maleLegR: -0.25 },
            { name: 'Cabbage Patch', hipSway: 10, maleArmL: 0.4, maleArmR: 0.4, bounce: 4, spin: 0.05 },
            
            // === LATIN & CARIBBEAN (80-89) ===
            { name: 'Merengue March', bounce: 5, hipSway: 14, lunge: 3, femaleArmL: 0.3, maleArmR: -0.3 },
            { name: 'Bachata Basic', hipSway: 16, sway: 0.1, bounce: 2, femaleArmL: 0.5, femaleArmR: -0.3 },
            { name: 'Bachata Dip', lunge: -10, femaleArmL: -1.0, femaleHeadTilt: 0.2, hipSway: 8, bounce: -5 },
            { name: 'Reggaeton Bounce', bounce: 10, hipSway: 18, femaleArmL: 0.4, femaleArmR: 0.4, lunge: 4 },
            { name: 'Samba Bounce', bounce: 12, hipSway: 15, femaleLegL: 8, femaleArmL: -0.5, femaleArmR: 0.5 },
            { name: 'Samba Roll', hipSway: 20, spin: 0.15, bounce: 6, femaleArmL: 0.6, femaleArmR: -0.6 },
            { name: 'Cumbia Step', hipSway: 12, lunge: 6, bounce: 4, femaleArmL: 0.4, maleArmR: -0.4 },
            { name: 'Mambo Break', bounce: 8, hipSway: 10, lunge: 8, spin: 0.1, maleArmL: -0.5 },
            { name: 'Soca Wine', hipSway: 22, bounce: 5, femaleArmL: 0.3, femaleArmR: 0.3, sway: 0.15 },
            { name: 'Dancehall Dip', hipSway: 18, bounce: 8, femaleArmL: -0.4, femaleArmR: 0.6, lunge: 5 },
            
            // === ROMANTIC & SLOW (90-99) ===
            { name: 'Slow Dance Sway', sway: 0.12, bounce: 1, maleArmL: 0.4, femaleArmR: 0.4, hipSway: 3 },
            { name: 'Cheek to Cheek', sway: 0.08, maleHeadTilt: 0.1, femaleHeadTilt: -0.1, bounce: 0, hipSway: 2 },
            { name: 'Romantic Dip', lunge: -15, sway: 0.2, femaleArmL: -1.4, femaleHeadTilt: 0.25, bounce: -10 },
            { name: 'First Dance', sway: 0.1, spin: 0.1, maleArmL: 0.3, femaleArmR: 0.3, bounce: 2 },
            { name: 'Wedding Waltz', spin: 0.2, sway: 0.15, lunge: 4, bounce: 3, maleArmL: 0.5 },
            { name: 'Embrace Spin', spin: 0.3, maleArmL: 0.4, femaleArmL: 0.4, bounce: 2, sway: 0.1 },
            { name: 'Love Lift', bounce: 15, femaleArmL: -1.2, femaleArmR: -1.2, maleArmL: 0.6, maleArmR: 0.6 },
            { name: 'Sweetheart Pose', sway: 0.05, femaleHeadTilt: 0.15, maleArmR: 0.5, femaleArmL: -0.5, bounce: 0 },
            { name: 'Starlight Sway', sway: 0.15, hipSway: 5, bounce: 2, femaleArmL: 0.3, femaleArmR: 0.3 },
            { name: 'Final Bow', bounce: -3, maleHeadTilt: 0.2, femaleHeadTilt: 0.2, maleArmL: 0.3, femaleArmL: 0.3 }
        ];
    }
    
    /**
     * Draw dancing couple visualizer
     */
    drawCouple() {
        const time = Date.now() / 1000;
        const dancer = this.dancer;
        
        // Calculate beat from audio data
        const bassSum = this.dataArray.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
        dancer.beat = dancer.beat * 0.8 + (bassSum / 255) * 0.2;
        
        // Move to new random position every 20 seconds (very slow, graceful movement)
        dancer.moveTimer += 0.016;
        if (dancer.moveTimer > 20) {
            dancer.moveTimer = 0;
            dancer.targetX = 0.25 + Math.random() * 0.5;
            dancer.targetY = 0.25 + Math.random() * 0.5;
        }
        
        // Smoothly interpolate position (very slow, elegant gliding)
        const lerpSpeed = 0.005;
        dancer.x += (dancer.targetX - dancer.x) * lerpSpeed;
        dancer.y += (dancer.targetY - dancer.y) * lerpSpeed;
        
        // Dance movement offset (subtle swaying while moving)
        const danceOffsetX = Math.sin(time * 2) * 20;
        const danceOffsetY = Math.cos(time * 2.5) * 12;
        
        // Calculate position
        const x = dancer.x * this._width + danceOffsetX;
        const y = dancer.y * this._height + danceOffsetY;
        
        // Scale with beat effect
        const scale = 2.2 + dancer.beat * 0.5;
        
        // Draw the couple
        this.drawDancingCouple(this.ctx, x, y, scale, time, dancer.beat);
    }
    
    /**
     * Draw dancing couple figure
     */
    drawDancingCouple(ctx, x, y, scale, time, beat) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        
        // Dance step phases - changes every 1.5 seconds, cycles through 100 steps
        const stepIndex = Math.floor(time / 1.5) % 100;
        const stepProgress = (time % 1.5) / 1.5;
        const ease = Math.sin(stepProgress * Math.PI);
        
        // Get current dance step from the 100 steps
        const step = this.danceSteps[stepIndex] || this.danceSteps[0];
        
        // Apply step values with easing
        let bounce = (step.bounce || 0) * ease;
        let sway = (step.sway || 0) * ease;
        let hipSway = (step.hipSway || 0) * ease;
        let spin = (step.spin || 0) * ease;
        let lunge = (step.lunge || 0) * ease;
        
        // Arms and legs (static values from step, animated slightly)
        let maleArmL = (step.maleArmL || 0) + Math.sin(time * 3) * 0.05;
        let maleArmR = (step.maleArmR || 0) + Math.cos(time * 3) * 0.05;
        let femaleArmL = (step.femaleArmL || 0) + Math.sin(time * 3.5) * 0.05;
        let femaleArmR = (step.femaleArmR || 0) + Math.cos(time * 3.5) * 0.05;
        let maleLegL = (step.maleLegL || 0) * ease;
        let maleLegR = (step.maleLegR || 0) * ease;
        let femaleLegL = (step.femaleLegL || 0) * ease;
        let femaleLegR = (step.femaleLegR || 0) * ease;
        let maleHeadTilt = (step.maleHeadTilt || 0) * ease;
        let femaleHeadTilt = (step.femaleHeadTilt || 0) * ease;
        
        // Add continuous subtle movement
        const microBounce = Math.abs(Math.sin(time * 6)) * 3 * (1 + beat * 0.5);
        bounce += microBounce;
        
        // Glow effect
        ctx.shadowColor = 'rgba(255, 200, 50, 0.6)';
        ctx.shadowBlur = 15 + beat * 15;
        
        // Floor shadow
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        ctx.ellipse(0, 28, 35 + Math.abs(lunge) * 0.5, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.shadowColor = 'rgba(255, 200, 50, 0.6)';
        ctx.shadowBlur = 12 + beat * 12;
        
        // --- Male Dancer ---
        ctx.save();
        ctx.translate(-20 + hipSway - lunge * 0.5, -bounce);
        ctx.rotate(sway + spin);
        
        ctx.fillStyle = 'rgba(25, 20, 35, 0.9)';
        ctx.strokeStyle = 'rgba(255, 180, 50, 0.85)';
        ctx.lineWidth = 2;
        
        // Head with tilt
        ctx.save();
        ctx.rotate(maleHeadTilt);
        ctx.beginPath();
        ctx.arc(0, -48, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        
        // Neck
        ctx.fillRect(-2, -40, 4, 5);
        
        // Body/Kurta
        ctx.beginPath();
        ctx.moveTo(-10, -35);
        ctx.lineTo(10, -35);
        ctx.lineTo(8, -5);
        ctx.lineTo(-8, -5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Left arm
        ctx.save();
        ctx.translate(-10, -32);
        ctx.rotate(maleArmL);
        ctx.fillRect(-3, 0, 6, 22);
        ctx.strokeRect(-3, 0, 6, 22);
        ctx.restore();
        
        // Right arm
        ctx.save();
        ctx.translate(10, -32);
        ctx.rotate(maleArmR);
        ctx.fillRect(-3, 0, 6, 22);
        ctx.strokeRect(-3, 0, 6, 22);
        ctx.restore();
        
        // Legs
        ctx.save();
        ctx.translate(-5, -5);
        ctx.rotate(maleLegL);
        ctx.fillRect(-4, 0, 8, 30);
        ctx.strokeRect(-4, 0, 8, 30);
        ctx.restore();
        
        ctx.save();
        ctx.translate(5, -5);
        ctx.rotate(maleLegR);
        ctx.fillRect(-4, 0, 8, 30);
        ctx.strokeRect(-4, 0, 8, 30);
        ctx.restore();
        
        ctx.restore();
        
        // --- Female Dancer ---
        ctx.save();
        ctx.translate(20 - hipSway + lunge * 0.5, -bounce);
        ctx.rotate(-sway - spin);
        
        ctx.fillStyle = 'rgba(180, 30, 60, 0.9)';
        ctx.strokeStyle = 'rgba(255, 180, 50, 0.85)';
        
        // Head
        ctx.save();
        ctx.rotate(femaleHeadTilt);
        ctx.beginPath();
        ctx.arc(0, -48, 9, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        
        // Neck
        ctx.fillRect(-2, -40, 4, 5);
        
        // Body/Blouse
        ctx.beginPath();
        ctx.moveTo(-8, -35);
        ctx.lineTo(8, -35);
        ctx.lineTo(6, -20);
        ctx.lineTo(-6, -20);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Lehenga (skirt)
        ctx.beginPath();
        ctx.moveTo(-6, -20);
        ctx.lineTo(6, -20);
        ctx.quadraticCurveTo(18 + Math.sin(time * 4) * 3, 15, 14, 28);
        ctx.lineTo(-14, 28);
        ctx.quadraticCurveTo(-18 - Math.sin(time * 4) * 3, 15, -6, -20);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        // Arms
        ctx.save();
        ctx.translate(-8, -32);
        ctx.rotate(femaleArmL);
        ctx.fillRect(-3, 0, 6, 20);
        ctx.strokeRect(-3, 0, 6, 20);
        ctx.restore();
        
        ctx.save();
        ctx.translate(8, -32);
        ctx.rotate(femaleArmR);
        ctx.fillRect(-3, 0, 6, 20);
        ctx.strokeRect(-3, 0, 6, 20);
        ctx.restore();
        
        // Legs (under skirt)
        if (femaleLegL > 5) {
            ctx.save();
            ctx.translate(-5, 15);
            ctx.rotate(-0.3);
            ctx.fillRect(-3, 0, 6, femaleLegL);
            ctx.restore();
        }
        
        ctx.restore();

        ctx.restore();
    }

    /**
     * Innocent, child-friendly action set for the kids visualizer - each is a
     * distinct playground move (never a partner-dance move like the adult
     * couple's dips/spins/lunges). Cycled through over time for variety.
     */
    initKidMoves() {
        return [
            { name: 'skip', arms: 'wave', legs: 'run', hopAmt: 1, legAmt: 1, armAmt: 1, spinSpeed: 0 },
            { name: 'jumpingJack', arms: 'jack', legs: 'jack', hopAmt: 1.3, legAmt: 1, armAmt: 1, spinSpeed: 0 },
            { name: 'clap', arms: 'clap', legs: 'still', hopAmt: 0.35, legAmt: 0.3, armAmt: 1, spinSpeed: 0 },
            { name: 'cheer', arms: 'oneUp', legs: 'run', hopAmt: 1, legAmt: 1, armAmt: 1, spinSpeed: 0 },
            { name: 'twirl', arms: 'out', legs: 'still', hopAmt: 0.4, legAmt: 0.2, armAmt: 1, spinSpeed: 1.1 },
            { name: 'highFive', arms: 'highfive', legs: 'still', hopAmt: 0.5, legAmt: 0.3, armAmt: 1, spinSpeed: 0 },
            { name: 'wiggle', arms: 'hips', legs: 'still', hopAmt: 0.25, legAmt: 0.2, armAmt: 1, spinSpeed: 0, lean: true },
            { name: 'bigJump', arms: 'up', legs: 'tuck', hopAmt: 1.9, legAmt: 1, armAmt: 1, spinSpeed: 0 },
            { name: 'march', arms: 'swing', legs: 'march', hopAmt: 0.7, legAmt: 1.3, armAmt: 1.2, spinSpeed: 0 }
        ];
    }

    /**
     * Draw kids dancing visualizer - a playful, innocent, natural take on
     * the dancing couple: two children happily playing together through a
     * rotating set of simple playground moves (skipping, jumping jacks,
     * clapping, cheering, twirling, high-fives, a wiggle, a big jump, and
     * marching) instead of a formal partner dance. Simpler proportions (big
     * round heads, short limbs), pastel colors, big smiles - no dips/spins/
     * lunges like the adult couple.
     */
    drawKids() {
        const time = Date.now() / 1000;
        const kids = this.kids;

        if (!this.kidMoves) {
            this.kidMoves = this.initKidMoves();
        }

        // Calculate beat from audio data
        const bassSum = this.dataArray.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
        kids.beat = kids.beat * 0.8 + (bassSum / 255) * 0.2;

        // Wander to a new spot every ~10 seconds - playful but not frantic
        kids.moveTimer += 0.016;
        if (kids.moveTimer > 10) {
            kids.moveTimer = 0;
            kids.targetX = 0.3 + Math.random() * 0.4;
            kids.targetY = 0.3 + Math.random() * 0.4;
        }

        // Separately, every ~7 seconds pick a new gap between the two kids -
        // sometimes they drift apart (playing independently), sometimes
        // they come right back close together.
        kids.separationTimer += 0.016;
        if (kids.separationTimer > 7) {
            kids.separationTimer = 0;
            kids.targetSeparation = 10 + Math.random() * 50; // ~10 (touching) .. ~60 (apart)
        }

        // Gentle glide toward the target spot / target separation
        const lerpSpeed = 0.01;
        kids.x += (kids.targetX - kids.x) * lerpSpeed;
        kids.y += (kids.targetY - kids.y) * lerpSpeed;
        kids.separation += (kids.targetSeparation - kids.separation) * (lerpSpeed * 0.8);

        // Light sway while moving (much smaller than the adult couple's)
        const wanderOffsetX = Math.sin(time * 1.5) * 10;
        const wanderOffsetY = Math.cos(time * 1.8) * 6;

        const x = kids.x * this._width + wanderOffsetX;
        const y = kids.y * this._height + wanderOffsetY;

        const scale = 2.0 + kids.beat * 0.4;

        // Cycle through the move set every 4 seconds, with an eased
        // transition in/out of each move so it never looks jerky.
        const moveDuration = 4;
        const moveIndex = Math.floor(time / moveDuration) % this.kidMoves.length;
        const moveProgress = (time % moveDuration) / moveDuration;
        const moveEase = Math.sin(moveProgress * Math.PI); // 0 -> 1 -> 0
        const move = this.kidMoves[moveIndex];

        this.drawDancingKids(this.ctx, x, y, scale, time, kids.beat, move, moveEase, kids.separation);
    }

    /**
     * Draw one child's pose (arms/legs) for the given move, returns nothing -
     * draws directly via the passed transforms. `side` is -1 for the boy
     * (left/inner arm = right) and +1 for the girl (left/inner arm = left).
     */
    drawKidLimbs(ctx, move, ease, time, side, skinColor) {
        const hopPhase = Math.sin(time * 4.2);
        const legLift = Math.max(0, hopPhase) * 14 * (move.legAmt ?? 1) * ease + (1 - ease) * 0;
        const legLiftAlt = Math.max(0, -hopPhase) * 14 * (move.legAmt ?? 1) * ease;

        // --- Legs ---
        ctx.save();
        if (move.legs === 'jack') {
            // Legs spread apart and snap together, synced with the hop
            const spread = (Math.abs(hopPhase)) * 0.5 * ease;
            ctx.save();
            ctx.translate(-6, 6);
            ctx.rotate(-spread);
            ctx.beginPath();
            ctx.roundRect(-4, 0, 8, 18, 3);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
            ctx.save();
            ctx.translate(6, 6);
            ctx.rotate(spread);
            ctx.beginPath();
            ctx.roundRect(-4, 0, 8, 18, 3);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        } else if (move.legs === 'tuck') {
            // Both knees tuck up together at the peak of a big jump
            const tuck = Math.max(0, hopPhase) * 16 * ease;
            [-6, 6].forEach((lx) => {
                ctx.save();
                ctx.translate(lx, 6);
                ctx.rotate(lx < 0 ? -0.5 * (tuck / 16) : 0.5 * (tuck / 16));
                ctx.beginPath();
                ctx.roundRect(-4, 0, 8, 18 - tuck, 3);
                ctx.fill();
                ctx.stroke();
                ctx.restore();
            });
        } else if (move.legs === 'march') {
            // Sharper, higher alternating knee raises
            ctx.save();
            ctx.translate(-6, 6);
            ctx.rotate(-legLift * 0.03);
            ctx.beginPath();
            ctx.roundRect(-4, 0, 8, 18 - legLift * 0.35, 3);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
            ctx.save();
            ctx.translate(6, 6);
            ctx.rotate(legLiftAlt * 0.03);
            ctx.beginPath();
            ctx.roundRect(-4, 0, 8, 18 - legLiftAlt * 0.35, 3);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        } else if (move.legs === 'still') {
            // Small weight shift from foot to foot - no big lift
            const shift = Math.sin(time * 2) * 2 * ease;
            ctx.save();
            ctx.translate(-6 + shift, 6);
            ctx.beginPath();
            ctx.roundRect(-4, 0, 8, 17, 3);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
            ctx.save();
            ctx.translate(6 - shift, 6);
            ctx.beginPath();
            ctx.roundRect(-4, 0, 8, 17, 3);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        } else {
            // Default: 'run' - the original alternating skip/run lift
            ctx.save();
            ctx.translate(-6, 6);
            ctx.rotate(-legLift * 0.02);
            ctx.beginPath();
            ctx.roundRect(-4, 0, 8, 18 - legLift * 0.3, 3);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
            ctx.save();
            ctx.translate(6, 6);
            ctx.rotate(legLiftAlt * 0.02);
            ctx.beginPath();
            ctx.roundRect(-4, 0, 8, 18 - legLiftAlt * 0.3, 3);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        }
        ctx.restore();

        // --- Arms ---
        ctx.fillStyle = skinColor;
        const armAmt = move.armAmt ?? 1;
        const cheerSide = Math.floor(time / 4) % 2 === 0 ? 1 : -1; // alternates which arm cheers each move cycle
        const clapPulse = (Math.sin(time * 8) + 1) / 2; // fast open/close

        let armLAngle, armRAngle;
        if (move.arms === 'jack') {
            const raise = (Math.abs(Math.sin(time * 4.2))) * 1.4 * ease * armAmt;
            armLAngle = -0.3 - raise;
            armRAngle = 0.3 + raise;
        } else if (move.arms === 'clap') {
            armLAngle = -0.3 - clapPulse * 1.3 * ease * armAmt;
            armRAngle = 0.3 + clapPulse * 1.3 * ease * armAmt;
        } else if (move.arms === 'oneUp') {
            const upAngle = -2.6 * ease * armAmt;
            armLAngle = cheerSide > 0 ? upAngle : 0.2;
            armRAngle = cheerSide > 0 ? -0.2 : -upAngle;
        } else if (move.arms === 'out') {
            armLAngle = -1.55 * ease * armAmt;
            armRAngle = 1.55 * ease * armAmt;
        } else if (move.arms === 'highfive') {
            // Inner arm reaches toward the other child; outer arm rests
            const reach = -1.4 * ease * armAmt;
            if (side < 0) { armLAngle = 0.15; armRAngle = reach; } // boy reaches right (toward girl)
            else { armLAngle = -reach; armRAngle = -0.15; } // girl reaches left (toward boy) - mirrored below
        } else if (move.arms === 'hips') {
            armLAngle = -0.15 + Math.sin(time * 2) * 0.05;
            armRAngle = 0.15 - Math.sin(time * 2) * 0.05;
        } else if (move.arms === 'up') {
            armLAngle = -2.9 * ease * armAmt;
            armRAngle = 2.9 * ease * armAmt;
        } else if (move.arms === 'swing') {
            const swing = Math.sin(time * 4.2) * 1.1 * armAmt;
            armLAngle = -0.6 + swing;
            armRAngle = 0.6 - swing;
        } else {
            // Default: 'wave' - the original gentle alternating wave
            const armWave = Math.sin(time * 4.2 * 0.5) * 0.5 * armAmt;
            armLAngle = -1.3 + armWave;
            armRAngle = 1.3 - armWave;
        }

        const armLen = move.arms === 'hips' ? 10 : 18;

        ctx.save();
        ctx.translate(-10, -18);
        ctx.rotate(armLAngle);
        ctx.beginPath();
        ctx.roundRect(-3, 0, 6, armLen, 3);
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.translate(10, -18);
        ctx.rotate(armRAngle);
        ctx.beginPath();
        ctx.roundRect(-3, 0, 6, armLen, 3);
        ctx.fill();
        ctx.restore();
    }

    /**
     * Draw two children happily playing together, cycling through a set of
     * innocent playground moves.
     */
    drawDancingKids(ctx, x, y, scale, time, beat, move, moveEase, separation = 15) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);

        const hopPhase = Math.sin(time * 4.2);
        const hopAmt = move.hopAmt ?? 1;
        const hop = Math.abs(hopPhase) * (9 + beat * 6) * hopAmt * (0.4 + moveEase * 0.6);
        const headBob = hopPhase * 0.12 * hopAmt;
        const lean = move.lean ? Math.sin(time * 3) * 0.15 : 0;

        // High-fives/claps need the kids close enough for hands to actually
        // meet, regardless of where the independent separation cycle is at.
        const gap = (move.arms === 'highfive' || move.arms === 'clap')
            ? separation * 0.4
            : separation;
        const halfGap = gap / 2;

        // Floor shadow stretches/splits a little as they drift apart, and
        // shrinks back to one shared puddle when they're close together
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.beginPath();
        ctx.ellipse(-halfGap * 0.5, 32, 20 + halfGap * 0.3, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(halfGap * 0.5, 32, 20 + halfGap * 0.3, 8, 0, 0, Math.PI * 2);
        ctx.fill();

        // Gentle, warm glow - friendlier than the couple's dramatic glow
        ctx.shadowColor = 'rgba(255, 230, 150, 0.5)';
        ctx.shadowBlur = 10 + beat * 8;

        const drawChild = (offsetX, side, skinColor, shirtColor, pantsColor, hairColor, isGirl) => {
            ctx.save();
            ctx.translate(offsetX, -hop);
            ctx.rotate(lean * side);

            // Joyful back-and-forth twirl for the 'twirl' move. A continuous
            // full rotation around the waist would flip the child upside
            // down mid-spin (looks like tumbling, not dancing) - an
            // oscillating twist keeps them upright while still reading as
            // a happy spin, especially combined with the dress flare below.
            const spinSpeed = move.spinSpeed || 0;
            if (spinSpeed) {
                ctx.rotate(Math.sin(time * spinSpeed * 1.5) * 0.9 * side);
            }

            // Legs + arms for the current move
            ctx.fillStyle = pantsColor;
            ctx.strokeStyle = 'rgba(60, 40, 30, 0.6)';
            ctx.lineWidth = 1.5;
            this.drawKidLimbs(ctx, move, moveEase, time, side, skinColor);

            // Body (simple rounded tummy - a child's proportions)
            ctx.fillStyle = shirtColor;
            ctx.beginPath();
            ctx.roundRect(-11, -22, 22, 30, 10);
            ctx.fill();
            ctx.stroke();

            // Dress hem flare for the girl - flares wider during a twirl
            if (isGirl) {
                const flare = 4 + Math.abs(Math.sin(time * (spinSpeed ? 6 : 4))) * (spinSpeed ? 10 : 3);
                ctx.beginPath();
                ctx.moveTo(-11, 2);
                ctx.quadraticCurveTo(-18 - flare, 10, -14 - flare * 0.5, 12);
                ctx.lineTo(14 + flare * 0.5, 12);
                ctx.quadraticCurveTo(18 + flare, 10, 11, 2);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            }

            // Head - big and round, classic child proportions
            ctx.save();
            ctx.rotate(headBob);
            ctx.fillStyle = skinColor;
            ctx.beginPath();
            ctx.arc(0, -32, 13, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Hair
            ctx.fillStyle = hairColor;
            if (isGirl) {
                // Two simple pigtails
                ctx.beginPath();
                ctx.arc(-13, -34, 5, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(13, -34, 5, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(0, -41, 10, Math.PI, Math.PI * 2);
                ctx.fill();
            } else {
                // Short tousled hair
                ctx.beginPath();
                ctx.arc(0, -40, 10.5, Math.PI * 0.95, Math.PI * 2.05);
                ctx.fill();
            }

            // Rosy cheeks
            ctx.fillStyle = 'rgba(255, 140, 140, 0.55)';
            ctx.beginPath();
            ctx.arc(-6, -29, 2.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(6, -29, 2.4, 0, Math.PI * 2);
            ctx.fill();

            // Eyes - simple happy dots
            ctx.fillStyle = 'rgba(40, 30, 25, 0.9)';
            ctx.beginPath();
            ctx.arc(-4.5, -33, 1.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(4.5, -33, 1.4, 0, Math.PI * 2);
            ctx.fill();

            // Big smile
            ctx.strokeStyle = 'rgba(40, 30, 25, 0.9)';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.arc(0, -29, 4, 0.15 * Math.PI, 0.85 * Math.PI);
            ctx.stroke();

            ctx.restore();
            ctx.restore();
        };

        // Two children, cycling through the same playful move together -
        // pushed apart or pulled together by the current separation gap
        drawChild(-halfGap, -1, '#f6c9a0', '#ffd166', '#5aa9e6', '#5a3a2a', false); // boy - yellow shirt, blue shorts
        drawChild(halfGap, 1, '#f0b892', '#ff8fab', '#ff8fab', '#3a2418', true);    // girl - pink dress

        // A little sparkle where their hands meet during a high-five
        if (move.arms === 'highfive' && moveEase > 0.5) {
            const sparkleAlpha = (moveEase - 0.5) * 2;
            ctx.save();
            ctx.globalAlpha = sparkleAlpha;
            ctx.fillStyle = 'rgba(255, 245, 200, 0.9)';
            ctx.beginPath();
            ctx.arc(0, -32, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        ctx.restore();
    }

    /**
     * Draw the Shiva Tandava visualizer - a centered, temple-idol-style
     * depiction of Shiva Nataraja's cosmic dance within a ring of fire,
     * echoing the classic bronze Nataraja iconography (and its portrayal in
     * shows like "Om Namah Shivay"): four arms in the traditional mudras,
     * one leg raised in the dance pose, flowing matted hair, a crescent
     * moon, and a third eye, all centered inside an animated ring of flame
     * that flickers and pulses with the music.
     */
    drawShiva() {
        const time = Date.now() / 1000;
        if (!this.shiva) this.shiva = { beat: 0 };

        // Calculate beat from audio data
        const bassSum = this.dataArray.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
        this.shiva.beat = this.shiva.beat * 0.8 + (bassSum / 255) * 0.2;
        const beat = this.shiva.beat;

        const cx = this._width / 2;
        const cy = this._height / 2;
        const scale = Math.min(this._width, this._height) / 320;

        this.drawFireRing(this.ctx, cx, cy, scale, time, beat);
        this.drawNataraja(this.ctx, cx, cy, scale, time, beat);
    }

    /**
     * Draw the animated ring of fire (prabhamandala) that frames the dance
     */
    drawFireRing(ctx, cx, cy, scale, time, beat) {
        const radius = 92 * scale;
        const lickCount = 40;

        ctx.save();
        for (let i = 0; i < lickCount; i++) {
            const angle = (i / lickCount) * Math.PI * 2;
            const flicker = 0.55 + 0.45 * Math.sin(time * 7 + i * 1.7) + beat * 0.6;
            const flameLen = (16 + 8 * Math.sin(i * 2.1)) * scale * Math.max(0.3, flicker);
            const sway = Math.sin(time * 5 + i * 0.8) * 4 * scale;

            const baseX = cx + Math.cos(angle) * radius;
            const baseY = cy + Math.sin(angle) * radius;
            const tipX = cx + Math.cos(angle) * (radius + flameLen) + sway * -Math.sin(angle);
            const tipY = cy + Math.sin(angle) * (radius + flameLen) + sway * Math.cos(angle);
            const widthDir = 5 * scale;

            const perpX = -Math.sin(angle) * widthDir;
            const perpY = Math.cos(angle) * widthDir;

            const grad = ctx.createLinearGradient(baseX, baseY, tipX, tipY);
            grad.addColorStop(0, 'rgba(255, 140, 20, 0.9)');
            grad.addColorStop(0.6, 'rgba(255, 90, 20, 0.75)');
            grad.addColorStop(1, 'rgba(255, 220, 90, 0)');

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(baseX - perpX, baseY - perpY);
            ctx.quadraticCurveTo(
                (baseX + tipX) / 2 + perpX * 0.5, (baseY + tipY) / 2 + perpY * 0.5,
                tipX, tipY
            );
            ctx.quadraticCurveTo(
                (baseX + tipX) / 2 - perpX * 0.5, (baseY + tipY) / 2 - perpY * 0.5,
                baseX + perpX, baseY + perpY
            );
            ctx.closePath();
            ctx.fill();
        }

        // Inner glow ring, pulsing with the beat
        const glow = ctx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, radius + 20 * scale);
        glow.addColorStop(0, 'rgba(255, 150, 40, 0)');
        glow.addColorStop(0.85, `rgba(255, 120, 30, ${0.15 + beat * 0.2})`);
        glow.addColorStop(1, 'rgba(255, 90, 20, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, cy, radius + 20 * scale, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    /**
     * Draw the stylized Nataraja figure - simplified, iconographic shapes
     * (not a literal portrait) built from the same flat primitives as the
     * other cartoon-style dancers, kept respectful and recognizable rather
     * than photorealistic.
     */
    drawNataraja(ctx, cx, cy, scale, time, beat) {
        ctx.save();
        ctx.translate(cx, cy + 10 * scale);
        ctx.scale(scale * 1.15, scale * 1.15);

        // Gentle, meditative sway - a slow cosmic dance, not a bounce
        const sway = Math.sin(time * 1.1) * 0.06;
        const bob = Math.sin(time * 1.1) * 2;
        ctx.rotate(sway);
        ctx.translate(0, bob);

        const bronzeFill = '#d9a441';
        const bronzeDark = 'rgba(90, 55, 15, 0.85)';
        ctx.fillStyle = bronzeFill;
        ctx.strokeStyle = bronzeDark;
        ctx.lineWidth = 1.6;

        ctx.shadowColor = 'rgba(255, 160, 60, 0.55)';
        ctx.shadowBlur = 14 + beat * 12;

        // Small figure of ignorance (Apasmara) underfoot - abstracted to a
        // simple dark oval, not a detailed figure
        ctx.fillStyle = 'rgba(50, 30, 20, 0.6)';
        ctx.beginPath();
        ctx.ellipse(6, 46, 10, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = bronzeFill;

        // Standing leg (straight, weight-bearing) with a small foot
        ctx.save();
        ctx.translate(5, 18);
        ctx.beginPath();
        ctx.roundRect(-4, 0, 8, 28, 3);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(0, 29, 6, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Raised leg (classic Nataraja dance lift, kicked out prominently
        // across and up rather than tucked behind the standing leg)
        ctx.save();
        ctx.translate(-2, 4);
        ctx.rotate(-1.7 + Math.sin(time * 1.1) * 0.06);
        ctx.beginPath();
        ctx.roundRect(-4, 0, 8, 22, 3);
        ctx.fill();
        ctx.stroke();
        ctx.translate(0, 22);
        ctx.beginPath();
        ctx.ellipse(0, 1, 5, 3, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Waist cloth (tiger-print skirt, simplified stripes)
        ctx.fillStyle = '#e8801f';
        ctx.beginPath();
        ctx.moveTo(-12, -2);
        ctx.lineTo(12, -2);
        ctx.quadraticCurveTo(20, 14, 10, 24);
        ctx.lineTo(-8, 24);
        ctx.quadraticCurveTo(-18, 14, -12, -2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = 'rgba(40, 25, 10, 0.5)';
        ctx.lineWidth = 1.2;
        for (let s = -8; s <= 8; s += 5) {
            ctx.beginPath();
            ctx.moveTo(s, 0);
            ctx.lineTo(s * 1.4, 20);
            ctx.stroke();
        }
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = bronzeDark;

        // Torso
        ctx.fillStyle = bronzeFill;
        ctx.beginPath();
        ctx.roundRect(-9, -28, 18, 28, 8);
        ctx.fill();
        ctx.stroke();

        // Rudraksha bead necklace
        ctx.fillStyle = 'rgba(60, 35, 15, 0.8)';
        for (let b = -6; b <= 6; b += 3) {
            ctx.beginPath();
            ctx.arc(b, -22 + Math.abs(b) * 0.15, 1.3, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = bronzeFill;

        // Four arms, each swaying gently out of phase - traditional mudras:
        // upper-right holds the damaru (drum of creation), upper-left holds
        // fire (of dissolution), lower-right in abhaya mudra (reassurance),
        // lower-left gestures toward the raised foot (gajahasta)
        const armSwing = Math.sin(time * 1.3) * 0.15;

        const drawArm = (shoulderX, shoulderY, angle, len, hand) => {
            ctx.save();
            ctx.translate(shoulderX, shoulderY);
            ctx.rotate(angle);
            ctx.beginPath();
            ctx.roundRect(-3, 0, 6, len, 3);
            ctx.fill();
            ctx.stroke();
            ctx.translate(0, len);
            hand();
            ctx.restore();
        };

        // Upper-right arm - damaru (small hourglass drum)
        drawArm(9, -26, 0.5 + armSwing, 20, () => {
            ctx.save();
            ctx.rotate(-0.3);
            ctx.fillStyle = 'rgba(70, 45, 20, 0.9)';
            ctx.beginPath();
            ctx.arc(-3, -3, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(3, 3, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(70, 45, 20, 0.9)';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(-1.5, -1.5);
            ctx.lineTo(1.5, 1.5);
            ctx.stroke();
            ctx.restore();
        });

        // Upper-left arm - flame of dissolution
        drawArm(-9, -26, Math.PI - 0.5 - armSwing, 20, () => {
            const flicker = 0.7 + 0.3 * Math.sin(time * 9);
            ctx.save();
            ctx.fillStyle = `rgba(255, 140, 30, ${0.85 * flicker})`;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(-4, -6, 0, -12 * flicker);
            ctx.quadraticCurveTo(4, -6, 0, 0);
            ctx.fill();
            ctx.restore();
        });

        // Lower-right arm - abhaya mudra (open palm, reassurance)
        drawArm(8, -14, 1.15 - armSwing * 0.6, 14, () => {
            ctx.save();
            ctx.fillStyle = bronzeFill;
            ctx.beginPath();
            ctx.arc(0, 2, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        });

        // Lower-left arm - gajahasta (gestures toward the raised foot)
        drawArm(-8, -14, Math.PI - 1.3 + armSwing * 0.6, 14, () => {
            ctx.save();
            ctx.fillStyle = bronzeFill;
            ctx.beginPath();
            ctx.arc(0, 2, 3.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        });

        // Head
        ctx.fillStyle = bronzeFill;
        ctx.beginPath();
        ctx.arc(0, -34, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Flowing matted hair (jata) - strands swaying outward, animated
        const strandCount = 9;
        ctx.strokeStyle = bronzeDark;
        ctx.lineWidth = 2;
        for (let s = 0; s < strandCount; s++) {
            const a = Math.PI + (s / (strandCount - 1) - 0.5) * Math.PI * 1.1;
            const strandSway = Math.sin(time * 2 + s) * 0.25;
            const len = 13 + (s % 3) * 2;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * 8, -34 + Math.sin(a) * 8);
            const midA = a + strandSway * 0.5;
            const endA = a + strandSway;
            ctx.quadraticCurveTo(
                Math.cos(midA) * (8 + len * 0.6), -34 + Math.sin(midA) * (8 + len * 0.6),
                Math.cos(endA) * (8 + len), -34 + Math.sin(endA) * (8 + len)
            );
            ctx.stroke();
        }

        // Crescent moon in the hair
        ctx.save();
        ctx.translate(-7, -42);
        ctx.rotate(-0.4);
        ctx.fillStyle = '#f0e6c8';
        ctx.beginPath();
        ctx.arc(0, 0, 4, Math.PI * 0.15, Math.PI * 1.6);
        ctx.arc(1.6, 0, 3.4, Math.PI * 1.6, Math.PI * 0.15, true);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Third eye
        ctx.strokeStyle = 'rgba(60, 35, 15, 0.9)';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(0, -38.5);
        ctx.lineTo(0, -36.5);
        ctx.stroke();

        // Calm, meditative closed eyes and a gentle serene smile
        ctx.beginPath();
        ctx.moveTo(-4, -34);
        ctx.quadraticCurveTo(-2.5, -33, -1, -34);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(1, -34);
        ctx.quadraticCurveTo(2.5, -33, 4, -34);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, -31, 2.5, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();

        ctx.restore();
    }

    /**
     * Draw Matrix Rain visualizer
     */
    drawMatrix() {
        const columnWidth = 20;
        const columns = Math.ceil(this._width / columnWidth);
        
        // Initialize drops if needed
        if (this.matrixDrops.length !== columns) {
            this.matrixDrops = [];
            for (let i = 0; i < columns; i++) {
                this.matrixDrops.push({
                    y: Math.random() * this._height,
                    speed: 2 + Math.random() * 3,
                    chars: []
                });
            }
        }
        
        const avgValue = this.dataArray.reduce((a, b) => a + b, 0) / this.dataArray.length;
        const intensity = avgValue / 255;
        
        // Matrix characters
        const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789';
        
        this.ctx.font = '14px monospace';
        
        this.matrixDrops.forEach((drop, i) => {
            const freqIndex = i % this.dataArray.length;
            const freqValue = this.dataArray[freqIndex] / 255;
            
            // Update position
            drop.y += drop.speed * (1 + freqValue * 2);
            
            // Reset if off screen
            if (drop.y > this._height) {
                drop.y = 0;
                drop.speed = 2 + Math.random() * 3;
            }
            
            // Draw trail
            const trailLength = 15 + Math.floor(freqValue * 10);
            for (let j = 0; j < trailLength; j++) {
                const y = drop.y - j * 16;
                if (y < 0 || y > this._height) continue;
                
                const alpha = (1 - j / trailLength) * (0.5 + intensity * 0.5);
                const char = chars[Math.floor(Math.random() * chars.length)];
                
                if (j === 0) {
                    this.ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
                } else {
                    this.ctx.fillStyle = `rgba(0, 255, 70, ${alpha})`;
                }
                
                this.ctx.fillText(char, i * columnWidth, y);
            }
        });
    }
    
    /**
     * Draw Fireworks visualizer
     */
    drawFireworks() {
        const avgValue = this.dataArray.reduce((a, b) => a + b, 0) / this.dataArray.length;
        const intensity = avgValue / 255;
        
        // Launch new firework on beat
        if (intensity > 0.5 && Math.random() < 0.1) {
            const x = Math.random() * this._width;
            const targetY = this._height * 0.2 + Math.random() * this._height * 0.3;
            const hue = Math.random() * 360;
            
            this.fireworks.push({
                x: x,
                y: this._height,
                targetY: targetY,
                vy: -8 - Math.random() * 4,
                hue: hue,
                exploded: false,
                particles: []
            });
        }
        
        // Update fireworks
        this.fireworks = this.fireworks.filter(fw => {
            if (!fw.exploded) {
                fw.y += fw.vy;
                
                // Draw rocket
                this.ctx.fillStyle = `hsla(${fw.hue}, 100%, 70%, 0.8)`;
                this.ctx.beginPath();
                this.ctx.arc(fw.x, fw.y, 3, 0, Math.PI * 2);
                this.ctx.fill();
                
                // Explode
                if (fw.y <= fw.targetY) {
                    fw.exploded = true;
                    const particleCount = 50 + Math.floor(intensity * 50);
                    for (let i = 0; i < particleCount; i++) {
                        const angle = (i / particleCount) * Math.PI * 2;
                        const speed = 2 + Math.random() * 4;
                        fw.particles.push({
                            x: fw.x,
                            y: fw.y,
                            vx: Math.cos(angle) * speed,
                            vy: Math.sin(angle) * speed,
                            life: 1,
                            hue: fw.hue + Math.random() * 30 - 15
                        });
                    }
                }
            } else {
                // Update particles
                fw.particles = fw.particles.filter(p => {
                    p.x += p.vx;
                    p.y += p.vy;
                    p.vy += 0.1; // Gravity
                    p.life -= 0.02;
                    
                    if (p.life > 0) {
                        this.ctx.fillStyle = `hsla(${p.hue}, 100%, 60%, ${p.life})`;
                        this.ctx.beginPath();
                        this.ctx.arc(p.x, p.y, 2 * p.life, 0, Math.PI * 2);
                        this.ctx.fill();
                        return true;
                    }
                    return false;
                });
                
                return fw.particles.length > 0;
            }
            return true;
        });
    }
    
    /**
     * Draw Aurora Borealis visualizer
     */
    drawAurora() {
        const time = Date.now() / 1000;
        const avgValue = this.dataArray.reduce((a, b) => a + b, 0) / this.dataArray.length;
        const intensity = avgValue / 255;
        
        // Draw multiple aurora layers
        const layers = 5;
        for (let layer = 0; layer < layers; layer++) {
            const layerOffset = layer * 0.3;
            const hue = 120 + layer * 20 + Math.sin(time * 0.5) * 30; // Green to cyan
            
            this.ctx.beginPath();
            this.ctx.moveTo(0, this._height);
            
            for (let x = 0; x <= this._width; x += 10) {
                const freqIndex = Math.floor((x / this._width) * this.dataArray.length);
                const freqValue = this.dataArray[freqIndex] / 255;
                
                const baseY = this._height * 0.3 + layer * 40;
                const waveY = Math.sin(x * 0.01 + time * (1 + layerOffset) + layer) * 50;
                const audioY = freqValue * 100;
                const y = baseY + waveY - audioY;
                
                this.ctx.lineTo(x, y);
            }
            
            this.ctx.lineTo(this._width, this._height);
            this.ctx.closePath();
            
            const gradient = this.ctx.createLinearGradient(0, 0, 0, this._height);
            gradient.addColorStop(0, `hsla(${hue}, 80%, 50%, ${0.1 + intensity * 0.2})`);
            gradient.addColorStop(0.5, `hsla(${hue + 30}, 70%, 40%, ${0.05 + intensity * 0.1})`);
            gradient.addColorStop(1, 'transparent');
            
            this.ctx.fillStyle = gradient;
            this.ctx.fill();
        }
        
        // Add shimmer stars
        for (let i = 0; i < 20; i++) {
            const x = (Math.sin(time * 0.5 + i * 0.7) * 0.5 + 0.5) * this._width;
            const y = (Math.cos(time * 0.3 + i * 1.1) * 0.3 + 0.2) * this._height;
            const size = 1 + Math.sin(time * 3 + i) * 0.5 + intensity;
            
            this.ctx.fillStyle = `rgba(255, 255, 255, ${0.3 + intensity * 0.5})`;
            this.ctx.beginPath();
            this.ctx.arc(x, y, size, 0, Math.PI * 2);
            this.ctx.fill();
        }
    }
    
    /**
     * Draw Bubbles visualizer
     */
    drawBubbles() {
        const avgValue = this.dataArray.reduce((a, b) => a + b, 0) / this.dataArray.length;
        const intensity = avgValue / 255;
        
        // Add new bubbles based on audio
        if (Math.random() < 0.1 + intensity * 0.3) {
            this.bubbles.push({
                x: Math.random() * this._width,
                y: this._height + 20,
                size: 10 + Math.random() * 30 + intensity * 20,
                speed: 1 + Math.random() * 2,
                wobble: Math.random() * Math.PI * 2,
                hue: 180 + Math.random() * 60 // Blue to cyan
            });
        }
        
        // Update and draw bubbles
        this.bubbles = this.bubbles.filter(bubble => {
            bubble.y -= bubble.speed * (1 + intensity);
            bubble.wobble += 0.05;
            bubble.x += Math.sin(bubble.wobble) * 1;
            
            if (bubble.y + bubble.size < 0) return false;
            
            // Draw bubble
            const gradient = this.ctx.createRadialGradient(
                bubble.x - bubble.size * 0.3, bubble.y - bubble.size * 0.3, 0,
                bubble.x, bubble.y, bubble.size
            );
            gradient.addColorStop(0, `hsla(${bubble.hue}, 80%, 90%, 0.8)`);
            gradient.addColorStop(0.5, `hsla(${bubble.hue}, 70%, 60%, 0.4)`);
            gradient.addColorStop(1, `hsla(${bubble.hue}, 60%, 50%, 0.1)`);
            
            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.arc(bubble.x, bubble.y, bubble.size, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Highlight
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            this.ctx.beginPath();
            this.ctx.arc(bubble.x - bubble.size * 0.3, bubble.y - bubble.size * 0.3, bubble.size * 0.15, 0, Math.PI * 2);
            this.ctx.fill();
            
            return true;
        });
        
        // Limit bubbles
        if (this.bubbles.length > 100) {
            this.bubbles = this.bubbles.slice(-100);
        }
    }
    
    /**
     * Draw Flames visualizer
     */
    drawFlames() {
        const avgValue = this.dataArray.reduce((a, b) => a + b, 0) / this.dataArray.length;
        const intensity = avgValue / 255;
        
        // Add flame particles
        const particlesToAdd = Math.floor(5 + intensity * 15);
        for (let i = 0; i < particlesToAdd; i++) {
            const x = Math.random() * this._width;
            this.flameParticles.push({
                x: x,
                y: this._height,
                vx: (Math.random() - 0.5) * 2,
                vy: -3 - Math.random() * 5 - intensity * 3,
                size: 5 + Math.random() * 15 + intensity * 10,
                life: 1,
                hue: 20 + Math.random() * 30 // Orange to red
            });
        }
        
        // Update and draw particles
        this.flameParticles = this.flameParticles.filter(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.05; // Slight upward deceleration
            p.life -= 0.02;
            p.size *= 0.98;
            
            if (p.life <= 0 || p.size < 1) return false;
            
            // Draw flame particle
            const gradient = this.ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
            gradient.addColorStop(0, `hsla(50, 100%, 80%, ${p.life})`);
            gradient.addColorStop(0.4, `hsla(${p.hue}, 100%, 50%, ${p.life * 0.8})`);
            gradient.addColorStop(1, `hsla(0, 100%, 30%, 0)`);
            
            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();
            
            return true;
        });
        
        // Limit particles
        if (this.flameParticles.length > 200) {
            this.flameParticles = this.flameParticles.slice(-200);
        }
    }
    
    /**
     * Draw Galaxy visualizer
     */
    drawGalaxy() {
        const time = Date.now() / 1000;
        const centerX = this._width / 2;
        const centerY = this._height / 2;
        const avgValue = this.dataArray.reduce((a, b) => a + b, 0) / this.dataArray.length;
        const intensity = avgValue / 255;
        
        // Initialize stars if needed
        if (this.stars.length < 300) {
            for (let i = this.stars.length; i < 300; i++) {
                const angle = Math.random() * Math.PI * 2;
                const distance = 20 + Math.random() * Math.min(this._width, this._height) * 0.4;
                this.stars.push({
                    angle: angle,
                    distance: distance,
                    size: 0.5 + Math.random() * 2,
                    speed: 0.001 + Math.random() * 0.002,
                    hue: Math.random() * 60 + 200 // Blue to purple
                });
            }
        }
        
        // Draw galaxy core glow
        const coreGradient = this.ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, 100 + intensity * 50);
        coreGradient.addColorStop(0, `rgba(255, 200, 150, ${0.5 + intensity * 0.3})`);
        coreGradient.addColorStop(0.5, `rgba(150, 100, 200, ${0.2 + intensity * 0.2})`);
        coreGradient.addColorStop(1, 'transparent');
        this.ctx.fillStyle = coreGradient;
        this.ctx.fillRect(0, 0, this._width, this._height);
        
        // Draw spiral arms and stars
        this.stars.forEach((star, i) => {
            const freqIndex = i % this.dataArray.length;
            const freqValue = this.dataArray[freqIndex] / 255;
            
            // Rotate stars
            star.angle += star.speed * (1 + intensity);
            
            // Spiral effect
            const spiralOffset = star.distance * 0.02;
            const x = centerX + Math.cos(star.angle + spiralOffset) * star.distance;
            const y = centerY + Math.sin(star.angle + spiralOffset) * star.distance * 0.6; // Flatten for perspective
            
            const size = star.size * (1 + freqValue * 2);
            
            this.ctx.fillStyle = `hsla(${star.hue}, 80%, ${60 + freqValue * 30}%, ${0.5 + freqValue * 0.5})`;
            this.ctx.beginPath();
            this.ctx.arc(x, y, size, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }
    
    /**
     * Draw Heartbeat/Pulse visualizer
     */
    drawPulse() {
        const centerY = this._height / 2;
        const avgValue = this.dataArray.reduce((a, b) => a + b, 0) / this.dataArray.length;
        const intensity = avgValue / 255;
        const time = Date.now() / 1000;
        
        // ECG-style line
        this.ctx.strokeStyle = `rgba(0, 255, 100, ${0.8 + intensity * 0.2})`;
        this.ctx.lineWidth = 3;
        this.ctx.shadowColor = 'rgba(0, 255, 100, 0.8)';
        this.ctx.shadowBlur = 10 + intensity * 10;
        
        this.ctx.beginPath();
        
        for (let x = 0; x < this._width; x += 2) {
            const progress = x / this._width;
            const freqIndex = Math.floor(progress * this.dataArray.length);
            const freqValue = this.dataArray[freqIndex] / 255;
            
            // Create heartbeat pattern
            const phase = (progress * 4 + time * 2) % 1;
            let y = centerY;
            
            if (phase < 0.1) {
                // P wave
                y = centerY - Math.sin(phase * Math.PI / 0.1) * 20 * (1 + intensity);
            } else if (phase > 0.2 && phase < 0.25) {
                // Q dip
                y = centerY + 10 * (1 + intensity);
            } else if (phase > 0.25 && phase < 0.35) {
                // R spike
                const t = (phase - 0.25) / 0.1;
                y = centerY - Math.sin(t * Math.PI) * (100 + freqValue * 100) * (1 + intensity);
            } else if (phase > 0.35 && phase < 0.4) {
                // S dip
                y = centerY + 15 * (1 + intensity);
            } else if (phase > 0.5 && phase < 0.7) {
                // T wave
                const t = (phase - 0.5) / 0.2;
                y = centerY - Math.sin(t * Math.PI) * 30 * (1 + intensity);
            }
            
            // Add audio modulation
            y += (freqValue - 0.5) * 30;
            
            if (x === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        }
        
        this.ctx.stroke();
        this.ctx.shadowBlur = 0;
        
        // Heart icon that pulses
        const heartSize = 30 + intensity * 20 + Math.sin(time * 8) * 5;
        const heartX = 50;
        const heartY = 50;
        
        this.ctx.fillStyle = `rgba(255, 50, 100, ${0.7 + intensity * 0.3})`;
        this.ctx.beginPath();
        this.ctx.moveTo(heartX, heartY + heartSize * 0.3);
        this.ctx.bezierCurveTo(heartX, heartY, heartX - heartSize * 0.5, heartY, heartX - heartSize * 0.5, heartY + heartSize * 0.3);
        this.ctx.bezierCurveTo(heartX - heartSize * 0.5, heartY + heartSize * 0.6, heartX, heartY + heartSize * 0.8, heartX, heartY + heartSize);
        this.ctx.bezierCurveTo(heartX, heartY + heartSize * 0.8, heartX + heartSize * 0.5, heartY + heartSize * 0.6, heartX + heartSize * 0.5, heartY + heartSize * 0.3);
        this.ctx.bezierCurveTo(heartX + heartSize * 0.5, heartY, heartX, heartY, heartX, heartY + heartSize * 0.3);
        this.ctx.fill();
    }
    
    /**
     * Draw Disco Ball visualizer
     */
    drawDisco() {
        const time = Date.now() / 1000;
        const centerX = this._width / 2;
        const centerY = this._height * 0.35;
        const avgValue = this.dataArray.reduce((a, b) => a + b, 0) / this.dataArray.length;
        const intensity = avgValue / 255;
        const radius = 80 + intensity * 20;
        
        // Initialize facets if needed
        if (this.discoFacets.length < 100) {
            this.discoFacets = [];
            for (let i = 0; i < 100; i++) {
                const theta = Math.acos(2 * Math.random() - 1);
                const phi = Math.random() * Math.PI * 2;
                this.discoFacets.push({
                    theta: theta,
                    phi: phi,
                    hue: Math.random() * 360
                });
            }
        }
        
        // Draw light beams
        for (let i = 0; i < 12; i++) {
            const freqIndex = i * Math.floor(this.dataArray.length / 12);
            const freqValue = this.dataArray[freqIndex] / 255;
            
            const angle = (i / 12) * Math.PI * 2 + time * 0.5;
            const length = 200 + freqValue * 300;
            
            const gradient = this.ctx.createLinearGradient(
                centerX, centerY,
                centerX + Math.cos(angle) * length,
                centerY + Math.sin(angle) * length
            );
            
            const hue = (i * 30 + time * 50) % 360;
            gradient.addColorStop(0, `hsla(${hue}, 100%, 70%, ${0.3 + freqValue * 0.4})`);
            gradient.addColorStop(1, 'transparent');
            
            this.ctx.strokeStyle = gradient;
            this.ctx.lineWidth = 20 + freqValue * 30;
            this.ctx.beginPath();
            this.ctx.moveTo(centerX, centerY);
            this.ctx.lineTo(centerX + Math.cos(angle) * length, centerY + Math.sin(angle) * length);
            this.ctx.stroke();
        }
        
        // Draw disco ball
        const ballGradient = this.ctx.createRadialGradient(
            centerX - radius * 0.3, centerY - radius * 0.3, 0,
            centerX, centerY, radius
        );
        ballGradient.addColorStop(0, '#ffffff');
        ballGradient.addColorStop(0.5, '#cccccc');
        ballGradient.addColorStop(1, '#666666');
        
        this.ctx.fillStyle = ballGradient;
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        this.ctx.fill();
        
        // Draw facets
        this.discoFacets.forEach((facet, i) => {
            const freqIndex = i % this.dataArray.length;
            const freqValue = this.dataArray[freqIndex] / 255;
            
            // Rotate facets
            const rotatedPhi = facet.phi + time * 0.5;
            
            // Project to 2D
            const x3d = Math.sin(facet.theta) * Math.cos(rotatedPhi);
            const y3d = Math.sin(facet.theta) * Math.sin(rotatedPhi);
            const z3d = Math.cos(facet.theta);
            
            // Only draw visible facets
            if (z3d > -0.2) {
                const x = centerX + x3d * radius * 0.9;
                const y = centerY + y3d * radius * 0.9 * 0.7; // Perspective
                const size = 8 + z3d * 5;
                
                const brightness = 0.3 + z3d * 0.5 + freqValue * 0.4;
                this.ctx.fillStyle = `hsla(${facet.hue + time * 30}, 50%, ${50 + brightness * 50}%, ${brightness})`;
                this.ctx.fillRect(x - size / 2, y - size / 2, size, size);
            }
        });
        
        // Draw string
        this.ctx.strokeStyle = '#888';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(centerX, 0);
        this.ctx.lineTo(centerX, centerY - radius);
        this.ctx.stroke();
    }
    
    /**
     * Destroy visualizer
     */
    destroy() {
        this.stop();
        this.stopSimulation();
        this.canvas?.remove();
    }
}

// Export for use
window.AudioVisualizer = AudioVisualizer;
