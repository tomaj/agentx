import { encrypt } from "@agentx/crypto";
import { type Database, mcpCredentials, mcpServers } from "@agentx/db";
import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { DB } from "../database/database.module";

@Injectable()
export class McpService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async listServers() {
    return this.db.select().from(mcpServers).orderBy(mcpServers.name);
  }

  async listCredentials(userId: string) {
    return this.db
      .select({
        id: mcpCredentials.id,
        mcpServerId: mcpCredentials.mcpServerId,
        serverName: mcpServers.name,
        serverSlug: mcpServers.slug,
        label: mcpCredentials.label,
        credentialType: mcpCredentials.credentialType,
        createdAt: mcpCredentials.createdAt,
      })
      .from(mcpCredentials)
      .innerJoin(mcpServers, eq(mcpServers.id, mcpCredentials.mcpServerId))
      .where(and(eq(mcpCredentials.ownerType, "user"), eq(mcpCredentials.ownerId, userId)));
  }

  async createCredential(
    userId: string,
    input: { mcpServerId: string; label: string; token: string },
  ) {
    const masterKey = process.env.AGENTX_MASTER_KEY;
    if (!masterKey) throw new Error("AGENTX_MASTER_KEY not configured");

    const encryptedPayload = encrypt(JSON.stringify({ token: input.token }), masterKey);

    const [credential] = await this.db
      .insert(mcpCredentials)
      .values({
        mcpServerId: input.mcpServerId,
        ownerType: "user",
        ownerId: userId,
        label: input.label,
        credentialType: "static_token",
        encryptedPayload,
      })
      .returning({
        id: mcpCredentials.id,
        mcpServerId: mcpCredentials.mcpServerId,
        label: mcpCredentials.label,
        createdAt: mcpCredentials.createdAt,
      });

    return credential!;
  }

  async deleteCredential(credentialId: string, userId: string) {
    const result = await this.db
      .delete(mcpCredentials)
      .where(
        and(
          eq(mcpCredentials.id, credentialId),
          eq(mcpCredentials.ownerType, "user"),
          eq(mcpCredentials.ownerId, userId),
        ),
      )
      .returning({ id: mcpCredentials.id });

    return result.length > 0;
  }
}
