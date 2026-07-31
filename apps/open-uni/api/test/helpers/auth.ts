import { JwtService } from '@nestjs/jwt';
import { JWT_SECRET } from '../../src/config';
import { AUTH_COOKIE } from '../../src/common/jwt-auth.guard';

// Signs the same token shape AuthService issues, so tests can authenticate
// as a given user without going through the magic-link flow.
export function authCookie(userId: string, email = `${userId}@example.com`): string {
  const token = new JwtService({ secret: JWT_SECRET }).sign({ sub: userId, email });
  return `${AUTH_COOKIE}=${token}`;
}
