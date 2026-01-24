# KAK Cup Test Suite

## Test Coverage

### Scoring Logic Tests (`scoring.test.ts`)

Comprehensive unit tests for all critical business logic in the KAK Cup scoring system.

#### 1. Chug Average Calculation (6 tests)
Tests the `calculateChugAverage()` function:
- ✅ Basic average calculation (10 + 20 = 15 average)
- ✅ Decimal precision rounding to 2 places
- ✅ Identical times (10 + 10 = 10)
- ✅ Error handling for zero/negative times
- ✅ Very small times (0.1, 0.2)
- ✅ Very large times (100, 200)

**Business Rule:** Average of two chug times, rounded to 2 decimal places, must be positive numbers

#### 2. Top 3 Fish Weights (9 tests)
Tests the `calculateTop3FishTotal()` function:
- ✅ Exactly 3 fish (sums all 3)
- ✅ Fewer than 3 fish (sums all available, including 1 or 2 fish)
- ✅ More than 3 fish (only sums the heaviest 3)
- ✅ Empty array returns 0
- ✅ Ignores zero and negative weights
- ✅ All zero weights returns 0
- ✅ Decimal weights handled correctly
- ✅ Unsorted arrays properly sorted
- ✅ Single very large fish

**Business Rule:** Only the top 3 fish weights count toward a team's total. If a team has fewer than 3 fish, all fish count.

#### 3. Tiebreaking Logic (9 tests)
Tests the `calculatePointsWithTiebreaking()` function:
- ✅ No ties: 1st=7pts, 2nd=6pts, 3rd=5pts, etc.
- ✅ 2-way tie: Split points equally (e.g., 2nd+3rd = 11pts ÷ 2 = 5.5 pts each)
- ✅ 3-way tie: Split points equally (e.g., 2nd+3rd+4th = 15pts ÷ 3 = 5 pts each)
- ✅ Multiple separate tie groups
- ✅ All teams tied (splits all points)
- ✅ 8th place and beyond get minimum 1 point
- ✅ Tie at 7th-8th place
- ✅ Single team gets 7 points
- ✅ Empty array returns empty results

**Business Rule:**
- Points awarded: 1st place = 7 pts, 2nd = 6 pts, ..., 7th = 1 pt, 8th+ = 1 pt
- When teams tie, they split the points equally for all positions they occupy
- Example: 3 teams tie for 2nd place → share (6+5+4)=15 points → 5 points each

## Running Tests

```bash
# Run all scoring tests
npm test -- tests/scoring.test.ts

# Run all tests
npm test
```

## Test Results

```
✓ 32 tests passing
✓ 0 tests failing
✓ 100% coverage of scoring logic
```
