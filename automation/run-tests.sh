#!/bin/bash

# Radio Explorer Test Automation Launcher
# This script provides a convenient way to run the test suite

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Functions
print_header() {
    echo -e "${CYAN}╔════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║  Radio Explorer - Test Automation 🎙️  ║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════╝${NC}"
    echo ""
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

print_warn() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

show_usage() {
    echo "Usage: ./run-tests.sh [options]"
    echo ""
    echo "Options:"
    echo "  all              Run all tests (default)"
    echo "  data             Run data validation only"
    echo "  unit             Run unit tests only"
    echo "  e2e              Run E2E tests only"
    echo "  stations         Run station health checks only"
    echo "  fast             Run all tests except E2E"
    echo "  setup            Install dependencies"
    echo "  clean            Remove reports and dependencies"
    echo "  help             Show this help message"
    echo ""
    echo "Examples:"
    echo "  ./run-tests.sh           # Run all tests"
    echo "  ./run-tests.sh fast      # Quick test (no E2E)"
    echo "  ./run-tests.sh data      # Just data validation"
    echo ""
}

check_node() {
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        echo "Please install Node.js 18+ from https://nodejs.org/"
        exit 1
    fi

    local node_version=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$node_version" -lt 18 ]; then
        print_error "Node.js 18+ required (you have $(node -v))"
        exit 1
    fi

    print_success "Node.js $(node -v) detected"
}

setup_automation() {
    print_info "Setting up automation suite..."
    cd "$SCRIPT_DIR"
    npm install
    print_success "Automation setup complete"
}

run_all_tests() {
    print_info "Running all tests..."
    cd "$SCRIPT_DIR"
    node run-all-tests.js "$@"
}

run_fast_tests() {
    print_info "Running tests (E2E skipped)..."
    cd "$SCRIPT_DIR"
    node run-all-tests.js --skip-e2e
}

run_data_tests() {
    print_info "Running data validation..."
    cd "$SCRIPT_DIR"
    npm run test:data
}

run_unit_tests() {
    print_info "Running unit tests..."
    cd "$SCRIPT_DIR"
    npm run test:unit
}

run_e2e_tests() {
    print_info "Running E2E tests..."
    cd "$SCRIPT_DIR"
    npm run test:e2e
}

run_station_tests() {
    print_info "Running station health checks..."
    cd "$SCRIPT_DIR"
    npm run test:stations
}

clean_suite() {
    print_info "Cleaning up..."
    cd "$SCRIPT_DIR"
    rm -rf node_modules reports .playwright test-results
    print_success "Cleanup complete"
}

show_report() {
    local report="$SCRIPT_DIR/reports/test-report.html"
    if [ -f "$report" ]; then
        print_success "Test report generated"
        echo ""
        echo "Reports available at:"
        echo "  HTML:  $report"
        echo "  JSON:  $SCRIPT_DIR/reports/test-report.json"
        echo ""
        if command -v open &> /dev/null; then
            echo "Opening report in browser..."
            open "$report"
        else
            print_info "View the HTML report in your browser: file://$report"
        fi
    fi
}

# Main
print_header

check_node

# Handle arguments
case "${1:-all}" in
    all)
        run_all_tests
        ;;
    fast)
        run_fast_tests
        ;;
    data)
        run_data_tests
        ;;
    unit)
        run_unit_tests
        ;;
    e2e)
        run_e2e_tests
        ;;
    stations)
        run_station_tests
        ;;
    setup)
        setup_automation
        ;;
    clean)
        clean_suite
        ;;
    help|-h|--help)
        show_usage
        ;;
    *)
        print_error "Unknown command: $1"
        echo ""
        show_usage
        exit 1
        ;;
esac

# Show report if available
show_report

print_success "Done!"
