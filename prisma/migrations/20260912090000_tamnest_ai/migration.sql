-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('HUMAN', 'AI_AGENT');

-- CreateEnum
CREATE TYPE "AiMessageRole" AS ENUM ('USER', 'ASSISTANT');

-- AlterTable: dữ liệu hiện có là người dùng thật.
ALTER TABLE "users"
ADD COLUMN "user_type" "UserType" NOT NULL DEFAULT 'HUMAN';

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "agent_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" "AiMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_user_type_department_id_deleted_at_idx"
ON "users"("user_type", "department_id", "deleted_at");

-- The former index is replaced by the user-type-aware index above.
DROP INDEX IF EXISTS "users_department_id_deleted_at_idx";

-- CreateIndex
CREATE INDEX "ai_conversations_user_id_updated_at_idx"
ON "ai_conversations"("user_id", "updated_at");

-- CreateIndex
CREATE INDEX "ai_conversations_agent_id_idx"
ON "ai_conversations"("agent_id");

-- CreateIndex
CREATE INDEX "ai_messages_conversation_id_created_at_idx"
ON "ai_messages"("conversation_id", "created_at");

-- AddForeignKey
ALTER TABLE "ai_conversations"
ADD CONSTRAINT "ai_conversations_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations"
ADD CONSTRAINT "ai_conversations_agent_id_fkey"
FOREIGN KEY ("agent_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages"
ADD CONSTRAINT "ai_messages_conversation_id_fkey"
FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
