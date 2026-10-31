import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OneTimeCodesService } from './one-time-codes.service';
import { SessionService } from './session.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionService, OneTimeCodesService],
  exports: [AuthService, SessionService],
})
export class AuthModule {}
