/**
 * SyncRadio Playlist Configuration
 *
 * Alternating Music & Speech Playlist
 * Plays music and speech files in alternating sequence.
 * All listeners sync to UTC time for perfect global synchronization.
 *
 * PRAYER TIMES:
 * Prayer interruptions are configured separately in prayer-times.js
 * At the configured times (fajr/morning and maghrib/evening),
 * the current song will be interrupted and replaced with a prayer.
 * After the prayer ends, playback resumes with the normal playlist.
 */

var PLAYLIST = [
    // Music & Speech alternating pattern
    { title: "🎵 Music 01", file: "music/01.mp3", duration: 268, type: "music" },
    { title: "🎤 Speech 01", file: "speach/01.mp3", duration: 18, type: "speech" },

    { title: "🎵 Music 02", file: "music/02.mp3", duration: 58, type: "music" },
    { title: "🎤 Speech 02", file: "speach/02.mp3", duration: 28, type: "speech" },

    { title: "🎵 Music 03", file: "music/03.mp3", duration: 15, type: "music" },
    { title: "🎤 Speech 03", file: "speach/03.mp3", duration: 25, type: "speech" },

    { title: "🎵 Music 04", file: "music/04.mp3", duration: 150, type: "music" },
    { title: "🎤 Speech 04", file: "speach/04.mp3", duration: 25, type: "speech" },

    { title: "🎵 Music 05", file: "music/08.mp3", duration: 148, type: "music" },
    { title: "🎤 Speech 05", file: "speach/05.mp3", duration: 22, type: "speech" },

    { title: "🎵 Music 06", file: "music/05.mp3", duration: 138, type: "music" },
    { title: "🎤 Speech 06", file: "speach/06.mp3", duration: 19, type: "speech" },

    { title: "🎵 Music 07", file: "music/06.mp3", duration: 111, type: "music" },
    { title: "🎤 Speech 07", file: "speach/07.mp3", duration: 13, type: "speech" },

    { title: "🎵 Music 08", file: "music/07.mp3", duration: 73, type: "music" },
    { title: "🎤 Speech 08", file: "speach/08.mp3", duration: 18, type: "speech" },

    // Remaining speech files (9-18)
    { title: "🎤 Speech 09", file: "speach/09.mp3", duration: 17, type: "speech" },
    { title: "🎤 Speech 10", file: "speach/10.mp3", duration: 45, type: "speech" },
    { title: "🎤 Speech 11", file: "speach/11.mp3", duration: 23, type: "speech" },
    { title: "🎤 Speech 12", file: "speach/12.mp3", duration: 12, type: "speech" },
    { title: "🎤 Speech 13", file: "speach/13.mp3", duration: 43, type: "speech" },
    { title: "🎤 Speech 14", file: "speach/14.mp3", duration: 27, type: "speech" },
    { title: "🎤 Speech 15", file: "speach/15.mp3", duration: 85, type: "speech" },
    { title: "🎤 Speech 16", file: "speach/16.mp3", duration: 24, type: "speech" },
    { title: "🎤 Speech 17", file: "speach/17.mp3", duration: 31, type: "speech" },
    { title: "🎤 Speech 18", file: "speach/18.mp3", duration: 24, type: "speech" }
];

/**
 * Calculate total playlist duration in seconds
 */
var TOTAL_PLAYLIST_DURATION = PLAYLIST.reduce((sum, track) => sum + track.duration, 0);

/**
 * Radio station start time (UTC)
 * This is when the "radio station" began broadcasting.
 * All synchronization is based on this timestamp.
 *
 * MUST be a fixed absolute epoch, identical here and in embed.html - not
 * computed relative to page-load time. The previous version was
 * `new Date() - 3h`, evaluated fresh every time the page loaded, which
 * meant every listener's "radio start" was their own load time minus 3
 * hours - i.e. no two listeners were ever actually on the same timeline,
 * and reloading the page jumped you to a different position. That
 * defeated the entire point of "all listeners hear the same song at the
 * same position" (see stations.json's `all_listeners_synchronized: true`).
 * With a fixed epoch, getRadioPosition()'s modulo-cycle math produces the
 * same position for everyone, at any moment, regardless of when they load.
 */
var RADIO_START_TIME = new Date('2026-01-01T00:00:00Z');
