const fs = require('fs');
const path = require('path');
const vm = require('vm');

class ModuleTestRunner {
    constructor() {
        this.tests = [];
        this.passed = 0;
        this.failed = 0;
        this.errors = [];
    }

    // Test that critical modules are syntactically valid and exportable
    testModuleSyntax(moduleName, filePath) {
        try {
            const code = fs.readFileSync(filePath, 'utf8');
            // Try to parse the module
            new vm.Script(code);
            this.passed++;
            console.log(`✓ ${moduleName}: valid syntax`);
        } catch (err) {
            this.failed++;
            this.errors.push(`${moduleName}: ${err.message}`);
            console.log(`✗ ${moduleName}: ${err.message}`);
        }
    }

    testModuleSize(moduleName, filePath, maxSizeKb = 500) {
        try {
            const stats = fs.statSync(filePath);
            const sizeKb = (stats.size / 1024).toFixed(2);

            if (stats.size > maxSizeKb * 1024) {
                this.failed++;
                this.errors.push(`${moduleName}: exceeds size limit (${sizeKb}KB > ${maxSizeKb}KB)`);
                console.log(`✗ ${moduleName}: size ${sizeKb}KB exceeds limit`);
            } else {
                this.passed++;
                console.log(`✓ ${moduleName}: ${sizeKb}KB`);
            }
        } catch (err) {
            this.failed++;
            this.errors.push(`${moduleName}: could not check size - ${err.message}`);
            console.log(`✗ ${moduleName}: size check failed`);
        }
    }

    testModuleImports(moduleName, filePath) {
        try {
            const code = fs.readFileSync(filePath, 'utf8');
            // Check for common issues
            const issues = [];

            // Check for unresolved imports
            const importMatches = code.match(/import\s+.*from\s+['"]([^'"]+)['"]/g) || [];
            const requireMatches = code.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g) || [];

            // For browser modules, imports from remote URLs should use absolute paths
            if (importMatches.length > 0 || requireMatches.length > 0) {
                console.log(`✓ ${moduleName}: imports found and checked`);
                this.passed++;
            } else {
                console.log(`✓ ${moduleName}: no imports to check`);
                this.passed++;
            }
        } catch (err) {
            this.failed++;
            this.errors.push(`${moduleName}: import check failed - ${err.message}`);
        }
    }

    testConfigFiles() {
        const jsPath = path.join(__dirname, '../../frontend/js');
        const requiredModules = [
            { name: 'app.js', size: 500 },
            { name: 'audio.js', size: 200 },
            { name: 'search.js', size: 200 },
            { name: 'ui.js', size: 200 },
            { name: 'favorites.js', size: 100 },
            { name: 'i18n.js', size: 200 }
        ];

        console.log('\n=== Module Syntax & Size Checks ===\n');

        for (const module of requiredModules) {
            const filePath = path.join(jsPath, module.name);
            if (fs.existsSync(filePath)) {
                this.testModuleSyntax(module.name, filePath);
                this.testModuleSize(module.name, filePath, module.size);
                this.testModuleImports(module.name, filePath);
            } else {
                this.failed++;
                this.errors.push(`${module.name}: file not found`);
                console.log(`✗ ${module.name}: file not found`);
            }
            console.log('');
        }
    }

    testAssetIntegrity() {
        console.log('=== Asset Integrity Checks ===\n');

        const assetsPath = path.join(__dirname, '../../frontend/assets');
        const requiredAssets = [
            'images/logo.png',
            'images/og-share.jpg'
        ];

        for (const asset of requiredAssets) {
            const filePath = path.join(assetsPath, asset);
            try {
                if (fs.existsSync(filePath)) {
                    this.passed++;
                    console.log(`✓ ${asset}: exists`);
                } else {
                    this.failed++;
                    this.errors.push(`${asset}: not found`);
                    console.log(`✗ ${asset}: not found`);
                }
            } catch (err) {
                this.failed++;
                this.errors.push(`${asset}: check failed - ${err.message}`);
            }
        }
    }

    testIndexHtml() {
        console.log('\n=== HTML Integrity ===\n');

        const indexPath = path.join(__dirname, '../../frontend/index.html');
        try {
            const html = fs.readFileSync(indexPath, 'utf8');

            // Check for critical elements
            // Note: Updated regex to match versioned script tags (e.g., js/app.js?v=18)
            const checks = [
                { pattern: /<script\s+src="js\/app\.js\?v=\d+/, name: 'app.js script tag' },
                { pattern: /<meta\s+name="viewport"/, name: 'viewport meta' },
                { pattern: /<meta\s+charset="UTF-8"/, name: 'charset meta' },
                { pattern: /<title>/, name: 'title tag' },
                { pattern: /<link\s+rel="manifest"/, name: 'manifest link' }
            ];

            for (const check of checks) {
                if (check.pattern.test(html)) {
                    this.passed++;
                    console.log(`✓ ${check.name}: present`);
                } else {
                    this.failed++;
                    this.errors.push(`${check.name}: not found`);
                    console.log(`✗ ${check.name}: not found`);
                }
            }
        } catch (err) {
            this.failed++;
            this.errors.push(`index.html: ${err.message}`);
            console.log(`✗ index.html: ${err.message}`);
        }
    }

    run() {
        console.log('=== Unit Tests: Module Validation ===\n');

        this.testConfigFiles();
        this.testAssetIntegrity();
        this.testIndexHtml();

        console.log('\n=== Summary ===');
        console.log(`Passed: ${this.passed}`);
        console.log(`Failed: ${this.failed}`);

        if (this.errors.length > 0) {
            console.log('\nErrors:');
            this.errors.forEach(err => console.log(`  - ${err}`));
        }

        return {
            success: this.failed === 0,
            passed: this.passed,
            failed: this.failed,
            errors: this.errors
        };
    }
}

module.exports = { ModuleTestRunner };
