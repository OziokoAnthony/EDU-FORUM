import { MATCH_DISTANCE_LIMIT_KM, MATCH_WEIGHTS as W } from '@edu-forum/shared';
import { Prisma } from '../../generated/prisma/client';

/** A search origin (lat/lng) as a PostGIS geography. */
export const point = (lat: number, lng: number) => Prisma.sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`;

const texts = (values: string[]) => Prisma.sql`${values}::text[]`;

/** Share of `wanted` found in `have` (both text[] SQL), as 0..1. Empty `wanted` counts as 1. */
function overlap(have: Prisma.Sql, wanted: Prisma.Sql) {
  return Prisma.sql`CASE WHEN cardinality(${wanted}) = 0 THEN 1
    ELSE (SELECT count(*) FROM unnest(${wanted}) w WHERE w = ANY(${have}))::float / cardinality(${wanted}) END`;
}

/** Distance points: full at 0 km, none at 50 km or with no origin/pin. */
function distancePoints(km: Prisma.Sql | null) {
  return km ? Prisma.sql`COALESCE(GREATEST(0, 1 - ${km} / ${MATCH_DISTANCE_LIMIT_KM}), 0)` : Prisma.sql`0`;
}

/**
 * Match score (0–100) of a vacancy row `v` for one teacher: does the teacher cover what the
 * vacancy asks for? Qualifications match by rank (holding a higher one counts).
 */
export function vacancyMatchScore(
  teacher: { subjects: string[]; levels: string[]; maxQualRank: number | null; years: number; certifications: string[] },
  km: Prisma.Sql | null,
) {
  return Prisma.sql`ROUND(
      ${W.subjects} * ${overlap(texts(teacher.subjects), Prisma.sql`v.subjects`)}
    + ${W.levels} * ${overlap(texts(teacher.levels), Prisma.sql`v.levels`)}
    + ${W.qualification} * CASE WHEN cardinality(v.required_qualifications) = 0 THEN 1
        WHEN ${teacher.maxQualRank}::int >= (SELECT min(qt.rank) FROM qualification_types qt WHERE qt.slug = ANY(v.required_qualifications)) THEN 1
        ELSE 0 END
    + ${W.experience} * CASE WHEN COALESCE(v.min_experience_years, 0) = 0 THEN 1
        ELSE LEAST(1, ${teacher.years}::float / v.min_experience_years) END
    + ${W.certifications} * ${overlap(texts(teacher.certifications), Prisma.sql`v.required_certifications`)}
    + ${W.distance} * ${distancePoints(km)}
  )::int`;
}

/**
 * Match score of a teacher row `t` (with lateral `tq.max_rank`, `tc.slugs`) against what a
 * principal/director is looking for: a vacancy's requirements or the search filters.
 */
export function teacherMatchScore(
  wanted: { subjects: string[]; levels: string[]; minQualRank: number | null; minExperience: number | null; certifications: string[] },
  km: Prisma.Sql | null,
) {
  return Prisma.sql`ROUND(
      ${W.subjects} * ${overlap(Prisma.sql`t.subjects`, texts(wanted.subjects))}
    + ${W.levels} * ${overlap(Prisma.sql`t.levels`, texts(wanted.levels))}
    + ${W.qualification} * CASE WHEN ${wanted.minQualRank}::int IS NULL THEN 1
        WHEN COALESCE(tq.max_rank, 0) >= ${wanted.minQualRank}::int THEN 1 ELSE 0 END
    + ${W.experience} * CASE WHEN COALESCE(${wanted.minExperience}::float, 0) = 0 THEN 1
        ELSE LEAST(1, t.years_experience / ${wanted.minExperience}::float) END
    + ${W.certifications} * ${overlap(Prisma.sql`tc.slugs`, texts(wanted.certifications))}
    + ${W.distance} * ${distancePoints(km)}
  )::int`;
}
