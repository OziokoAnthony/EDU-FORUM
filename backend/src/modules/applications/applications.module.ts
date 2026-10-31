import { Module } from '@nestjs/common';
import { SearchModule } from '../search/search.module';
import { SeoModule } from '../seo/seo.module';
import { UploadsModule } from '../uploads/uploads.module';
import { ApplicationsController, VacancyApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';

@Module({
  imports: [UploadsModule, SearchModule, SeoModule],
  controllers: [VacancyApplicationsController, ApplicationsController],
  providers: [ApplicationsService],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
