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
      toolsCatalog: [
        {
          name: "read_file",
          description: "Read the complete contents of a file from the file system",
          inputSchema: {
            type: "object",
            properties: { path: { type: "string", description: "Path to the file to read" } },
            required: ["path"],
          },
        },
        {
          name: "read_multiple_files",
          description: "Read the contents of multiple files simultaneously",
          inputSchema: {
            type: "object",
            properties: {
              paths: {
                type: "array",
                items: { type: "string" },
                description: "List of file paths to read",
              },
            },
            required: ["paths"],
          },
        },
        {
          name: "write_file",
          description: "Create a new file or completely overwrite an existing file",
          inputSchema: {
            type: "object",
            properties: {
              path: { type: "string", description: "Path where to write the file" },
              content: { type: "string", description: "Content to write to the file" },
            },
            required: ["path", "content"],
          },
        },
        {
          name: "edit_file",
          description: "Make line-based edits to a text file using search and replace",
          inputSchema: {
            type: "object",
            properties: {
              path: { type: "string", description: "Path to the file to edit" },
              edits: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    oldText: { type: "string" },
                    newText: { type: "string" },
                  },
                  required: ["oldText", "newText"],
                },
              },
            },
            required: ["path", "edits"],
          },
        },
        {
          name: "list_directory",
          description: "List files and directories in a given path",
          inputSchema: {
            type: "object",
            properties: {
              path: { type: "string", description: "Path of the directory to list" },
            },
            required: ["path"],
          },
        },
        {
          name: "directory_tree",
          description: "Get a recursive tree view of files and directories",
          inputSchema: {
            type: "object",
            properties: {
              path: { type: "string", description: "Root path for the tree" },
            },
            required: ["path"],
          },
        },
        {
          name: "search_files",
          description: "Recursively search for files matching a pattern",
          inputSchema: {
            type: "object",
            properties: {
              path: { type: "string", description: "Starting path for the search" },
              pattern: { type: "string", description: "Search pattern (regex)" },
            },
            required: ["path", "pattern"],
          },
        },
        {
          name: "get_file_info",
          description: "Retrieve metadata about a file or directory",
          inputSchema: {
            type: "object",
            properties: {
              path: { type: "string", description: "Path to the file or directory" },
            },
            required: ["path"],
          },
        },
        {
          name: "move_file",
          description: "Move or rename files and directories",
          inputSchema: {
            type: "object",
            properties: {
              source: { type: "string", description: "Source path" },
              destination: { type: "string", description: "Destination path" },
            },
            required: ["source", "destination"],
          },
        },
      ],
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
      toolsCatalog: [
        {
          name: "fetch",
          description:
            "Fetches a URL from the internet and returns the content. Handles HTML by converting to markdown.",
          inputSchema: {
            type: "object",
            properties: {
              url: { type: "string", description: "URL to fetch" },
              maxLength: {
                type: "number",
                description: "Maximum number of characters to return (default 5000)",
              },
              startIndex: {
                type: "number",
                description: "Start index for pagination (default 0)",
              },
              raw: {
                type: "boolean",
                description: "Get raw content without markdown conversion",
              },
            },
            required: ["url"],
          },
        },
      ],
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
      toolsCatalog: [
        {
          name: "create_or_update_file",
          description: "Create or update a single file in a repository",
          inputSchema: {
            type: "object",
            properties: {
              owner: { type: "string" },
              repo: { type: "string" },
              path: { type: "string" },
              content: { type: "string" },
              message: { type: "string", description: "Commit message" },
              branch: { type: "string" },
            },
            required: ["owner", "repo", "path", "content", "message", "branch"],
          },
        },
        {
          name: "search_repositories",
          description: "Search for GitHub repositories",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string" },
              page: { type: "number" },
              perPage: { type: "number" },
            },
            required: ["query"],
          },
        },
        {
          name: "create_issue",
          description: "Create a new issue in a repository",
          inputSchema: {
            type: "object",
            properties: {
              owner: { type: "string" },
              repo: { type: "string" },
              title: { type: "string" },
              body: { type: "string" },
              labels: { type: "array", items: { type: "string" } },
              assignees: { type: "array", items: { type: "string" } },
            },
            required: ["owner", "repo", "title"],
          },
        },
        {
          name: "create_pull_request",
          description: "Create a new pull request",
          inputSchema: {
            type: "object",
            properties: {
              owner: { type: "string" },
              repo: { type: "string" },
              title: { type: "string" },
              body: { type: "string" },
              head: { type: "string" },
              base: { type: "string" },
            },
            required: ["owner", "repo", "title", "head", "base"],
          },
        },
        {
          name: "list_issues",
          description: "List issues in a repository with filtering options",
          inputSchema: {
            type: "object",
            properties: {
              owner: { type: "string" },
              repo: { type: "string" },
              state: { type: "string", description: "open, closed, or all" },
              labels: { type: "string", description: "Comma-separated label names" },
              page: { type: "number" },
              perPage: { type: "number" },
            },
            required: ["owner", "repo"],
          },
        },
        {
          name: "get_issue",
          description: "Get details of a specific issue",
          inputSchema: {
            type: "object",
            properties: {
              owner: { type: "string" },
              repo: { type: "string" },
              issue_number: { type: "number" },
            },
            required: ["owner", "repo", "issue_number"],
          },
        },
        {
          name: "add_issue_comment",
          description: "Add a comment to an issue or pull request",
          inputSchema: {
            type: "object",
            properties: {
              owner: { type: "string" },
              repo: { type: "string" },
              issue_number: { type: "number" },
              body: { type: "string" },
            },
            required: ["owner", "repo", "issue_number", "body"],
          },
        },
        {
          name: "list_commits",
          description: "List commits in a repository branch",
          inputSchema: {
            type: "object",
            properties: {
              owner: { type: "string" },
              repo: { type: "string" },
              sha: { type: "string", description: "Branch name or commit SHA" },
              page: { type: "number" },
              perPage: { type: "number" },
            },
            required: ["owner", "repo"],
          },
        },
        {
          name: "get_file_contents",
          description: "Get the contents of a file or directory from a repository",
          inputSchema: {
            type: "object",
            properties: {
              owner: { type: "string" },
              repo: { type: "string" },
              path: { type: "string" },
              branch: { type: "string" },
            },
            required: ["owner", "repo", "path"],
          },
        },
        {
          name: "push_files",
          description: "Push multiple files to a repository in a single commit",
          inputSchema: {
            type: "object",
            properties: {
              owner: { type: "string" },
              repo: { type: "string" },
              branch: { type: "string" },
              message: { type: "string" },
              files: {
                type: "array",
                items: {
                  type: "object",
                  properties: { path: { type: "string" }, content: { type: "string" } },
                },
              },
            },
            required: ["owner", "repo", "branch", "message", "files"],
          },
        },
      ],
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
      toolsCatalog: [
        {
          name: "list_channels",
          description: "List public channels in the Slack workspace",
          inputSchema: {
            type: "object",
            properties: {
              limit: { type: "number", description: "Max channels to return (default 100)" },
              cursor: { type: "string", description: "Pagination cursor" },
            },
          },
        },
        {
          name: "post_message",
          description: "Post a message to a Slack channel",
          inputSchema: {
            type: "object",
            properties: {
              channel: { type: "string", description: "Channel ID" },
              text: { type: "string", description: "Message text" },
            },
            required: ["channel", "text"],
          },
        },
        {
          name: "reply_to_thread",
          description: "Reply to a specific message thread in Slack",
          inputSchema: {
            type: "object",
            properties: {
              channel: { type: "string", description: "Channel ID" },
              thread_ts: { type: "string", description: "Thread timestamp" },
              text: { type: "string", description: "Reply text" },
            },
            required: ["channel", "thread_ts", "text"],
          },
        },
        {
          name: "add_reaction",
          description: "Add an emoji reaction to a message",
          inputSchema: {
            type: "object",
            properties: {
              channel: { type: "string" },
              timestamp: { type: "string" },
              name: { type: "string", description: "Emoji name without colons" },
            },
            required: ["channel", "timestamp", "name"],
          },
        },
        {
          name: "get_channel_history",
          description: "Get recent messages from a channel",
          inputSchema: {
            type: "object",
            properties: {
              channel: { type: "string", description: "Channel ID" },
              limit: { type: "number", description: "Max messages to return (default 10)" },
            },
            required: ["channel"],
          },
        },
        {
          name: "get_thread_replies",
          description: "Get all replies in a message thread",
          inputSchema: {
            type: "object",
            properties: {
              channel: { type: "string" },
              thread_ts: { type: "string" },
            },
            required: ["channel", "thread_ts"],
          },
        },
        {
          name: "search_messages",
          description: "Search for messages in the workspace",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string", description: "Search query" },
              count: { type: "number", description: "Number of results (default 5)" },
            },
            required: ["query"],
          },
        },
        {
          name: "get_users",
          description: "List users in the workspace",
          inputSchema: {
            type: "object",
            properties: {
              limit: { type: "number", description: "Max users to return (default 100)" },
              cursor: { type: "string" },
            },
          },
        },
        {
          name: "get_user_profile",
          description: "Get detailed profile information for a user",
          inputSchema: {
            type: "object",
            properties: {
              user_id: { type: "string", description: "Slack user ID" },
            },
            required: ["user_id"],
          },
        },
      ],
    },
    {
      slug: "linear",
      name: "Linear",
      description: "Manage issues, projects, and teams in Linear project management",
      transport: "stdio",
      launchConfig: { command: "npx", args: ["-y", "@linear/mcp-server"] },
      authType: "static_token",
      safetyTier: "write",
      requiresIsolation: false,
      isBuiltin: true,
      toolsCatalog: [
        {
          name: "list_issues",
          description: "List issues with optional filters for team, status, assignee, and labels",
          inputSchema: {
            type: "object",
            properties: {
              teamId: { type: "string", description: "Filter by team ID" },
              status: { type: "string", description: "Filter by status name" },
              assigneeId: { type: "string", description: "Filter by assignee ID" },
              labels: {
                type: "array",
                items: { type: "string" },
                description: "Filter by label names",
              },
              limit: { type: "number", description: "Max results (default 50)" },
            },
          },
        },
        {
          name: "get_issue",
          description: "Get detailed information about a specific issue by ID or identifier",
          inputSchema: {
            type: "object",
            properties: {
              issueId: { type: "string", description: "Issue ID or identifier (e.g. ENG-123)" },
            },
            required: ["issueId"],
          },
        },
        {
          name: "create_issue",
          description: "Create a new issue in Linear",
          inputSchema: {
            type: "object",
            properties: {
              title: { type: "string", description: "Issue title" },
              description: { type: "string", description: "Issue description (markdown)" },
              teamId: { type: "string", description: "Team ID to create the issue in" },
              assigneeId: { type: "string", description: "Assignee user ID" },
              priority: {
                type: "number",
                description: "Priority: 0=none, 1=urgent, 2=high, 3=medium, 4=low",
              },
              labelIds: {
                type: "array",
                items: { type: "string" },
                description: "Label IDs to apply",
              },
              projectId: { type: "string", description: "Project ID" },
              cycleId: { type: "string", description: "Cycle ID" },
            },
            required: ["title", "teamId"],
          },
        },
        {
          name: "update_issue",
          description: "Update an existing issue's properties",
          inputSchema: {
            type: "object",
            properties: {
              issueId: { type: "string", description: "Issue ID or identifier" },
              title: { type: "string" },
              description: { type: "string" },
              status: { type: "string", description: "Status name to transition to" },
              assigneeId: { type: "string" },
              priority: { type: "number" },
              labelIds: { type: "array", items: { type: "string" } },
            },
            required: ["issueId"],
          },
        },
        {
          name: "search_issues",
          description: "Full-text search across all issues",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string", description: "Search query" },
              limit: { type: "number", description: "Max results (default 10)" },
            },
            required: ["query"],
          },
        },
        {
          name: "list_teams",
          description: "List all teams in the workspace",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "list_projects",
          description: "List projects with optional team filter",
          inputSchema: {
            type: "object",
            properties: {
              teamId: { type: "string", description: "Filter by team ID" },
            },
          },
        },
        {
          name: "create_comment",
          description: "Add a comment to an issue",
          inputSchema: {
            type: "object",
            properties: {
              issueId: { type: "string", description: "Issue ID or identifier" },
              body: { type: "string", description: "Comment body (markdown)" },
            },
            required: ["issueId", "body"],
          },
        },
        {
          name: "list_labels",
          description: "List all labels available in the workspace",
          inputSchema: {
            type: "object",
            properties: {
              teamId: { type: "string", description: "Filter by team ID" },
            },
          },
        },
        {
          name: "list_cycles",
          description: "List cycles (sprints) for a team",
          inputSchema: {
            type: "object",
            properties: {
              teamId: { type: "string", description: "Team ID" },
            },
            required: ["teamId"],
          },
        },
      ],
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
      await db
        .update(mcpServers)
        .set({
          name: server.name,
          description: server.description,
          transport: server.transport,
          launchConfig: server.launchConfig,
          authType: server.authType,
          safetyTier: server.safetyTier,
          requiresIsolation: server.requiresIsolation,
          isBuiltin: server.isBuiltin,
          toolsCatalog: server.toolsCatalog,
        })
        .where(eq(mcpServers.slug, server.slug));
      console.log(`  Updated MCP server: ${server.slug}`);
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
