import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Lock, Pencil } from "lucide-react";
import { getCurrentUser } from "@/modules/auth/auth.service";
import { can, canSeeMoney, hasPermission } from "@/common/permissions/permissions";
import {
  DEPARTMENT_LABEL, PROJECT_STATUS_LABEL, PROJECT_TYPE_LABEL, PROJECT_FILE_KINDS, PROJECT_IMAGE_KINDS, STAGE_LABEL, } from "@/common/enums";
import { formatDate, formatVnd } from "@/lib/utils";
import { PageHeader } from "@/components/patterns/page-header";
import { ButtonLink, Card, DescriptionRow, EmptyStatePanel, TextLink, BackLink } from "@/components/ui";
import {
  getProject,
  memberIdsOf,
  listAssignableUsers,
} from "@/modules/projects/projects.service";
import {
  daysUntilPurge,
  listTrashedFiles,
  withDownloadUrls,
  TRASH_RETENTION_DAYS,
} from "@/shared/minio/file.service";
import { ProjectTabs, type TabKey } from "@/modules/projects/components/project-tabs";
import { StageProgress } from "@/modules/projects/components/stage-progress";
import { StageTimeline } from "@/modules/projects/components/stage-timeline";
import { ChangeStageForm } from "@/modules/projects/components/change-stage-form";
import { CompleteProjectButton } from "@/modules/projects/components/complete-project-button";
import { MemberManager } from "@/modules/projects/components/member-manager";
import { CommentSection } from "@/modules/projects/components/comment-section";
import { FileUploader } from "@/modules/projects/components/file-uploader";
import { FileList } from "@/modules/projects/components/file-list";
import { FileTrash } from "@/modules/projects/components/file-trash";
import { ImageGallery } from "@/modules/projects/components/image-gallery";
import { DeleteProjectButton } from "@/modules/projects/components/delete-project-button";
import { ContractSection } from "@/modules/contracts/components/contract-section";
import { listContractsByProject } from "@/modules/contracts/contracts.service";
import { MaterialsWorkspace } from "@/modules/materials/components/materials-workspace";
import { listMaterials } from "@/modules/materials/materials.service";
import { ProjectTransactionSection } from "@/modules/finance/components/project-transaction-section";
import { MaintenanceTab } from "@/modules/maintenance/components/maintenance-tab";
import { transactionsWithoutContractByProject } from "@/modules/finance/finance.service";
import type { SessionUser } from "@/common/permissions/permissions";

/** Hợp đồng của dự án kèm URL tải có chữ ký cho từng file đính kèm. */
async function loadContractsWithUrls(user: SessionUser, projectId: string) {
  const contracts = await listContractsByProject(user, projectId);
  return Promise.all(
    contracts.map(async (c) => ({
      ...c,
      files: await withDownloadUrls(c.files),
    })),
  );
}

export type ProjectDetailWorkspaceProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
};

const VALID_TABS: TabKey[] = [
  "tong-quan",
  "tien-do",
  "file",
  "anh",
  "vat-tu",
  "tai-chinh",
  "bao-hanh",
];

export async function ProjectDetailWorkspace({
  params,
  searchParams,
}: ProjectDetailWorkspaceProps) {
  const { id } = await params;
  const { tab } = await searchParams;
  const activeTab: TabKey = VALID_TABS.includes(tab as TabKey)
    ? (tab as TabKey)
    : "tong-quan";

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const project = await getProject(user, id, {
    withContractFallback: activeTab === "tong-quan",
  });
  if (!project) notFound();

  const memberIds = await memberIdsOf(id);
  const showMoney = canSeeMoney(user);
  const canEdit = can(user, "project.update", { memberIds });
  const canChangeStage = can(user, "project.stage.change", { memberIds });
  const canManageMembers = hasPermission(user, "project.member.manage");
  const canUpload = can(user, "project.file.upload", { memberIds });
  const canComment = hasPermission(user, "project.comment");
  const canDelete = hasPermission(user, "project.delete");

  // Tách file tài liệu và ảnh, gắn URL tải có chữ ký.
  const documents = await withDownloadUrls(
    project.files
      .filter((f) => !PROJECT_IMAGE_KINDS.includes(f.kind))
      .map((f) => ({ ...f, createdAt: f.createdAt })),
  );
  const images = await withDownloadUrls(
    project.files.filter((f) => PROJECT_IMAGE_KINDS.includes(f.kind)),
  );

  // Thùng rác: chỉ nạp khi người xem có quyền quản file — người khác không cần.
  // Tách ảnh / tài liệu để mỗi tab chỉ thấy rác của đúng loại mình quản.
  const trashed = canUpload ? await listTrashedFiles(project.id) : [];
  const trashedWithDays = trashed.map((f) => ({
    ...f,
    deletedAt: f.deletedAt!,
    daysLeft: daysUntilPurge(f.deletedAt!),
  }));
  const trashedDocuments = trashedWithDays.filter(
    (f) => !PROJECT_IMAGE_KINDS.includes(f.kind),
  );
  const trashedImages = trashedWithDays.filter((f) =>
    PROJECT_IMAGE_KINDS.includes(f.kind),
  );

  return (
    <>
      <BackLink
        href="/projects"
      >
        <ArrowLeft className="size-4" />
        Danh sách dự án
      </BackLink>

      <PageHeader
        title={project.name}
        actions={
          canEdit ? (
            <ButtonLink
              href={`/projects/${project.id}/sua`}
            >
              <Pencil className="size-4" />
              Sửa
            </ButtonLink>
          ) : null
        }
      />

      <ProjectTabs active={activeTab} />

      {/* ─────────── TAB TỔNG QUAN ─────────── */}
      {activeTab === "tong-quan" && (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-6">
            <Card className="p-6">
              <dl>
                <DescriptionRow label="Mã dự án" value={project.code} />
                <DescriptionRow
                  label="Khách hàng"
                  value={
                    <TextLink
                      href={`/customers/${project.customer.id}`}
                    >
                      {project.customer.name}
                    </TextLink>
                  }
                />
                <DescriptionRow label="Loại dự án" value={PROJECT_TYPE_LABEL[project.type]} />
                <DescriptionRow label="Loại hình công trình" value={project.propertyType} />
                <DescriptionRow
                  label="Giai đoạn hiện tại"
                  value={STAGE_LABEL[project.currentStage]}
                />
                <DescriptionRow
                  label="Trạng thái"
                  value={PROJECT_STATUS_LABEL[project.status]}
                />
                {showMoney && (
                  <DescriptionRow
                    label="Giá trị dự kiến"
                    value={formatVnd(project.displayEstimatedValue)}
                  />
                )}
                <DescriptionRow label="Địa chỉ" value={project.address} />
                <DescriptionRow label="Ngày bắt đầu" value={formatDate(project.startDate)} />
                <DescriptionRow
                  label="Hạn hoàn thành dự kiến"
                  value={formatDate(project.expectedEndDate)}
                />
                <DescriptionRow label="Người tạo" value={project.createdBy?.fullName} />
                <DescriptionRow label="Mô tả" value={project.description} />
              </dl>
            </Card>

            {canDelete && (
              <DeleteProjectButton
                projectId={project.id}
                projectName={project.name}
              />
            )}
          </div>

          <Card className="p-5">
            <h3 className="mb-3 text-h3 font-semibold text-foreground">
              Thành viên dự án
            </h3>
            {project.members.length === 0 ? (
              <p className="text-sm text-muted">Chưa gán thành viên nào.</p>
            ) : (
              <ul className="space-y-2">
                {project.members.map((m) => (
                  <li key={m.id} className="flex items-center justify-between text-sm">
                    <span className="text-foreground">{m.user.fullName}</span>
                    <span className="text-xs text-muted">
                      {m.user.department
                        ? DEPARTMENT_LABEL[m.user.department.code]
                        : "BGĐ"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {/* ─────────── TAB TIẾN ĐỘ ─────────── */}
      {activeTab === "tien-do" && (
        <div className="space-y-6">
          <StageProgress currentStage={project.currentStage} />
          {canChangeStage ? (
            <ChangeStageForm
              projectId={project.id}
              currentStage={project.currentStage}
            />
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Lock className="size-4" />
              Chỉ thành viên dự án mới chuyển được giai đoạn.
            </p>
          )}

          {canEdit &&
            project.currentStage === "WARRANTY" &&
            project.status !== "COMPLETED" && (
              <CompleteProjectButton projectId={project.id} />
            )}

          <div>
            <h3 className="mb-3 text-h3 font-semibold text-foreground">
              Lịch sử chuyển giai đoạn
            </h3>
            <StageTimeline logs={project.stageLogs} />
          </div>

          <div>
            <h3 className="mb-3 text-h3 font-semibold text-foreground">
              Bình luận & chú thích
            </h3>
            {canComment ? (
              <CommentSection projectId={project.id} comments={project.comments} />
            ) : (
              <p className="text-sm text-muted">Bạn không có quyền bình luận.</p>
            )}
          </div>
        </div>
      )}

      {/* ─────────── TAB FILE ─────────── */}
      {activeTab === "file" && (
        <div className="space-y-6">
          {canUpload && (
            <FileUploader
              projectId={project.id}
              kinds={PROJECT_FILE_KINDS}
              projectFileLayout
            />
          )}
          <FileList files={documents} canManage={canUpload} />
          <FileTrash
            files={trashedDocuments}
            canRestore={canUpload}
            retentionDays={TRASH_RETENTION_DAYS}
          />
        </div>
      )}

      {/* ─────────── TAB ẢNH ─────────── */}
      {activeTab === "anh" && (
        <div className="space-y-6">
          {canUpload && (
            <FileUploader
              projectId={project.id}
              kinds={PROJECT_IMAGE_KINDS}
              withCaption
              accept="image/*"
            />
          )}
          <ImageGallery images={images} canManage={canUpload} />
          <FileTrash
            files={trashedImages}
            canRestore={canUpload}
            retentionDays={TRASH_RETENTION_DAYS}
          />
        </div>
      )}

      {/* ─────────── TAB VẬT TƯ (module Vật tư, gắn theo dự án) ─────────── */}
      {activeTab === "vat-tu" &&
        (hasPermission(user, "material.view") ? (
          <MaterialsWorkspace
            // fixedProjectId → ẩn ô chọn dự án + bảng top, khóa mọi thao tác về
            // đúng dự án này. Quyền sửa dựa trên material.manage scope ASSIGNED
            // (memberIds), tiền ẩn ở tầng service qua showMoney như trang /materials.
            fixedProjectId={project.id}
            projects={[
              { id: project.id, code: project.code, name: project.name },
            ]}
            materials={await listMaterials(user, { projectId: project.id })}
            showMoney={showMoney}
            manageableProjectIds={
              can(user, "material.manage", { memberIds }) ? [project.id] : []
            }
          />
        ) : (
          <EmptyStatePanel >
            <p className="text-sm text-muted">Bạn không có quyền xem vật tư.</p>
          </EmptyStatePanel>
        ))}

      {/* ─────────── TAB TÀI CHÍNH — Hợp đồng (CT-01→07) ─────────── */}
      {activeTab === "tai-chinh" && (
        <div className="space-y-5">
          {showMoney && (
            <div className="flex justify-end">
              <ButtonLink
                href={`/finance?projectId=${project.id}`}
                variant="outline"
              >
                Xem giao dịch thu / chi của dự án
              </ButtonLink>
            </div>
          )}
          {can(user, "contract.view", { memberIds }) ? (
            <ContractSection
              projectId={project.id}
              project={{ id: project.id, code: project.code, name: project.name }}
              contracts={await loadContractsWithUrls(user, project.id)}
              showMoney={showMoney}
              canManage={can(user, "contract.manage", { memberIds })}
              canManageFinance={can(user, "finance.manage")}
            />
          ) : (
            <EmptyStatePanel >
              <p className="text-sm text-muted">
                Bạn không có quyền xem hợp đồng của dự án.
              </p>
            </EmptyStatePanel>
          )}
          {showMoney && (
            <ProjectTransactionSection
              project={{ id: project.id, code: project.code, name: project.name }}
              transactions={await transactionsWithoutContractByProject(project.id)}
              canManage={can(user, "finance.manage")}
            />
          )}
        </div>
      )}

      {/* ─────────── TAB BẢO HÀNH — sau bàn giao (khách báo hỏng + lịch định kỳ) ─────────── */}
      {activeTab === "bao-hanh" &&
        (hasPermission(user, "maintenance.view") ? (
          <MaintenanceTab
            user={user}
            projectId={project.id}
            handoverDate={project.actualEndDate}
            memberIds={memberIds}
          />
        ) : (
          <EmptyStatePanel>
            <p className="text-sm text-muted">
              Bạn không có quyền xem thông tin bảo hành.
            </p>
          </EmptyStatePanel>
        ))}

      {/* Quản lý thành viên đặt dưới tab Tổng quan cho người có quyền */}
      {activeTab === "tong-quan" && canManageMembers && (
        <div className="mt-6">
          <h3 className="mb-3 text-h3 font-semibold text-foreground">
            Quản lý thành viên
          </h3>
          <MemberManager
            projectId={project.id}
            members={project.members}
            assignableUsers={await listAssignableUsers()}
            canManage={canManageMembers}
          />
        </div>
      )}
    </>
  );
}
