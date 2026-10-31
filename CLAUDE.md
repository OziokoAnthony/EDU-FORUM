---
name: teacher-recruitment-portal
description: Build and extend EDU-FORUM, a teacher recruitment portal where teachers onboard with location, qualifications, experience, certifications and a mandatory CV, and principals and directors post vacancies and recruit. Use for any feature, endpoint, schema, UI or test work on this project.
---

# EDU-FORUM — Teacher Recruitment Portal (PRD working name: TeachHire)

Two-sided portal. **Teachers** register, complete a profile and upload a CV.
**Principals and directors** (same access) register, view teacher profiles and CVs, chat with
teachers and post vacancies, with their school's name or anonymously. **Admins** moderate.
There are no school accounts, no school onboarding and no identity verification.

The PRD is the source of truth for scope and the full endpoint list, **except where the user
changed it** (see "User changes to the PRD" below). When this file and the PRD disagree
otherwise, follow the PRD and flag the conflict.

## The three pillars — never ship a change that weakens these

1. **Location** — required on every teacher profile and every vacancy.
   - Structure: `country, state, lga_city, area, address_line (private), lat, lng`.
   - Store lat/lng as a PostGIS `geography(Point, 4326)` with a GiST index; all distance
     search uses `ST_DWithin` and sorts by `ST_Distance`.
   - Never return a teacher's `address_line` or exact coordinates to principals/directors —
     return `state`, `lga_city` and distance in km only.
2. **Qualification** — a teacher profile cannot be published without:
   - at least one Qualification,
   - work experience (or an explicit "no experience yet" entry for fresh graduates),
   - teaching preferences (subjects, levels),
   - an **active CV** (PDF, DOC or DOCX, ≤ 5 MB, virus-scan passed),
   - a location.
   Certifications (e.g. TRCN) are captured with number, issuer, dates and file.
   The CV is replaceable anytime; replacing sets the new file active and keeps old
   versions for 90 days. Applications store a CV snapshot, so later replacements do not
   change what a principal/director already received.
3. ~~Identification~~ — **dropped by the user (2026-10-31)**: no government ID, CAC or
   Ministry documents, no verified badge, no admin verification queue. Registering (with the
   email/phone confirmation link or code) is enough. Kept as an optional idea for later.

## Vacancy rules

- Posted by a principal or director. Required: `title`, `subjects`, `levels`, `job_type`,
  `salary_min`, `salary_max`, `salary_currency` (default NGN), `salary_period` (default
  monthly), `description` (≥ 100 chars), `location` (state + lga_city),
  `location_visibility`, and `school_name` unless the vacancy is anonymous. Location, details
  and salary range are always compulsory (user, 2026-10-31).
- Validate `salary_min <= salary_max`, both > 0.
- `location_visibility = "anonymous"`: public responses hide the school name, address and
  lat/lng; show state, lga_city and the label "Confidential school".
  Reveal the school only to teachers who are shortlisted or invited. Enforce this in the
  serializer, not the frontend.
- Lifecycle: `draft → published → paused → closed`. Only drafts can be deleted.

## Free platform, AdSense revenue

There are no payments anywhere: never add fees, subscriptions, featured listings or
checkout flows. Revenue is Google AdSense on public pages only, so organic search
traffic is the business. Every public-page change must keep SEO intact.

## SEO rules

- Public pages (home, `/jobs`, job detail, state/LGA/subject landing pages, `/blog`) are server-rendered (SSR or ISR) with `generateMetadata`; revalidate a job page
  on publish, edit and close.
- URLs: `/jobs/{state}`, `/jobs/{state}/{lga}`, `/jobs/subject/{subject}`,
  `/jobs/{state}/{subject}-teacher`, `/jobs/{slug}-{shortId}`, `/blog/{slug}`. Lowercase, hyphenated, never change a published slug (301 if forced).
- `noindex` + robots.txt disallow: teacher profiles, auth, onboarding, dashboards, CV
  viewer, messages, admin, `/api`. Landing pages with < 3 live jobs are `noindex`.
- JSON-LD: `JobPosting` on every live job (title, description, datePosted, validThrough,
  employmentType, hiringOrganization (the vacancy's school name), jobLocation
  locality/region/country NG, baseSalary NGN min/max unitText MONTH); `BreadcrumbList` on all public
  pages; `WebSite` + `SearchAction` on home; `Article` on posts. Validate with Google's
  Rich Results Test in CI or a test fixture.
- Closed/expired job: drop JobPosting markup, add `noindex`, show "position closed" and
  similar jobs; return 410 after 30 days. Ping the Google Indexing API on publish/close.
- Unique `<title>` and meta description per page, canonical URL, OG/X cards,
  `lang="en-NG"`. One `h1` per page.
- Sitemap index (vacancies, landing, blog) with accurate `lastmod`.
- Core Web Vitals budget on mobile: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1.

## AdSense rules

- Ads only on: job search and landing pages (in-feed after every 6th result), job detail
  (below the description, sidebar on desktop), blog posts (max 3 in-article),
  home (below the fold).
- Never on: login, register, onboarding, dashboards, CV viewer, applications, messages,
  admin, error or empty-result pages. Never directly beside or above an Apply button.
- Use one `<AdSlot pageType slot />` component: fixed reserved height (no CLS), lazy-loads
  below the fold, renders nothing when `/api/v1/ads/config` says the slot is off or the
  user has not consented.
- Load the AdSense script once in the public layout only, with
  `NEXT_PUBLIC_ADSENSE_CLIENT` from env. Serve `ads.txt` at the root.
- Cookie consent banner before ads load; Google-certified consent tool for EEA/UK/CH
  visitors. Privacy policy must mention Google advertising cookies.

## Default stack (change only if the user says so)

- **Frontend:** Next.js (App Router) + TypeScript + Tailwind, React Hook Form + Zod,
  TanStack Query. Mobile-first; must work on low-end Android over 3G.
- **Backend:** Node.js + NestJS (or Express) + TypeScript, REST under `/api/v1`.
- **Database:** PostgreSQL + PostGIS, Prisma ORM (raw SQL for geo queries).
- **Search:** Postgres full-text + PostGIS first; move to Meilisearch/Typesense only past
  ~100k profiles.
- **Files:** S3-compatible private bucket (S3, R2, or Cloudinary raw). Upload via signed
  URL, scan with ClamAV (or provider scan), serve via signed URLs that expire in 10 min.
  Render DOC/DOCX in the CV viewer by converting to PDF server-side on upload.
- **Auth:** JWT access (15 min) + rotating refresh token (30 days, httpOnly cookie on web).
  Email OTP/link verification; phone OTP via Termii or similar.
- **Realtime:** WebSocket gateway at `/ws` for messages and notifications.
- **Email:** Resend/Postmark; queue jobs with BullMQ + Redis.

## Project layout

```
frontend/              # Next.js (package @edu-forum/frontend)
  app/(public)/        # landing, vacancy search, vacancy detail, blog
  app/(auth)/          # login, register, verify, reset
  app/teacher/         # onboarding wizard, dashboard, profile, CV, applications, invites
  app/hiring/          # principals + directors: vacancies, applicants, teacher search, chat
  app/admin/           # moderation, reports, reference data
  e2e/                 # Playwright (mobile-360 + desktop projects)
backend/               # NestJS (package @edu-forum/backend)
  src/modules/         # auth, users, teachers, cv, vacancies,
                       # search, applications, invitations, interviews, saved, community,
                       # messaging, notifications, reports, meta, admin, uploads
  src/common/          # guards, filters, pipes, serializers
  prisma/schema.prisma
  test/                # Jest + Supertest e2e
shared/                # Zod schemas + TypeScript types (package @edu-forum/shared)
docker-compose.yml     # Postgres/PostGIS, Redis, ClamAV, Mailpit
```

pnpm workspaces. One NestJS module per PRD endpoint group. Zod schemas in `shared/` are the
single source of validation for both client and server; run `pnpm build:shared` after
changing them (root `dev`/`test`/`build` scripts do this first).

Tooling notes: NestJS 12 is ESM-only, so backend tests run Jest under
`node --experimental-vm-modules` (see `backend/package.json`). Backend and frontend pin
TypeScript 5 because the Nest CLI, ts-jest and Next.js use the TypeScript JS API.
`geog` columns are filled from `lat`/`lng` by the `set_geog_from_lat_lng` trigger (init
migration). Never make them `GENERATED` columns: Prisma reads those as defaults and every
later migration tries to `DROP DEFAULT`, which Postgres rejects. Hand-written SQL (PostGIS,
partial unique index, CHECK constraints) lives at the end of the init migration.
`prisma migrate dev` can hang waiting for a prompt in non-interactive shells; use
`--create-only` to write a migration and `prisma migrate deploy` to apply it.
External services are picked by `*_DRIVER` env vars (`STORAGE_DRIVER`, `SCANNER_DRIVER`,
`CONVERTER_DRIVER`, `QUEUE_DRIVER`, `MAIL_DRIVER`, `SMS_DRIVER`); `backend/test/setup-env.ts`
switches them all to in-memory/inline so tests never touch B2, ClamAV, Gotenberg or Redis.
BullMQ 6 needs `ioredis` installed alongside it. Gotenberg (DOC/DOCX→PDF) runs on port 3100.
The B2 bucket's CORS rule allows browser uploads from `http://localhost:3000` only; add the
production origin before launch. Upload flow: `POST /uploads/sign` → browser PUT to B2 →
feature endpoint claims the upload (size + file-signature check) → background ClamAV scan →
the feature's scan listener (`UploadsService.onScanned`).

## Confirmed decisions (resolve the PRD's open questions — 2026-10-31)

- Product name **EDU-FORUM** (`APP_NAME` in `shared/src/app.ts`); "TeachHire" in the PRD means this.
- Launch in all 36 states + FCT (no single pilot state).
- TRCN is optional for teachers; vacancies may require it via `required_certifications`.
- Anonymous vacancies get **no** `JobPosting` JSON-LD.
- Scope: PRD MVP + v1.0 + v1.1, web only (mobile-first PWA); native apps deferred.
- File storage is Backblaze B2 (S3-compatible API) both locally and in production (MinIO
  no longer ships a Docker image). Other services sit behind interfaces: ClamAV, Mailpit and
  console/stub adapters locally; Resend, Termii and Google Geocoding in production.
  Leaflet + OpenStreetMap for the map pin, Tiptap for rich text, Google Privacy &
  Messaging as the certified consent tool.
- Testing: Jest + Supertest (backend), Vitest (frontend units), Playwright (E2E).
- Profile completeness weights: CV 20, qualification 15, experience 15, preferences 15,
  location 10, personal details 10 (required = 85%); photo 10, bio 5.
  Publishing also requires personal details (name, gender, date of birth).
- A published profile cannot delete its last experience entry (unpublish first).
- BullMQ job queue arrived in Phase 3 (scan + convert jobs); Gotenberg converts DOC/DOCX.
- Recommendations = the PRD's matching (recommended vacancies / recommended teachers, Phase 7).
- **Community (added by the user, 2026-10-31; not in the PRD):** one shared feed, like
  Facebook: anyone with an account (teacher, principal, director) posts to their status, and
  every signed-in user sees every post and can like and comment. Updates live over `/ws`.
  Signed-out visitors see nothing: `noindex`, robots disallow, no ads. (A separate
  teachers-only space was dropped by the user.) Moderation: report, admin remove, block, and a warning not to share phone
  numbers (so contact gating cannot be bypassed). Built right after Phase 11 messaging; its
  endpoints are listed here when built, since the PRD is a PDF.
  Community features (user, 2026-10-31): reactions/likes on posts and comments; photos on
  posts (same signed-upload + ClamAV pipeline); sharing a job vacancy into the feed (anonymous
  vacancies still hide the school); topic tags (e.g. Lesson ideas, Job tips, Salary talk);
  notifications when someone comments on your post (via the Phase 11 notification system).
- PRD PDF garbles some paths; use the hyphenated forms (`/auth/resend-verification`,
  `/auth/change-password`, `/vacancies/:id/applications/bulk-status`, `/saved-searches/:id`,
  `/webhooks/storage/scan-result`, `/vacancies/by-slug/:slug`,
  `/vacancies/:id/recommended-teachers`).

## User changes to the PRD (2026-10-31) — these override the PRD

- **Accounts:** sign-up offers **Teacher, Principal or Director** (roles `teacher`,
  `principal`, `director`; `admin` comes from the seed). Principals and directors have the
  same access. The PRD's school owner / recruiter roles, `POST /schools`, `/schools/me/*`,
  team invites (FR-3) and school pages (`/schools/{slug}`, `Organization` JSON-LD) are
  removed. Principals and directors fill in no profile: school name, location and details are
  typed on each vacancy.
- **No identity verification** (FR-2 step 8, FR-3 step 4, `/verifications/*`, the admin
  verification queue, verified badges and "verified first" ranking are removed). Email/phone
  confirmation at sign-up stays.
- **Teacher details are open to principals and directors:** they always see a teacher's
  phone and email and can view/download CVs (still never the street address or exact pin),
  and they can open a chat with any teacher from the profile at any time; no shortlist gate.
  Every CV view/download is still logged.

## API conventions

- Base `/api/v1`, JSON, `camelCase` fields in JSON, `snake_case` in the database.
- Pagination: `?page=1&limit=20` (max 50) → `{ data, meta: { page, limit, total } }`.
  Messages use cursor pagination.
- Errors: `{ error: { code, message, details? } }` with proper status codes
  (400 validation, 401, 403, 404, 409 duplicate application, 422 business rule such as
  "profile incomplete").
- `POST /teachers/me/publish` returns 422 with `details.missing: string[]` listing exactly
  which required items are missing.
- Every role check lives in a guard (`@Roles('teacher')`, `@Roles('leader')` = principal or
  director, `@Roles('admin')`) plus a resource-ownership check in the service (a principal or
  director only manages the vacancies and applicants they posted).
- Log every CV view/download and every admin action (`ProfileView`, `AuditLog`).
- Implement endpoints exactly as listed in the PRD's "API endpoints" section; if a new one
  is needed, add it to the PRD table in the same change.

## Search behaviour

- `GET /vacancies` and `GET /teachers` accept `lat, lng, radiusKm`; if absent, default to
  the caller's saved location; if the caller has none, filter by `state`/`lga` only.
- Match score (0–100): subjects 30, level 20, qualification 15, experience 15,
  certifications 10, distance 10. Compute in SQL or a service; expose as `matchScore`.
- Rank complete profiles above incomplete ones.

## Application pipeline

Statuses: `applied → viewed → shortlisted → interview → offered → hired`, plus `rejected`
and `withdrawn` from any non-final state. Record each change in `ApplicationStatusHistory`
and notify the teacher. For anonymous vacancies, shortlisting (or an invite) reveals the
school name to that teacher. Contact details and chat are always open (see "User changes").
One application per teacher per vacancy (unique index).

## Build order

1. Schema + migrations + seed (states/LGAs, subjects, levels, qualification and
   certification types).
2. Auth and `/me`.
3. Teacher onboarding wizard (resumable steps) + CV upload pipeline + publish gate.
4. Principal/director accounts (replaced school onboarding; identity verification dropped).
5. Vacancy CRUD with listed/anonymous serializer.
6. Vacancy search and teacher search with location filters.
7. Applications + status pipeline + email notifications.
8. Admin moderation (no verification queue).
9. SEO layer: slugs, metadata, JSON-LD, sitemaps, robots.txt, landing pages.
10. Invitations, interviews, messaging, saved searches, dashboards, then community.
11. Blog/CMS, then AdSense (`AdSlot`, consent, ads.txt, admin ad settings).

## Definition of done for any feature

- Zod validation on client and server; required pillar fields cannot be bypassed via API.
- Role and ownership guards covered by tests (a principal/director cannot read applicants of
  someone else's vacancy; a teacher cannot read another teacher's CV).
- Anonymous vacancy never leaks school identity in any endpoint response (test it).
- Teacher address and coordinates never appear in principal/director-facing responses (test it).
- File upload rejects wrong MIME/extension and files over 5 MB.
- Mobile layout checked at 360 px width.
- Public pages: correct metadata, canonical, JSON-LD and no CLS from ad slots; private
  pages carry `noindex` and show no ads.
- PRD endpoint table updated if endpoints changed.
