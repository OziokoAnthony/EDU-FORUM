import { Controller, Get, Module, Query } from '@nestjs/common';
import { z } from 'zod';
import { Public } from '../../common/auth/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SearchModule } from '../search/search.module';
import { SeoNotifier } from './seo-notifier';
import { SeoService } from './seo.service';

const metaQuery = z.object({ path: z.string().trim().min(1).max(300) });
const landingQuery = z.object({ minJobs: z.coerce.number().int().min(0).max(100).default(3) });

/** PRD "SEO" endpoints (public). `GET /seo/sitemap/vacancies` is an addition for the sitemap. */
@Controller('seo')
@Public()
export class SeoController {
  constructor(private readonly seo: SeoService) {}

  @Get('meta')
  meta(@Query(new ZodValidationPipe(metaQuery)) q: z.output<typeof metaQuery>) {
    return this.seo.meta(q.path);
  }

  @Get('landing-pages')
  landing(@Query(new ZodValidationPipe(landingQuery)) q: z.output<typeof landingQuery>) {
    return this.seo.landingPages(q.minJobs);
  }

  @Get('sitemap/vacancies')
  sitemap() {
    return this.seo.sitemapVacancies();
  }
}

@Module({
  imports: [SearchModule],
  controllers: [SeoController],
  providers: [SeoService, SeoNotifier],
  exports: [SeoService, SeoNotifier],
})
export class SeoModule {}
