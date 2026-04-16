import { type ExecutionContext, createParamDecorator } from "@nestjs/common";

export const CurrentActor = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  return request.user; // populated by JwtStrategy.validate()
});
