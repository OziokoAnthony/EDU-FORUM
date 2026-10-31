/** Lowercase, hyphenated URL slug: "Jama'are" → "jamaare", "Ado-Odo/Ota" → "ado-odo-ota". */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
