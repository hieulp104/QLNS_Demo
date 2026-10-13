-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('PROJECT_MEMBER_ADDED', 'PROJECT_STAGE_CHANGED', 'PROJECT_COMMENT', 'PROJECT_OVERDUE', 'MAINTENANCE_REQUEST_NEW', 'MAINTENANCE_ASSIGNED', 'MAINTENANCE_DUE', 'CONTRACT_UNDERPAID', 'LEAVE_REQUEST_PENDING', 'LEAVE_REQUEST_RESULT', 'SYSTEM');

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "href" TEXT,
    "entity" TEXT,
    "entity_id" TEXT,
    "actor_id" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_recipient_id_read_at_created_at_idx" ON "notifications"("recipient_id", "read_at", "created_at");

-- CreateIndex
CREATE INDEX "notifications_recipient_id_type_entity_id_idx" ON "notifications"("recipient_id", "type", "entity_id");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
