import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { CertificationsService } from './certifications.service';
import { CompletenessService } from './completeness.service';
import { ExperiencesService } from './experiences.service';
import { QualificationsService } from './qualifications.service';
import { ReferenceCheckService } from './reference-check.service';
import { TeacherProfilesService } from './teacher-profiles.service';
import { TeachersController } from './teachers.controller';
import { TeachersService } from './teachers.service';

@Module({
  imports: [UploadsModule],
  controllers: [TeachersController],
  providers: [
    TeachersService,
    TeacherProfilesService,
    CompletenessService,
    ReferenceCheckService,
    QualificationsService,
    CertificationsService,
    ExperiencesService,
  ],
  exports: [TeacherProfilesService, CompletenessService, ReferenceCheckService],
})
export class TeachersModule {}
