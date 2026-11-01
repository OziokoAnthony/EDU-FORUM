import { Controller, Get, Header, HttpStatus, Query } from '@nestjs/common';
import {
  geocodeQuerySchema,
  lgasQuerySchema,
  statesQuerySchema,
  type CertificationTypeItem,
  type CountryItem,
  type GeocodeResult,
  type LgaItem,
  type ListResponse,
  type MetaItem,
  type QualificationTypeItem,
  type StateItem,
} from '@edu-forum/shared';
import type { z } from 'zod';
import { Public } from '../../common/auth/decorators';
import { ApiException } from '../../common/filters/api-exception.filter';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Geocoder } from '../../infra/geocoder';
import { PrismaService } from '../../infra/prisma/prisma.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Reference lists change rarely (admin edits); browsers and CDNs may cache them for an hour. */
const CACHE = 'public, max-age=3600';

/** PRD "Reference data" endpoints. Only active items are listed. */
@Controller('meta')
export class MetaController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geocoder: Geocoder,
  ) {}

  @Get('subjects')
  @Public()
  @Header('Cache-Control', CACHE)
  async subjects(): Promise<ListResponse<MetaItem>> {
    const data = await this.prisma.subject.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, slug: true },
    });
    return { data };
  }

  @Get('levels')
  @Public()
  @Header('Cache-Control', CACHE)
  async levels(): Promise<ListResponse<MetaItem>> {
    const data = await this.prisma.level.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, slug: true },
    });
    return { data };
  }

  @Get('qualification-types')
  @Public()
  @Header('Cache-Control', CACHE)
  async qualificationTypes(): Promise<ListResponse<QualificationTypeItem>> {
    const data = await this.prisma.qualificationType.findMany({
      where: { isActive: true },
      orderBy: [{ rank: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, slug: true, rank: true },
    });
    return { data };
  }

  @Get('certification-types')
  @Public()
  @Header('Cache-Control', CACHE)
  async certificationTypes(): Promise<ListResponse<CertificationTypeItem>> {
    const data = await this.prisma.certificationType.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true, issuer: true },
    });
    return { data };
  }

  @Get('locations/countries')
  @Public()
  @Header('Cache-Control', CACHE)
  async countries(): Promise<ListResponse<CountryItem>> {
    const data = await this.prisma.country.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { code: true, name: true },
    });
    return { data };
  }

  @Get('locations/states')
  @Public()
  @Header('Cache-Control', CACHE)
  async states(
    @Query(new ZodValidationPipe(statesQuerySchema)) query: z.output<typeof statesQuerySchema>,
  ): Promise<ListResponse<StateItem>> {
    const data = await this.prisma.state.findMany({
      where: { isActive: true, countryCode: query.country },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true, countryCode: true },
    });
    return { data };
  }

  @Get('locations/lgas')
  @Public()
  @Header('Cache-Control', CACHE)
  async lgas(@Query(new ZodValidationPipe(lgasQuerySchema)) query: z.output<typeof lgasQuerySchema>): Promise<ListResponse<LgaItem>> {
    const state = await this.prisma.state.findFirst({
      where: UUID.test(query.state) ? { id: query.state } : { slug: query.state.toLowerCase() },
    });
    if (!state) throw new ApiException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'State not found');
    const data = await this.prisma.lga.findMany({
      where: { isActive: true, stateId: state.id },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true, stateId: true },
    });
    return { data };
  }

  /**
   * PRD: address → lat/lng through our proxy (auth: any signed-in user). GEOCODER_DRIVER=stub
   * (local) returns no results; "google" asks the Google Geocoding API, limited to Nigeria.
   */
  @Get('geocode')
  async geocode(@Query(new ZodValidationPipe(geocodeQuerySchema)) query: z.output<typeof geocodeQuerySchema>): Promise<ListResponse<GeocodeResult>> {
    return { data: await this.geocoder.search(query.q) };
  }
}
