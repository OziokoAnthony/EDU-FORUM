import { Module } from '@nestjs/common';
import { MetaModule } from '../meta/meta.module';
import { VacanciesController } from './vacancies.controller';
import { VacanciesService } from './vacancies.service';

@Module({
  imports: [MetaModule],
  controllers: [VacanciesController],
  providers: [VacanciesService],
  exports: [VacanciesService],
})
export class VacanciesModule {}
