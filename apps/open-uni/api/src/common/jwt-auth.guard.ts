import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { IS_LOCAL_MODE } from '../config';

export const AUTH_COOKIE = 'auth_token';

// Local mode has no login: every request is this one fixed user (docs/adr/0002).
export const LOCAL_USER = { sub: 'local', email: 'local' };

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
    if (IS_LOCAL_MODE) {
      req.user = LOCAL_USER;
      return true;
    }
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
