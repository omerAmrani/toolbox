import { Controller, Post, Get, Body, Query, Req, Res, HttpCode, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { AUTH_COOKIE, JwtAuthGuard } from '../../common/jwt-auth.guard';
import { WEB_ORIGIN } from '../../config';

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days, matches JwtModule signOptions.expiresIn
};

@Controller('api/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('request-link')
  @HttpCode(200)
  async requestLink(@Body('email') email: string, @Res() res: Response) {
    await this.auth.requestLink(email || '');
    res.json({ ok: true }); // same response whether or not the email exists — avoids account enumeration
  }

  @Get('verify')
  verify(@Query('token') token: string, @Res() res: Response) {
    try {
      const { cookieValue, redirectTo } = this.auth.verify(token || '');
      res.cookie(AUTH_COOKIE, cookieValue, COOKIE_OPTIONS);
      res.redirect(redirectTo);
    } catch {
      res.redirect(`${WEB_ORIGIN}/login?error=invalid_link`);
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
    res.json({ id: user.sub, email: user.email });
  }
}
