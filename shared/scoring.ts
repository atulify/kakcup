/**
 * Shared scoring utilities for KAK Cup competitions
 * These functions handle the core business logic for calculating scores and rankings
 */

/**
 * Calculate the average of two chug times
 * @param chug1 - First chug time in seconds
 * @param chug2 - Second chug time in seconds
 * @returns Average time rounded to 3 decimal places
 */
export function calculateChugAverage(chug1: number, chug2: number): number {
  if (chug1 <= 0 || chug2 <= 0) {
    throw new Error("Chug times must be positive numbers");
  }
  return Math.round((chug1 + chug2) / 2 * 1000) / 1000;
}

/**
 * Calculate total weight from fish weights, taking only the top 3
 * If there are fewer than 3 fish, uses all available weights
 * @param weights - Array of fish weights
 * @returns Sum of top 3 weights (or all weights if fewer than 3)
 */
export function calculateTop3FishTotal(weights: number[]): number {
  if (weights.length === 0) {
    return 0;
  }

  // Filter out non-positive weights
  const validWeights = weights.filter(w => w > 0);

  if (validWeights.length === 0) {
    return 0;
  }

  // Sort descending and take top 3
  const top3 = validWeights.sort((a, b) => b - a).slice(0, 3);

  // Sum the top 3 weights
  return top3.reduce((sum, weight) => sum + weight, 0);
}

/**
 * Represents a team with their score for ranking
 */
export interface TeamScore {
  teamId: string;
  score: number;
}

/**
 * Represents points awarded to a team
 */
export interface TeamPoints {
  teamId: string;
  points: number;
}

class TP implements TeamPoints {
  constructor(public teamId: string, public points: number) {}
}

/**
 * Calculate points for ranked teams with tiebreaking
 * Teams are ranked by score (higher is better for fish, lower is better for chug/golf)
 * Points are awarded: 7 for 1st, 6 for 2nd, 5 for 3rd, etc., down to 1 point
 * When teams tie, they split the points equally
 *
 * Example: If 3 teams tie for 2nd place, they share (6 + 5 + 4) = 15 points
 * Each tied team gets 15 / 3 = 5 points
 *
 * @param rankedTeams - Teams already sorted by their score (best to worst)
 * @returns Array of team IDs with their awarded points
 */
// Direct points-per-rank lookup: extended to 16 to avoid bounds checks
// rank 1→7, rank 2→6, ..., rank 7→1, rank 8+→1
const RANK_POINTS = [0, 7, 6, 5, 4, 3, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1];
// Prefix sums extended: POINTS_PREFIX[n] = sum of points for ranks 1..n
// For ranks > 7, each rank contributes 1 point
const POINTS_PREFIX = [0, 7, 13, 18, 22, 25, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36];

export function calculatePointsWithTiebreaking(rankedTeams: TeamScore[]): TeamPoints[] {
  const len = rankedTeams.length;
  if (len === 0) return [];
  if (len === 1) return [new TP(rankedTeams[0].teamId, 7)];

  const result = new Array<TeamPoints>(len);
  let currentRank = 1;
  let i = 0;

  do {
    const team = rankedTeams[i];
    const currentScore = team.score;

    // Count ties — cache next element to reduce indexed access
    let j = i + 1;
    if (j < len && rankedTeams[j].score === currentScore) {
      // Has at least one tie — continue counting
      j++;
      while (j < len && rankedTeams[j].score === currentScore) {
        j++;
      }
      // Tie path: use extended prefix sums
      const tieCount = j - i;
      const endRank = currentRank + tieCount - 1;
      const pointsPerTeam = (POINTS_PREFIX[endRank] - POINTS_PREFIX[currentRank - 1]) / tieCount;
      for (let k = i; k < j; k++) {
        result[k] = new TP(rankedTeams[k].teamId, pointsPerTeam);
      }
      currentRank = endRank + 1;
    } else {
      // No tie — direct lookup, no division
      result[i] = new TP(team.teamId, RANK_POINTS[currentRank]);
      currentRank++;
    }

    i = j;
  } while (i < len);

  return result;
}

/**
 * Rank teams by score for fish competition (higher weight is better)
 * @param teamWeights - Map of team ID to total fish weight
 * @returns Array of teams with points awarded
 */
export function rankFishTeams(teamWeights: Map<string, number>): TeamPoints[] {
  const rankedTeams = Array.from(teamWeights.entries())
    .map(([teamId, score]) => ({ teamId, score }))
    .sort((a, b) => b.score - a.score); // Higher score is better

  return calculatePointsWithTiebreaking(rankedTeams);
}

/**
 * Rank teams by chug average time (lower time is better)
 * @param teamAverages - Map of team ID to average chug time
 * @returns Array of teams with points awarded
 */
export function rankChugTeams(teamAverages: Map<string, number>): TeamPoints[] {
  const rankedTeams = Array.from(teamAverages.entries())
    .map(([teamId, score]) => ({ teamId, score }))
    .sort((a, b) => a.score - b.score); // Lower score is better

  return calculatePointsWithTiebreaking(rankedTeams);
}

/**
 * Rank teams by golf score (lower score is better)
 * @param teamScores - Map of team ID to golf score
 * @returns Array of teams with points awarded
 */
export function rankGolfTeams(teamScores: Map<string, number>): TeamPoints[] {
  const rankedTeams = Array.from(teamScores.entries())
    .map(([teamId, score]) => ({ teamId, score }))
    .sort((a, b) => a.score - b.score); // Lower score is better

  return calculatePointsWithTiebreaking(rankedTeams);
}
