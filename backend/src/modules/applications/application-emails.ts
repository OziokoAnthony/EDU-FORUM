import { APP_NAME, APPLICATION_STATUS_LABELS, type ApplicationStatus } from '@edu-forum/shared';
import { escapeHtml } from '../../infra/mail/email-queue';
import type { MailMessage } from '../../infra/mail/mailer';

/** Notification emails for the application pipeline (FR-7, FR-9). */
export const applicationEmails = {
  newApplication(to: string, appUrl: string, p: { vacancyTitle: string; vacancyId: string; teacherName: string }): MailMessage {
    const link = `${appUrl}/hiring/vacancies/${p.vacancyId}/applicants`;
    return {
      to,
      subject: `New application: ${p.vacancyTitle}`,
      text: `${p.teacherName} applied for ${p.vacancyTitle} on ${APP_NAME}.\n\nSee the application: ${link}`,
      html: `<p>${escapeHtml(p.teacherName)} applied for <strong>${escapeHtml(p.vacancyTitle)}</strong> on ${APP_NAME}.</p><p><a href="${link}">See the application</a></p>`,
    };
  },

  statusChanged(to: string, appUrl: string, p: { vacancyTitle: string; schoolLabel: string; status: ApplicationStatus; message?: string }): MailMessage {
    const link = `${appUrl}/teacher/applications`;
    const label = APPLICATION_STATUS_LABELS[p.status];
    const note = p.message ? `\n\nMessage: ${p.message}` : '';
    return {
      to,
      subject: `Your application: ${label} (${p.vacancyTitle})`,
      text: `Your application for ${p.vacancyTitle} at ${p.schoolLabel} is now: ${label}.${note}\n\nSee your applications: ${link}`,
      html: `<p>Your application for <strong>${escapeHtml(p.vacancyTitle)}</strong> at ${escapeHtml(p.schoolLabel)} is now: <strong>${label}</strong>.</p>${
        p.message ? `<p>Message: ${escapeHtml(p.message)}</p>` : ''
      }<p><a href="${link}">See your applications</a></p>`,
    };
  },

  withdrawn(to: string, appUrl: string, p: { vacancyTitle: string; vacancyId: string; teacherName: string }): MailMessage {
    const link = `${appUrl}/hiring/vacancies/${p.vacancyId}/applicants`;
    return {
      to,
      subject: `Application withdrawn: ${p.vacancyTitle}`,
      text: `${p.teacherName} withdrew their application for ${p.vacancyTitle}.\n\n${link}`,
      html: `<p>${escapeHtml(p.teacherName)} withdrew their application for <strong>${escapeHtml(p.vacancyTitle)}</strong>.</p><p><a href="${link}">See applicants</a></p>`,
    };
  },

  /** PRD FR-4: "salary or title changes notify applicants". */
  vacancyChanged(to: string, appUrl: string, p: { vacancyTitle: string; changes: string[] }): MailMessage {
    const link = `${appUrl}/teacher/applications`;
    return {
      to,
      subject: `A job you applied for was updated: ${p.vacancyTitle}`,
      text: `A vacancy you applied for has changed:\n${p.changes.map((c) => `- ${c}`).join('\n')}\n\nSee your applications: ${link}`,
      html: `<p>A vacancy you applied for has changed:</p><ul>${p.changes.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul><p><a href="${link}">See your applications</a></p>`,
    };
  },
};
