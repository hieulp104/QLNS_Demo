-- CreateEnum
CREATE TYPE "MaintenanceKind" AS ENUM ('SCHEDULED_CHECK', 'CUSTOMER_REQUEST');

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MaintenancePriority" AS ENUM ('NORMAL', 'URGENT');

-- CreateTable
CREATE TABLE "maintenance_tasks" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "kind" "MaintenanceKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "milestone_months" INTEGER,
    "due_date" TIMESTAMP(3),
    "reported_at" TIMESTAMP(3),
    "reporter_note" TEXT,
    "priority" "MaintenancePriority" NOT NULL DEFAULT 'NORMAL',
    "status" "MaintenanceStatus" NOT NULL DEFAULT 'PENDING',
    "assignee_id" TEXT,
    "handled_by_id" TEXT,
    "handled_at" TIMESTAMP(3),
    "result_note" TEXT,
    "created_by_id" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maintenance_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "maintenance_tasks_status_due_date_idx" ON "maintenance_tasks"("status", "due_date");

-- CreateIndex
CREATE INDEX "maintenance_tasks_project_id_kind_idx" ON "maintenance_tasks"("project_id", "kind");

-- CreateIndex
CREATE INDEX "maintenance_tasks_assignee_id_status_idx" ON "maintenance_tasks"("assignee_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_tasks_project_id_milestone_months_key" ON "maintenance_tasks"("project_id", "milestone_months");

-- AddForeignKey
ALTER TABLE "maintenance_tasks" ADD CONSTRAINT "maintenance_tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tasks" ADD CONSTRAINT "maintenance_tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tasks" ADD CONSTRAINT "maintenance_tasks_handled_by_id_fkey" FOREIGN KEY ("handled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tasks" ADD CONSTRAINT "maintenance_tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
