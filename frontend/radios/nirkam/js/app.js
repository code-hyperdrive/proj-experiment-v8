/**
 * SyncRadio - Synchronized Internet Radio with Prayer Interrupts
 *
 * Core application logic for synchronized radio playback.
 * Plays songs continuously, but interrupts at scheduled prayer times
 * to play a single prayer file, then resumes normal playlist.
 * Every listener hears the same content at the same time.
 */

class SyncRadio {
    constructor() {
        // DOM Elements
        this.audioPlayer = document.getElementById("audioPlayer");
        this.playPauseBtn = document.getElementById("playPauseBtn");
        this.muteBtn = document.getElementById("muteBtn");
        this.volumeSlider = document.getElementById("volumeSlider");
        this.currentSongTitle = document.getElementById("currentSongTitle");
        this.currentTimeEl = document.getElementById("currentTime");
        this.totalTimeEl = document.getElementById("totalTime");
        this.progressFill = document.getElementById("progressFill");
        this.utcTimeEl = document.getElementById("utcTime");
        this.stationUptimeEl = document.getElementById("stationUptime");
        this.upcomingListEl = document.getElementById("upcomingList");
        this.statusPanelEl = document.getElementById("statusPanel");
        this.startScreen = document.getElementById("startScreen");
        this.mainContent = document.getElementById("mainContent");
        this.startButton = document.getElementById("startButton");

        // State
        this.isPlaying = false;
        this.isMuted = false;
        this.currentSongIndex = -1;
        this.currentSongFile = '';
        this.hasStarted = false;
        this.lastSyncTime = 0;
        this.syncInterval = 30; // Seconds between sync corrections
        this.isPrayerTime = false;
        this.currentPrayerType = null;
        this.lastPrayerCheck = 0;

        // Initialize
        this.init();
    }

    /**
     * Initialize the application
     */
    init() {
        this.setupEventListeners();
        this.loadVolumePreference();
        this.updateClockAndUptime();
        this.updateUI();

        // UI updates only
        setInterval(() => this.updateClockAndUptime(), 1000);
        setInterval(() => this.updateProgressBar(), 100);

        // Check prayer status every 5 seconds
        setInterval(() => this.checkPrayerStatus(), 5000);

        // Error handling
        this.audioPlayer.addEventListener("error", (e) =>
            this.handleAudioError(e)
        );

        // When song ends, load next song
        this.audioPlayer.addEventListener("ended", () => this.onSongEnded());

        // When metadata loads, seek to correct position if needed
        this.audioPlayer.addEventListener("loadedmetadata", () => {
            if (this.hasStarted && !this.isPrayerTime) {
                const radioPosition = this.getRadioPosition();
                this.audioPlayer.currentTime = radioPosition.positionInSong;
            }
        });
    }

    /**
     * Setup all event listeners
     */
    setupEventListeners() {
        this.startButton.addEventListener("click", () => this.startListening());
        this.playPauseBtn.addEventListener("click", () => this.togglePlayPause());
        this.muteBtn.addEventListener("click", () => this.toggleMute());
        this.volumeSlider.addEventListener("input", (e) =>
            this.setVolume(e.target.value)
        );
    }

    /**
     * Start listening to the radio stream
     */
    startListening() {
        this.hasStarted = true;
        this.showMainContent();
        this.syncToLivePosition();
        this.play();
    }

    /**
     * Show main content and hide start screen
     */
    showMainContent() {
        this.startScreen.classList.add("hidden");
        this.mainContent.classList.remove("hidden");
    }

    /**
     * Check if prayer time and handle interruption
     */
    checkPrayerStatus() {
        if (!this.hasStarted) return;

        const prayerStatus = checkPrayerTime();

        // Prayer time detected and we weren't in prayer mode before.
        // Note: this only ever STARTS a prayer. Ending it is deliberately
        // NOT handled here anymore - it used to also force-end the prayer
        // the moment checkPrayerTime()'s narrow trigger window (±1 minute
        // around the scheduled time) closed, which is only ~2 minutes wide
        // while the actual prayer audio files run ~7 minutes - so every
        // prayer was hard-cut mid-playback by this same check that started
        // it. The prayer audio's own 'ended' event (see onSongEnded()) is
        // what correctly ends prayer mode, once it has actually finished
        // playing.
        if (prayerStatus.isPrayerTime && !this.isPrayerTime) {
            this.startPrayer(prayerStatus.prayerType);
        }
    }

    /**
     * Start playing prayer (interrupt current song)
     */
    startPrayer(prayerType) {
        const prayerFile = getPrayerFilePath(prayerType);
        if (!prayerFile) {
            // getPrayerFilePath() returns null for any type other than
            // 'fajr'/'maghrib'. Previously this fell through to
            // `audioPlayer.src = null`, which the browser resolves to the
            // page's own URL, triggers a real audio error, and used to
            // then crash entirely via the this.nextSong() bug fixed above.
            console.warn('Unknown prayer type, skipping prayer interruption:', prayerType);
            return;
        }

        this.isPrayerTime = true;
        this.currentPrayerType = prayerType;

        const prayerLabel = prayerType === 'fajr' ? '🌅 Morning Prayer' : '🌙 Evening Prayer';

        this.audioPlayer.src = prayerFile;
        this.currentSongTitle.textContent = prayerLabel;
        this.currentTimeEl.textContent = "00:00";
        this.totalTimeEl.textContent = "00:00";

        console.log(`Prayer started: ${prayerLabel} at ${new Date().toUTCString()}`);

        if (this.isPlaying) {
            this.play();
        }

        this.updateUI();
    }

    /**
     * Prayer has ended, return to normal playlist
     */
    endPrayer() {
        this.isPrayerTime = false;
        this.currentPrayerType = null;

        console.log(`Prayer ended at ${new Date().toUTCString()}`);

        // Resync to current position in normal playlist
        this.syncToLivePosition();

        if (this.isPlaying) {
            this.play();
        }

        this.updateUI();
    }

    /**
     * Synchronize to the current live radio position
     * This runs continuously to ensure all listeners stay in sync
     */
    syncToLivePosition() {
        // Calculate correct position based on UTC time
        const radioPosition = this.getRadioPosition();

        // If song changed, load it
        if (radioPosition.songIndex !== this.currentSongIndex) {
            this.currentSongIndex = radioPosition.songIndex;
            this.loadSong(this.currentSongIndex);
            this.audioPlayer.currentTime = radioPosition.positionInSong;
        }
    }

    /**
     * Get the current radio position
     * Returns: { songIndex, positionInSong }
     */
    getRadioPosition() {
        const elapsedSeconds = this.getElapsedSeconds();
        const cyclePosition = elapsedSeconds % TOTAL_PLAYLIST_DURATION;

        let accumulatedDuration = 0;
        let songIndex = 0;

        for (let i = 0; i < PLAYLIST.length; i++) {
            const songDuration = PLAYLIST[i].duration;
            if (cyclePosition < accumulatedDuration + songDuration) {
                songIndex = i;
                break;
            }
            accumulatedDuration += songDuration;
        }

        const positionInSong = cyclePosition - this.getAccumulatedDuration(songIndex);

        return {
            songIndex,
            positionInSong
        };
    }

    /**
     * Get accumulated duration up to (but not including) a song index
     */
    getAccumulatedDuration(upToIndex) {
        let accumulated = 0;
        for (let i = 0; i < upToIndex; i++) {
            accumulated += PLAYLIST[i].duration;
        }
        return accumulated;
    }

    /**
     * Get elapsed seconds since radio start time
     */
    getElapsedSeconds() {
        const now = Date.now();
        const startTime = RADIO_START_TIME.getTime();
        return (now - startTime) / 1000;
    }

    /**
     * Load a song by index
     */
    loadSong(index) {
        if (index < 0 || index >= PLAYLIST.length) {
            console.error("Invalid song index");
            return;
        }

        const song = PLAYLIST[index];

        // Check if we already have this song loaded
        const needsReload = this.currentSongFile !== song.file;

        if (needsReload) {
            this.currentSongFile = song.file;

            // Only set src and load, don't pause/resume as it causes clicks
            // The browser will handle the transition smoothly
            this.audioPlayer.src = song.file;
            this.audioPlayer.load();
        }

        this.currentSongTitle.textContent = song.title;
        this.totalTimeEl.textContent = this.formatTime(song.duration);
    }

    /**
     * Play the current song
     */
    play() {
        if (!this.hasStarted) return;

        this.audioPlayer.play().catch((error) => {
            console.warn("Autoplay prevented:", error.message);
        });

        this.isPlaying = true;
        this.updatePlayPauseButton();
    }

    /**
     * Pause the current song
     */
    pause() {
        this.audioPlayer.pause();
        this.isPlaying = false;
        this.updatePlayPauseButton();
    }

    /**
     * Toggle play/pause
     */
    togglePlayPause() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    /**
     * Toggle mute
     */
    toggleMute() {
        this.isMuted = !this.isMuted;
        this.audioPlayer.muted = this.isMuted;
        this.updateMuteButton();
    }

    /**
     * Set volume
     */
    setVolume(value) {
        const volume = Math.max(0, Math.min(100, value)) / 100;
        this.audioPlayer.volume = volume;
        localStorage.setItem("syncRadioVolume", value);
        this.updateMuteButton();
    }

    /**
     * Handle song ending
     */
    onSongEnded() {
        if (this.isPrayerTime) {
            // Prayer ended, return to normal playlist
            this.endPrayer();
        } else {
            // Song ended naturally - sync to next song based on UTC time
            // This ensures perfect synchronization across all listeners
            this.syncToLivePosition();

            // Ensure playback continues
            if (this.isPlaying && this.audioPlayer.paused) {
                this.play();
            }
        }
    }


    /**
     * Update play/pause button appearance
     */
    updatePlayPauseButton() {
        this.playPauseBtn.innerHTML = this.isPlaying ? "⏸" : "▶";
        this.playPauseBtn.setAttribute(
            "aria-label",
            this.isPlaying ? "Pause" : "Play"
        );
    }

    /**
     * Update mute button appearance
     */
    updateMuteButton() {
        const volumeLevel = this.audioPlayer.volume;
        let icon = "🔊";

        if (this.isMuted || volumeLevel === 0) {
            icon = "🔇";
        } else if (volumeLevel < 0.5) {
            icon = "🔉";
        }

        this.muteBtn.innerHTML = icon;
    }

    /**
     * Update progress bar
     */
    updateProgressBar() {
        if (!this.hasStarted) return;

        const currentTime = this.audioPlayer.currentTime;
        const duration = this.audioPlayer.duration;

        if (duration > 0) {
            const percentage = (currentTime / duration) * 100;
            this.progressFill.style.width = percentage + "%";
        }

        this.currentTimeEl.textContent = this.formatTime(currentTime);
    }

    /**
     * Update clock and uptime
     */
    updateClockAndUptime() {
        // Update UTC time
        const now = new Date();
        const hours = String(now.getUTCHours()).padStart(2, "0");
        const minutes = String(now.getUTCMinutes()).padStart(2, "0");
        const seconds = String(now.getUTCSeconds()).padStart(2, "0");
        this.utcTimeEl.textContent = `${hours}:${minutes}:${seconds}`;

        // Update station uptime
        const elapsedSeconds = this.getElapsedSeconds();
        this.stationUptimeEl.textContent = this.formatUptimeHMS(elapsedSeconds);
    }

    /**
     * Update all UI elements
     */
    updateUI() {
        this.updateUpcomingList();
        this.updatePlayPauseButton();
        this.updateMuteButton();
    }

    /**
     * Update the upcoming songs list
     */
    updateUpcomingList() {
        if (this.isPrayerTime) {
            this.upcomingListEl.innerHTML = '<div class="upcoming-item">Prayer in progress...</div>';
            return;
        }

        const radioPosition = this.getRadioPosition();
        let currentIndex = radioPosition.songIndex;
        const upcomingItems = [];

        for (let i = 0; i < 5; i++) {
            const index = (currentIndex + i + 1) % PLAYLIST.length;
            const song = PLAYLIST[index];
            upcomingItems.push(
                `<div class="upcoming-item" data-index="${i + 1}"><span>${song.title}</span></div>`
            );
        }

        this.upcomingListEl.innerHTML = upcomingItems.join("");
    }

    /**
     * Format time in MM:SS
     */
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }

    /**
     * Format uptime in HH:MM:SS or Xd HH:MM
     */
    formatUptimeHMS(seconds) {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        if (days > 0) {
            return `${days}d ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
        }

        return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }

    /**
     * Load volume preference from localStorage
     */
    loadVolumePreference() {
        const savedVolume = localStorage.getItem("syncRadioVolume");
        if (savedVolume) {
            this.volumeSlider.value = savedVolume;
            this.setVolume(savedVolume);
        } else {
            this.setVolume(70);
        }
    }

    /**
     * Handle audio loading errors
     */
    handleAudioError(error) {
        const errorMessage = this.getAudioErrorMessage(this.audioPlayer.error);
        console.error("Audio playback error:", errorMessage);

        // Try to recover by resyncing to the live position after a brief
        // delay. (This used to call this.nextSong(), which doesn't exist on
        // this class - every audio error threw a TypeError here and killed
        // playback permanently instead of recovering.)
        setTimeout(() => {
            if (this.isPlaying && !this.isPrayerTime) {
                this.syncToLivePosition();
            }
        }, 1000);
    }

    /**
     * Get human-readable error message for audio errors
     */
    getAudioErrorMessage(error) {
        if (!error) return "Unknown error";

        switch (error.code) {
            case error.MEDIA_ERR_ABORTED:
                return "Playback was aborted";
            case error.MEDIA_ERR_NETWORK:
                return "Network error occurred";
            case error.MEDIA_ERR_DECODE:
                return "Could not decode the audio file";
            case error.MEDIA_ERR_SRC_NOT_SUPPORTED:
                return "Audio source not supported";
            default:
                return "Audio error occurred";
        }
    }
}

/**
 * Initialize application when DOM is ready
 */
document.addEventListener("DOMContentLoaded", () => {
    // Validate playlist
    if (!PLAYLIST || PLAYLIST.length === 0) {
        console.error("Error: Playlist is empty. Add songs to js/playlist.js");
        return;
    }

    if (TOTAL_PLAYLIST_DURATION === 0) {
        console.error("Error: Total playlist duration is 0. Check song durations.");
        return;
    }

    // Validate prayer times configuration exists
    if (typeof PRAYER_TIMES === 'undefined') {
        console.error("Error: Prayer times not configured. Include js/prayer-times.js");
        return;
    }

    // Start the application
    window.syncRadio = new SyncRadio();
});

/**
 * Handle page visibility changes
 * Resync when page comes into focus
 */
document.addEventListener("visibilitychange", () => {
});

/**
 * Handle browser tab becoming active
 */
window.addEventListener("focus", () => {
    // Resume playback on focus if needed
});
