// Runs before every test file (jest setupFiles). Values here win over backend/.env.
process.env.MAIL_DRIVER = 'memory';
process.env.SMS_DRIVER = 'memory';
process.env.PUSH_DRIVER = 'memory';
process.env.VAPID_PUBLIC_KEY = 'BTestPublicKeyForE2EOnly';
process.env.REFRESH_REUSE_GRACE_SECONDS ??= '0';
// Most suites make many auth calls; test/rate-limit.e2e-spec.ts checks the real limit.
process.env.AUTH_RATE_LIMIT ??= '1000';
// Files and jobs stay in memory; jobs run inside the request so tests can assert results.
process.env.STORAGE_DRIVER = 'memory';
process.env.SCANNER_DRIVER = 'memory';
process.env.CONVERTER_DRIVER = 'memory';
process.env.QUEUE_DRIVER = 'inline';
process.env.INDEXING_DRIVER = 'memory';
process.env.SCAN_WEBHOOK_SECRET = 'test-webhook-secret-0123456789abcdef';
