import { config } from "dotenv";
import type { ZodSchema } from "zod";

export function loadConfig<T>(schema: ZodSchema<T>): T {
  config({ path: [".env.local", ".env"] });
  return schema.parse(process.env);
}
