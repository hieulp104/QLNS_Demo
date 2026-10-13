import Image from "next/image";
import { redirect } from "next/navigation";
import { CircleCheck } from "lucide-react";
import { Alert } from "@/components/ui";
import { BrandPanel } from "@/components/patterns/auth-brand-panel";
import { BrandLogoBox } from "@/components/theme";
import tamnestLogo from "@/components/theme/themes/tamnest/assets/LOGO.svg";
import { getCurrentUser } from "@/modules/auth/auth.service";
import { LoginForm } from "@/modules/auth/components/login-form";

export type LoginWorkspaceProps = {
  searchParams: Promise<{ callbackUrl?: string; "doi-mat-khau"?: string }>;
};

export async function LoginWorkspace({
  searchParams,
}: LoginWorkspaceProps) {
  // Đã đăng nhập rồi thì không cần vào lại trang này.
  const user = await getCurrentUser();
  if (user) redirect(user.mustChangePassword ? "/doi-mat-khau" : "/dashboard");

  const params = await searchParams;
  const justChangedPassword = params["doi-mat-khau"] === "thanh-cong";

  return (
    <main className="relative flex min-h-screen overflow-hidden">
      {/* Nền thương hiệu luôn hiện; nội dung dài chỉ hiển thị trên desktop. */}
      <BrandPanel className="absolute inset-0 z-0 flex flex-col p-12">
        <div className="relative hidden lg:block">
          <div className="flex items-center gap-4">
            <BrandLogoBox size="hero">
              <Image
                src={tamnestLogo}
                alt=""
                className="size-full object-contain p-1.5"
                priority
              />
            </BrandLogoBox>
            <p className="text-h2 font-bold leading-[1.2] tracking-tight text-on-primary">
              NA
            </p>
          </div>
        </div>

        <div className="relative my-auto hidden max-w-[560px] lg:block">
          <h1 className="text-h1 font-bold leading-tight text-on-primary">
            Tạo nên không gian sống bằng sự chỉn chu trong từng chi tiết.
          </h1>
          <p className="mt-6 max-w-[560px] text-sm leading-relaxed text-on-primary/75">
            NA mang đến giải pháp thiết kế và thi công nội thất trọn gói,
            lấy chất lượng, sự minh bạch và trải nghiệm khách hàng làm giá trị
            cốt lõi.
          </p>
        </div>
      </BrandPanel>

      {/* Cột form */}
      <div className="tamnest-login-form-panel relative z-10 ml-auto flex w-full flex-col justify-center">
        <div className="tamnest-login-form-card mx-auto w-full max-w-sm">
          {/* Logo rút gọn cho mobile */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Image
              src={tamnestLogo}
              alt=""
              className="size-10 shrink-0 object-contain"
              priority
            />
            <p className="text-base font-bold leading-none text-foreground">
              NA
            </p>
          </div>

          <h1 className="text-h1 font-bold tracking-tight text-foreground">
            Đăng nhập
          </h1>
          <p className="mt-2 text-sm text-muted">
            Đăng nhập bằng email hoặc số điện thoại đã đăng ký với công ty.
          </p>

          {justChangedPassword && (
            <Alert variant="success" role="status" className="mt-6 flex items-start gap-2.5">
              <CircleCheck className="mt-0.5 size-4 shrink-0" />
              <span>
                Đổi mật khẩu thành công. Vui lòng đăng nhập lại bằng mật khẩu
                mới.
              </span>
            </Alert>
          )}

          <div className="mt-8">
            <LoginForm callbackUrl={params.callbackUrl} />
          </div>

          <p className="mt-8 text-center text-xs leading-relaxed text-muted">
            Chưa có tài khoản? Hệ thống không cho phép tự đăng ký —
            <br />
            vui lòng liên hệ Giám đốc để được cấp.
          </p>
        </div>
      </div>
    </main>
  );
}
