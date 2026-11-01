import { Module } from '@nestjs/common';
import { TeachersModule } from '../teachers/teachers.module';
import { RemindersService } from './reminders.service';

/** Daily reminder jobs (FR-9): vacancy closing in 3 days, unfinished teacher profile. */
@Module({
  imports: [TeachersModule],
  providers: [RemindersService],
})
export class RemindersModule {}
