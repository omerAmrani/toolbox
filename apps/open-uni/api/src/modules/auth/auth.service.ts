import { Injectable, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import { StorageService } from '../storage/storage.service';
import { WEB_ORIGIN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } from '../../config';

const GOOGLE_SCOPES = ['openid', 'email'];

@Injectable()
export class AuthService {
  constructor(
    private readonly storage: StorageService,
    private readonly jwt: JwtService,
  ) {}

  private googleClient(): OAuth2Client {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      throw new Error('Google OAuth is not configured — set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET');
    }
    return new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
  }

  getGoogleAuthUrl(): string {
    return this.googleClient().generateAuthUrl({ scope: GOOGLE_SCOPES });
  }

  async handleGoogleCallback(code: string): Promise<{ email: string }> {
    const client = this.googleClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.id_token) throw new BadRequestException('Google did not return an id token');

    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!payload?.email || !payload.email_verified) {
      throw new BadRequestException('Google account has no verified email');
    }

    return { email: payload.email.toLowerCase() };
  }

  async loginWithGoogle(code: string): Promise<{ cookieValue: string; redirectTo: string }> {
    const { email } = await this.handleGoogleCallback(code);
    const user = this.storage.getOrCreateUser(email);
    const cookieValue = this.jwt.sign({ sub: user.id, email: user.email });
    return { cookieValue, redirectTo: WEB_ORIGIN };
  }
}
