import type {
  CertificationResponse,
  CvResponse,
  ExperienceResponse,
  QualificationResponse,
  ScanStatus,
} from '@edu-forum/shared';
import { fromDbDate } from '../../common/dates';
import type {
  Certification,
  CertificationType,
  Cv,
  Qualification,
  QualificationType,
  WorkExperience,
} from '../../generated/prisma/client';

/** Scan status of attached files, keyed by object key (from the uploads table). */
export type FileStatuses = Map<string, ScanStatus>;

export function toQualificationResponse(q: Qualification & { type: QualificationType }, files: FileStatuses): QualificationResponse {
  return {
    id: q.id,
    qualificationType: { id: q.type.id, name: q.type.name },
    course: q.course,
    institution: q.institution,
    yearObtained: q.yearObtained,
    hasFile: !!q.fileKey,
    fileScanStatus: q.fileKey ? (files.get(q.fileKey) ?? 'pending') : null,
  };
}

export function toCertificationResponse(c: Certification & { type: CertificationType }, files: FileStatuses): CertificationResponse {
  return {
    id: c.id,
    certificationType: { id: c.type.id, name: c.type.name },
    issuer: c.issuer,
    number: c.number,
    issuedAt: fromDbDate(c.issuedAt),
    expiresAt: fromDbDate(c.expiresAt),
    hasFile: !!c.fileKey,
    fileScanStatus: c.fileKey ? (files.get(c.fileKey) ?? 'pending') : null,
  };
}

export function toExperienceResponse(e: WorkExperience): ExperienceResponse {
  return {
    id: e.id,
    kind: e.kind,
    schoolName: e.schoolName,
    role: e.role,
    subjects: e.subjects,
    levels: e.levels,
    startDate: fromDbDate(e.startDate),
    endDate: fromDbDate(e.endDate),
    isCurrent: e.isCurrent,
    description: e.description,
  };
}

/** Signed links are added only for clean files. */
export function toCvResponse(cv: Cv, urls: { downloadUrl: string | null; viewUrl: string | null }): CvResponse {
  return {
    id: cv.id,
    fileName: cv.fileName,
    mimeType: cv.mimeType,
    sizeBytes: cv.sizeBytes,
    scanStatus: cv.scanStatus,
    isActive: cv.isActive,
    uploadedAt: cv.uploadedAt.toISOString(),
    replacedAt: cv.replacedAt?.toISOString() ?? null,
    downloadUrl: urls.downloadUrl,
    viewUrl: urls.viewUrl,
  };
}

/** The key of the PDF the viewer shows: the original PDF, or the converted copy of a DOC/DOCX. */
export function cvViewKey(cv: Pick<Cv, 'mimeType' | 'objectKey' | 'pdfKey'>): string | null {
  return cv.mimeType === 'pdf' ? cv.objectKey : cv.pdfKey;
}
