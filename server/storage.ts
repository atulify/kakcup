import { users, years, teams, kaks, champs, boots, tieBreakAdjustments, fishWeights, chugTimes, golfScores, type User, type RegisterUser, type Year, type InsertYear, type Team, type InsertTeam, type Kak, type InsertKak, type InsertTieBreakAdjustment, type TieBreakAdjustment, type InsertFishWeight, type InsertChugTime, type InsertGolfScore } from "../shared/schema.js";
import { db } from "./db.js";
import { eq, and, count, desc } from "drizzle-orm";

export interface KakStatRow {
  kakId: string;
  name: string;
  total: number;
}

export interface YearResult {
  year: number;
  champs: string[];
  boots: string[];
}

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(userData: RegisterUser & { role?: string }): Promise<User>;
  // Year operations
  getYear(year: number): Promise<Year | undefined>;
  getYearById(id: string): Promise<Year | undefined>;
  getYears(): Promise<Year[]>;
  createYear(year: InsertYear): Promise<Year>;
  updateYear(id: string, year: Partial<Year>): Promise<Year>;
  // Team operations
  getTeamsByYear(yearId: string): Promise<Team[]>;
  createTeam(team: InsertTeam): Promise<Team>;
  updateTeam(id: string, team: Partial<InsertTeam>): Promise<Team>;
  // KAK operations
  getKaks(status?: string): Promise<Kak[]>;
  createKak(kak: InsertKak): Promise<Kak>;
  updateKak(id: string, kak: Partial<InsertKak>): Promise<Kak>;
  getKakStats(): Promise<{ champs: KakStatRow[]; boots: KakStatRow[] }>;
  getYearResults(): Promise<YearResult[]>;
  setChampsAndBoots(yearId: string, champKakIds: string[], bootKakIds: string[]): Promise<void>;
  getTieBreakAdjustmentsByYear(yearId: string): Promise<TieBreakAdjustment[]>;
  createTieBreakAdjustment(adjustment: InsertTieBreakAdjustment): Promise<TieBreakAdjustment>;
  deleteTieBreakAdjustmentsByYear(yearId: string): Promise<void>;
  // Competition operations
  getFishWeightsByYear(yearId: string): Promise<any[]>;
  createFishWeight(fishWeight: any): Promise<any>;
  deleteFishWeightsByTeam(yearId: string, teamId: string): Promise<void>;
  getChugTimesByYear(yearId: string): Promise<any[]>;
  createChugTime(chugTime: any): Promise<any>;
  deleteChugTime(yearId: string, teamId: string): Promise<void>;
  getGolfScoresByYear(yearId: string): Promise<any[]>;
  createGolfScore(golfScore: any): Promise<any>;
  deleteGolfScore(yearId: string, teamId: string): Promise<void>;
  deleteAllFishWeightsByYear(yearId: string): Promise<void>;
  deleteAllChugTimesByYear(yearId: string): Promise<void>;
  deleteAllGolfScoresByYear(yearId: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(userData: RegisterUser & { role?: string }): Promise<User> {
    const [user] = await db
      .insert(users)
      .values({
        ...userData,
        role: userData.role || 'user',
      })
      .returning();
    return user;
  }

  async getYear(year: number): Promise<Year | undefined> {
    const [yearRecord] = await db.select().from(years).where(eq(years.year, year));
    return yearRecord || undefined;
  }

  async getYearById(id: string): Promise<Year | undefined> {
    try {
      const [yearRecord] = await db.select().from(years).where(eq(years.id, id));
      return yearRecord || undefined;
    } catch (error) {
      console.error("Error in getYearById:", error);
      return undefined;
    }
  }

  async getYears(): Promise<Year[]> {
    return await db.select().from(years);
  }

  async createYear(insertYear: InsertYear): Promise<Year> {
    const [year] = await db
      .insert(years)
      .values(insertYear)
      .returning();
    return year;
  }

  async updateYear(id: string, yearData: Partial<Year>): Promise<Year> {
    const [year] = await db
      .update(years)
      .set(yearData)
      .where(eq(years.id, id))
      .returning();
    return year;
  }

  async getTeamsByYear(yearId: string): Promise<Team[]> {
    return await db.select().from(teams).where(eq(teams.yearId, yearId));
  }

  async createTeam(insertTeam: InsertTeam): Promise<Team> {
    const [team] = await db
      .insert(teams)
      .values(insertTeam)
      .returning();
    return team;
  }

  async updateTeam(id: string, teamData: Partial<InsertTeam>): Promise<Team> {
    const [team] = await db
      .update(teams)
      .set(teamData)
      .where(eq(teams.id, id))
      .returning();
    return team;
  }

  async getKaks(status?: string): Promise<Kak[]> {
    if (status) {
      return await db.select().from(kaks).where(eq(kaks.status, status));
    }
    return await db.select().from(kaks);
  }

  async createKak(kakData: InsertKak): Promise<Kak> {
    const [kak] = await db.insert(kaks).values(kakData).returning();
    return kak;
  }

  async updateKak(id: string, kakData: Partial<InsertKak>): Promise<Kak> {
    const [kak] = await db.update(kaks).set(kakData).where(eq(kaks.id, id)).returning();
    return kak;
  }

  async getKakStats(): Promise<{ champs: KakStatRow[]; boots: KakStatRow[] }> {
    const [champData, bootData] = await Promise.all([
      db
        .select({ kakId: champs.kakId, name: kaks.name, total: count() })
        .from(champs)
        .innerJoin(kaks, eq(kaks.id, champs.kakId))
        .groupBy(champs.kakId, kaks.name),
      db
        .select({ kakId: boots.kakId, name: kaks.name, total: count() })
        .from(boots)
        .innerJoin(kaks, eq(kaks.id, boots.kakId))
        .groupBy(boots.kakId, kaks.name),
    ]);

    return {
      champs: champData.sort((a: KakStatRow, b: KakStatRow) => b.total - a.total),
      boots: bootData.sort((a: KakStatRow, b: KakStatRow) => b.total - a.total),
    };
  }

  async getYearResults(): Promise<YearResult[]> {
    const [champRows, bootRows] = await Promise.all([
      db.select({ year: years.year, name: kaks.name })
        .from(champs)
        .innerJoin(years, eq(years.id, champs.yearId))
        .innerJoin(kaks, eq(kaks.id, champs.kakId)),
      db.select({ year: years.year, name: kaks.name })
        .from(boots)
        .innerJoin(years, eq(years.id, boots.yearId))
        .innerJoin(kaks, eq(kaks.id, boots.kakId)),
    ]);

    const yearMap = new Map<number, { champs: string[]; boots: string[] }>();
    for (const r of champRows) {
      if (!yearMap.has(r.year)) yearMap.set(r.year, { champs: [], boots: [] });
      yearMap.get(r.year)!.champs.push(r.name);
    }
    for (const r of bootRows) {
      if (!yearMap.has(r.year)) yearMap.set(r.year, { champs: [], boots: [] });
      yearMap.get(r.year)!.boots.push(r.name);
    }

    return Array.from(yearMap.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([year, data]) => ({
        year,
        champs: data.champs.sort(),
        boots: data.boots.sort(),
      }));
  }

  async setChampsAndBoots(yearId: string, champKakIds: string[], bootKakIds: string[]): Promise<void> {
    // Clear existing entries for the year (idempotent)
    await Promise.all([
      db.delete(champs).where(eq(champs.yearId, yearId)),
      db.delete(boots).where(eq(boots.yearId, yearId)),
    ]);

    if (champKakIds.length > 0) {
      await db.insert(champs).values(
        champKakIds.map(kakId => ({ yearId, kakId }))
      ).onConflictDoNothing();
    }

    if (bootKakIds.length > 0) {
      await db.insert(boots).values(
        bootKakIds.map(kakId => ({ yearId, kakId }))
      ).onConflictDoNothing();
    }
  }

  async getTieBreakAdjustmentsByYear(yearId: string): Promise<TieBreakAdjustment[]> {
    return await db
      .select()
      .from(tieBreakAdjustments)
      .where(eq(tieBreakAdjustments.yearId, yearId));
  }

  async createTieBreakAdjustment(adjustment: InsertTieBreakAdjustment): Promise<TieBreakAdjustment> {
    const [row] = await db
      .insert(tieBreakAdjustments)
      .values(adjustment)
      .returning();
    return row;
  }

  async deleteTieBreakAdjustmentsByYear(yearId: string): Promise<void> {
    await db.delete(tieBreakAdjustments).where(eq(tieBreakAdjustments.yearId, yearId));
  }

  async getFishWeightsByYear(yearId: string): Promise<any[]> {
    return await db
      .select({ teamId: fishWeights.teamId, weight: fishWeights.weight })
      .from(fishWeights)
      .where(eq(fishWeights.yearId, yearId));
  }

  async createFishWeight(fishWeightData: any): Promise<any> {
    const [fishWeight] = await db
      .insert(fishWeights)
      .values(fishWeightData)
      .returning();
    return fishWeight;
  }

  async deleteFishWeightsByTeam(yearId: string, teamId: string): Promise<void> {
    await db
      .delete(fishWeights)
      .where(and(
        eq(fishWeights.yearId, yearId),
        eq(fishWeights.teamId, teamId)
      ));
  }

  async getChugTimesByYear(yearId: string): Promise<any[]> {
    return await db
      .select({
        teamId: chugTimes.teamId,
        chug1: chugTimes.chug1,
        chug2: chugTimes.chug2,
        average: chugTimes.average,
      })
      .from(chugTimes)
      .where(eq(chugTimes.yearId, yearId));
  }

  async createChugTime(chugTimeData: any): Promise<any> {
    const [chugTime] = await db
      .insert(chugTimes)
      .values(chugTimeData)
      .onConflictDoUpdate({
        target: [chugTimes.yearId, chugTimes.teamId],
        set: {
          chug1: chugTimeData.chug1,
          chug2: chugTimeData.chug2,
          average: chugTimeData.average,
          notes: chugTimeData.notes,
        },
      })
      .returning();
    return chugTime;
  }

  async deleteChugTime(yearId: string, teamId: string): Promise<void> {
    await db
      .delete(chugTimes)
      .where(and(
        eq(chugTimes.yearId, yearId),
        eq(chugTimes.teamId, teamId)
      ));
  }

  async getGolfScoresByYear(yearId: string): Promise<any[]> {
    return await db
      .select({ teamId: golfScores.teamId, score: golfScores.score })
      .from(golfScores)
      .where(eq(golfScores.yearId, yearId));
  }

  async createGolfScore(golfScoreData: any): Promise<any> {
    const [golfScore] = await db
      .insert(golfScores)
      .values(golfScoreData)
      .onConflictDoUpdate({
        target: [golfScores.yearId, golfScores.teamId],
        set: {
          score: golfScoreData.score,
          notes: golfScoreData.notes,
        },
      })
      .returning();
    return golfScore;
  }

  async deleteGolfScore(yearId: string, teamId: string): Promise<void> {
    await db
      .delete(golfScores)
      .where(and(
        eq(golfScores.yearId, yearId),
        eq(golfScores.teamId, teamId)
      ));
  }

  async deleteAllFishWeightsByYear(yearId: string): Promise<void> {
    await db.delete(fishWeights).where(eq(fishWeights.yearId, yearId));
  }

  async deleteAllChugTimesByYear(yearId: string): Promise<void> {
    await db.delete(chugTimes).where(eq(chugTimes.yearId, yearId));
  }

  async deleteAllGolfScoresByYear(yearId: string): Promise<void> {
    await db.delete(golfScores).where(eq(golfScores.yearId, yearId));
  }
}

export const storage = new DatabaseStorage();
