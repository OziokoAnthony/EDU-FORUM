# EDU-FORUM launch checklist

Everything below is built and tested; these are the accounts, keys and settings that only you can
provide, plus the checks to run on the live site. Work top to bottom. Settings go in
`backend/.env` (API) and `frontend/.env.local` (web app) on the server, or your host's
"environment variables" page. Names match `.env.example`.

## 1. Domain and hosting

- [ ] Buy the domain (e.g. `eduforum.ng`) and choose hosting:
  - **Web app (Next.js):** Vercel, or a Node server (VPS) running `pnpm build && pnpm start`.
  - **API (NestJS) + background jobs:** a Node server or container (Railway, Render, Fly.io, a VPS).
  - **Database:** managed PostgreSQL **with PostGIS** (Neon, Supabase, Railway, DigitalOcean).
  - **Redis** (job queue): Upstash, Railway, or on the VPS.
  - **ClamAV** (virus scan) and **Gotenberg** (Word → PDF): Docker containers on the API server.
- [ ] HTTPS on both addresses (push alerts and the installable app need it).
- [ ] `APP_URL=https://your-domain` (API) and `NEXT_PUBLIC_API_URL=https://api.your-domain/api/v1` (web).
- [ ] Run database migrations: `pnpm --filter @edu-forum/backend exec prisma migrate deploy`, then the seed
  once (`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`: use a strong password, not the local one).
- [ ] Behind a proxy or load balancer, tell the API to trust it (so the contact form's per-network limit sees
  real visitor addresses): add `app.set('trust proxy', 1)` in `backend/src/main.ts`.
- [ ] New secrets for production (never reuse local ones): `JWT_ACCESS_SECRET`, `OTP_SECRET`,
  `REVALIDATE_SECRET` (same value in API and web), `SCAN_WEBHOOK_SECRET` if used.

## 2. Business details (legal pages)

- [ ] Fill in `LEGAL` in `shared/src/legal.ts`: company name, registered address, support email.
- [ ] Have a lawyer review `/privacy` and `/terms` (NDPA 2023).
- [ ] `SUPPORT_EMAIL` so contact-form messages reach you by email.

## 3. File storage (Backblaze B2)

- [ ] A production bucket (private) and keys: `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`,
  `S3_SECRET_KEY`.
- [ ] **CORS rule:** allow browser uploads (`PUT`) from `https://your-domain` (today only
  `http://localhost:3000` is allowed).

## 4. Email, SMS, maps

- [ ] **Resend:** verify the sending domain, then `MAIL_DRIVER=resend`, `RESEND_API_KEY`,
  `MAIL_FROM="EDU-FORUM <no-reply@your-domain>"`.
- [ ] **Termii:** register a sender ID (approval takes a few days), then `SMS_DRIVER=termii`,
  `TERMII_API_KEY`, `TERMII_SENDER_ID`. Keep `TERMII_SMS_ROUTE=dnd` so codes reach DND numbers.
  WhatsApp: after Termii approves your WhatsApp sender, `TERMII_WHATSAPP=true`.
- [ ] **Google Maps (address lookup):** a Geocoding API key restricted to the API server, then
  `GEOCODER_DRIVER=google`, `GOOGLE_MAPS_API_KEY`.

## 5. Google sign-in

- [ ] Google Cloud Console → APIs & Services → Credentials → OAuth client ID (Web application).
  Authorised JavaScript origin: `https://your-domain`.
- [ ] Same client ID in `GOOGLE_CLIENT_ID` (API) and `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (web), rebuild the web app.
- [ ] OAuth consent screen: app name, logo, privacy policy and terms links (`/privacy`, `/terms`).

## 6. Push alerts (installable app)

- [ ] New VAPID keys for production:
  `node -e "console.log(require('web-push').generateVAPIDKeys())"` (in `backend/`), then
  `PUSH_DRIVER=webpush`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:you@your-domain`.

## 7. Search engines

- [ ] Google Search Console: verify the domain, submit `https://your-domain/sitemap.xml`.
- [ ] Google Indexing API (job pages): a service account with the Indexing API enabled, added as an owner in
  Search Console. The adapter is a logger today (`INDEXING_DRIVER=log`); wiring the real call is a small
  change once the credentials exist.
- [ ] Check a few job pages in Google's Rich Results Test (JobPosting) and a blog post (Article).

## 8. AdSense (after the legal pages are live)

- [ ] Apply for AdSense with the live domain; once approved, set `NEXT_PUBLIC_ADSENSE_CLIENT=ca-pub-…`
  and rebuild. `/ads.txt` fills in automatically.
- [ ] In AdSense → Privacy & messaging, publish the consent message (shown to every visitor).
- [ ] Admin → Ads: paste each ad unit's slot ID and switch the spaces on.

## 9. Final checks on the live site

- [ ] Lighthouse (mobile) on the home page, `/jobs`, a job page and a blog post: LCP ≤ 2.5 s, INP ≤ 200 ms,
  CLS ≤ 0.1.
- [ ] Sign up as a teacher and as a director; confirm email and phone codes arrive.
- [ ] Upload a CV and a community photo; they appear after the virus check.
- [ ] Install the app on an Android phone and an iPhone (Safari → Share → Add to Home Screen); turn on
  alerts and send yourself a message.
- [ ] Admin: upload a teaching material, an exam timetable and a calendar date.
- [ ] Daily database backups switched on at your database host.
