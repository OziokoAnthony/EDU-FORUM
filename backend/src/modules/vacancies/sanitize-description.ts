import sanitizeHtml from 'sanitize-html';

/**
 * Vacancy descriptions are rich text from the editor. Only simple formatting survives;
 * scripts, styles, event handlers and images are removed, and links open safely.
 */
export function sanitizeDescription(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'h2', 'h3', 'blockquote', 'a'],
    // rel and target are always overwritten by the transform below.
    allowedAttributes: { a: ['href', 'rel', 'target'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'nofollow noopener noreferrer', target: '_blank' }),
    },
  }).trim();
}
