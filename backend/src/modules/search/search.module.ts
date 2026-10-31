import { Module } from '@nestjs/common';
import { UploadsModule } from '../uploads/uploads.module';
import { TeacherSearchService } from './teacher-search.service';
import { TeachersDirectoryController } from './teachers-directory.controller';
import { VacancySearchService } from './vacancy-search.service';

@Module({
  imports: [UploadsModule],
  controllers: [TeachersDirectoryController],
  providers: [VacancySearchService, TeacherSearchService],
  exports: [VacancySearchService, TeacherSearchService],
})
export class SearchModule {}
