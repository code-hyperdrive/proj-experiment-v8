const fs = require('fs');
const path = require('path');

const STATIONS_PATH = path.join(__dirname, '../../frontend/data/stations.json');
const EXCEPTIONS_PATH = path.join(__dirname, '../../frontend/data/station-exceptions.json');

class DataValidator {
    constructor() {
        this.errors = [];
        this.warnings = [];
        this.stats = {};
    }

    log(level, msg) {
        console.log(`[${level}] ${msg}`);
    }

    validateStationsFile() {
        this.log('INFO', 'Validating stations.json...');

        if (!fs.existsSync(STATIONS_PATH)) {
            this.errors.push(`stations.json not found at ${STATIONS_PATH}`);
            return false;
        }

        let stations;
        try {
            const raw = fs.readFileSync(STATIONS_PATH, 'utf8');
            stations = JSON.parse(raw);
            if (!Array.isArray(stations)) {
                this.errors.push('stations.json must be an array');
                return false;
            }
        } catch (err) {
            this.errors.push(`Failed to parse stations.json: ${err.message}`);
            return false;
        }

        this.log('INFO', `✓ stations.json is valid JSON with ${stations.length} stations`);
        this.stats.totalStations = stations.length;
        this.validateStationStructure(stations);
        return true;
    }

    validateStationStructure(stations) {
        const requiredFields = ['id', 'name', 'country', 'streams'];
        const validStreamTypes = ['normal', 'web-player']; // Allowed stream types
        let enabledCount = 0;
        let streamCountsByStation = [];
        let countryCounts = {};
        let duplicateIds = new Set();
        let seenIds = new Set();
        let webPlayerCount = 0;

        for (let i = 0; i < stations.length; i++) {
            const station = stations[i];

            // Check required fields
            for (const field of requiredFields) {
                if (!(field in station)) {
                    this.errors.push(`Station ${i}: missing required field "${field}"`);
                }
            }

            // Check ID uniqueness
            if (station.id) {
                if (seenIds.has(station.id)) {
                    this.errors.push(`Duplicate station ID: ${station.id}`);
                    duplicateIds.add(station.id);
                } else {
                    seenIds.add(station.id);
                }
            }

            // Track enabled status
            if (station.enabled !== false) {
                enabledCount++;
            }

            // Validate streams array
            if (!Array.isArray(station.streams) || station.streams.length === 0) {
                this.warnings.push(`Station "${station.name}": has no streams`);
            } else {
                streamCountsByStation.push({
                    name: station.name,
                    count: station.streams.length
                });

                for (let j = 0; j < station.streams.length; j++) {
                    const stream = station.streams[j];
                    const isWebPlayer = stream.type === 'web-player';

                    if (!stream.url) {
                        this.errors.push(`Station "${station.name}" stream ${j}: missing URL`);
                    } else if (!isWebPlayer && !isValidUrl(stream.url)) {
                        // Skip URL validation for web-player streams (they're internal pages)
                        this.errors.push(`Station "${station.name}" stream ${j}: invalid URL format: ${stream.url}`);
                    } else if (isWebPlayer) {
                        webPlayerCount++;
                    }
                }
            }

            // Track countries
            if (station.country) {
                countryCounts[station.country] = (countryCounts[station.country] || 0) + 1;
            }
        }

        this.stats.enabledStations = enabledCount;
        this.stats.disabledStations = stations.length - enabledCount;
        this.stats.uniqueCountries = Object.keys(countryCounts).length;
        this.stats.webPlayerStations = webPlayerCount;
        this.stats.avgStreamsPerStation = (stations.reduce((sum, s) => sum + (s.streams?.length || 0), 0) / stations.length).toFixed(2);

        this.log('INFO', `✓ Found ${enabledCount}/${stations.length} enabled stations`);
        this.log('INFO', `✓ Stations from ${this.stats.uniqueCountries} unique countries`);
        if (webPlayerCount > 0) {
            this.log('INFO', `✓ ${webPlayerCount} web-player stations (skipped from stream connectivity tests)`);
        }
    }

    validateExceptionsFile() {
        this.log('INFO', 'Validating station-exceptions.json...');

        if (!fs.existsSync(EXCEPTIONS_PATH)) {
            this.warnings.push('station-exceptions.json not found (optional)');
            return true;
        }

        let exceptions;
        try {
            const raw = fs.readFileSync(EXCEPTIONS_PATH, 'utf8');
            exceptions = JSON.parse(raw);
        } catch (err) {
            this.errors.push(`Failed to parse station-exceptions.json: ${err.message}`);
            return false;
        }

        this.log('INFO', `✓ station-exceptions.json is valid with ${Object.keys(exceptions).length} entries`);
        return true;
    }

    validateManifest() {
        this.log('INFO', 'Validating manifest.json...');

        const manifestPath = path.join(__dirname, '../../frontend/manifest.json');
        if (!fs.existsSync(manifestPath)) {
            this.errors.push('manifest.json not found');
            return false;
        }

        let manifest;
        try {
            const raw = fs.readFileSync(manifestPath, 'utf8');
            manifest = JSON.parse(raw);
        } catch (err) {
            this.errors.push(`Failed to parse manifest.json: ${err.message}`);
            return false;
        }

        const requiredFields = ['name', 'short_name', 'description', 'start_url', 'display', 'scope', 'theme_color', 'background_color', 'icons'];
        for (const field of requiredFields) {
            if (!(field in manifest)) {
                this.errors.push(`manifest.json: missing required field "${field}"`);
            }
        }

        if (manifest.icons && Array.isArray(manifest.icons)) {
            for (const icon of manifest.icons) {
                if (!icon.src || !icon.sizes || !icon.type) {
                    this.errors.push('manifest.json: icon missing src, sizes, or type');
                }
            }
        }

        this.log('INFO', '✓ manifest.json is valid');
        return true;
    }

    generateReport() {
        return {
            timestamp: new Date().toISOString(),
            summary: {
                totalErrors: this.errors.length,
                totalWarnings: this.warnings.length,
                stats: this.stats
            },
            errors: this.errors,
            warnings: this.warnings
        };
    }

    run() {
        this.log('INFO', '=== Starting Data Validation ===\n');

        const success =
            this.validateStationsFile() &&
            this.validateExceptionsFile() &&
            this.validateManifest();

        const report = this.generateReport();

        console.log('\n=== Validation Report ===');
        console.log(`Errors: ${this.errors.length}`);
        console.log(`Warnings: ${this.warnings.length}`);
        console.log('\nStatistics:');
        console.log(`  Total Stations: ${this.stats.totalStations}`);
        console.log(`  Enabled: ${this.stats.enabledStations}`);
        console.log(`  Disabled: ${this.stats.disabledStations}`);
        console.log(`  Countries: ${this.stats.uniqueCountries}`);
        console.log(`  Web-Player Stations: ${this.stats.webPlayerStations || 0}`);
        console.log(`  Avg Streams/Station: ${this.stats.avgStreamsPerStation}`);

        if (this.errors.length > 0) {
            console.log('\n⚠️  Errors:');
            this.errors.forEach(err => console.log(`  - ${err}`));
        }

        if (this.warnings.length > 0) {
            console.log('\n⚠️  Warnings:');
            this.warnings.forEach(warn => console.log(`  - ${warn}`));
        }

        return { success, report };
    }
}

function isValidUrl(urlString) {
    try {
        new URL(urlString);
        return true;
    } catch {
        return false;
    }
}

module.exports = { DataValidator };
