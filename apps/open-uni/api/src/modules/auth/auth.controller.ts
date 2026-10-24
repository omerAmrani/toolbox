import { Controller, Get, Post, Query, Req, Res, HttpCode, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AUTH_COOKIE, JwtAuthGuard } from '../../common/jwt-auth.guard';
import { WEB_ORIGIN, IS_PRODUCTION, IS_LOCAL_MODE } from '../../config';

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: IS_PRODUCTION,
  path: '/',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days, matches JwtModule signOptions.expiresIn
};

@Controller('api/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('google')
  google(@Res() res: Response) {
    res.redirect(this.auth.getGoogleAuthUrl());
  }

  @Get('google/callback')
  async googleCallback(@Query('code') code: string, @Res() res: Response) {
    try {
      const { cookieValue, redirectTo } = await this.auth.loginWithGoogle(code || '');
      res.cookie(AUTH_COOKIE, cookieValue, COOKIE_OPTIONS);
      res.redirect(redirectTo);
    } catch {
      res.redirect(`${WEB_ORIGIN}/login?error=oauth_failed`);
    }
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Res() res: Response) {
    res.clearCookie(AUTH_COOKIE, { path: '/' });
    res.json({ ok: true });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: Request, @Res() res: Response) {
    const user = (req as any).user as { sub: string; email: string };
    res.json({ id: user.sub, email: user.email, local: IS_LOCAL_MODE });
  }
}
