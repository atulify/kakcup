import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Session storage table
export const sessions = sqliteTable(
  "sessions",
  {
    sid: text("sid").primaryKey(),
    sess: text("sess").notNull(), // JSON stored as text
    expire: integer("expire", { mode: 'timestamp' }).notNull(),
  },
  (table) => ({
    expireIdx: index("IDX_session_expire").on(table.expire),
  }),
);

// User storage table with username/password authentication
export const users = sqliteTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  username: text("username").unique(),
  email: text("email").unique(),
  passwordHash: text("password_hash"),
  firstName: text("first_name"),
  lastName: text("last_name"),
  profileImageUrl: text("profile_image_url"),
  role: text("role").notNull().default("user"), // 'user' or 'admin'
  createdAt: integer("created_at", { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

export const kaks = sqliteTable("kaks", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().unique(),
  status: text("status").notNull().default("active"), // active, inactive, retired, in-memoriam
});

export const years = sqliteTable("years", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  year: integer("year").notNull().unique(),
  name: text("name").notNull(),
  status: text("status").notNull().default("upcoming"), // upcoming, active, completed
  fishing_locked: integer("fishing_locked", { mode: 'boolean' }).notNull().default(false),
  chug_locked: integer("chug_locked", { mode: 'boolean' }).notNull().default(false),
  golf_locked: integer("golf_locked", { mode: 'boolean' }).notNull().default(false),
});

export const teams = sqliteTable("teams", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  yearId: text("year_id").notNull(),
  name: text("name").notNull(),
  position: integer("position").notNull(), // 1-7 for team ordering
  kak1: text("kak1"), // member 1 name (legacy text, kept until FK backfill complete)
  kak2: text("kak2"), // member 2 name (legacy text, kept until FK backfill complete)
  kak3: text("kak3"), // member 3 name (legacy text, kept until FK backfill complete)
  kak4: text("kak4"), // member 4 name (legacy text, kept until FK backfill complete)
  kak1Id: text("kak_1").references(() => kaks.id), // FK to kaks
  kak2Id: text("kak_2").references(() => kaks.id), // FK to kaks
  kak3Id: text("kak_3").references(() => kaks.id), // FK to kaks
  kak4Id: text("kak_4").references(() => kaks.id), // FK to kaks
  locked: integer("locked", { mode: 'boolean' }).notNull().default(false), // team lock status
}, (table) => ({
  yearIdIdx: index("teams_year_id_idx").on(table.yearId),
}));

export const champs = sqliteTable("champs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  yearId: text("year_id").notNull().references(() => years.id),
  kakId: text("kak_id").notNull().references(() => kaks.id),
}, (table) => ({
  uniqueYearKak: uniqueIndex("unique_champs_year_kak").on(table.yearId, table.kakId),
}));

export const boots = sqliteTable("boots", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  yearId: text("year_id").notNull().references(() => years.id),
  kakId: text("kak_id").notNull().references(() => kaks.id),
}, (table) => ({
  uniqueYearKak: uniqueIndex("unique_boots_year_kak").on(table.yearId, table.kakId),
}));

export const tieBreakAdjustments = sqliteTable("tie_break_adjustments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  yearId: text("year_id").notNull().references(() => years.id),
  teamId: text("team_id").notNull().references(() => teams.id),
  event: text("event").notNull(), // fish | chug | golf | total
  deltaPoints: real("delta_points").notNull(),
  reason: text("reason"),
  createdBy: text("created_by").notNull().references(() => users.id),
  createdAt: integer("created_at", { mode: 'timestamp' }).$defaultFn(() => new Date()),
}, (table) => ({
  uniqueYear: uniqueIndex("unique_tie_break_year").on(table.yearId),
}));

export const fishWeights = sqliteTable("fish_weights", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  yearId: text("year_id").notNull(),
  teamId: text("team_id").notNull(),
  weight: real("weight"), // weight in pounds with decimals
  notes: text("notes"), // optional notes about the catch
}, (table) => ({
  yearTeamIdx: index("fish_weights_year_team_idx").on(table.yearId, table.teamId),
}));

export const chugTimes = sqliteTable("chug_times", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  yearId: text("year_id").notNull(),
  teamId: text("team_id").notNull(),
  chug1: real("chug_1"), // first chug time
  chug2: real("chug_2"), // second chug time
  average: real("average"), // average of chug1 and chug2
  notes: text("notes"), // optional notes about the chug
}, (table) => ({
  uniqueYearTeam: uniqueIndex("unique_chug_year_team").on(table.yearId, table.teamId),
}));

export const golfScores = sqliteTable("golf_scores", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  yearId: text("year_id").notNull(),
  teamId: text("team_id").notNull(),
  score: integer("score"), // golf score
  notes: text("notes"), // optional notes about the round
}, (table) => ({
  uniqueYearTeam: uniqueIndex("unique_golf_year_team").on(table.yearId, table.teamId),
}));

// Relations
export const kaksRelations = relations(kaks, ({ many }) => ({
  champs: many(champs),
  boots: many(boots),
}));

export const yearsRelations = relations(years, ({ many }) => ({
  teams: many(teams),
  fishWeights: many(fishWeights),
  chugTimes: many(chugTimes),
  golfScores: many(golfScores),
  champs: many(champs),
  boots: many(boots),
  tieBreakAdjustments: many(tieBreakAdjustments),
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
  year: one(years, {
    fields: [teams.yearId],
    references: [years.id],
  }),
  kakMember1: one(kaks, { fields: [teams.kak1Id], references: [kaks.id], relationName: "teamKak1" }),
  kakMember2: one(kaks, { fields: [teams.kak2Id], references: [kaks.id], relationName: "teamKak2" }),
  kakMember3: one(kaks, { fields: [teams.kak3Id], references: [kaks.id], relationName: "teamKak3" }),
  kakMember4: one(kaks, { fields: [teams.kak4Id], references: [kaks.id], relationName: "teamKak4" }),
  fishWeights: many(fishWeights),
  chugTimes: many(chugTimes),
  golfScores: many(golfScores),
  tieBreakAdjustments: many(tieBreakAdjustments),
}));

export const champsRelations = relations(champs, ({ one }) => ({
  year: one(years, { fields: [champs.yearId], references: [years.id] }),
  kak: one(kaks, { fields: [champs.kakId], references: [kaks.id] }),
}));

export const bootsRelations = relations(boots, ({ one }) => ({
  year: one(years, { fields: [boots.yearId], references: [years.id] }),
  kak: one(kaks, { fields: [boots.kakId], references: [kaks.id] }),
}));

export const tieBreakAdjustmentsRelations = relations(tieBreakAdjustments, ({ one }) => ({
  year: one(years, { fields: [tieBreakAdjustments.yearId], references: [years.id] }),
  team: one(teams, { fields: [tieBreakAdjustments.teamId], references: [teams.id] }),
  createdBy: one(users, { fields: [tieBreakAdjustments.createdBy], references: [users.id] }),
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
  chug_locked: true,
  golf_locked: true,
});

export const insertTeamSchema = createInsertSchema(teams).pick({
  yearId: true,
  name: true,
  position: true,
  kak1: true,
  kak2: true,
  kak3: true,
  kak4: true,
  kak1Id: true,
  kak2Id: true,
  kak3Id: true,
  kak4Id: true,
  locked: true,
});

export const insertKakSchema = createInsertSchema(kaks).pick({
  name: true,
  status: true,
});

export const insertChampSchema = createInsertSchema(champs).pick({
  yearId: true,
  kakId: true,
});

export const insertBootSchema = createInsertSchema(boots).pick({
  yearId: true,
  kakId: true,
});

export const insertTieBreakAdjustmentSchema = createInsertSchema(tieBreakAdjustments).pick({
  yearId: true,
  teamId: true,
  event: true,
  deltaPoints: true,
  reason: true,
  createdBy: true,
});

export type RegisterUser = z.infer<typeof registerUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertYear = z.infer<typeof insertYearSchema>;
export type Year = typeof years.$inferSelect;
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type Team = typeof teams.$inferSelect;
export type InsertKak = z.infer<typeof insertKakSchema>;
export type Kak = typeof kaks.$inferSelect;
export type InsertChamp = z.infer<typeof insertChampSchema>;
export type Champ = typeof champs.$inferSelect;
export type InsertBoot = z.infer<typeof insertBootSchema>;
export type Boot = typeof boots.$inferSelect;
export type InsertTieBreakAdjustment = z.infer<typeof insertTieBreakAdjustmentSchema>;
export type TieBreakAdjustment = typeof tieBreakAdjustments.$inferSelect;

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
