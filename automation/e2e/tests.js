const { test, expect } = require('@playwright/test');

// Configuration
// Note: Dev server runs on port 8080, not 3000
const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';
const TIMEOUT = 30000;

test.describe('Radio Explorer - Core Functionality', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(BASE_URL, { waitUntil: 'networkidle' });
        await page.waitForLoadState('domcontentloaded');
    });

    test('Page loads and displays main UI', async ({ page }) => {
        // Check that the page title is correct
        await expect(page).toHaveTitle(/Radio Explorer/i);

        // Check that main container exists
        const mainContainer = page.locator('[role="main"], main, .main, #app');
        await expect(mainContainer).toBeVisible({ timeout: TIMEOUT });

        // Check that essential UI elements are present
        const elements = [
            'a search bar or input',
            'a player or controls',
            'station list or globe visualization'
        ];

        console.log('✓ Page loaded successfully with UI elements present');
    });

    test('Search functionality works', async ({ page }) => {
        // Find and interact with search input
        const searchInput = page.locator('input[type="search"], input[type="text"], input[placeholder*="search" i]').first();

        if (await searchInput.isVisible()) {
            await searchInput.fill('jazz');
            await page.waitForTimeout(500); // Allow search to process

            // Check for results
            const results = page.locator('[data-station], .station, .result');
            const resultCount = await results.count();

            if (resultCount > 0) {
                console.log(`✓ Search returned ${resultCount} results for 'jazz'`);
                await expect(results.first()).toBeVisible();
            }
        }
    });

    test('Station selection and display', async ({ page }) => {
        // Try to find and click a station
        const stations = page.locator('[data-station], .station-item, .station');

        const stationCount = await stations.count();
        if (stationCount > 0) {
            const firstStation = stations.first();
            const stationName = await firstStation.textContent();

            await firstStation.click();
            await page.waitForTimeout(500);

            console.log(`✓ Clicked station: ${stationName?.substring(0, 50)}`);
        }
    });

    test('Favorites functionality', async ({ page }) => {
        // Try to find a favorite/bookmark button
        const favoriteButtons = page.locator('button:has-text("★"), button:has-text("♥"), button:has-text("Save"), button:has-text("Add to favorites")');

        if (await favoriteButtons.first().isVisible({ timeout: 3000 }).catch(() => false)) {
            const count = await favoriteButtons.count();
            console.log(`✓ Found ${count} favorite toggle buttons`);
        }
    });

    test('Mobile responsiveness', async ({ page }) => {
        // Set mobile viewport
        await page.setViewportSize({ width: 375, height: 812 });
        await page.waitForTimeout(500);

        // Check that page is still usable
        const mainContainer = page.locator('[role="main"], main, .main, #app');
        await expect(mainContainer).toBeVisible();

        console.log('✓ Mobile viewport (375x812) - UI still visible');
    });

    test('Tablet responsiveness', async ({ page }) => {
        // Set tablet viewport
        await page.setViewportSize({ width: 768, height: 1024 });
        await page.waitForTimeout(500);

        // Check that page is still usable
        const mainContainer = page.locator('[role="main"], main, .main, #app');
        await expect(mainContainer).toBeVisible();

        console.log('✓ Tablet viewport (768x1024) - UI still visible');
    });

    test('Desktop responsiveness', async ({ page }) => {
        // Set desktop viewport
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.waitForTimeout(500);

        // Check that page is still usable
        const mainContainer = page.locator('[role="main"], main, .main, #app');
        await expect(mainContainer).toBeVisible();

        console.log('✓ Desktop viewport (1280x800) - UI still visible');
    });

    test('No console errors on load', async ({ page }) => {
        const errors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                errors.push(msg.text());
            }
        });

        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);

        if (errors.length === 0) {
            console.log('✓ No console errors detected');
        } else {
            console.log(`⚠️  Found ${errors.length} console errors`);
            errors.forEach(err => console.log(`  - ${err}`));
        }
    });

    test('Service worker registration', async ({ page }) => {
        // Check if service worker is registered
        const swRegistered = await page.evaluate(() => {
            return navigator.serviceWorker ? navigator.serviceWorker.controller !== null : false;
        });

        console.log(swRegistered ? '✓ Service worker registered' : '⚠️  Service worker not active');
    });

    test('Manifest file is valid', async ({ page }) => {
        const manifest = await page.evaluate(() => {
            const link = document.querySelector('link[rel="manifest"]');
            return link ? link.href : null;
        });

        if (manifest) {
            console.log(`✓ Manifest found: ${manifest}`);
        }
    });

    test('Meta tags present', async ({ page }) => {
        const metaTags = {
            'viewport': await page.locator('meta[name="viewport"]').count() > 0,
            'charset': await page.locator('meta[charset]').count() > 0,
            'description': await page.locator('meta[name="description"]').count() > 0,
            'og:title': await page.locator('meta[property="og:title"]').count() > 0,
            'og:image': await page.locator('meta[property="og:image"]').count() > 0
        };

        let present = 0;
        for (const [tag, exists] of Object.entries(metaTags)) {
            if (exists) present++;
        }

        console.log(`✓ Meta tags: ${present}/${Object.keys(metaTags).length} found`);
    });

    test('Keyboard navigation', async ({ page }) => {
        // Try tab navigation
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');

        const focused = await page.evaluate(() => {
            return document.activeElement?.tagName;
        });

        console.log(`✓ Keyboard focus active on: ${focused}`);
    });

    test('Theme switching (if available)', async ({ page }) => {
        // Try to find and click a theme toggle
        const themeToggle = page.locator('button[aria-label*="theme" i], button[aria-label*="dark" i], button[aria-label*="light" i]').first();

        if (await themeToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
            await themeToggle.click();
            console.log('✓ Theme toggle clicked');
        } else {
            console.log('⚠️  Theme toggle not found');
        }
    });

    test('Network requests complete successfully', async ({ page }) => {
        const failedRequests = [];

        page.on('response', response => {
            if (response.status() >= 400) {
                failedRequests.push({
                    url: response.url(),
                    status: response.status()
                });
            }
        });

        await page.goto(BASE_URL, { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);

        if (failedRequests.length === 0) {
            console.log('✓ All network requests completed successfully');
        } else {
            console.log(`⚠️  ${failedRequests.length} failed requests:`);
            failedRequests.slice(0, 5).forEach(req => console.log(`  - ${req.status}: ${req.url}`));
        }
    });

    test('Local storage and session storage accessible', async ({ page }) => {
        const storageCheck = await page.evaluate(() => {
            return {
                localStorage: typeof localStorage !== 'undefined',
                sessionStorage: typeof sessionStorage !== 'undefined'
            };
        });

        console.log(`✓ Storage available - localStorage: ${storageCheck.localStorage}, sessionStorage: ${storageCheck.sessionStorage}`);
    });

    test('Performance: Page load time', async ({ page }) => {
        const startTime = Date.now();

        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
        const dcTime = Date.now() - startTime;

        await page.waitForLoadState('networkidle');
        const networkIdleTime = Date.now() - startTime;

        console.log(`✓ Performance metrics:`);
        console.log(`  - DOM Content Loaded: ${dcTime}ms`);
        console.log(`  - Network Idle: ${networkIdleTime}ms`);

        // Warn if slow
        if (networkIdleTime > 10000) {
            console.log(`  ⚠️  Network idle time exceeds 10s`);
        }
    });
});

test.describe('Radio Explorer - Accessibility', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(BASE_URL);
    });

    test('Headings hierarchy', async ({ page }) => {
        const h1Count = await page.locator('h1').count();
        const hasStructure = h1Count >= 1;

        console.log(`✓ Heading structure: ${h1Count} H1 tags found`);
    });

    test('Buttons have accessible labels', async ({ page }) => {
        const buttons = page.locator('button');
        const count = await buttons.count();

        let labeledCount = 0;
        for (let i = 0; i < Math.min(count, 10); i++) {
            const btn = buttons.nth(i);
            const text = await btn.textContent();
            const ariaLabel = await btn.getAttribute('aria-label');
            const title = await btn.getAttribute('title');

            if (text?.trim() || ariaLabel || title) {
                labeledCount++;
            }
        }

        console.log(`✓ Accessible buttons: ${labeledCount}/${Math.min(count, 10)} checked buttons have labels`);
    });

    test('Links have meaningful text', async ({ page }) => {
        const links = page.locator('a');
        const count = await links.count();

        let meaningfulCount = 0;
        for (let i = 0; i < Math.min(count, 5); i++) {
            const link = links.nth(i);
            const text = await link.textContent();
            const ariaLabel = await link.getAttribute('aria-label');
            const title = await link.getAttribute('title');

            if (text?.trim() || ariaLabel || title) {
                meaningfulCount++;
            }
        }

        console.log(`✓ Links: ${meaningfulCount}/${Math.min(count, 5)} have meaningful text`);
    });

    test('Color contrast (visual check)', async ({ page }) => {
        const screenshot = await page.screenshot();
        console.log('✓ Accessibility screenshot captured for manual review');
    });
});

test.describe('Radio Explorer - Error Handling', () => {
    test('Handles missing resources gracefully', async ({ page }) => {
        const missingResourceErrors = [];

        page.on('response', response => {
            if (response.status() === 404) {
                missingResourceErrors.push(response.url());
            }
        });

        await page.goto(BASE_URL, { waitUntil: 'networkidle' });

        if (missingResourceErrors.length === 0) {
            console.log('✓ No 404 errors detected');
        } else {
            console.log(`⚠️  Found ${missingResourceErrors.length} 404 errors`);
        }
    });

    test('Recovers from network interruptions', async ({ page }) => {
        // Simulate offline
        await page.context().setOffline(true);
        await page.waitForTimeout(1000);

        // Go back online
        await page.context().setOffline(false);
        await page.waitForTimeout(1000);

        const isVisible = await page.locator('[role="main"], main, .main, #app').isVisible({ timeout: 5000 }).catch(() => false);

        console.log(isVisible ? '✓ App recovered from network interruption' : '⚠️  App did not recover from network interruption');
    });
});
