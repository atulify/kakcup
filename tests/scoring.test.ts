import { describe, it, expect } from 'vitest';
import {
  calculateChugAverage,
  calculateTop3FishTotal,
  calculatePointsWithTiebreaking,
  rankFishTeams,
  rankChugTeams,
  rankGolfTeams,
  type TeamScore,
} from '../shared/scoring';

describe('Scoring Utilities', () => {
  describe('calculateChugAverage', () => {
    it('should calculate the average of two chug times', () => {
      expect(calculateChugAverage(10, 20)).toBe(15);
      expect(calculateChugAverage(5.5, 6.5)).toBe(6);
      expect(calculateChugAverage(3.25, 4.75)).toBe(4);
    });

    it('should round to 3 decimal places', () => {
      expect(calculateChugAverage(10.123, 20.456)).toBe(15.290);
      expect(calculateChugAverage(7.777, 8.888)).toBe(8.333);
      expect(calculateChugAverage(1.111, 2.222)).toBe(1.667);
    });

    it('should handle identical times', () => {
      expect(calculateChugAverage(10, 10)).toBe(10);
      expect(calculateChugAverage(5.5, 5.5)).toBe(5.5);
    });

    it('should throw error for zero or negative times', () => {
      expect(() => calculateChugAverage(0, 10)).toThrow("Chug times must be positive numbers");
      expect(() => calculateChugAverage(10, 0)).toThrow("Chug times must be positive numbers");
      expect(() => calculateChugAverage(-5, 10)).toThrow("Chug times must be positive numbers");
      expect(() => calculateChugAverage(10, -5)).toThrow("Chug times must be positive numbers");
    });

    it('should handle very small times', () => {
      expect(calculateChugAverage(0.1, 0.2)).toBe(0.15);
      expect(calculateChugAverage(0.01, 0.02)).toBe(0.015);
    });

    it('should handle very large times', () => {
      expect(calculateChugAverage(100, 200)).toBe(150);
      expect(calculateChugAverage(999.99, 1000.01)).toBe(1000);
    });
  });

  describe('calculateTop3FishTotal', () => {
    it('should sum all weights when there are exactly 3 fish', () => {
      expect(calculateTop3FishTotal([10, 20, 30])).toBe(60);
      expect(calculateTop3FishTotal([5.5, 6.5, 7.5])).toBe(19.5);
    });

    it('should sum all weights when there are fewer than 3 fish', () => {
      expect(calculateTop3FishTotal([10, 20])).toBe(30);
      expect(calculateTop3FishTotal([15])).toBe(15);
      expect(calculateTop3FishTotal([7.5, 8.5])).toBe(16);
    });

    it('should take only the top 3 weights when there are more than 3 fish', () => {
      expect(calculateTop3FishTotal([10, 20, 30, 40, 50])).toBe(120); // 50 + 40 + 30
      expect(calculateTop3FishTotal([1, 2, 3, 4, 5, 6, 7])).toBe(18); // 7 + 6 + 5
      expect(calculateTop3FishTotal([100, 1, 200, 2, 300, 3])).toBe(600); // 300 + 200 + 100
    });

    it('should return 0 for empty array', () => {
      expect(calculateTop3FishTotal([])).toBe(0);
    });

    it('should ignore zero and negative weights', () => {
      expect(calculateTop3FishTotal([10, 0, 20, -5, 30])).toBe(60); // Only 10, 20, 30
      expect(calculateTop3FishTotal([0, -1, -2])).toBe(0);
      expect(calculateTop3FishTotal([5, 0, 10])).toBe(15); // Only 5, 10
    });

    it('should handle all zero weights', () => {
      expect(calculateTop3FishTotal([0, 0, 0])).toBe(0);
    });

    it('should handle decimal weights correctly', () => {
      expect(calculateTop3FishTotal([1.5, 2.5, 3.5, 4.5])).toBe(10.5); // 4.5 + 3.5 + 2.5
      expect(calculateTop3FishTotal([10.25, 20.75])).toBe(31); // Both weights
    });

    it('should handle unsorted arrays', () => {
      expect(calculateTop3FishTotal([50, 10, 30, 20, 40])).toBe(120); // 50 + 40 + 30
      expect(calculateTop3FishTotal([3, 1, 2])).toBe(6); // 3 + 2 + 1
    });

    it('should handle single very large fish', () => {
      expect(calculateTop3FishTotal([1000])).toBe(1000);
      expect(calculateTop3FishTotal([500, 100, 50])).toBe(650);
    });
  });

  describe('calculatePointsWithTiebreaking', () => {
    it('should award points correctly with no ties', () => {
      const teams: TeamScore[] = [
        { teamId: 'team1', score: 100 },
        { teamId: 'team2', score: 90 },
        { teamId: 'team3', score: 80 },
        { teamId: 'team4', score: 70 },
      ];

      const result = calculatePointsWithTiebreaking(teams);

      expect(result).toEqual([
        { teamId: 'team1', points: 7 }, // 1st place: 8 - 1 = 7
        { teamId: 'team2', points: 6 }, // 2nd place: 8 - 2 = 6
        { teamId: 'team3', points: 5 }, // 3rd place: 8 - 3 = 5
        { teamId: 'team4', points: 4 }, // 4th place: 8 - 4 = 4
      ]);
    });

    it('should split points equally for 2-way tie', () => {
      const teams: TeamScore[] = [
        { teamId: 'team1', score: 100 },
        { teamId: 'team2', score: 90 },
        { teamId: 'team3', score: 90 }, // Tied for 2nd
        { teamId: 'team4', score: 70 },
      ];

      const result = calculatePointsWithTiebreaking(teams);

      // team2 and team3 tie for 2nd place
      // They split 2nd place (6 points) + 3rd place (5 points) = 11 points
      // Each gets 11 / 2 = 5.5 points
      expect(result).toEqual([
        { teamId: 'team1', points: 7 },
        { teamId: 'team2', points: 5.5 },
        { teamId: 'team3', points: 5.5 },
        { teamId: 'team4', points: 4 }, // Now effectively 4th
      ]);
    });

    it('should split points equally for 3-way tie', () => {
      const teams: TeamScore[] = [
        { teamId: 'team1', score: 100 },
        { teamId: 'team2', score: 90 },
        { teamId: 'team3', score: 90 },
        { teamId: 'team4', score: 90 }, // 3-way tie for 2nd
        { teamId: 'team5', score: 70 },
      ];

      const result = calculatePointsWithTiebreaking(teams);

      // team2, team3, team4 tie for 2nd place
      // They split 2nd (6) + 3rd (5) + 4th (4) = 15 points
      // Each gets 15 / 3 = 5 points
      expect(result).toEqual([
        { teamId: 'team1', points: 7 },
        { teamId: 'team2', points: 5 },
        { teamId: 'team3', points: 5 },
        { teamId: 'team4', points: 5 },
        { teamId: 'team5', points: 3 }, // Now effectively 5th (8 - 5 = 3)
      ]);
    });

    it('should handle multiple separate tie groups', () => {
      const teams: TeamScore[] = [
        { teamId: 'team1', score: 100 },
        { teamId: 'team2', score: 100 }, // Tied for 1st
        { teamId: 'team3', score: 80 },
        { teamId: 'team4', score: 70 },
        { teamId: 'team5', score: 70 }, // Tied for 4th
      ];

      const result = calculatePointsWithTiebreaking(teams);

      // team1, team2 tie for 1st: (7 + 6) / 2 = 6.5 each
      // team3 is 3rd: 5 points
      // team4, team5 tie for 4th: (4 + 3) / 2 = 3.5 each
      expect(result).toEqual([
        { teamId: 'team1', points: 6.5 },
        { teamId: 'team2', points: 6.5 },
        { teamId: 'team3', points: 5 },
        { teamId: 'team4', points: 3.5 },
        { teamId: 'team5', points: 3.5 },
      ]);
    });

    it('should handle all teams tied', () => {
      const teams: TeamScore[] = [
        { teamId: 'team1', score: 100 },
        { teamId: 'team2', score: 100 },
        { teamId: 'team3', score: 100 },
      ];

      const result = calculatePointsWithTiebreaking(teams);

      // All tied for 1st: (7 + 6 + 5) / 3 = 6 points each
      expect(result).toEqual([
        { teamId: 'team1', points: 6 },
        { teamId: 'team2', points: 6 },
        { teamId: 'team3', points: 6 },
      ]);
    });

    it('should give minimum 1 point for 8th place and beyond', () => {
      const teams: TeamScore[] = [
        { teamId: 'team1', score: 100 },
        { teamId: 'team2', score: 90 },
        { teamId: 'team3', score: 80 },
        { teamId: 'team4', score: 70 },
        { teamId: 'team5', score: 60 },
        { teamId: 'team6', score: 50 },
        { teamId: 'team7', score: 40 },
        { teamId: 'team8', score: 30 },
        { teamId: 'team9', score: 20 },
      ];

      const result = calculatePointsWithTiebreaking(teams);

      expect(result).toEqual([
        { teamId: 'team1', points: 7 }, // 8 - 1 = 7
        { teamId: 'team2', points: 6 }, // 8 - 2 = 6
        { teamId: 'team3', points: 5 }, // 8 - 3 = 5
        { teamId: 'team4', points: 4 }, // 8 - 4 = 4
        { teamId: 'team5', points: 3 }, // 8 - 5 = 3
        { teamId: 'team6', points: 2 }, // 8 - 6 = 2
        { teamId: 'team7', points: 1 }, // 8 - 7 = 1
        { teamId: 'team8', points: 1 }, // max(1, 8 - 8) = 1
        { teamId: 'team9', points: 1 }, // max(1, 8 - 9) = 1
      ]);
    });

    it('should handle tie at 7th-8th place', () => {
      const teams: TeamScore[] = [
        { teamId: 'team1', score: 100 },
        { teamId: 'team2', score: 90 },
        { teamId: 'team3', score: 80 },
        { teamId: 'team4', score: 70 },
        { teamId: 'team5', score: 60 },
        { teamId: 'team6', score: 50 },
        { teamId: 'team7', score: 40 },
        { teamId: 'team8', score: 40 }, // Tied for 7th
      ];

      const result = calculatePointsWithTiebreaking(teams);

      // team7 and team8 tie for 7th: (1 + 1) / 2 = 1 point each
      expect(result[6]).toEqual({ teamId: 'team7', points: 1 });
      expect(result[7]).toEqual({ teamId: 'team8', points: 1 });
    });

    it('should handle single team', () => {
      const teams: TeamScore[] = [
        { teamId: 'team1', score: 100 },
      ];

      const result = calculatePointsWithTiebreaking(teams);

      expect(result).toEqual([
        { teamId: 'team1', points: 7 },
      ]);
    });

    it('should handle empty array', () => {
      const teams: TeamScore[] = [];

      const result = calculatePointsWithTiebreaking(teams);

      expect(result).toEqual([]);
    });
  });

  describe('rankFishTeams', () => {
    it('should rank fish teams by total weight (higher is better)', () => {
      const teamWeights = new Map<string, number>([
        ['team1', 100],
        ['team2', 150],
        ['team3', 125],
      ]);

      const result = rankFishTeams(teamWeights);

      // team2 (150) > team3 (125) > team1 (100)
      expect(result).toEqual([
        { teamId: 'team2', points: 7 }, // 1st
        { teamId: 'team3', points: 6 }, // 2nd
        { teamId: 'team1', points: 5 }, // 3rd
      ]);
    });

    it('should handle ties in fish weights', () => {
      const teamWeights = new Map<string, number>([
        ['team1', 100],
        ['team2', 150],
        ['team3', 150], // Tied with team2
      ]);

      const result = rankFishTeams(teamWeights);

      // team2 and team3 tied at 150: (7 + 6) / 2 = 6.5 each
      expect(result).toContainEqual({ teamId: 'team2', points: 6.5 });
      expect(result).toContainEqual({ teamId: 'team3', points: 6.5 });
      expect(result).toContainEqual({ teamId: 'team1', points: 5 });
    });
  });

  describe('rankChugTeams', () => {
    it('should rank chug teams by average time (lower is better)', () => {
      const teamAverages = new Map<string, number>([
        ['team1', 10],
        ['team2', 5],
        ['team3', 7.5],
      ]);

      const result = rankChugTeams(teamAverages);

      // team2 (5) < team3 (7.5) < team1 (10) - lower is better
      expect(result).toEqual([
        { teamId: 'team2', points: 7 }, // 1st (fastest)
        { teamId: 'team3', points: 6 }, // 2nd
        { teamId: 'team1', points: 5 }, // 3rd
      ]);
    });

    it('should handle ties in chug times', () => {
      const teamAverages = new Map<string, number>([
        ['team1', 10],
        ['team2', 7.5],
        ['team3', 7.5], // Tied with team2
      ]);

      const result = rankChugTeams(teamAverages);

      // team2 and team3 tied at 7.5: (7 + 6) / 2 = 6.5 each
      expect(result).toContainEqual({ teamId: 'team2', points: 6.5 });
      expect(result).toContainEqual({ teamId: 'team3', points: 6.5 });
      expect(result).toContainEqual({ teamId: 'team1', points: 5 });
    });
  });

  describe('rankGolfTeams', () => {
    it('should rank golf teams by score (lower is better)', () => {
      const teamScores = new Map<string, number>([
        ['team1', 80],
        ['team2', 72],
        ['team3', 76],
      ]);

      const result = rankGolfTeams(teamScores);

      // team2 (72) < team3 (76) < team1 (80) - lower is better
      expect(result).toEqual([
        { teamId: 'team2', points: 7 }, // 1st (best score)
        { teamId: 'team3', points: 6 }, // 2nd
        { teamId: 'team1', points: 5 }, // 3rd
      ]);
    });

    it('should handle ties in golf scores', () => {
      const teamScores = new Map<string, number>([
        ['team1', 80],
        ['team2', 72],
        ['team3', 72], // Tied with team2
      ]);

      const result = rankGolfTeams(teamScores);

      // team2 and team3 tied at 72: (7 + 6) / 2 = 6.5 each
      expect(result).toContainEqual({ teamId: 'team2', points: 6.5 });
      expect(result).toContainEqual({ teamId: 'team3', points: 6.5 });
      expect(result).toContainEqual({ teamId: 'team1', points: 5 });
    });
  });

  describe('Integration: Complex Tiebreaking Scenarios', () => {
    it('should handle complex multi-level ties correctly', () => {
      const teams: TeamScore[] = [
        { teamId: 'team1', score: 100 },
        { teamId: 'team2', score: 100 }, // Tied for 1st
        { teamId: 'team3', score: 100 }, // Tied for 1st
        { teamId: 'team4', score: 80 },
        { teamId: 'team5', score: 70 },
        { teamId: 'team6', score: 70 }, // Tied for 5th
        { teamId: 'team7', score: 60 },
      ];

      const result = calculatePointsWithTiebreaking(teams);

      // 3-way tie for 1st: (7 + 6 + 5) / 3 = 6 points each
      expect(result[0].points).toBe(6);
      expect(result[1].points).toBe(6);
      expect(result[2].points).toBe(6);

      // team4 is 4th: 4 points
      expect(result[3]).toEqual({ teamId: 'team4', points: 4 });

      // 2-way tie for 5th: (3 + 2) / 2 = 2.5 points each
      expect(result[4].points).toBe(2.5);
      expect(result[5].points).toBe(2.5);

      // team7 is 7th: 1 point
      expect(result[6]).toEqual({ teamId: 'team7', points: 1 });
    });

    it('should verify total points are conserved with ties', () => {
      const teams: TeamScore[] = [
        { teamId: 'team1', score: 100 },
        { teamId: 'team2', score: 90 },
        { teamId: 'team3', score: 90 }, // Tied for 2nd
        { teamId: 'team4', score: 70 },
      ];

      const result = calculatePointsWithTiebreaking(teams);

      // Total points without ties: 7 + 6 + 5 + 4 = 22
      // Total points with ties should be the same
      const totalPoints = result.reduce((sum, team) => sum + team.points, 0);
      expect(totalPoints).toBe(22);
    });
  });
});
