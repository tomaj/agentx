import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { agents } from "./agents";
import { users } from "./users";

export const executions = pgTable(
  "executions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id").notNull(), // logical agent
    agentSnapshotId: uuid("agent_snapshot_id")
      .notNull()
      .references(() => agents.id),
    triggerType: text("trigger_type").notNull().default("manual"), // http | chat | cron | manual
    status: text("status").notNull().default("queued"), // queued | running | succeeded | failed | cancelled
    initiatedBy: uuid("initiated_by").references(() => users.id, { onDelete: "set null" }),
    input: jsonb("input"),
    output: jsonb("output"),
    error: jsonb("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }),
    totalPromptTokens: integer("total_prompt_tokens").notNull().default(0),
    totalCompletionTokens: integer("total_completion_tokens").notNull().default(0),
    totalCostUsd: numeric("total_cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("executions_agent_started_idx").on(table.agentId, table.startedAt)],
);

export const executionEvents = pgTable(
  "execution_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    executionId: uuid("execution_id")
      .notNull()
      .references(() => executions.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
  },
  (table) => [index("execution_events_exec_seq_idx").on(table.executionId, table.seq)],
);
