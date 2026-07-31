import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export const AUTH_COOKIE = 'auth_token';

function readCookie(req: any, name: string): string | undefined {
  if (req.cookies?.[name]) return req.cookies[name];
  const header: string | undefined = req.headers?.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return undefined;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const token = readCookie(req, AUTH_COOKIE);
    if (!token) throw new UnauthorizedException('Not logged in');
    try {
      req.user = this.jwt.verify(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired session');
    }
    return true;
  }
}
