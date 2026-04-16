import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { orgs } from "./orgs";
import { users } from "./users";

export const agents = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").notNull().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdByEmail: text("created_by_email"),
    name: text("name").notNull(),
    description: text("description").default(""),
    status: text("status").notNull().default("draft"), // draft | active | archived
    version: integer("version").notNull().default(1),
    isCurrent: boolean("is_current").notNull().default(true),
    systemPrompt: text("system_prompt").notNull(),
    modelProvider: text("model_provider").notNull().default("anthropic"),
    modelId: text("model_id").notNull().default("claude-sonnet-4-6"),
    params: jsonb("params")
      .notNull()
      .default(
        sql`'{"temperature":0.2,"maxTokens":4096,"maxIterations":25,"maxCostUsd":5,"hardTimeoutMs":600000,"parallelToolCalls":true}'::jsonb`,
      ),
    mcpBindings: jsonb("mcp_bindings").notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    unique("agents_agent_id_version_unique").on(table.agentId, table.version),
    uniqueIndex("agents_agent_id_current_unique")
      .on(table.agentId)
      .where(sql`${table.isCurrent} = true`),
    index("agents_org_id_current_idx").on(table.orgId).where(sql`${table.isCurrent} = true`),
  ],
);
