const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class StationHealthCheck {
    constructor() {
        this.report = null;
        this.summary = {};
    }

    run(options = {}) {
        console.log('=== Station Health Check ===\n');

        const concurrency = options.concurrency || 40;
        const timeout = options.timeout || 8000;
        const onlyEnabled = options.onlyEnabled || false;

        const stationTestsPath = path.join(__dirname, '../station-health/check-stations.js');

        if (!fs.existsSync(stationTestsPath)) {
            console.log('✗ Station tests script not found');
            return { success: false };
        }

        try {
            console.log(`Running station health checks (concurrency=${concurrency}, timeout=${timeout}ms)...\n`);

            const args = [];
            if (concurrency) args.push(`--concurrency=${concurrency}`);
            if (timeout) args.push(`--timeout=${timeout}`);
            if (onlyEnabled) args.push('--only-enabled');

            execSync(`node ${stationTestsPath} ${args.join(' ')}`, {
                stdio: 'inherit',
                cwd: path.dirname(stationTestsPath)
            });

            // Read the generated report
            const reportPath = path.join(__dirname, '../station-health/report.json');
            if (fs.existsSync(reportPath)) {
                this.report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
                this.summary = this.report.summary;

                console.log('\n=== Station Health Summary ===');
                console.log(`Total Tested: ${this.summary.totalTested}`);
                console.log(`Working: ${this.summary.working}`);
                console.log(`Broken: ${this.summary.broken}`);
                console.log(`Broken but Enabled (needs fix): ${this.summary.brokenButMarkedEnabled}`);
                console.log(`Duration: ${this.summary.durationSeconds}s`);

                return {
                    success: this.summary.brokenButMarkedEnabled === 0,
                    summary: this.summary,
                    report: this.report
                };
            }

            return { success: false };
        } catch (err) {
            console.error(`\nStation health check failed: ${err.message}`);
            return { success: false, error: err.message };
        }
    }
}

module.exports = { StationHealthCheck };
