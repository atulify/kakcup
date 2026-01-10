import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, decimal, unique, timestamp, index, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Session storage table
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table with username/password authentication
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: varchar("username").unique(),
  email: varchar("email").unique(),
  passwordHash: varchar("password_hash"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role").notNull().default("user"), // 'user' or 'admin'
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const years = pgTable("years", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  year: integer("year").notNull().unique(),
  name: text("name").notNull(),
  status: text("status").notNull().default("upcoming"), // upcoming, active, completed
  fishing_locked: boolean("fishing_locked").notNull().default(false),
});

export const teams = pgTable("teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  yearId: varchar("year_id").notNull(),
  name: text("name").notNull(),
  position: integer("position").notNull(), // 1-7 for team ordering
  kak1: text("kak1"), // member 1 name
  kak2: text("kak2"), // member 2 name  
  kak3: text("kak3"), // member 3 name
  kak4: text("kak4"), // member 4 name
  locked: boolean("locked").notNull().default(false), // team lock status
});

export const fishWeights = pgTable("fish_weights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  yearId: varchar("year_id").notNull(),
  teamId: varchar("team_id").notNull(),
  weight: decimal("weight", { precision: 10, scale: 2 }), // weight in pounds with decimals
  notes: text("notes"), // optional notes about the catch
});

export const chugTimes = pgTable("chug_times", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  yearId: varchar("year_id").notNull(),
  teamId: varchar("team_id").notNull(),
  chug1: decimal("chug_1", { precision: 10, scale: 2 }), // first chug time
  chug2: decimal("chug_2", { precision: 10, scale: 2 }), // second chug time
  average: decimal("average", { precision: 10, scale: 3 }), // average of chug1 and chug2
  notes: text("notes"), // optional notes about the chug
}, (table) => ({
  uniqueYearTeam: unique().on(table.yearId, table.teamId),
}));

export const golfScores = pgTable("golf_scores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  yearId: varchar("year_id").notNull(),
  teamId: varchar("team_id").notNull(),
  score: integer("score"), // golf score
  notes: text("notes"), // optional notes about the round
}, (table) => ({
  uniqueYearTeam: unique().on(table.yearId, table.teamId),
}));

// Relations
export const yearsRelations = relations(years, ({ many }) => ({
  teams: many(teams),
  fishWeights: many(fishWeights),
  chugTimes: many(chugTimes),
  golfScores: many(golfScores),
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
  year: one(years, {
    fields: [teams.yearId],
    references: [years.id],
  }),
  fishWeights: many(fishWeights),
  chugTimes: many(chugTimes),
  golfScores: many(golfScores),
}));

export const fishWeightsRelations = relations(fishWeights, ({ one }) => ({
  year: one(years, {
    fields: [fishWeights.yearId],
    references: [years.id],
  }),
  team: one(teams, {
    fields: [fishWeights.teamId],
    references: [teams.id],
  }),
}));

export const chugTimesRelations = relations(chugTimes, ({ one }) => ({
  year: one(years, {
    fields: [chugTimes.yearId],
    references: [years.id],
  }),
  team: one(teams, {
    fields: [chugTimes.teamId],
    references: [teams.id],
  }),
}));

export const golfScoresRelations = relations(golfScores, ({ one }) => ({
  year: one(years, {
    fields: [golfScores.yearId],
    references: [years.id],
  }),
  team: one(teams, {
    fields: [golfScores.teamId],
    references: [teams.id],
  }),
}));



// User schema for registration
export const registerUserSchema = createInsertSchema(users).pick({
  username: true,
  email: true,
  passwordHash: true,
  firstName: true,
  lastName: true,
});

export const insertYearSchema = createInsertSchema(years).omit({
  id: true,
  fishing_locked: true,
});

export const insertTeamSchema = createInsertSchema(teams).pick({
  yearId: true,
  name: true,
  position: true,
  kak1: true,
  kak2: true,
  kak3: true,
  kak4: true,
  locked: true,
});

export type RegisterUser = z.infer<typeof registerUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertYear = z.infer<typeof insertYearSchema>;
export type Year = typeof years.$inferSelect;
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Team = typeof teams.$inferSelect;

export const insertFishWeightSchema = createInsertSchema(fishWeights).pick({
  yearId: true,
  teamId: true,
  weight: true,
  notes: true,
});
export type InsertFishWeight = z.infer<typeof insertFishWeightSchema>;
export type FishWeight = typeof fishWeights.$inferSelect;

export const insertChugTimeSchema = createInsertSchema(chugTimes).pick({
  yearId: true,
  teamId: true,
  chug1: true,
  chug2: true,
  notes: true,
});
export type InsertChugTime = z.infer<typeof insertChugTimeSchema>;
export type ChugTime = typeof chugTimes.$inferSelect;

export const insertGolfScoreSchema = createInsertSchema(golfScores).pick({
  yearId: true,
  teamId: true,
  score: true,
  notes: true,
});
export type InsertGolfScore = z.infer<typeof insertGolfScoreSchema>;
export type GolfScore = typeof golfScores.$inferSelect;
