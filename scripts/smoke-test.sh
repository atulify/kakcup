#!/bin/bash
set -e

# Smoke test script for KAK Cup application
# Usage: ./smoke-test.sh [URL]

URL=${1:-https://kak-cup.vercel.app}
FAILED=0

echo "🧪 Running smoke tests against: $URL"
echo "================================================"

# Helper function to test endpoint
test_endpoint() {
  local name=$1
  local endpoint=$2
  local expected_status=${3:-200}

  echo -n "Testing $name... "

  response=$(curl -s -o /dev/null -w "%{http_code}" "$URL$endpoint")

  if [ "$response" -eq "$expected_status" ]; then
    echo "✅ ($response)"
  else
    echo "❌ Expected $expected_status, got $response"
    FAILED=1
  fi
}

# Frontend routes
echo ""
echo "Frontend Routes:"
test_endpoint "Homepage" "/"
test_endpoint "Year page (2025)" "/year/2025"
test_endpoint "Login page" "/login"

# API endpoints
echo ""
echo "API Endpoints:"
test_endpoint "Get all years" "/api/years"
test_endpoint "Get specific year (2025)" "/api/years/2025"

# Get a year ID from the API to test nested routes
YEAR_ID=$(curl -s "$URL/api/years" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -n "$YEAR_ID" ]; then
  echo ""
  echo "Nested API Routes (using year ID: $YEAR_ID):"
  test_endpoint "Get teams for year" "/api/years/$YEAR_ID/teams"
  test_endpoint "Get fish weights for year" "/api/years/$YEAR_ID/fish-weights"
  test_endpoint "Get chug times for year" "/api/years/$YEAR_ID/chug-times"
  test_endpoint "Get golf scores for year" "/api/years/$YEAR_ID/golf-scores"
else
  echo "⚠️  No years found in database, skipping nested route tests"
fi

# Summary
echo ""
echo "================================================"
if [ $FAILED -eq 0 ]; then
  echo "✅ All smoke tests passed!"
  exit 0
else
  echo "❌ Some tests failed!"
  exit 1
fi
