import { verifyPassword } from "@agentx/crypto";
import { orgMembers, orgs, users } from "@agentx/db";
import type { Database } from "@agentx/db";
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { and, eq, isNull } from "drizzle-orm";
import { DB } from "../database/database.module";

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(JwtService) private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string) {
    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.email, email), eq(users.active, true), isNull(users.deletedAt)));

    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const valid = await verifyPassword(user.passwordHash, password);
    if (!valid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    // Find org memberships
    const memberships = await this.db
      .select({
        orgId: orgMembers.orgId,
        role: orgMembers.role,
      })
      .from(orgMembers)
      .where(eq(orgMembers.userId, user.id));

    // Use first org for token (MVP: single org assumed)
    const orgId = memberships[0]?.orgId ?? null;
    const roles = memberships.map((m) => m.role);

    const payload = { sub: user.id, email: user.email, orgId, roles };

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const accessToken = this.jwt.sign(payload as any);
    const refreshToken = this.jwt.sign(payload as any, {
      secret: process.env.JWT_REFRESH_SECRET ?? "dev-refresh-secret-change-me",
      expiresIn: (process.env.JWT_REFRESH_TTL ?? "7d") as any,
    });

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, name: user.name },
    };
  }

  async me(userId: string) {
    const [user] = await this.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.active, true), isNull(users.deletedAt)));

    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    // Include org memberships
    const memberships = await this.db
      .select({
        orgId: orgMembers.orgId,
        orgName: orgs.name,
        role: orgMembers.role,
      })
      .from(orgMembers)
      .innerJoin(orgs, eq(orgs.id, orgMembers.orgId))
      .where(eq(orgMembers.userId, userId));

    return { ...user, memberships };
  }
}
