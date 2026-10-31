import { Module } from '@nestjs/common';
import { MetaModule } from '../meta/meta.module';
import { SearchModule } from '../search/search.module';
import { VacanciesController } from './vacancies.controller';
import { VacanciesService } from './vacancies.service';

@Module({
  imports: [MetaModule, SearchModule],
  controllers: [VacanciesController],
  providers: [VacanciesService],
  exports: [VacanciesService],
})
export class VacanciesModule {}
