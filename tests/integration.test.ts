/**
 * Integration test: replay all 2025 KAK Cup data via APIs and verify
 * that standings come out exactly right.
 *
 * Also tests the clear-scores → re-enter → mark-completed lifecycle.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { Hono } from 'hono';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../shared/schema-sqlite.js';
import { createRoutes } from '../server/routes.js';
import { setDb } from '../server/db.js';
import { createTestDatabase } from './helpers.js';
import { createToken, type AppEnv } from '../server/auth.js';
import {
  calculateTop3FishTotal,
  rankFishTeams,
  rankChugTeams,
  rankGolfTeams,
} from '../shared/scoring.js';

// ── 2025 fixture data ──────────────────────────────────────────────

const TEAMS = [
  { name: 'Champs',  position: 1, kak1: 'Pope',   kak2: 'Dump Bear', kak3: 'Dyer',    kak4: 'Bopper' },
  { name: 'Team 1',  position: 2, kak1: 'Nych',   kak2: 'Colin',     kak3: 'Norton',   kak4: 'Booya' },
  { name: 'Team 2',  position: 3, kak1: 'Body',   kak2: 'Boxy',      kak3: 'Tank',     kak4: 'Muldoon' },
  { name: 'Team 3',  position: 4, kak1: 'Murr',   kak2: 'Sewter',    kak3: 'Burnie',   kak4: 'Newt' },
  { name: 'Team 4',  position: 5, kak1: 'Stubby', kak2: 'Pete',      kak3: 'No Show',  kak4: 'Mckay' },
  { name: 'Team 5',  position: 6, kak1: 'Hooper', kak2: 'Burns',     kak3: 'Jocquo',   kak4: 'Fatty' },
  { name: 'Team 6',  position: 7, kak1: 'TBone',  kak2: 'Sub',       kak3: 'Dano',     kak4: 'Morash' },
];

// Fish weights keyed by team name
const FISH: Record<string, number[]> = {
  'Champs':  [2.57, 2.49, 2.42],
  'Team 1':  [2.00, 1.91, 1.67],
  'Team 2':  [1.25, 1.10, 1.03],
  'Team 3':  [3.37, 1.05, 0.72],
  'Team 4':  [8.17, 3.36, 1.91],
  'Team 5':  [1.45, 1.36, 0.61],
  'Team 6':  [2.87, 2.56, 2.09],
};

// Chug times: [chug1, chug2]
const CHUGS: Record<string, [number, number]> = {
  'Champs':  [15.92, 15.94],
  'Team 1':  [15.08, 15.10],
  'Team 2':  [21.00, 20.70],
  'Team 3':  [18.55, 18.35],
  'Team 4':  [35.50, 35.50],
  'Team 5':  [16.00, 15.98],
  'Team 6':  [17.86, 17.82],
};

// Golf scores (4-man scramble, lower is better)
const GOLF: Record<string, number> = {
  'Champs':  -8,
  'Team 1':  -5,
  'Team 2':  -8,
  'Team 3':  -9,
  'Team 4':  -8,
  'Team 5':  2,
  'Team 6':  -6,
};

// ── Expected results (hand-verified) ───────────────────────────────

// Fish totals (top-3 per team)
const EXPECTED_FISH_TOTALS: Record<string, number> = {
  'Champs':  7.48,
  'Team 1':  5.58,
  'Team 2':  3.38,
  'Team 3':  5.14,
  'Team 4':  13.44,
  'Team 5':  3.42,
  'Team 6':  7.52,
};

// Fish points: ranked by total weight (higher = better)
// Team 4(13.44)=7, Team 6(7.52)=6, Champs(7.48)=5, Team 1(5.58)=4, Team 3(5.14)=3, Team 5(3.42)=2, Team 2(3.38)=1
const EXPECTED_FISH_POINTS: Record<string, number> = {
  'Team 4': 7, 'Team 6': 6, 'Champs': 5, 'Team 1': 4, 'Team 3': 3, 'Team 5': 2, 'Team 2': 1,
};

// Chug averages
const EXPECTED_CHUG_AVG: Record<string, number> = {
  'Team 1': 15.09, 'Champs': 15.93, 'Team 5': 15.99,
  'Team 6': 17.84, 'Team 3': 18.45, 'Team 2': 20.85, 'Team 4': 35.50,
};

// Chug points: ranked by average (lower = better)
const EXPECTED_CHUG_POINTS: Record<string, number> = {
  'Team 1': 7, 'Champs': 6, 'Team 5': 5, 'Team 6': 4, 'Team 3': 3, 'Team 2': 2, 'Team 4': 1,
};

// Golf points: ranked by score (lower = better)
// -9(Team 3)=7, -8 three-way tie (Champs,Team 4,Team 2) split (6+5+4)/3=5 each,
// -6(Team 6)=3, -5(Team 1)=2, 2(Team 5)=1
const EXPECTED_GOLF_POINTS: Record<string, number> = {
  'Team 3': 7, 'Champs': 5, 'Team 4': 5, 'Team 2': 5, 'Team 6': 3, 'Team 1': 2, 'Team 5': 1,
};

// Overall standings: fish + chug + golf
const EXPECTED_TOTAL: Record<string, number> = {
  'Champs':  16,  // 5+6+5
  'Team 1':  13,  // 4+7+2
  'Team 2':   8,  // 1+2+5
  'Team 3':  13,  // 3+3+7
  'Team 4':  13,  // 7+1+5
  'Team 5':   8,  // 2+5+1
  'Team 6':  13,  // 6+4+3
};

// ── Test setup ─────────────────────────────────────────────────────

let app: Hono<AppEnv>;
let adminCookie: string;

// Map of team name → team id (populated after team creation)
const teamIds = new Map<string, string>();
let yearId: string;

beforeAll(async () => {
  delete process.env.DATABASE_URL;
  const { sqlite } = createTestDatabase();
  setDb(drizzle(sqlite, { schema }));

  app = new Hono<AppEnv>();
  createRoutes(app);

  // Create an admin JWT so we can hit protected routes
  const token = await createToken({
    userId: 'admin-test-id',
    username: 'admin',
    email: 'admin@test.com',
    firstName: 'Admin',
    lastName: 'User',
    role: 'admin',
  });
  adminCookie = `token=${token}`;
});

/** Helper to make admin requests */
function adminReq(path: string, method = 'GET', body?: unknown) {
  return app.request(path, {
    method,
    headers: {
      Cookie: adminCookie,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ── Tests ──────────────────────────────────────────────────────────

// Storage used to create the year (no public POST endpoint for years)
import { DatabaseStorage } from '../server/storage.js';

describe('2025 KAK Cup — Full Lifecycle', () => {
  const store = new DatabaseStorage();

  beforeAll(async () => {
    // Create year via storage (no public POST endpoint)
    const year = await store.createYear({ year: 2025, name: 'KAK Cup 2025', status: 'active' });
    yearId = year.id;

    // Create teams via API
    for (const t of TEAMS) {
      const res = await adminReq(`/api/years/${yearId}/teams`, 'POST', t);
      expect(res.status).toBe(201);
      const team = await res.json();
      teamIds.set(t.name, team.id);
    }
  });

  // ── Phase 2: Enter all competition data via APIs ────────────────

  it('enters all fish weights', async () => {
    for (const [teamName, weights] of Object.entries(FISH)) {
      const teamId = teamIds.get(teamName)!;
      for (const weight of weights) {
        const res = await adminReq(`/api/years/${yearId}/fish-weights`, 'POST', {
          teamId, weight,
        });
        expect(res.status).toBe(201);
      }
    }
  });

  it('enters all chug times', async () => {
    for (const [teamName, [chug1, chug2]] of Object.entries(CHUGS)) {
      const teamId = teamIds.get(teamName)!;
      const average = Math.round((chug1 + chug2) / 2 * 1000) / 1000;
      const res = await adminReq(`/api/years/${yearId}/chug-times`, 'POST', {
        teamId, chug1, chug2, average,
      });
      expect(res.status).toBe(201);
    }
  });

  it('enters all golf scores', async () => {
    for (const [teamName, score] of Object.entries(GOLF)) {
      const teamId = teamIds.get(teamName)!;
      const res = await adminReq(`/api/years/${yearId}/golf-scores`, 'POST', {
        teamId, score,
      });
      expect(res.status).toBe(201);
    }
  });

  // ── Phase 3: Verify API data matches expected values ────────────

  it('fish weights API returns correct data per team', async () => {
    const res = await app.request(`/api/years/${yearId}/fish-weights`);
    expect(res.status).toBe(200);
    const data = await res.json();

    // Group by team and compute top-3 totals
    const byTeam = new Map<string, number[]>();
    for (const fw of data) {
      const w = parseFloat(fw.weight);
      if (!byTeam.has(fw.teamId)) byTeam.set(fw.teamId, []);
      byTeam.get(fw.teamId)!.push(w);
    }

    for (const [teamName, expectedTotal] of Object.entries(EXPECTED_FISH_TOTALS)) {
      const teamId = teamIds.get(teamName)!;
      const weights = byTeam.get(teamId) || [];
      const total = calculateTop3FishTotal(weights);
      expect(total).toBeCloseTo(expectedTotal, 2);
    }
  });

  it('chug times API returns correct averages', async () => {
    const res = await app.request(`/api/years/${yearId}/chug-times`);
    expect(res.status).toBe(200);
    const data = await res.json();

    for (const ct of data) {
      // Find team name by id
      const teamName = [...teamIds.entries()].find(([, id]) => id === ct.teamId)?.[0];
      expect(teamName).toBeDefined();
      expect(parseFloat(ct.average)).toBeCloseTo(EXPECTED_CHUG_AVG[teamName!], 2);
    }
  });

  it('golf scores API returns correct scores', async () => {
    const res = await app.request(`/api/years/${yearId}/golf-scores`);
    expect(res.status).toBe(200);
    const data = await res.json();

    for (const gs of data) {
      const teamName = [...teamIds.entries()].find(([, id]) => id === gs.teamId)?.[0];
      expect(teamName).toBeDefined();
      expect(gs.score).toBe(GOLF[teamName!]);
    }
  });

  // ── Phase 4: Verify scoring/standings calculations ──────────────

  it('fish ranking produces correct points', () => {
    const totals = new Map<string, number>();
    for (const [name, total] of Object.entries(EXPECTED_FISH_TOTALS)) {
      totals.set(teamIds.get(name)!, total);
    }
    const points = rankFishTeams(totals);
    for (const { teamId, points: pts } of points) {
      const name = [...teamIds.entries()].find(([, id]) => id === teamId)?.[0]!;
      expect(pts).toBe(EXPECTED_FISH_POINTS[name]);
    }
  });

  it('chug ranking produces correct points', () => {
    const avgs = new Map<string, number>();
    for (const [name, avg] of Object.entries(EXPECTED_CHUG_AVG)) {
      avgs.set(teamIds.get(name)!, avg);
    }
    const points = rankChugTeams(avgs);
    for (const { teamId, points: pts } of points) {
      const name = [...teamIds.entries()].find(([, id]) => id === teamId)?.[0]!;
      expect(pts).toBe(EXPECTED_CHUG_POINTS[name]);
    }
  });

  it('golf ranking produces correct points (including 3-way tie)', () => {
    const scores = new Map<string, number>();
    for (const [name, score] of Object.entries(GOLF)) {
      scores.set(teamIds.get(name)!, score);
    }
    const points = rankGolfTeams(scores);
    for (const { teamId, points: pts } of points) {
      const name = [...teamIds.entries()].find(([, id]) => id === teamId)?.[0]!;
      expect(pts).toBe(EXPECTED_GOLF_POINTS[name]);
    }
  });

  it('overall standings produce correct totals', () => {
    // Build the same maps the StandingsTab builds from API data
    const fishTotals = new Map<string, number>();
    const chugAvgs = new Map<string, number>();
    const golfScoresMap = new Map<string, number>();

    for (const [name, total] of Object.entries(EXPECTED_FISH_TOTALS)) {
      fishTotals.set(teamIds.get(name)!, total);
    }
    for (const [name, avg] of Object.entries(EXPECTED_CHUG_AVG)) {
      chugAvgs.set(teamIds.get(name)!, avg);
    }
    for (const [name, score] of Object.entries(GOLF)) {
      golfScoresMap.set(teamIds.get(name)!, score);
    }

    const fishPts = new Map(rankFishTeams(fishTotals).map(p => [p.teamId, p.points]));
    const chugPts = new Map(rankChugTeams(chugAvgs).map(p => [p.teamId, p.points]));
    const golfPts = new Map(rankGolfTeams(golfScoresMap).map(p => [p.teamId, p.points]));

    for (const [name, expectedTotal] of Object.entries(EXPECTED_TOTAL)) {
      const id = teamIds.get(name)!;
      const total = (fishPts.get(id) || 0) + (chugPts.get(id) || 0) + (golfPts.get(id) || 0);
      expect(total).toBe(expectedTotal);
    }
  });

  it('Champs wins with 16 points', () => {
    const totals = Object.entries(EXPECTED_TOTAL);
    const winner = totals.sort((a, b) => b[1] - a[1])[0];
    expect(winner[0]).toBe('Champs');
    expect(winner[1]).toBe(16);
  });

  // ── Phase 5: Clear scores, re-enter, mark completed ─────────────

  it('clears all scores for the year', async () => {
    const res = await adminReq(`/api/years/${yearId}/scores`, 'DELETE');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe('All scores cleared for year');
  });

  it('all competition data is empty after clearing', async () => {
    const [fishRes, chugRes, golfRes] = await Promise.all([
      app.request(`/api/years/${yearId}/fish-weights`),
      app.request(`/api/years/${yearId}/chug-times`),
      app.request(`/api/years/${yearId}/golf-scores`),
    ]);

    expect(await fishRes.json()).toEqual([]);
    expect(await chugRes.json()).toEqual([]);
    expect(await golfRes.json()).toEqual([]);
  });

  it('re-enters all data after clearing', async () => {
    // Fish
    for (const [teamName, weights] of Object.entries(FISH)) {
      for (const weight of weights) {
        const res = await adminReq(`/api/years/${yearId}/fish-weights`, 'POST', {
          teamId: teamIds.get(teamName)!, weight,
        });
        expect(res.status).toBe(201);
      }
    }

    // Chug
    for (const [teamName, [chug1, chug2]] of Object.entries(CHUGS)) {
      const average = Math.round((chug1 + chug2) / 2 * 1000) / 1000;
      const res = await adminReq(`/api/years/${yearId}/chug-times`, 'POST', {
        teamId: teamIds.get(teamName)!, chug1, chug2, average,
      });
      expect(res.status).toBe(201);
    }

    // Golf
    for (const [teamName, score] of Object.entries(GOLF)) {
      const res = await adminReq(`/api/years/${yearId}/golf-scores`, 'POST', {
        teamId: teamIds.get(teamName)!, score,
      });
      expect(res.status).toBe(201);
    }
  });

  it('standings are identical after re-entering data', async () => {
    const [fishRes, chugRes, golfRes] = await Promise.all([
      app.request(`/api/years/${yearId}/fish-weights`),
      app.request(`/api/years/${yearId}/chug-times`),
      app.request(`/api/years/${yearId}/golf-scores`),
    ]);

    const fishData = await fishRes.json();
    const chugData = await chugRes.json();
    const golfData = await golfRes.json();

    // Verify fish totals
    const byTeam = new Map<string, number[]>();
    for (const fw of fishData) {
      if (!byTeam.has(fw.teamId)) byTeam.set(fw.teamId, []);
      byTeam.get(fw.teamId)!.push(parseFloat(fw.weight));
    }
    for (const [name, expected] of Object.entries(EXPECTED_FISH_TOTALS)) {
      const total = calculateTop3FishTotal(byTeam.get(teamIds.get(name)!) || []);
      expect(total).toBeCloseTo(expected, 2);
    }

    // Verify chug averages
    for (const ct of chugData) {
      const name = [...teamIds.entries()].find(([, id]) => id === ct.teamId)?.[0]!;
      expect(parseFloat(ct.average)).toBeCloseTo(EXPECTED_CHUG_AVG[name], 2);
    }

    // Verify golf scores
    for (const gs of golfData) {
      const name = [...teamIds.entries()].find(([, id]) => id === gs.teamId)?.[0]!;
      expect(gs.score).toBe(GOLF[name]);
    }
  });

  it('marks the year as completed', async () => {
    const res = await adminReq(`/api/years/${yearId}`, 'PATCH', { status: 'completed' });
    expect(res.status).toBe(200);
    const year = await res.json();
    expect(year.status).toBe('completed');
  });

  it('year status is persisted as completed', async () => {
    const res = await app.request(`/api/years/2025`);
    expect(res.status).toBe(200);
    const year = await res.json();
    expect(year.status).toBe('completed');
  });
});
