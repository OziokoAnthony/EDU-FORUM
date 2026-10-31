import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MeController } from './me.controller';
import { MeService } from './me.service';
import { OnboardingService } from './onboarding.service';

@Module({
  imports: [AuthModule],
  controllers: [MeController],
  providers: [MeService, OnboardingService],
  exports: [OnboardingService],
})
export class UsersModule {}
