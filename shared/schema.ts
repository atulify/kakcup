// Export the appropriate schema based on the database type
// PostgreSQL is used when DATABASE_URL is set, otherwise SQLite is used

// Import both schemas
import * as sqliteSchema from "./schema-sqlite.js";
import * as postgresSchema from "./schema-postgres.js";

// Determine which schema to use
const isPostgres = !!process.env.DATABASE_URL;
const activeSchema = isPostgres ? postgresSchema : sqliteSchema;

// Re-export all exports from the active schema
export const {
  users,
  years,
  teams,
  kaks,
  champs,
  boots,
  fishWeights,
  chugTimes,
  golfScores,
  kaksRelations,
  yearsRelations,
  teamsRelations,
  champsRelations,
  bootsRelations,
  fishWeightsRelations,
  chugTimesRelations,
  golfScoresRelations,
  registerUserSchema,
  insertYearSchema,
  insertTeamSchema,
  insertKakSchema,
  insertChampSchema,
  insertBootSchema,
  insertFishWeightSchema,
  insertChugTimeSchema,
  insertGolfScoreSchema,
} = activeSchema;

// Re-export types
export type {
  RegisterUser,
  User,
  InsertYear,
  Year,
  InsertTeam,
  Team,
  InsertKak,
  Kak,
  InsertChamp,
  Champ,
  InsertBoot,
  Boot,
  InsertFishWeight,
  FishWeight,
  InsertChugTime,
  ChugTime,
  InsertGolfScore,
  GolfScore,
} from "./schema-sqlite.js"; // Types are the same for both
