-- AlterEnum: thêm trạng thái "Bảo hành" cho dự án (giai đoạn 9)
ALTER TYPE "ProjectStatus" ADD VALUE 'WARRANTY' BEFORE 'COMPLETED';
