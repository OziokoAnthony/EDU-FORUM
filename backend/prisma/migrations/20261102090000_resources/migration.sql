-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "UploadPurpose" ADD VALUE 'teaching_material';
ALTER TYPE "UploadPurpose" ADD VALUE 'exam_timetable';

-- CreateTable
CREATE TABLE "teaching_materials" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subject" TEXT,
    "class_level" TEXT,
    "term" TEXT,
    "upload_id" UUID NOT NULL,
    "object_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "teaching_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "state_id" UUID,
    "note" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exams" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exam_timetables" (
    "id" UUID NOT NULL,
    "exam_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "session" TEXT NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "upload_id" UUID NOT NULL,
    "object_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "exam_timetables_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "teaching_materials_slug_key" ON "teaching_materials"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "teaching_materials_upload_id_key" ON "teaching_materials"("upload_id");

-- CreateIndex
CREATE INDEX "teaching_materials_subject_class_level_idx" ON "teaching_materials"("subject", "class_level");

-- CreateIndex
CREATE INDEX "teaching_materials_created_at_idx" ON "teaching_materials"("created_at");

-- CreateIndex
CREATE INDEX "calendar_events_start_date_idx" ON "calendar_events"("start_date");

-- CreateIndex
CREATE UNIQUE INDEX "exams_name_key" ON "exams"("name");

-- CreateIndex
CREATE UNIQUE INDEX "exams_slug_key" ON "exams"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "exam_timetables_upload_id_key" ON "exam_timetables"("upload_id");

-- CreateIndex
CREATE INDEX "exam_timetables_exam_id_year_idx" ON "exam_timetables"("exam_id", "year");

-- AddForeignKey
ALTER TABLE "teaching_materials" ADD CONSTRAINT "teaching_materials_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "uploads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_materials" ADD CONSTRAINT "teaching_materials_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_state_id_fkey" FOREIGN KEY ("state_id") REFERENCES "states"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_timetables" ADD CONSTRAINT "exam_timetables_exam_id_fkey" FOREIGN KEY ("exam_id") REFERENCES "exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_timetables" ADD CONSTRAINT "exam_timetables_upload_id_fkey" FOREIGN KEY ("upload_id") REFERENCES "uploads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_timetables" ADD CONSTRAINT "exam_timetables_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Starter exams (user, 2026-11-01); admins add or retire them as reference data `exams`.
INSERT INTO "exams" ("id", "name", "slug", "full_name", "sort_order", "updated_at") VALUES
  (gen_random_uuid(), 'WAEC WASSCE', 'waec', 'West African Senior School Certificate Examination (WAEC)', 1, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'NECO SSCE', 'neco', 'National Examinations Council Senior School Certificate Examination', 2, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'NABTEB', 'nabteb', 'National Business and Technical Examinations Board', 3, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'JAMB UTME', 'jamb-utme', 'Joint Admissions and Matriculation Board Unified Tertiary Matriculation Examination', 4, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'BECE', 'bece', 'Basic Education Certificate Examination (Junior WAEC)', 5, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'Common Entrance', 'common-entrance', 'National Common Entrance Examination (NCEE) into Federal Unity Colleges', 6, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'First School Leaving', 'first-school-leaving', 'First School Leaving Certificate Examination (Primary 6)', 7, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'IELTS', 'ielts', 'International English Language Testing System', 8, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'TRCN PQE', 'trcn-pqe', 'Teachers Registration Council of Nigeria Professional Qualifying Examination', 9, CURRENT_TIMESTAMP);
