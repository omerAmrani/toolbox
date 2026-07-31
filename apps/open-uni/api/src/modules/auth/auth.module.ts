import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { StorageModule } from '../storage/storage.module';
import { EmailModule } from '../email/email.module';
import { JWT_SECRET } from '../../config';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';

@Module({
  imports: [
    StorageModule,
    EmailModule,
    JwtModule.register({ secret: JWT_SECRET, signOptions: { expiresIn: '30d' } }),
  ],
  providers: [AuthService, JwtAuthGuard],
  controllers: [AuthController],
  exports: [JwtModule, JwtAuthGuard],
})
export class AuthModule {}
