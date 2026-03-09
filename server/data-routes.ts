// Edge-compatible — no bcryptjs in this import chain.
import type { Context, Hono, MiddlewareHandler } from "hono";
import { storage } from "./storage.js";
import { isAdmin, type AppEnv } from "./auth.js";
import { cached, cacheKeys, invalidate } from "./cache.js";
import {
  calculateTop3FishTotal,
  rankFishTeams,
  rankChugTeams,
  rankGolfTeams,
} from "../shared/scoring.js";

/** FNV-1a 32-bit hash — fast, non-cryptographic, perfect for ETags. */
export function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16);
}

/** Return JSON with ETag; responds 304 if the client already has it. */
function jsonWithEtag(c: Context, data: unknown) {
  const body = JSON.stringify(data);
  const etag = `"${fnv1a(body)}"`;

  if (c.req.header("if-none-match") === etag) {
    return c.body(null, 304);
  }
  c.header("ETag", etag);
  c.header("Content-Type", "application/json");
  return c.body(body);
}

// Fetches the year record once and caches it in c.var for the handler.
const requireYear: MiddlewareHandler<AppEnv> = async (c, next) => {
  try {
    const year = await storage.getYearById(c.req.param("yearId")!);
    if (!year) return c.json({ error: "Year not found" }, 404);
    c.set("year", year);
    await next();
  } catch {
    return c.json({ error: "Failed to fetch year" }, 500);
  }
};

export function createDataRoutes(app: Hono<AppEnv>): void {
  // Year routes
  app.get("/api/years", async (c) => {
    try {
      const years = await cached(cacheKeys.years, () => storage.getYears());
      return jsonWithEtag(c, years);
    } catch {
      return c.json({ error: "Failed to fetch years" }, 500);
    }
  });

  app.get("/api/years/:year", async (c) => {
    try {
      const yearParam = c.req.param("year");
      const year = parseInt(yearParam);

      if (isNaN(year)) {
        const yearRecord = await storage.getYearById(yearParam);
        if (!yearRecord) return c.json({ error: "Year not found" }, 404);
        return jsonWithEtag(c, yearRecord);
      }

      const yearRecord = await storage.getYear(year);
      if (!yearRecord) return c.json({ error: "Year not found" }, 404);
      return jsonWithEtag(c, yearRecord);
    } catch (error) {
      console.error("Error fetching year:", error);
      return c.json({ error: "Failed to fetch year" }, 500);
    }
  });

  app.post("/api/years", isAdmin, async (c) => {
    try {
      const years = await storage.getYears();
      if (years.length === 0) {
        return c.json({ error: "No existing years found" }, 400);
      }
      const maxYear = Math.max(...years.map((y) => y.year));
      const nextYear = maxYear + 1;
      const year = await storage.createYear({
        year: nextYear,
        name: `${nextYear} KAK Cup`,
        status: "upcoming",
      });
      await invalidate(cacheKeys.years);
      return c.json(year, 201);
    } catch {
      return c.json({ error: "Failed to create year" }, 500);
    }
  });

  app.patch("/api/years/:yearId", isAdmin, async (c) => {
    try {
      const yearId = c.req.param("yearId");
      const yearData = await c.req.json();

      // When marking a year as completed, validate all events are locked
      // then calculate and persist champs/boots.
      if (yearData.status === "completed") {
        const current = await storage.getYearById(yearId);
        if (!current) return c.json({ error: "Year not found" }, 404);

        const allLocked =
          (yearData.fishing_locked ?? current.fishing_locked) &&
          (yearData.chug_locked ?? current.chug_locked) &&
          (yearData.golf_locked ?? current.golf_locked);

        if (!allLocked) {
          return c.json(
            { error: "All three events must be locked before marking the year as completed." },
            400
          );
        }
      }

      const year = await storage.updateYear(yearId, yearData);

      // After a successful transition to completed, calculate and store champs/boots
      if (year.status === "completed") {
        await calculateAndStoreChampsBoots(year.id);
        await invalidate(cacheKeys.kakStats);
      }

      await invalidate(cacheKeys.years);
      return c.json(year);
    } catch {
      return c.json({ error: "Failed to update year" }, 500);
    }
  });

  // Team routes
  app.get("/api/years/:yearId/teams", async (c) => {
    try {
      const yearId = c.req.param("yearId");
      const teams = await cached(cacheKeys.teams(yearId), () =>
        storage.getTeamsByYear(yearId)
      );
      return jsonWithEtag(c, teams);
    } catch {
      return c.json({ error: "Failed to fetch teams" }, 500);
    }
  });

  app.post("/api/years/:yearId/teams", isAdmin, async (c) => {
    try {
      const yearId = c.req.param("yearId");
      const teamData = await c.req.json();
      teamData.yearId = yearId;
      const team = await storage.createTeam(teamData);
      await invalidate(cacheKeys.teams(yearId));
      return c.json(team, 201);
    } catch {
      return c.json({ error: "Failed to create team" }, 500);
    }
  });

  app.put("/api/teams/:teamId", isAdmin, async (c) => {
    try {
      const teamData = await c.req.json();
      const team = await storage.updateTeam(c.req.param("teamId"), teamData);
      await invalidate(cacheKeys.teams(team.yearId));
      return c.json(team);
    } catch {
      return c.json({ error: "Failed to update team" }, 500);
    }
  });

  // Fish weights routes
  app.get("/api/years/:yearId/fish-weights", async (c) => {
    try {
      const yearId = c.req.param("yearId");
      const fishWeights = await cached(cacheKeys.fishWeights(yearId), () =>
        storage.getFishWeightsByYear(yearId)
      );
      return jsonWithEtag(c, fishWeights);
    } catch {
      return c.json({ error: "Failed to fetch fish weights" }, 500);
    }
  });

  app.post("/api/years/:yearId/fish-weights", isAdmin, requireYear, async (c) => {
    try {
      if (c.var.year!.fishing_locked) {
        return c.json({ error: "Fishing competition is locked. No more weights can be added." }, 403);
      }
      const yearId = c.req.param("yearId");
      const weightData = await c.req.json();
      weightData.yearId = yearId;
      const fishWeight = await storage.createFishWeight(weightData);
      await invalidate(cacheKeys.fishWeights(yearId));
      return c.json(fishWeight, 201);
    } catch {
      return c.json({ error: "Failed to create fish weight" }, 500);
    }
  });

  app.delete("/api/years/:yearId/teams/:teamId/fish-weights", isAdmin, requireYear, async (c) => {
    try {
      if (c.var.year!.fishing_locked) {
        return c.json({ error: "Fishing competition is locked. Cannot delete weights." }, 403);
      }
      const yearId = c.req.param("yearId");
      await storage.deleteFishWeightsByTeam(yearId, c.req.param("teamId"));
      await invalidate(cacheKeys.fishWeights(yearId));
      return c.json({ message: "Fish weights deleted successfully" });
    } catch {
      return c.json({ error: "Failed to delete fish weights" }, 500);
    }
  });

  // Chug times routes
  app.get("/api/years/:yearId/chug-times", async (c) => {
    try {
      const yearId = c.req.param("yearId");
      const chugTimes = await cached(cacheKeys.chugTimes(yearId), () =>
        storage.getChugTimesByYear(yearId)
      );
      return jsonWithEtag(c, chugTimes);
    } catch {
      return c.json({ error: "Failed to fetch chug times" }, 500);
    }
  });

  app.post("/api/years/:yearId/chug-times", isAdmin, requireYear, async (c) => {
    try {
      if (c.var.year!.chug_locked) {
        return c.json({ error: "Chug competition is locked. No more times can be added." }, 403);
      }
      const yearId = c.req.param("yearId");
      const chugData = await c.req.json();
      chugData.yearId = yearId;
      const chugTime = await storage.createChugTime(chugData);
      await invalidate(cacheKeys.chugTimes(yearId));
      return c.json(chugTime, 201);
    } catch {
      return c.json({ error: "Failed to create chug time" }, 500);
    }
  });

  app.delete("/api/years/:yearId/teams/:teamId/chug-times", isAdmin, requireYear, async (c) => {
    try {
      if (c.var.year!.chug_locked) {
        return c.json({ error: "Chug competition is locked. Cannot delete times." }, 403);
      }
      const yearId = c.req.param("yearId");
      await storage.deleteChugTime(yearId, c.req.param("teamId"));
      await invalidate(cacheKeys.chugTimes(yearId));
      return c.json({ message: "Chug time deleted successfully" });
    } catch {
      return c.json({ error: "Failed to delete chug time" }, 500);
    }
  });

  // Golf scores routes
  app.get("/api/years/:yearId/golf-scores", async (c) => {
    try {
      const yearId = c.req.param("yearId");
      const golfScores = await cached(cacheKeys.golfScores(yearId), () =>
        storage.getGolfScoresByYear(yearId)
      );
      return jsonWithEtag(c, golfScores);
    } catch {
      return c.json({ error: "Failed to fetch golf scores" }, 500);
    }
  });

  app.post("/api/years/:yearId/golf-scores", isAdmin, requireYear, async (c) => {
    try {
      if (c.var.year!.golf_locked) {
        return c.json({ error: "Golf competition is locked. No more scores can be added." }, 403);
      }
      const yearId = c.req.param("yearId");
      const golfData = await c.req.json();
      golfData.yearId = yearId;
      const golfScore = await storage.createGolfScore(golfData);
      await invalidate(cacheKeys.golfScores(yearId));
      return c.json(golfScore, 201);
    } catch {
      return c.json({ error: "Failed to create golf score" }, 500);
    }
  });

  app.delete("/api/years/:yearId/scores", isAdmin, requireYear, async (c) => {
    try {
      const yearId = c.req.param("yearId");
      await Promise.all([
        storage.deleteAllFishWeightsByYear(yearId),
        storage.deleteAllChugTimesByYear(yearId),
        storage.deleteAllGolfScoresByYear(yearId),
      ]);
      await invalidate(
        cacheKeys.fishWeights(yearId),
        cacheKeys.chugTimes(yearId),
        cacheKeys.golfScores(yearId),
        cacheKeys.years,
      );
      return c.json({ message: "All scores cleared for year" });
    } catch {
      return c.json({ error: "Failed to clear scores" }, 500);
    }
  });

  app.delete("/api/years/:yearId/teams/:teamId/golf-scores", isAdmin, requireYear, async (c) => {
    try {
      if (c.var.year!.golf_locked) {
        return c.json({ error: "Golf competition is locked. Cannot delete scores." }, 403);
      }
      const yearId = c.req.param("yearId");
      await storage.deleteGolfScore(yearId, c.req.param("teamId"));
      await invalidate(cacheKeys.golfScores(yearId));
      return c.json({ message: "Golf score deleted successfully" });
    } catch {
      return c.json({ error: "Failed to delete golf score" }, 500);
    }
  });

  // KAK routes
  app.get("/api/kaks", async (c) => {
    try {
      const status = c.req.query("status");
      const kakList = await cached(
        status ? `${cacheKeys.kaks}:${status}` : cacheKeys.kaks,
        () => storage.getKaks(status)
      );
      return jsonWithEtag(c, kakList);
    } catch {
      return c.json({ error: "Failed to fetch KAKs" }, 500);
    }
  });

  app.post("/api/kaks", isAdmin, async (c) => {
    try {
      const kakData = await c.req.json();
      if (!kakData.name) return c.json({ error: "name is required" }, 400);
      const kak = await storage.createKak(kakData);
      await invalidate(cacheKeys.kaks, `${cacheKeys.kaks}:active`);
      return c.json(kak, 201);
    } catch (err: any) {
      if (err?.message?.toLowerCase().includes("unique")) {
        return c.json({ error: "A KAK with that name already exists" }, 409);
      }
      return c.json({ error: "Failed to create KAK" }, 500);
    }
  });

  app.patch("/api/kaks/:kakId", isAdmin, async (c) => {
    try {
      const kakData = await c.req.json();
      const kak = await storage.updateKak(c.req.param("kakId"), kakData);
      if (!kak) return c.json({ error: "KAK not found" }, 404);
      await invalidate(cacheKeys.kaks, `${cacheKeys.kaks}:active`);
      return c.json(kak);
    } catch (err: any) {
      if (err?.message?.toLowerCase().includes("unique")) {
        return c.json({ error: "A KAK with that name already exists" }, 409);
      }
      return c.json({ error: "Failed to update KAK" }, 500);
    }
  });

  app.get("/api/kak-stats", async (c) => {
    try {
      const stats = await cached(cacheKeys.kakStats, () => storage.getKakStats());
      return jsonWithEtag(c, stats);
    } catch {
      return c.json({ error: "Failed to fetch KAK stats" }, 500);
    }
  });
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/** Calculates standings for a year and writes champs + boots entries. */
async function calculateAndStoreChampsBoots(yearId: string): Promise<void> {
  const [allTeams, fishData, chugData, golfData] = await Promise.all([
    storage.getTeamsByYear(yearId),
    storage.getFishWeightsByYear(yearId),
    storage.getChugTimesByYear(yearId),
    storage.getGolfScoresByYear(yearId),
  ]);

  // Build fish totals (top 3 per team)
  const fishByTeam = new Map<string, number[]>();
  for (const fw of fishData) {
    if (!fishByTeam.has(fw.teamId)) fishByTeam.set(fw.teamId, []);
    fishByTeam.get(fw.teamId)!.push(parseFloat(fw.weight));
  }

  const chugAverages = new Map<string, number>();
  for (const ct of chugData) {
    chugAverages.set(ct.teamId, parseFloat(ct.average));
  }

  const golfScoresMap = new Map<string, number>();
  for (const gs of golfData) {
    golfScoresMap.set(gs.teamId, gs.score);
  }

  // Only score teams that have all three competition results
  const completeTeams = allTeams.filter(
    t => chugAverages.has(t.id) && golfScoresMap.has(t.id)
  );
  if (completeTeams.length === 0) return;

  const fishTotals = new Map(
    completeTeams.map(t => [t.id, calculateTop3FishTotal(fishByTeam.get(t.id) ?? [])])
  );

  const fishPoints = rankFishTeams(fishTotals);
  const chugPoints = rankChugTeams(new Map(completeTeams.map(t => [t.id, chugAverages.get(t.id)!])));
  const golfPoints = rankGolfTeams(new Map(completeTeams.map(t => [t.id, golfScoresMap.get(t.id)!])));

  // Sum totals
  const totalPoints = new Map<string, number>();
  for (const team of completeTeams) {
    const fish = fishPoints.find(p => p.teamId === team.id)?.points ?? 0;
    const chug = chugPoints.find(p => p.teamId === team.id)?.points ?? 0;
    const golf = golfPoints.find(p => p.teamId === team.id)?.points ?? 0;
    totalPoints.set(team.id, fish + chug + golf);
  }

  const maxPts = Math.max(...totalPoints.values());
  const minPts = Math.min(...totalPoints.values());

  const champKakIds: string[] = [];
  const bootKakIds: string[] = [];

  for (const team of completeTeams) {
    const pts = totalPoints.get(team.id) ?? 0;
    const kakIds = [team.kak1Id, team.kak2Id, team.kak3Id, team.kak4Id].filter(Boolean) as string[];
    if (pts === maxPts) champKakIds.push(...kakIds);
    if (pts === minPts) bootKakIds.push(...kakIds);
  }

  await storage.setChampsAndBoots(yearId, champKakIds, bootKakIds);
}
