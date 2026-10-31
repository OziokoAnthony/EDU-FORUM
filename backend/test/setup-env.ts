// Runs before every test file (jest setupFiles). Values here win over backend/.env.
process.env.MAIL_DRIVER = 'memory';
process.env.SMS_DRIVER = 'memory';
process.env.REFRESH_REUSE_GRACE_SECONDS ??= '0';
// Most suites make many auth calls; test/rate-limit.e2e-spec.ts checks the real limit.
process.env.AUTH_RATE_LIMIT ??= '1000';
