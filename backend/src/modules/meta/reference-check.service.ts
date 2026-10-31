import { HttpStatus, Injectable } from '@nestjs/common';
import { ApiException } from '../../common/filters/api-exception.filter';
import { PrismaService } from '../../infra/prisma/prisma.service';

/** Checks that slugs/ids sent by the client exist in the admin-managed reference lists. */
@Injectable()
export class ReferenceCheckService {
  constructor(private readonly prisma: PrismaService) {}

  async subjects(slugs: string[], path: string): Promise<void> {
    if (slugs.length === 0) return;
    const found = await this.prisma.subject.findMany({ where: { slug: { in: slugs }, isActive: true }, select: { slug: true } });
    this.assertAll(slugs, found, path, 'Unknown subject');
  }

  async levels(slugs: string[], path: string): Promise<void> {
    if (slugs.length === 0) return;
    const found = await this.prisma.level.findMany({ where: { slug: { in: slugs }, isActive: true }, select: { slug: true } });
    this.assertAll(slugs, found, path, 'Unknown level');
  }

  async states(slugs: string[], path: string): Promise<void> {
    if (slugs.length === 0) return;
    const found = await this.prisma.state.findMany({ where: { slug: { in: slugs }, isActive: true }, select: { slug: true } });
    this.assertAll(slugs, found, path, 'Unknown state');
  }

  async qualificationTypes(slugs: string[], path: string): Promise<void> {
    if (slugs.length === 0) return;
    const found = await this.prisma.qualificationType.findMany({ where: { slug: { in: slugs }, isActive: true }, select: { slug: true } });
    this.assertAll(slugs, found, path, 'Unknown qualification');
  }

  async certificationTypes(slugs: string[], path: string): Promise<void> {
    if (slugs.length === 0) return;
    const found = await this.prisma.certificationType.findMany({ where: { slug: { in: slugs }, isActive: true }, select: { slug: true } });
    this.assertAll(slugs, found, path, 'Unknown certification');
  }

  /** The LGA must belong to the state, and both must be active. */
  async stateAndLga(stateId: string, lgaId: string): Promise<void> {
    const lga = await this.prisma.lga.findFirst({
      where: { id: lgaId, isActive: true, state: { isActive: true } },
      select: { stateId: true },
    });
    const state = await this.prisma.state.findFirst({ where: { id: stateId, isActive: true } });
    if (!state) throw invalid('stateId', 'Choose a state');
    if (!lga || lga.stateId !== stateId) throw invalid('lgaId', 'Choose an LGA or city in this state');
  }

  async qualificationType(id: string): Promise<void> {
    const found = await this.prisma.qualificationType.findFirst({ where: { id, isActive: true } });
    if (!found) throw invalid('qualificationTypeId', 'Choose a qualification');
  }

  async certificationType(id: string): Promise<void> {
    const found = await this.prisma.certificationType.findFirst({ where: { id, isActive: true } });
    if (!found) throw invalid('certificationTypeId', 'Choose a certification');
  }

  private assertAll(slugs: string[], found: { slug: string }[], path: string, message: string): void {
    const known = new Set(found.map((f) => f.slug));
    const index = slugs.findIndex((s) => !known.has(s));
    if (index >= 0) throw invalid(`${path}.${index}`, `${message}: ${slugs[index]}`);
  }
}

function invalid(path: string, message: string): ApiException {
  return new ApiException(HttpStatus.BAD_REQUEST, 'VALIDATION_ERROR', 'Validation failed', { issues: [{ path, message }] });
}
