import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET ?? "dev-secret-change-me",
    });
  }

  validate(payload: { sub: string; email: string; orgId: string; roles: string[] }) {
    return {
      userId: payload.sub,
      email: payload.email,
      orgId: payload.orgId,
      roles: payload.roles,
    };
  }
}
