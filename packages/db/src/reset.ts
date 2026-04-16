import { config } from "dotenv";
config({ path: ["../../.env.local", "../../.env"] });

import postgres from "postgres";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://localhost:5432/agentx_dev";

async function reset() {
  console.log("Resetting database...");
  const sql = postgres(DATABASE_URL);
  await sql`DROP SCHEMA IF EXISTS drizzle CASCADE`;
  await sql`DROP SCHEMA IF EXISTS public CASCADE`;
  await sql`CREATE SCHEMA public`;
  await sql`GRANT ALL ON SCHEMA public TO public`;
  await sql.end();
  console.log("Database reset. Run pnpm db:migrate && pnpm db:seed to recreate.");
  process.exit(0);
}

reset().catch((err) => {
  console.error("Reset failed:", err);
  process.exit(1);
});
