import { escapeHtml } from './email-queue';
import type { MailMessage } from './mailer';

/** A short notification email: a few plain lines and one link. Text is escaped for the HTML part. */
export function simpleEmail(to: string, subject: string, lines: string[], link: { url: string; text: string }): MailMessage {
  return {
    to,
    subject,
    text: `${lines.join('\n\n')}\n\n${link.text}: ${link.url}`,
    html: `${lines.map((l) => `<p>${escapeHtml(l)}</p>`).join('')}<p><a href="${link.url}">${escapeHtml(link.text)}</a></p>`,
  };
}
