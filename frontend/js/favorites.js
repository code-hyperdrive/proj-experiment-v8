/**
 * favorites.js - Favorites Management
 * localStorage-backed, with best-effort backend sync (window.apiClient).
 * This is the SOLE source of truth for favorites - there used to be a
 * second, independently-maintained copy on UserProfile.data.favorites,
 * kept in sync only by call-ordering convention in app.js's
 * handleFavoriteToggle(); that duplicate store was removed (not
 * synchronized) once this one started talking to the backend.
 */

class FavoritesController {
    constructor(stations) {
        this.stations = stations;
        this.favorites = [];
        this.storageKey = 'globeRadio_favorites';

        this.load();
    }

    /**
     * Load favorites from localStorage
     */
    load() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                const ids = JSON.parse(stored);
                // Filter for display purposes against whatever station list
                // we have *right now* - but deliberately do NOT persist this
                // filtered result back to storage. This controller is
                // constructed with an early, sometimes-partial station list
                // (app.js fetches stations.json a second time shortly after
                // and reassigns this.stations with the fuller set) - if we
                // wrote the pruned list back here, any favorite that wasn't
                // in that first partial snapshot would be permanently
                // deleted from localStorage before the fuller list ever
                // arrived. Only real user actions (toggle/add/remove/import,
                // via save()) should ever persist a change; a save() at
                // that point will naturally reflect whatever this.stations
                // is by then, which is correct without needing to force it
                // here.
                this.favorites = ids.filter(id =>
                    this.stations.some(station => station.id === id)
                );
            }
        } catch (error) {
            console.error('Failed to load favorites:', error);
            this.favorites = [];
        }
    }

    /**
     * Save favorites to localStorage
     */
    save() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.favorites));
            this.emit('favoritesChanged', { favorites: this.getFavoriteStations() });
        } catch (error) {
            console.error('Failed to save favorites:', error);
            this.emit('error', {
                title: 'Storage Error',
                message: 'Failed to save favorites. Your browser may have disabled localStorage.'
            });
        }
    }

    /**
     * One-time reconciliation with the backend, meant to be awaited once
     * (from app.js's init, after window.apiClient's own init has settled -
     * see UserProfile.waitForApiClient()). This is the data-loss-sensitive
     * part of Milestone 2: a returning user already has real local
     * favorites; a brand-new backend account starts empty. The backend
     * must NEVER blindly overwrite local on first contact - only ever
     * ADD to it, or (once the backend already has data of its own, e.g.
     * a linked account signed in elsewhere) union the two lists.
     */
    async reconcileWithBackend() {
        if (!window.apiClient || !window.apiClient.syncEnabled) {
            return;
        }

        try {
            const { favorites: serverFavorites } = await window.apiClient.getFavorites();
            const serverIds = serverFavorites.map((f) => f.stationId);
            const serverIdSet = new Set(serverIds);
            const localOnlyIds = this.favorites.filter((id) => !serverIdSet.has(id));

            if (localOnlyIds.length > 0) {
                // Seed the backend with whatever exists only locally -
                // never the other way around. One at a time (not
                // reorderFavorites) since these are genuinely NEW entries
                // from the backend's point of view, not a reorder of an
                // existing set.
                for (const id of localOnlyIds) {
                    await window.apiClient.addFavorite(id).catch((error) => {
                        console.warn('⚠️ Failed to sync a local favorite to the backend:', id, error.message);
                    });
                }
            }

            // Union: backend's existing order first, then local-only
            // additions appended - never drop anything from either side.
            const merged = [...serverIds, ...localOnlyIds];
            if (merged.length !== this.favorites.length || merged.some((id, i) => id !== this.favorites[i])) {
                this.favorites = merged;
                this.save();
            }
        } catch (error) {
            console.warn('⚠️ Favorites backend reconciliation failed, staying local-only for now:', error.message);
        }
    }

    /**
     * Add station to favorites
     */
    add(stationId) {
        if (!this.isFavorite(stationId)) {
            this.favorites.push(stationId);
            this.save();
            this._syncAdd(stationId);
            return true;
        }
        return false;
    }

    /**
     * Remove station from favorites
     */
    remove(stationId) {
        const index = this.favorites.indexOf(stationId);
        if (index > -1) {
            this.favorites.splice(index, 1);
            this.save();
            this._syncRemove(stationId);
            return true;
        }
        return false;
    }

    /**
     * Toggle favorite status
     */
    toggle(stationId) {
        if (this.isFavorite(stationId)) {
            this.remove(stationId);
            return false;
        } else {
            this.add(stationId);
            return true;
        }
    }

    /**
     * Check if station is favorited
     */
    isFavorite(stationId) {
        return this.favorites.includes(stationId);
    }

    /**
     * Get all favorite station objects
     */
    getFavoriteStations() {
        return this.favorites
            .map(id => this.stations.find(station => station.id === id))
            .filter(Boolean); // Remove any null/undefined
    }

    /**
     * Get favorite IDs
     */
    getFavoriteIds() {
        return [...this.favorites];
    }

    /**
     * Get favorite count
     */
    getCount() {
        return this.favorites.length;
    }

    /**
     * Clear all favorites
     */
    clear() {
        const removedIds = [...this.favorites];
        this.favorites = [];
        this.save();
        removedIds.forEach((id) => this._syncRemove(id));
    }

    /**
     * Export favorites as JSON
     */
    export() {
        const favoriteStations = this.getFavoriteStations();
        const data = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            favorites: favoriteStations.map(station => ({
                id: station.id,
                name: station.name,
                city: station.city,
                country: station.country
            }))
        };

        return JSON.stringify(data, null, 2);
    }

    /**
     * Import favorites from JSON
     */
    import(jsonString) {
        try {
            const data = JSON.parse(jsonString);

            if (!data.favorites || !Array.isArray(data.favorites)) {
                throw new Error('Invalid favorites file format');
            }

            // Map imported station IDs to current station IDs
            // In case station IDs changed, try to match by name and location
            const importedIds = data.favorites.map(fav => {
                // First try exact ID match
                let station = this.stations.find(s => s.id === fav.id);

                // If not found, try name + city match
                if (!station) {
                    station = this.stations.find(s =>
                        s.name === fav.name &&
                        s.city === fav.city &&
                        s.country === fav.country
                    );
                }

                return station ? station.id : null;
            }).filter(Boolean);

            // Merge with existing favorites (no duplicates)
            const newIds = importedIds.filter((id) => !this.favorites.includes(id));
            const merged = [...new Set([...this.favorites, ...importedIds])];
            this.favorites = merged;
            this.save();
            newIds.forEach((id) => this._syncAdd(id));

            return {
                success: true,
                imported: importedIds.length,
                total: this.favorites.length
            };
        } catch (error) {
            console.error('Failed to import favorites:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Download favorites as JSON file
     */
    download() {
        const json = this.export();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `globe-radio-favorites-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Reorder favorites
     */
    reorder(fromIndex, toIndex) {
        if (fromIndex < 0 || fromIndex >= this.favorites.length) return false;
        if (toIndex < 0 || toIndex >= this.favorites.length) return false;

        const [removed] = this.favorites.splice(fromIndex, 1);
        this.favorites.splice(toIndex, 0, removed);
        this.save();
        this._syncReorder();
        return true;
    }

    /**
     * Move favorite up in list
     */
    moveUp(stationId) {
        const index = this.favorites.indexOf(stationId);
        if (index > 0) {
            return this.reorder(index, index - 1);
        }
        return false;
    }

    /**
     * Move favorite down in list
     */
    moveDown(stationId) {
        const index = this.favorites.indexOf(stationId);
        if (index >= 0 && index < this.favorites.length - 1) {
            return this.reorder(index, index + 1);
        }
        return false;
    }

    // --- Best-effort backend sync helpers ---------------------------------
    // All three are fire-and-forget: local state (already saved above) is
    // authoritative for the UI; a backend failure is logged, never
    // surfaced as an error to the user and never reverts the local change.

    _syncAdd(stationId) {
        if (window.apiClient?.syncEnabled) {
            window.apiClient.addFavorite(stationId).catch((error) => {
                console.warn('⚠️ Failed to sync favorite add to backend:', stationId, error.message);
            });
        }
    }

    _syncRemove(stationId) {
        if (window.apiClient?.syncEnabled) {
            window.apiClient.removeFavorite(stationId).catch((error) => {
                console.warn('⚠️ Failed to sync favorite removal to backend:', stationId, error.message);
            });
        }
    }

    _syncReorder() {
        if (window.apiClient?.syncEnabled) {
            window.apiClient.reorderFavorites(this.favorites).catch((error) => {
                console.warn('⚠️ Failed to sync favorites reorder to backend:', error.message);
            });
        }
    }

    /**
     * Event emitter
     */
    emit(event, data) {
        window.dispatchEvent(new CustomEvent(`favorites:${event}`, { detail: data }));
    }

    /**
     * Get statistics
     */
    getStats() {
        const favoriteStations = this.getFavoriteStations();
        const countries = new Set(favoriteStations.map(s => s.country));
        const genres = new Set(favoriteStations.filter(s => s.genre).map(s => s.genre));

        return {
            total: this.favorites.length,
            countries: countries.size,
            genres: genres.size,
            countryBreakdown: this.getCountryBreakdown(),
            genreBreakdown: this.getGenreBreakdown()
        };
    }

    /**
     * Get breakdown by country
     */
    getCountryBreakdown() {
        const favoriteStations = this.getFavoriteStations();
        const breakdown = {};

        favoriteStations.forEach(station => {
            const country = station.country;
            breakdown[country] = (breakdown[country] || 0) + 1;
        });

        return Object.entries(breakdown)
            .sort((a, b) => b[1] - a[1])
            .map(([country, count]) => ({ country, count }));
    }

    /**
     * Get breakdown by genre
     */
    getGenreBreakdown() {
        const favoriteStations = this.getFavoriteStations();
        const breakdown = {};

        favoriteStations.forEach(station => {
            const genre = station.genre || 'Unknown';
            breakdown[genre] = (breakdown[genre] || 0) + 1;
        });

        return Object.entries(breakdown)
            .sort((a, b) => b[1] - a[1])
            .map(([genre, count]) => ({ genre, count }));
    }
}

// Export for use in app.js
window.FavoritesController = FavoritesController;
