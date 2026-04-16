import { sql } from "drizzle-orm";
import { boolean, customType, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverParam: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const mcpServers = pgTable("mcp_servers", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").default(""),
  transport: text("transport").notNull().default("stdio"), // stdio | http | sse
  launchConfig: jsonb("launch_config").notNull().default(sql`'{}'::jsonb`),
  authType: text("auth_type").notNull().default("none"), // none | static_token | oauth2
  authConfig: jsonb("auth_config"),
  safetyTier: text("safety_tier").notNull().default("safe"), // safe | write | destructive
  requiresIsolation: boolean("requires_isolation").notNull().default(false),
  isBuiltin: boolean("is_builtin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const mcpCredentials = pgTable("mcp_credentials", {
  id: uuid("id").primaryKey().defaultRandom(),
  mcpServerId: uuid("mcp_server_id")
    .notNull()
    .references(() => mcpServers.id),
  ownerType: text("owner_type").notNull().default("user"), // user | org
  ownerId: uuid("owner_id").notNull(),
  label: text("label").notNull(),
  credentialType: text("credential_type").notNull().default("static_token"), // static_token | oauth2
  encryptedPayload: bytea("encrypted_payload").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
