import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Campos camelCase no TS viram snake_case no banco automaticamente.
  casing: "snake_case",
  verbose: true,
  strict: true,
});
