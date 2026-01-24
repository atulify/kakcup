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
export function calculatePointsWithTiebreaking(rankedTeams: TeamScore[]): TeamPoints[] {
  const result: TeamPoints[] = [];

  let currentRank = 1;
  let i = 0;

  while (i < rankedTeams.length) {
    const currentScore = rankedTeams[i].score;

    // Find all teams tied at this score
    const tiedTeams: TeamScore[] = [];
    let j = i;
    while (j < rankedTeams.length && rankedTeams[j].score === currentScore) {
      tiedTeams.push(rankedTeams[j]);
      j++;
    }

    // Calculate total points available for this tie group
    // Points formula: max(1, 8 - rank)
    // Rank 1 gets 7 points, rank 2 gets 6, ..., rank 7 gets 1, rank 8+ gets 1
    let totalPoints = 0;
    for (let rank = currentRank; rank < currentRank + tiedTeams.length; rank++) {
      totalPoints += Math.max(1, 8 - rank);
    }

    // Split points equally among tied teams
    const pointsPerTeam = totalPoints / tiedTeams.length;

    // Award points to each tied team
    tiedTeams.forEach(({ teamId }) => {
      result.push({ teamId, points: pointsPerTeam });
    });

    // Move to next rank group
    currentRank += tiedTeams.length;
    i = j;
  }

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
