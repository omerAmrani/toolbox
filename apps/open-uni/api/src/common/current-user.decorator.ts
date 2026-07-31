import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// Requires JwtAuthGuard to have run first (sets req.user from a verified JWT).
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest();
  return req.user.sub;
});
