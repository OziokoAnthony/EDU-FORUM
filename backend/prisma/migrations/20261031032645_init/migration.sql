-- PostGIS for location search (ST_DWithin / ST_Distance on geog columns).
CREATE EXTENSION IF NOT EXISTS postgis;

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('teacher', 'school_owner', 'recruiter', 'admin');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'suspended');

-- CreateEnum
CREATE TYPE "AuthTokenType" AS ENUM ('email_verification', 'phone_otp', 'password_reset');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'prefer_not_to_say');

-- CreateEnum
CREATE TYPE "JobType" AS ENUM ('full_time', 'part_time', 'contract', 'tutoring');

-- CreateEnum
CREATE TYPE "SalaryPeriod" AS ENUM ('monthly', 'annual', 'hourly');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('unverified', 'pending', 'verified', 'rejected');

-- CreateEnum
CREATE TYPE "ProfileVisibility" AS ENUM ('visible', 'hidden');

-- CreateEnum
CREATE TYPE "ExperienceKind" AS ENUM ('job', 'nysc', 'teaching_practice');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('pending', 'clean', 'infected', 'failed');

-- CreateEnum
CREATE TYPE "CvMimeType" AS ENUM ('pdf', 'doc', 'docx');

-- CreateEnum
CREATE TYPE "DocumentOwnerType" AS ENUM ('teacher', 'school');

-- CreateEnum
CREATE TYPE "IdentityDocType" AS ENUM ('nin_slip', 'voters_card', 'drivers_licence', 'international_passport', 'cac_certificate', 'moe_approval_letter', 'contact_person_id');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('pending', 'verified', 'rejected');

-- CreateEnum
CREATE TYPE "SchoolType" AS ENUM ('nursery', 'primary', 'secondary', 'combined', 'tertiary', 'tutorial_centre');

-- CreateEnum
CREATE TYPE "SchoolOwnership" AS ENUM ('private', 'public', 'mission');

-- CreateEnum
CREATE TYPE "PopulationBand" AS ENUM ('under_100', 'from_100_to_299', 'from_300_to_599', 'from_600_to_999', 'over_1000');

-- CreateEnum
CREATE TYPE "ContactTitle" AS ENUM ('director', 'proprietor', 'principal', 'head_teacher', 'hr');

-- CreateEnum
CREATE TYPE "SchoolMemberRole" AS ENUM ('owner', 'recruiter');

-- CreateEnum
CREATE TYPE "SchoolMemberStatus" AS ENUM ('active', 'removed');

-- CreateEnum
CREATE TYPE "LocationVisibility" AS ENUM ('listed', 'anonymous');

-- CreateEnum
CREATE TYPE "VacancyStatus" AS ENUM ('draft', 'published', 'paused', 'closed');

-- CreateEnum
CREATE TYPE "VacancyCloseReason" AS ENUM ('filled', 'cancelled', 'expired', 'taken_down');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('applied', 'viewed', 'shortlisted', 'interview', 'offered', 'hired', 'rejected', 'withdrawn');

-- CreateEnum
CREATE TYPE "ApplicationSource" AS ENUM ('applied', 'invited');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('pending', 'accepted', 'declined', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "InterviewMode" AS ENUM ('in_person', 'phone', 'video');

-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('proposed', 'confirmed', 'rescheduled', 'cancelled', 'done');

-- CreateEnum
CREATE TYPE "SavedItemType" AS ENUM ('vacancy', 'teacher');

-- CreateEnum
CREATE TYPE "SavedSearchScope" AS ENUM ('vacancies', 'teachers');

-- CreateEnum
CREATE TYPE "AlertFrequency" AS ENUM ('instant', 'daily', 'weekly', 'off');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('in_app', 'email', 'sms', 'whatsapp');

-- CreateEnum
CREATE TYPE "ProfileViewKind" AS ENUM ('profile', 'cv_view', 'cv_download');

-- CreateEnum
CREATE TYPE "ReportTargetType" AS ENUM ('teacher_profile', 'school', 'vacancy', 'message');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('open', 'resolved', 'dismissed');

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('draft', 'published');

-- CreateEnum
CREATE TYPE "AdPageType" AS ENUM ('home', 'job_search', 'landing', 'job_detail', 'school', 'blog_post');

-- CreateEnum
CREATE TYPE "UploadPurpose" AS ENUM ('cv', 'profile_photo', 'qualification_file', 'certification_file', 'identity_document', 'identity_selfie', 'school_logo', 'message_attachment', 'post_cover');

-- CreateTable
CREATE TABLE "countries" (
    "code" CHAR(2) NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "states" (
    "id" UUID NOT NULL,
    "country_code" CHAR(2) NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lgas" (
    "id" UUID NOT NULL,
    "state_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lgas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "levels" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qualification_types" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "qualification_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certification_types" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "issuer" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certification_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "password_hash" TEXT,
    "google_id" TEXT,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "email_verified_at" TIMESTAMP(3),
    "phone_verified_at" TIMESTAMP(3),
    "last_login_at" TIMESTAMP(3),
    "consent_accepted_at" TIMESTAMP(3),
    "consent_version" TEXT,
    "notification_settings" JSONB NOT NULL DEFAULT '{}',
    "suspended_reason" TEXT,
    "deletion_requested_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "family_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "replaced_by" UUID,
    "user_agent" TEXT,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "AuthTokenType" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploads" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" "UploadPurpose" NOT NULL,
    "object_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "scan_status" "ScanStatus" NOT NULL DEFAULT 'pending',
    "scanned_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "full_name" TEXT,
    "gender" "Gender",
    "dob" DATE,
    "photo_key" TEXT,
    "bio" TEXT,
    "country_code" CHAR(2),
    "state_id" UUID,
    "lga_id" UUID,
    "area" TEXT,
    "address_line" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "geog" geography(Point, 4326),
    "willing_to_relocate" BOOLEAN NOT NULL DEFAULT false,
    "preferred_states" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subjects" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "levels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "job_types" "JobType"[] DEFAULT ARRAY[]::"JobType"[],
    "expected_salary_min" INTEGER,
    "expected_salary_max" INTEGER,
    "available_from" DATE,
    "no_experience_yet" BOOLEAN NOT NULL DEFAULT false,
    "years_experience" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completeness_score" INTEGER NOT NULL DEFAULT 0,
    "onboarding_steps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'unverified',
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMP(3),
    "visibility" "ProfileVisibility" NOT NULL DEFAULT 'visible',
    "moderation_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "teacher_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qualifications" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "qualification_type_id" UUID NOT NULL,
    "course" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "year_obtained" INTEGER NOT NULL,
    "file_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "qualifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certifications" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "certification_type_id" UUID NOT NULL,
    "issuer" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "issued_at" DATE,
    "expires_at" DATE,
    "file_key" TEXT,
    "verification_status" "DocumentStatus" NOT NULL DEFAULT 'pending',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "certifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_experiences" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "kind" "ExperienceKind" NOT NULL DEFAULT 'job',
    "school_name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "subjects" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "levels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "work_experiences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cvs" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "object_key" TEXT NOT NULL,
    "pdf_key" TEXT,
    "file_name" TEXT NOT NULL,
    "mime_type" "CvMimeType" NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "scan_status" "ScanStatus" NOT NULL DEFAULT 'pending',
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replaced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "cvs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cv_snapshots" (
    "id" UUID NOT NULL,
    "source_cv_id" UUID,
    "object_key" TEXT NOT NULL,
    "pdf_key" TEXT,
    "file_name" TEXT NOT NULL,
    "mime_type" "CvMimeType" NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cv_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_documents" (
    "id" UUID NOT NULL,
    "owner_type" "DocumentOwnerType" NOT NULL,
    "teacher_id" UUID,
    "school_id" UUID,
    "doc_type" "IdentityDocType" NOT NULL,
    "doc_number_enc" TEXT,
    "file_key" TEXT NOT NULL,
    "selfie_key" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'pending',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "resubmission_of" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "identity_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schools" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "SchoolType" NOT NULL,
    "ownership" "SchoolOwnership" NOT NULL,
    "curriculum" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "population_band" "PopulationBand",
    "logo_key" TEXT,
    "website" TEXT,
    "description" TEXT,
    "country_code" CHAR(2),
    "state_id" UUID,
    "lga_id" UUID,
    "area" TEXT,
    "address_line" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "geog" geography(Point, 4326),
    "contact_name" TEXT,
    "contact_title" "ContactTitle",
    "contact_phone" TEXT,
    "contact_email" TEXT,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'unverified',
    "verified_at" TIMESTAMP(3),
    "onboarding_steps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "schools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_members" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "SchoolMemberRole" NOT NULL,
    "invited_by" UUID,
    "status" "SchoolMemberStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "school_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_invites" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "SchoolMemberRole" NOT NULL DEFAULT 'recruiter',
    "token_hash" TEXT NOT NULL,
    "invited_by" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vacancies" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "short_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subjects" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "levels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "job_type" "JobType" NOT NULL,
    "salary_min" INTEGER NOT NULL,
    "salary_max" INTEGER NOT NULL,
    "salary_currency" CHAR(3) NOT NULL DEFAULT 'NGN',
    "salary_period" "SalaryPeriod" NOT NULL DEFAULT 'monthly',
    "description" TEXT NOT NULL,
    "country_code" CHAR(2) NOT NULL DEFAULT 'NG',
    "state_id" UUID NOT NULL,
    "lga_id" UUID NOT NULL,
    "area" TEXT,
    "address_line" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "geog" geography(Point, 4326),
    "location_visibility" "LocationVisibility" NOT NULL,
    "required_qualifications" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "min_experience_years" INTEGER,
    "required_certifications" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "openings" INTEGER NOT NULL DEFAULT 1,
    "benefits" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "screening_questions" JSONB NOT NULL DEFAULT '[]',
    "deadline" DATE,
    "start_date" DATE,
    "status" "VacancyStatus" NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "close_reason" "VacancyCloseReason",
    "needs_review" BOOLEAN NOT NULL DEFAULT false,
    "takedown_reason" TEXT,
    "views_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "vacancies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" UUID NOT NULL,
    "vacancy_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "cv_snapshot_id" UUID NOT NULL,
    "cover_note" TEXT,
    "screening_answers" JSONB NOT NULL DEFAULT '[]',
    "source" "ApplicationSource" NOT NULL DEFAULT 'applied',
    "status" "ApplicationStatus" NOT NULL DEFAULT 'applied',
    "rating" INTEGER,
    "match_score" INTEGER NOT NULL DEFAULT 0,
    "shortlisted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_status_history" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "from_status" "ApplicationStatus",
    "to_status" "ApplicationStatus" NOT NULL,
    "changed_by" UUID NOT NULL,
    "message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_notes" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "application_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "vacancy_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "invited_by" UUID NOT NULL,
    "message" TEXT,
    "status" "InvitationStatus" NOT NULL DEFAULT 'pending',
    "application_id" UUID,
    "responded_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interviews" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "duration_minutes" INTEGER,
    "mode" "InterviewMode" NOT NULL,
    "location_or_link" TEXT NOT NULL,
    "status" "InterviewStatus" NOT NULL DEFAULT 'proposed',
    "proposed_at" TIMESTAMP(3),
    "proposal_note" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "interviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_items" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "item_type" "SavedItemType" NOT NULL,
    "item_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_searches" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "scope" "SavedSearchScope" NOT NULL,
    "name" TEXT,
    "filters" JSONB NOT NULL,
    "alert_frequency" "AlertFrequency" NOT NULL DEFAULT 'daily',
    "last_alerted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "saved_searches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "application_id" UUID,
    "blocked_by" UUID,
    "blocked_at" TIMESTAMP(3),
    "last_message_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "body" TEXT,
    "attachment_key" TEXT,
    "attachment_name" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "channel" "NotificationChannel" NOT NULL DEFAULT 'in_app',
    "sent_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profile_views" (
    "id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "school_id" UUID NOT NULL,
    "viewer_id" UUID NOT NULL,
    "kind" "ProfileViewKind" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "target_type" "ReportTargetType" NOT NULL,
    "target_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'open',
    "resolved_by" UUID,
    "resolved_at" TIMESTAMP(3),
    "resolution" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "category" TEXT,
    "excerpt" TEXT,
    "body" TEXT NOT NULL,
    "cover_image_key" TEXT,
    "meta_title" TEXT,
    "meta_description" TEXT,
    "status" "PostStatus" NOT NULL DEFAULT 'draft',
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_settings" (
    "id" UUID NOT NULL,
    "page_type" "AdPageType" NOT NULL,
    "slot_name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "slot_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "states_slug_key" ON "states"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "states_country_code_name_key" ON "states"("country_code", "name");

-- CreateIndex
CREATE UNIQUE INDEX "lgas_state_id_slug_key" ON "lgas"("state_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_name_key" ON "subjects"("name");

-- CreateIndex
CREATE UNIQUE INDEX "subjects_slug_key" ON "subjects"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "levels_name_key" ON "levels"("name");

-- CreateIndex
CREATE UNIQUE INDEX "levels_slug_key" ON "levels"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "qualification_types_name_key" ON "qualification_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "qualification_types_slug_key" ON "qualification_types"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "certification_types_name_key" ON "certification_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "certification_types_slug_key" ON "certification_types"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- CreateIndex
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- CreateIndex
CREATE INDEX "auth_tokens_user_id_type_idx" ON "auth_tokens"("user_id", "type");

-- CreateIndex
CREATE INDEX "auth_tokens_token_hash_idx" ON "auth_tokens"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "uploads_object_key_key" ON "uploads"("object_key");

-- CreateIndex
CREATE INDEX "uploads_user_id_purpose_idx" ON "uploads"("user_id", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_profiles_user_id_key" ON "teacher_profiles"("user_id");

-- CreateIndex
CREATE INDEX "teacher_profiles_is_published_visibility_verification_statu_idx" ON "teacher_profiles"("is_published", "visibility", "verification_status");

-- CreateIndex
CREATE INDEX "teacher_profiles_state_id_lga_id_idx" ON "teacher_profiles"("state_id", "lga_id");

-- CreateIndex
CREATE INDEX "teacher_profiles_subjects_idx" ON "teacher_profiles" USING GIN ("subjects");

-- CreateIndex
CREATE INDEX "teacher_profiles_levels_idx" ON "teacher_profiles" USING GIN ("levels");

-- CreateIndex
CREATE INDEX "teacher_profiles_geog_idx" ON "teacher_profiles" USING GIST ("geog");

-- CreateIndex
CREATE INDEX "qualifications_teacher_id_idx" ON "qualifications"("teacher_id");

-- CreateIndex
CREATE INDEX "certifications_teacher_id_idx" ON "certifications"("teacher_id");

-- CreateIndex
CREATE INDEX "certifications_certification_type_id_verification_status_idx" ON "certifications"("certification_type_id", "verification_status");

-- CreateIndex
CREATE INDEX "work_experiences_teacher_id_idx" ON "work_experiences"("teacher_id");

-- CreateIndex
CREATE INDEX "cvs_teacher_id_is_active_idx" ON "cvs"("teacher_id", "is_active");

-- CreateIndex
CREATE INDEX "identity_documents_status_owner_type_created_at_idx" ON "identity_documents"("status", "owner_type", "created_at");

-- CreateIndex
CREATE INDEX "identity_documents_teacher_id_idx" ON "identity_documents"("teacher_id");

-- CreateIndex
CREATE INDEX "identity_documents_school_id_idx" ON "identity_documents"("school_id");

-- CreateIndex
CREATE UNIQUE INDEX "schools_slug_key" ON "schools"("slug");

-- CreateIndex
CREATE INDEX "schools_state_id_lga_id_idx" ON "schools"("state_id", "lga_id");

-- CreateIndex
CREATE INDEX "schools_verification_status_idx" ON "schools"("verification_status");

-- CreateIndex
CREATE INDEX "schools_geog_idx" ON "schools" USING GIST ("geog");

-- CreateIndex
CREATE INDEX "school_members_user_id_idx" ON "school_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "school_members_school_id_user_id_key" ON "school_members"("school_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "school_invites_token_hash_key" ON "school_invites"("token_hash");

-- CreateIndex
CREATE INDEX "school_invites_school_id_email_idx" ON "school_invites"("school_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "vacancies_short_id_key" ON "vacancies"("short_id");

-- CreateIndex
CREATE INDEX "vacancies_status_published_at_idx" ON "vacancies"("status", "published_at");

-- CreateIndex
CREATE INDEX "vacancies_school_id_status_idx" ON "vacancies"("school_id", "status");

-- CreateIndex
CREATE INDEX "vacancies_state_id_lga_id_status_idx" ON "vacancies"("state_id", "lga_id", "status");

-- CreateIndex
CREATE INDEX "vacancies_subjects_idx" ON "vacancies" USING GIN ("subjects");

-- CreateIndex
CREATE INDEX "vacancies_levels_idx" ON "vacancies" USING GIN ("levels");

-- CreateIndex
CREATE INDEX "vacancies_geog_idx" ON "vacancies" USING GIST ("geog");

-- CreateIndex
CREATE INDEX "applications_teacher_id_status_idx" ON "applications"("teacher_id", "status");

-- CreateIndex
CREATE INDEX "applications_vacancy_id_status_idx" ON "applications"("vacancy_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "applications_vacancy_id_teacher_id_key" ON "applications"("vacancy_id", "teacher_id");

-- CreateIndex
CREATE INDEX "application_status_history_application_id_created_at_idx" ON "application_status_history"("application_id", "created_at");

-- CreateIndex
CREATE INDEX "application_notes_application_id_idx" ON "application_notes"("application_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_application_id_key" ON "invitations"("application_id");

-- CreateIndex
CREATE INDEX "invitations_teacher_id_status_idx" ON "invitations"("teacher_id", "status");

-- CreateIndex
CREATE INDEX "invitations_vacancy_id_idx" ON "invitations"("vacancy_id");

-- CreateIndex
CREATE INDEX "interviews_application_id_idx" ON "interviews"("application_id");

-- CreateIndex
CREATE INDEX "interviews_scheduled_at_idx" ON "interviews"("scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "saved_items_user_id_item_type_item_id_key" ON "saved_items"("user_id", "item_type", "item_id");

-- CreateIndex
CREATE INDEX "saved_searches_user_id_idx" ON "saved_searches"("user_id");

-- CreateIndex
CREATE INDEX "saved_searches_alert_frequency_last_alerted_at_idx" ON "saved_searches"("alert_frequency", "last_alerted_at");

-- CreateIndex
CREATE INDEX "conversations_teacher_id_last_message_at_idx" ON "conversations"("teacher_id", "last_message_at");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_school_id_teacher_id_key" ON "conversations"("school_id", "teacher_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_id_idx" ON "messages"("conversation_id", "created_at" DESC, "id");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at" DESC);

-- CreateIndex
CREATE INDEX "profile_views_teacher_id_created_at_idx" ON "profile_views"("teacher_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "reports_status_created_at_idx" ON "reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "reports_target_type_target_id_idx" ON "reports"("target_type", "target_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_created_at_idx" ON "audit_logs"("actor_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_target_type_target_id_idx" ON "audit_logs"("target_type", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "posts_slug_key" ON "posts"("slug");

-- CreateIndex
CREATE INDEX "posts_status_published_at_idx" ON "posts"("status", "published_at");

-- CreateIndex
CREATE UNIQUE INDEX "ad_settings_page_type_slot_name_key" ON "ad_settings"("page_type", "slot_name");

-- AddForeignKey
ALTER TABLE "states" ADD CONSTRAINT "states_country_code_fkey" FOREIGN KEY ("country_code") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lgas" ADD CONSTRAINT "lgas_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "states"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "states"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_lga_id_fkey" FOREIGN KEY ("lga_id") REFERENCES "lgas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qualifications" ADD CONSTRAINT "qualifications_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qualifications" ADD CONSTRAINT "qualifications_qualification_type_id_fkey" FOREIGN KEY ("qualification_type_id") REFERENCES "qualification_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_certification_type_id_fkey" FOREIGN KEY ("certification_type_id") REFERENCES "certification_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certifications" ADD CONSTRAINT "certifications_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_experiences" ADD CONSTRAINT "work_experiences_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cvs" ADD CONSTRAINT "cvs_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_snapshots" ADD CONSTRAINT "cv_snapshots_source_cv_id_fkey" FOREIGN KEY ("source_cv_id") REFERENCES "cvs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_documents" ADD CONSTRAINT "identity_documents_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_documents" ADD CONSTRAINT "identity_documents_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_documents" ADD CONSTRAINT "identity_documents_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_documents" ADD CONSTRAINT "identity_documents_resubmission_of_fkey" FOREIGN KEY ("resubmission_of") REFERENCES "identity_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schools" ADD CONSTRAINT "schools_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "states"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schools" ADD CONSTRAINT "schools_lga_id_fkey" FOREIGN KEY ("lga_id") REFERENCES "lgas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_members" ADD CONSTRAINT "school_members_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_members" ADD CONSTRAINT "school_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_members" ADD CONSTRAINT "school_members_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_invites" ADD CONSTRAINT "school_invites_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_invites" ADD CONSTRAINT "school_invites_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vacancies" ADD CONSTRAINT "vacancies_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vacancies" ADD CONSTRAINT "vacancies_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vacancies" ADD CONSTRAINT "vacancies_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "states"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vacancies" ADD CONSTRAINT "vacancies_lga_id_fkey" FOREIGN KEY ("lga_id") REFERENCES "lgas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_vacancy_id_fkey" FOREIGN KEY ("vacancy_id") REFERENCES "vacancies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_cv_snapshot_id_fkey" FOREIGN KEY ("cv_snapshot_id") REFERENCES "cv_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_status_history" ADD CONSTRAINT "application_status_history_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_status_history" ADD CONSTRAINT "application_status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_notes" ADD CONSTRAINT "application_notes_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_notes" ADD CONSTRAINT "application_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_vacancy_id_fkey" FOREIGN KEY ("vacancy_id") REFERENCES "vacancies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_items" ADD CONSTRAINT "saved_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_searches" ADD CONSTRAINT "saved_searches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_blocked_by_fkey" FOREIGN KEY ("blocked_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_views" ADD CONSTRAINT "profile_views_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teacher_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_views" ADD CONSTRAINT "profile_views_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profile_views" ADD CONSTRAINT "profile_views_viewer_id_fkey" FOREIGN KEY ("viewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───── Hand-written rules Prisma cannot express ─────

-- One active CV per teacher.
CREATE UNIQUE INDEX "cvs_one_active_per_teacher" ON "cvs" ("teacher_id") WHERE "is_active" AND "deleted_at" IS NULL;

-- Vacancy salary: both > 0 and min <= max; openings >= 1.
ALTER TABLE "vacancies" ADD CONSTRAINT "vacancies_salary_check"
  CHECK ("salary_min" > 0 AND "salary_max" > 0 AND "salary_min" <= "salary_max");
ALTER TABLE "vacancies" ADD CONSTRAINT "vacancies_openings_check" CHECK ("openings" >= 1);

-- Teacher expected salary range, when given.
ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_salary_check"
  CHECK ("expected_salary_min" IS NULL OR "expected_salary_max" IS NULL OR "expected_salary_min" <= "expected_salary_max");

-- Applicant rating 1–5.
ALTER TABLE "applications" ADD CONSTRAINT "applications_rating_check" CHECK ("rating" IS NULL OR "rating" BETWEEN 1 AND 5);

-- Identity documents belong to exactly one owner matching owner_type.
ALTER TABLE "identity_documents" ADD CONSTRAINT "identity_documents_owner_check" CHECK (
  ("owner_type" = 'teacher' AND "teacher_id" IS NOT NULL AND "school_id" IS NULL) OR
  ("owner_type" = 'school' AND "school_id" IS NOT NULL AND "teacher_id" IS NULL)
);

-- Keep geog in sync with lat/lng (a trigger, not a generated column, so Prisma sees no drift).
CREATE FUNCTION set_geog_from_lat_lng() RETURNS trigger AS $$
BEGIN
  IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL THEN
    NEW.geog := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
  ELSE
    NEW.geog := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER teacher_profiles_set_geog BEFORE INSERT OR UPDATE OF lat, lng ON teacher_profiles
  FOR EACH ROW EXECUTE FUNCTION set_geog_from_lat_lng();
CREATE TRIGGER schools_set_geog BEFORE INSERT OR UPDATE OF lat, lng ON schools
  FOR EACH ROW EXECUTE FUNCTION set_geog_from_lat_lng();
CREATE TRIGGER vacancies_set_geog BEFORE INSERT OR UPDATE OF lat, lng ON vacancies
  FOR EACH ROW EXECUTE FUNCTION set_geog_from_lat_lng();

-- Coordinates must be valid when present.
ALTER TABLE "teacher_profiles" ADD CONSTRAINT "teacher_profiles_latlng_check" CHECK ("lat" BETWEEN -90 AND 90 AND "lng" BETWEEN -180 AND 180);
ALTER TABLE "schools" ADD CONSTRAINT "schools_latlng_check" CHECK ("lat" BETWEEN -90 AND 90 AND "lng" BETWEEN -180 AND 180);
ALTER TABLE "vacancies" ADD CONSTRAINT "vacancies_latlng_check" CHECK ("lat" BETWEEN -90 AND 90 AND "lng" BETWEEN -180 AND 180);
