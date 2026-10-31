import { Module } from '@nestjs/common';
import { SchoolGuard } from '../../common/auth/school.guard';
import { MetaModule } from '../meta/meta.module';
import { UploadsModule } from '../uploads/uploads.module';
import { MySchoolController, SchoolsController } from './schools.controller';
import { SchoolTeamService } from './school-team.service';
import { SchoolsService } from './schools.service';

@Module({
  imports: [UploadsModule, MetaModule],
  controllers: [SchoolsController, MySchoolController],
  providers: [SchoolsService, SchoolTeamService, SchoolGuard],
  exports: [SchoolGuard],
})
export class SchoolsModule {}
