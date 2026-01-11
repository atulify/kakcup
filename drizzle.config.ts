import { defineConfig } from "drizzle-kit";

// Determine which database to use based on DATABASE_URL
const isPostgres = !!process.env.DATABASE_URL;

export default defineConfig({
  out: "./migrations",
  schema: isPostgres ? "./shared/schema-postgres.ts" : "./shared/schema-sqlite.ts",
  dialect: isPostgres ? "postgresql" : "sqlite",
  dbCredentials: isPostgres
    ? {
        url: process.env.DATABASE_URL!,
      }
    : {
        url: "./kakcup.db",
      },
});
