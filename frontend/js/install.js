/**
 * install.js - PWA install prompt handling
 *
 * Chrome/Edge/Android fire `beforeinstallprompt`, which we capture and defer so
 * we can trigger it from our own "Install App" button instead of a browser-owned
 * mini-infobar. iOS Safari never fires that event — there is no programmatic
 * install API there — so for iOS we show the same affordances but explain the
 * manual "Share -> Add to Home Screen" steps instead.
 */
class InstallController {
    constructor() {
        this.deferredPrompt = null;
        this.storageKey = 'globeRadio_installPromptDismissed';
        this.isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
        this.isStandalone = window.matchMedia('(display-mode: standalone)').matches
            || window.navigator.standalone === true;
    }

    init() {
        if (this.isStandalone) {
            // Already installed/running as an app — nothing to offer.
            return;
        }

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            this.showInstallButton();
            this.maybeShowBanner();
        });

        window.addEventListener('appinstalled', () => {
            this.deferredPrompt = null;
            this.hideInstallButton();
            this.hideBanner();
            window.app?.ui?.showToast({
                type: 'success',
                title: 'App Installed',
                message: 'Launch Radio Explorer anytime from your home screen.'
            });
        });

        document.getElementById('installAppBtn')?.addEventListener('click', () => this.promptInstall());

        if (this.isIOS) {
            // No install signal ever fires on iOS — show our own affordances directly.
            this.showInstallButton();
            setTimeout(() => this.maybeShowBanner(), 8000);
        }
    }

    showInstallButton() {
        document.getElementById('installAppBtn')?.removeAttribute('hidden');
    }

    hideInstallButton() {
        document.getElementById('installAppBtn')?.setAttribute('hidden', '');
    }

    async promptInstall() {
        if (this.isIOS) {
            this.showIOSInstructions();
            return;
        }

        if (!this.deferredPrompt) return;

        this.deferredPrompt.prompt();
        const { outcome } = await this.deferredPrompt.userChoice;
        this.deferredPrompt = null;

        if (outcome !== 'accepted') {
            // Browser will fire a fresh beforeinstallprompt later if the user
            // becomes eligible again; nothing to keep around until then.
            this.hideInstallButton();
        }

        this.hideBanner();
    }

    /**
     * A one-time dismissible banner, shown once per browser (not per session)
     * unless the user explicitly dismisses it — mirrors the resume banner's
     * visual language via the shared .resume-banner styles.
     */
    maybeShowBanner() {
        if (localStorage.getItem(this.storageKey)) return;
        if (document.querySelector('.resume-banner.show') || document.getElementById('userSetupModal')) {
            // Don't stack with the "continue listening?" banner or the
            // first-run welcome/setup modal — try again shortly.
            setTimeout(() => this.maybeShowBanner(), 4000);
            return;
        }
        if (document.querySelector('.install-banner')) return;

        const banner = document.createElement('div');
        banner.className = 'resume-banner install-banner';
        banner.innerHTML = `
            <div class="resume-banner-content">
                <span class="resume-banner-text">Install <strong>Radio Explorer</strong> for a faster, full-screen experience</span>
                <button class="resume-btn" id="installBannerBtn">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 3v12"/>
                        <path d="m7 11 5 5 5-5"/>
                        <path d="M5 19h14"/>
                    </svg>
                    Install
                </button>
                <button class="resume-dismiss-btn" id="installBannerDismissBtn">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        `;

        document.body.appendChild(banner);
        requestAnimationFrame(() => banner.classList.add('show'));

        document.getElementById('installBannerBtn')?.addEventListener('click', () => this.promptInstall());
        document.getElementById('installBannerDismissBtn')?.addEventListener('click', () => this.dismissBanner());
    }

    dismissBanner() {
        localStorage.setItem(this.storageKey, '1');
        this.hideBanner();
    }

    hideBanner() {
        const banner = document.querySelector('.install-banner');
        if (!banner) return;
        banner.classList.remove('show');
        setTimeout(() => banner.remove(), 300);
    }

    showIOSInstructions() {
        // Remove any existing instance rather than reusing it in place — reuse
        // would leave it at its old DOM position, which can end up stacked
        // behind a modal that was opened more recently (e.g. Profile), since
        // both share the same .modal z-index and rely on DOM order to stack.
        document.getElementById('iosInstallModal')?.remove();

        const modal = document.createElement('div');
        modal.id = 'iosInstallModal';
        modal.className = 'modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'iosInstallModalTitle');
        modal.innerHTML = `
            <div class="modal-backdrop"></div>
            <div class="modal-content">
                <div class="modal-header">
                    <h3 id="iosInstallModalTitle">Install Radio Explorer</h3>
                    <button class="icon-btn" id="closeIosInstallModal" aria-label="Close">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>
                <div class="modal-body">
                    <p>Safari on iOS doesn't offer an automatic install button, but you can add Radio Explorer to your home screen in a few taps:</p>
                    <ol class="ios-install-steps">
                        <li>Tap the <strong>Share</strong> button in Safari's toolbar</li>
                        <li>Scroll down and tap <strong>Add to Home Screen</strong></li>
                        <li>Tap <strong>Add</strong> in the top-right corner</li>
                    </ol>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const close = () => { modal.hidden = true; };
        modal.querySelector('#closeIosInstallModal')?.addEventListener('click', close);
        modal.querySelector('.modal-backdrop')?.addEventListener('click', close);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !modal.hidden) close();
        });
    }
}

window.InstallController = InstallController;
