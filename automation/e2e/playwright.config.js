const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
    testDir: __dirname,
    testMatch: 'tests.js',
    timeout: 30 * 1000,
    expect: {
        timeout: 5000
    },
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: [
        ['html', { outputFolder: '../reports/e2e-report' }],
        ['json', { outputFile: '../reports/e2e-results.json' }],
        ['list']
    ],
    use: {
        baseURL: process.env.BASE_URL || 'http://localhost:3000',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure'
    },
    webServer: process.env.BASE_URL ? undefined : {
        command: 'python3 -m http.server 3000 --directory ../../frontend',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] }
        },
        {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] }
        },
        {
            name: 'webkit',
            use: { ...devices['Desktop Safari'] }
        },
        {
            name: 'mobile-chrome',
            use: { ...devices['Pixel 5'] }
        },
        {
            name: 'mobile-safari',
            use: { ...devices['iPhone 12'] }
        }
    ]
});
