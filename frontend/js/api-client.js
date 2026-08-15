/**
 * api-client.js - Backend API client (replaces firebase-sync.js)
 * Talks to the Cloudflare Worker backend (backend/) for profile,
 * favorites, history, and stats persistence, and for Google sign-in.
 * No Firebase/Firestore involved anywhere - auth is a backend-owned
 * opaque session token (see backend/src/lib/session.ts).
 */

class ApiClient {
    constructor() {
        this.baseUrl = this.detectApiBase();
        this.sessionToken = localStorage.getItem('globeRadio_sessionToken');
        this.initialized = false;
        // Mirrors FirebaseSync's flag name so user.js's existing
        // `if (this.data.syncEnabled)` / `if (firebaseSync.syncEnabled)`
        // style checks keep working with minimal edits.
        this.syncEnabled = false;
        // Populated by consumeAuthRedirectParams() when this load is the
        // return trip from a Google sign-in redirect - read once by
        // user.js right after init(), then left alone.
        this.pendingSignInResult = null;
        this.pendingAuthError = null;
    }

    /**
     * Local dev talks to the local wrangler dev server; everywhere else
     * talks to the deployed Worker. No build step, so this is a runtime
     * check, not an env var substitution - same pattern audio.js's
     * detectProxyUrl() already uses for the stream proxy.
     */
    detectApiBase() {
        const host = window.location.hostname;
        if (host === 'localhost' || host === '127.0.0.1') {
            return 'http://localhost:8787';
        }
        return 'https://radio-explorer-api.ramsharans-rathore.workers.dev';
    }

    /**
     * Call once on startup. Consumes a one-time Google-redirect return if
     * this load is one, then ensures a usable session exists (creating an
     * anonymous one if there's no session at all yet). Never throws - on
     * any backend failure, returns false and the app continues fully
     * local (see the ground rule this milestone was built to: additive,
     * never breaks the app on a backend error).
     */
    async init() {
        this.consumeAuthRedirectParams();

        if (!this.sessionToken) {
            try {
                await this.createAnonymousSession();
            } catch (error) {
                console.warn('⚠️ Could not create a backend session - continuing local-only:', error.message);
                this.initialized = false;
                this.syncEnabled = false;
                return false;
            }
        }

        this.initialized = true;
        this.syncEnabled = true;
        return true;
    }

    /**
     * Reads ?sessionToken=&userId=&isNewUser=&wasLinked= (success) or
     * ?authError= (failure) off the URL - the one-time return from
     * backend/src/routes/auth.ts's /auth/google/callback redirect - and
     * strips them afterward. Mirrors app.js's checkSharedData() pattern
     * for ?station=/?share=.
     */
    consumeAuthRedirectParams() {
        const params = new URLSearchParams(window.location.search);
        const token = params.get('sessionToken');
        const authError = params.get('authError');

        if (!token && !authError) {
            return;
        }

        if (token) {
            this.sessionToken = token;
            localStorage.setItem('globeRadio_sessionToken', token);
            this.pendingSignInResult = {
                userId: params.get('userId'),
                isNewUser: params.get('isNewUser') === 'true',
                wasLinked: params.get('wasLinked') === 'true'
            };
        } else {
            this.pendingAuthError = authError;
        }

        ['sessionToken', 'userId', 'isNewUser', 'wasLinked', 'authError'].forEach((key) => params.delete(key));
        const newQuery = params.toString();
        window.history.replaceState(
            {},
            '',
            window.location.pathname + (newQuery ? '?' + newQuery : '') + window.location.hash
        );
    }

    async createAnonymousSession() {
        const response = await fetch(`${this.baseUrl}/api/v1/auth/anonymous`, { method: 'POST' });
        if (!response.ok) {
            throw new Error(`Failed to create session (HTTP ${response.status})`);
        }
        const data = await response.json();
        this.sessionToken = data.sessionToken;
        localStorage.setItem('globeRadio_sessionToken', data.sessionToken);
        return data;
    }

    /**
     * Core request helper. On a 401 (session invalid/expired
     * server-side - not expected in normal use given the 90-day sliding
     * expiration, but real if e.g. the account was deleted elsewhere),
     * silently establishes a fresh anonymous session and retries once
     * rather than failing hard.
     */
    async request(method, path, body, isRetry = false) {
        if (!this.sessionToken) {
            await this.createAnonymousSession();
        }

        const response = await fetch(`${this.baseUrl}${path}`, {
            method,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.sessionToken}`
            },
            body: body !== undefined ? JSON.stringify(body) : undefined
        });

        if (response.status === 401 && !isRetry) {
            await this.createAnonymousSession();
            return this.request(method, path, body, true);
        }

        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            throw new Error(errorBody.error || `Request failed (HTTP ${response.status})`);
        }

        if (response.status === 204) {
            return null;
        }
        return response.json();
    }

    getProfile() {
        return this.request('GET', '/api/v1/profile');
    }

    updateProfile(patch) {
        return this.request('PATCH', '/api/v1/profile', patch);
    }

    deleteProfile() {
        return this.request('DELETE', '/api/v1/profile');
    }

    getFavorites() {
        return this.request('GET', '/api/v1/favorites');
    }

    addFavorite(stationId) {
        return this.request('PUT', `/api/v1/favorites/${encodeURIComponent(stationId)}`);
    }

    removeFavorite(stationId) {
        return this.request('DELETE', `/api/v1/favorites/${encodeURIComponent(stationId)}`);
    }

    reorderFavorites(order) {
        return this.request('PUT', '/api/v1/favorites/reorder', { order });
    }

    getHistory() {
        return this.request('GET', '/api/v1/history');
    }

    addHistoryEntry(entry) {
        return this.request('POST', '/api/v1/history', entry);
    }

    /**
     * Public route, no auth - never throws, falls back to zeros so the
     * "connected/active users" display widget can hide itself exactly
     * like it already does when Firebase was unreachable.
     */
    async getGlobalStats() {
        try {
            const response = await fetch(`${this.baseUrl}/api/v1/stats`);
            if (!response.ok) {
                return { connectedUsers: 0, activeUsers: 0 };
            }
            return await response.json();
        } catch (error) {
            return { connectedUsers: 0, activeUsers: 0 };
        }
    }

    /**
     * Redirects the whole page to Google's consent screen - can't be
     * done via fetch()/XHR, OAuth requires a real top-level navigation.
     * Passes the current session token so an active anonymous account's
     * favorites/history/preferences carry over onto the resulting
     * Google-linked account (same row, converted in place server-side -
     * see backend's linkAnonymousUserToProvider).
     */
    signInWithGoogle() {
        const url = new URL(`${this.baseUrl}/api/v1/auth/google/start`);
        if (this.sessionToken) {
            url.searchParams.set('sessionToken', this.sessionToken);
        }
        window.location.href = url.toString();
    }

    /**
     * Revokes the current session and immediately establishes a fresh
     * anonymous one - the app is never left without a usable account
     * after signing out.
     */
    async logout() {
        try {
            await this.request('POST', '/api/v1/auth/logout');
        } catch (error) {
            console.warn('⚠️ Logout request failed (continuing anyway):', error.message);
        }
        this.sessionToken = null;
        localStorage.removeItem('globeRadio_sessionToken');
        await this.createAnonymousSession();
    }

    getStatus() {
        return {
            initialized: this.initialized,
            syncEnabled: this.syncEnabled,
            hasSession: !!this.sessionToken,
            online: navigator.onLine
        };
    }
}

// Export for use in other modules
window.ApiClient = ApiClient;
