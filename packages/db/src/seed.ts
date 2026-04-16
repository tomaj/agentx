import { config } from "dotenv";
config({ path: ["../../.env.local", "../../.env"] });

import { hashPassword } from "@agentx/crypto";
import { eq } from "drizzle-orm";
import { createDb } from "./client";
import { mcpServers, orgMembers, orgs, users } from "./schema/index";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://localhost:5432/agentx_dev";

async function seed() {
  const db = createDb(DATABASE_URL);

  console.log("Seeding database...");

  // 1. Create default admin user
  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, "admin@agentx.local"),
  });

  let adminUser: { id: string };

  if (existingUser) {
    adminUser = existingUser;
    console.log("  Admin user already exists");
  } else {
    const passwordHash = await hashPassword("agentx123");
    const [user] = await db
      .insert(users)
      .values({
        email: "admin@agentx.local",
        passwordHash,
        name: "Admin",
        emailVerifiedAt: new Date(),
      })
      .returning();
    adminUser = user!;
    console.log("  Created admin user: admin@agentx.local / agentx123");
  }

  // 2. Create default org
  const existingOrg = await db.query.orgs.findFirst({
    where: eq(orgs.slug, "default"),
  });

  let defaultOrg: { id: string };

  if (existingOrg) {
    defaultOrg = existingOrg;
    console.log("  Default org already exists");
  } else {
    const [org] = await db
      .insert(orgs)
      .values({
        name: "Default Organization",
        slug: "default",
        ownerId: adminUser.id,
      })
      .returning();
    defaultOrg = org!;

    await db.insert(orgMembers).values({
      orgId: defaultOrg.id,
      userId: adminUser.id,
      role: "owner",
    });
    console.log("  Created default org");
  }

  // 3. Seed MCP server catalog
  const mcpCatalog = [
    {
      slug: "filesystem",
      name: "Filesystem",
      description: "Read and write files in the agent workspace",
      transport: "stdio",
      launchConfig: {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"],
      },
      authType: "none",
      safetyTier: "write",
      requiresIsolation: true,
      isBuiltin: true,
    },
    {
      slug: "fetch",
      name: "HTTP Fetch",
      description: "Fetch content from HTTP URLs",
      transport: "stdio",
      launchConfig: { command: "npx", args: ["-y", "@modelcontextprotocol/server-fetch"] },
      authType: "none",
      safetyTier: "safe",
      requiresIsolation: false,
      isBuiltin: true,
    },
    {
      slug: "github",
      name: "GitHub",
      description: "Interact with GitHub repositories, issues, and pull requests",
      transport: "stdio",
      launchConfig: { command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] },
      authType: "static_token",
      safetyTier: "write",
      requiresIsolation: false,
      isBuiltin: true,
    },
    {
      slug: "slack",
      name: "Slack",
      description: "Send messages and interact with Slack workspaces",
      transport: "stdio",
      launchConfig: { command: "npx", args: ["-y", "@modelcontextprotocol/server-slack"] },
      authType: "static_token",
      safetyTier: "write",
      requiresIsolation: false,
      isBuiltin: true,
    },
  ];

  for (const server of mcpCatalog) {
    const existing = await db.query.mcpServers.findFirst({
      where: eq(mcpServers.slug, server.slug),
    });
    if (!existing) {
      await db.insert(mcpServers).values(server);
      console.log(`  Seeded MCP server: ${server.slug}`);
    } else {
      console.log(`  MCP server ${server.slug} already exists`);
    }
  }

  console.log("\nSeed complete!");
  console.log("Login credentials: admin@agentx.local / agentx123");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
