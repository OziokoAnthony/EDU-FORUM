import { Module } from '@nestjs/common';
import { MetaModule } from '../meta/meta.module';
import { UploadsModule } from '../uploads/uploads.module';
import { CertificationsService } from './certifications.service';
import { CompletenessService } from './completeness.service';
import { ExperiencesService } from './experiences.service';
import { QualificationsService } from './qualifications.service';
import { TeacherProfilesService } from './teacher-profiles.service';
import { TeachersController } from './teachers.controller';
import { TeachersService } from './teachers.service';

@Module({
  imports: [UploadsModule, MetaModule],
  controllers: [TeachersController],
  providers: [
    TeachersService,
    TeacherProfilesService,
    CompletenessService,
    QualificationsService,
    CertificationsService,
    ExperiencesService,
  ],
  exports: [TeacherProfilesService, CompletenessService],
})
export class TeachersModule {}
