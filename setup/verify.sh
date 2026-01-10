#!/bin/bash
#
# KAK Cup - Verification Script
#
# This script verifies that the KAK Cup application is running correctly
# by testing the API endpoints.
#
# Usage: ./verify.sh [host:port]
#

# Configuration
DEFAULT_HOST="localhost:3000"
HOST="${1:-$DEFAULT_HOST}"
BASE_URL="http://$HOST"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASSED=0
FAILED=0

log_pass() {
    echo -e "  ${GREEN}✓${NC} $1"
    ((PASSED++))
}

log_fail() {
    echo -e "  ${RED}✗${NC} $1"
    ((FAILED++))
}

log_info() {
    echo -e "${YELLOW}→${NC} $1"
}

# Test an endpoint
test_endpoint() {
    local name="$1"
    local endpoint="$2"
    local expected_code="${3:-200}"

    response=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$BASE_URL$endpoint" 2>/dev/null)

    if [ "$response" = "$expected_code" ]; then
        log_pass "$name (HTTP $response)"
        return 0
    else
        log_fail "$name (HTTP $response, expected $expected_code)"
        return 1
    fi
}

# Test an endpoint and validate JSON response
test_endpoint_json() {
    local name="$1"
    local endpoint="$2"
    local json_check="$3"

    response=$(curl -s --max-time 5 "$BASE_URL$endpoint" 2>/dev/null)
    http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$BASE_URL$endpoint" 2>/dev/null)

    if [ "$http_code" != "200" ]; then
        log_fail "$name (HTTP $http_code)"
        return 1
    fi

    # Check if response is valid JSON
    if ! echo "$response" | python3 -m json.tool > /dev/null 2>&1; then
        log_fail "$name (Invalid JSON response)"
        return 1
    fi

    # If a JSON check is provided, validate it
    if [ -n "$json_check" ]; then
        if echo "$response" | python3 -c "import sys, json; data = json.load(sys.stdin); $json_check" 2>/dev/null; then
            log_pass "$name"
            return 0
        else
            log_fail "$name (JSON validation failed)"
            return 1
        fi
    fi

    log_pass "$name"
    return 0
}

echo ""
echo "======================================"
echo "  KAK Cup Verification"
echo "======================================"
echo ""
echo "Testing: $BASE_URL"
echo ""

# Check if server is reachable
log_info "Checking server connectivity..."
if ! curl -s --max-time 5 "$BASE_URL" > /dev/null 2>&1; then
    echo ""
    log_fail "Cannot connect to $BASE_URL"
    echo ""
    echo -e "${RED}Server is not reachable. Make sure the application is running.${NC}"
    echo ""
    exit 1
fi
log_pass "Server is reachable"
echo ""

# Test API endpoints
log_info "Testing API endpoints..."

# Years endpoint
test_endpoint_json "GET /api/years" "/api/years" "assert isinstance(data, list)"

# Get first year info for further tests
YEAR_RESPONSE=$(curl -s --max-time 5 "$BASE_URL/api/years" 2>/dev/null)
FIRST_YEAR_ID=$(echo "$YEAR_RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data[0]['id'] if data else '')" 2>/dev/null)
FIRST_YEAR_NUM=$(echo "$YEAR_RESPONSE" | python3 -c "import sys, json; data = json.load(sys.stdin); print(data[0]['year'] if data else '')" 2>/dev/null)

if [ -n "$FIRST_YEAR_ID" ]; then
    # Test year-specific endpoints (use year number for lookup, ID for sub-routes)
    test_endpoint_json "GET /api/years/:year" "/api/years/$FIRST_YEAR_NUM" "assert 'id' in data"
    test_endpoint_json "GET /api/years/:id/teams" "/api/years/$FIRST_YEAR_ID/teams" "assert isinstance(data, list)"
    test_endpoint_json "GET /api/years/:id/fish-weights" "/api/years/$FIRST_YEAR_ID/fish-weights" "assert isinstance(data, list)"
    test_endpoint_json "GET /api/years/:id/chug-times" "/api/years/$FIRST_YEAR_ID/chug-times" "assert isinstance(data, list)"
    test_endpoint_json "GET /api/years/:id/golf-scores" "/api/years/$FIRST_YEAR_ID/golf-scores" "assert isinstance(data, list)"
else
    log_fail "Could not retrieve year ID for further tests"
fi

echo ""

# Test static content
log_info "Testing static content..."
test_endpoint "GET / (homepage)" "/" "200"

echo ""

# Test auth endpoints exist (should return 4xx without credentials, not 5xx)
log_info "Testing auth endpoints..."
auth_response=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 -X POST "$BASE_URL/api/auth/login" -H "Content-Type: application/json" -d '{}' 2>/dev/null)
if [ "$auth_response" = "400" ] || [ "$auth_response" = "401" ]; then
    log_pass "POST /api/auth/login (HTTP $auth_response - auth required)"
    ((PASSED++))
else
    log_fail "POST /api/auth/login (HTTP $auth_response)"
    ((FAILED++))
fi

echo ""
echo "======================================"
echo "  Results"
echo "======================================"
echo ""
echo -e "  Passed: ${GREEN}$PASSED${NC}"
echo -e "  Failed: ${RED}$FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}All tests passed! The application is running correctly.${NC}"
    echo ""
    exit 0
else
    echo -e "${RED}Some tests failed. Please check the application logs.${NC}"
    echo ""
    exit 1
fi
