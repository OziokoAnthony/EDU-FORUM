/** Only same-site paths are followed after sign-in/sign-up, so links cannot redirect off-site. */
export function safeNext(next: string | undefined | null): string | null {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : null;
}
