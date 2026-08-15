/**
 * Prayer Times Configuration
 *
 * This file contains the prayer times for each month.
 * Times are in UTC format (HH:MM).
 *
 * These values should be updated monthly with the actual prayer times.
 * The application will use these times to determine when to play prayers
 * and interrupt the normal song playlist.
 */

const PRAYER_TIMES = {
    january: {
        fajr: "05:00",      // Morning prayer time
        maghrib: "18:00"    // Evening prayer time
    },
    february: {
        fajr: "05:05",
        maghrib: "18:05"
    },
    march: {
        fajr: "05:10",
        maghrib: "18:10"
    },
    april: {
        fajr: "05:15",
        maghrib: "18:15"
    },
    may: {
        fajr: "05:20",
        maghrib: "18:20"
    },
    june: {
        fajr: "05:25",
        maghrib: "18:25"
    },
    july: {
        fajr: "05:30",
        maghrib: "18:30"
    },
    august: {
        fajr: "05:25",
        maghrib: "18:25"
    },
    september: {
        fajr: "05:15",
        maghrib: "18:15"
    },
    october: {
        fajr: "05:00",
        maghrib: "18:00"
    },
    november: {
        fajr: "04:50",
        maghrib: "17:50"
    },
    december: {
        fajr: "04:45",
        maghrib: "17:45"
    }
};

/**
 * Get prayer times for current month
 */
function getPrayerTimesForMonth(date = new Date()) {
    const monthNames = [
        'january', 'february', 'march', 'april', 'may', 'june',
        'july', 'august', 'september', 'october', 'november', 'december'
    ];

    const monthIndex = date.getUTCMonth();
    const monthName = monthNames[monthIndex];

    return PRAYER_TIMES[monthName];
}

/**
 * Parse time string "HH:MM" to minutes since midnight
 */
function timeToMinutes(timeString) {
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
}

/**
 * Get current minutes since midnight (UTC)
 */
function getCurrentMinutesSinceMidnight() {
    const now = new Date();
    return now.getUTCHours() * 60 + now.getUTCMinutes();
}

/**
 * Check if current time matches a prayer time
 * Returns: { isPrayerTime: boolean, prayerType: 'fajr' | 'maghrib' | null }
 */
function checkPrayerTime() {
    const currentMinutes = getCurrentMinutesSinceMidnight();
    const prayerTimes = getPrayerTimesForMonth();

    const fajrMinutes = timeToMinutes(prayerTimes.fajr);
    const maghribMinutes = timeToMinutes(prayerTimes.maghrib);

    // Check if we're within 1 minute window of prayer time (to account for timing variations)
    const tolerance = 1; // minutes

    if (Math.abs(currentMinutes - fajrMinutes) <= tolerance) {
        return { isPrayerTime: true, prayerType: 'fajr' };
    }

    if (Math.abs(currentMinutes - maghribMinutes) <= tolerance) {
        return { isPrayerTime: true, prayerType: 'maghrib' };
    }

    return { isPrayerTime: false, prayerType: null };
}

/**
 * Get the prayer file path for a prayer type
 */
function getPrayerFilePath(prayerType) {
    if (prayerType === 'fajr') {
        return 'prayer/morning/01.mp3';
    } else if (prayerType === 'maghrib') {
        return 'prayer/evening/01.mp3';
    }
    return null;
}

/**
 * Get formatted prayer time for display
 */
function getFormattedPrayerTime(prayerType) {
    const prayerTimes = getPrayerTimesForMonth();
    if (prayerType === 'fajr') {
        return prayerTimes.fajr + ' UTC (Morning Prayer)';
    } else if (prayerType === 'maghrib') {
        return prayerTimes.maghrib + ' UTC (Evening Prayer)';
    }
    return 'Unknown';
}
