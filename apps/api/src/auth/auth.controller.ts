import { loginSchema } from "@agentx/shared";
import { Body, Controller, Get, Inject, Post, UseGuards } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { CurrentActor } from "./decorators/current-actor.decorator";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import type { Actor } from "./types";

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post("login")
  async login(@Body() body: unknown) {
    const dto = loginSchema.parse(body);
    return this.authService.login(dto.email, dto.password);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  async me(@CurrentActor() actor: Actor) {
    return this.authService.me(actor.userId);
  }
}
