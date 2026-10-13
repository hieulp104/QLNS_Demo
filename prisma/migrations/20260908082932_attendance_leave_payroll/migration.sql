-- CreateEnum
CREATE TYPE "AttendanceMark" AS ENUM ('FULL', 'HALF', 'ABSENT', 'HOLIDAY', 'ANNUAL_LEAVE');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('UNPAID', 'HOLIDAY', 'ANNUAL', 'SICK', 'OTHER');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AdvanceMethod" AS ENUM ('CASH', 'TRANSFER');

-- CreateEnum
CREATE TYPE "PayrollStatus" AS ENUM ('DRAFT', 'LOCKED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "base_salary" DECIMAL(15,0),
ADD COLUMN     "insurance_base" DECIMAL(15,0),
ADD COLUMN     "is_fixed_salary" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "attendance_days" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "work_date" DATE NOT NULL,
    "mark" "AttendanceMark" NOT NULL,
    "overtime_hours" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "LeaveType" NOT NULL,
    "from_date" DATE NOT NULL,
    "to_date" DATE NOT NULL,
    "half_day" BOOLEAN NOT NULL DEFAULT false,
    "day_count" DECIMAL(4,1) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "approver_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_advances" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "advance_date" DATE NOT NULL,
    "amount" DECIMAL(15,0) NOT NULL,
    "method" "AdvanceMethod" NOT NULL,
    "note" TEXT,
    "created_by_id" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_advances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_periods" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "PayrollStatus" NOT NULL DEFAULT 'DRAFT',
    "locked_at" TIMESTAMP(3),
    "locked_by_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_lines" (
    "id" TEXT NOT NULL,
    "period_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "is_fixed_salary" BOOLEAN NOT NULL DEFAULT false,
    "base_salary" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "work_days" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "sunday_days" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "overtime_days" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "total_days" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "gross_salary" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "rounded_salary" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "advance_amount" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "material_deduction" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "insurance_deduction" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "bonus_sales" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "bonus_responsibility" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "bonus_attendance" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "bonus_punctuality" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "total_salary" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "net_salary" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_days_work_date_idx" ON "attendance_days"("work_date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_days_user_id_work_date_key" ON "attendance_days"("user_id", "work_date");

-- CreateIndex
CREATE INDEX "leave_requests_user_id_status_idx" ON "leave_requests"("user_id", "status");

-- CreateIndex
CREATE INDEX "leave_requests_status_from_date_idx" ON "leave_requests"("status", "from_date");

-- CreateIndex
CREATE INDEX "salary_advances_user_id_advance_date_idx" ON "salary_advances"("user_id", "advance_date");

-- CreateIndex
CREATE INDEX "salary_advances_advance_date_idx" ON "salary_advances"("advance_date");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_periods_year_month_key" ON "payroll_periods"("year", "month");

-- CreateIndex
CREATE INDEX "payroll_lines_user_id_idx" ON "payroll_lines"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_lines_period_id_user_id_key" ON "payroll_lines"("period_id", "user_id");

-- AddForeignKey
ALTER TABLE "attendance_days" ADD CONSTRAINT "attendance_days_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_days" ADD CONSTRAINT "attendance_days_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_advances" ADD CONSTRAINT "salary_advances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_advances" ADD CONSTRAINT "salary_advances_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_locked_by_id_fkey" FOREIGN KEY ("locked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "payroll_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
