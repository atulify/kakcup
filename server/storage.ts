import { users, years, teams, fishWeights, chugTimes, golfScores, type User, type RegisterUser, type Year, type InsertYear, type Team, type InsertTeam, type InsertFishWeight, type InsertChugTime, type InsertGolfScore } from "../shared/schema.js";
import { db } from "./db.js";
import { eq, and } from "drizzle-orm";

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

  async getFishWeightsByYear(yearId: string): Promise<any[]> {
    return await db
      .select()
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
      .select()
      .from(chugTimes)
      .where(eq(chugTimes.yearId, yearId));
  }

  async createChugTime(chugTimeData: any): Promise<any> {
    // Delete existing entry for this team/year if it exists (upsert behavior)
    await db
      .delete(chugTimes)
      .where(and(
        eq(chugTimes.yearId, chugTimeData.yearId),
        eq(chugTimes.teamId, chugTimeData.teamId)
      ));

    // Insert the new entry
    const [chugTime] = await db
      .insert(chugTimes)
      .values(chugTimeData)
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
      .select()
      .from(golfScores)
      .where(eq(golfScores.yearId, yearId));
  }

  async createGolfScore(golfScoreData: any): Promise<any> {
    // Delete existing entry for this team/year if it exists (upsert behavior)
    await db
      .delete(golfScores)
      .where(and(
        eq(golfScores.yearId, golfScoreData.yearId),
        eq(golfScores.teamId, golfScoreData.teamId)
      ));

    // Insert the new entry
    const [golfScore] = await db
      .insert(golfScores)
      .values(golfScoreData)
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


}

export const storage = new DatabaseStorage();
