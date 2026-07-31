import { Injectable, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { StorageService } from '../storage/storage.service';
import { EmailService } from '../email/email.service';
import { API_ORIGIN, WEB_ORIGIN } from '../../config';

const TOKEN_TTL_MS = 15 * 60 * 1000;
const RATE_LIMIT_MS = 60 * 1000;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  // ponytail: in-memory cooldown, single-instance deployment — move to a shared
  // store (Redis) if this ever runs multi-instance.
  private readonly lastRequestAt = new Map<string, number>();

  constructor(
    private readonly storage: StorageService,
    private readonly email: EmailService,
    private readonly jwt: JwtService,
  ) {}

  async requestLink(email: string): Promise<void> {
    const normalized = email.trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) throw new BadRequestException('Invalid email');

    const last = this.lastRequestAt.get(normalized);
    if (last && Date.now() - last < RATE_LIMIT_MS) return; // silently drop — no signal to a spammer

    this.lastRequestAt.set(normalized, Date.now());

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
    this.storage.createMagicLinkToken(hashToken(token), normalized, expiresAt);

    const verifyUrl = `${API_ORIGIN}/api/auth/verify?token=${token}`;
    await this.email.sendMagicLink(normalized, verifyUrl);
  }

  verify(token: string): { cookieValue: string; redirectTo: string } {
    const consumed = this.storage.consumeMagicLinkToken(hashToken(token));
    if (!consumed) throw new BadRequestException('Invalid or expired link');

    const user = this.storage.getOrCreateUser(consumed.email);
    const cookieValue = this.jwt.sign({ sub: user.id, email: user.email });
    return { cookieValue, redirectTo: WEB_ORIGIN };
  }
}
