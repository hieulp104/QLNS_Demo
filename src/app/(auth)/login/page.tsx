import type { Metadata } from "next";
import {
  LoginWorkspace,
  type LoginWorkspaceProps,
} from "@/modules/auth/components/login-workspace";
import {
  ACTIVE_THEME_FAMILY,
  ACTIVE_THEME_VARIANT,
  getTheme,
} from "@/components/theme";

export const metadata: Metadata = { title: "Đăng nhập" };

const loginTheme = getTheme({
  family: ACTIVE_THEME_FAMILY,
  variant: ACTIVE_THEME_VARIANT,
  mode: "light",
});

export default function LoginPage(props: LoginWorkspaceProps) {
  return (
    <div
      className="tamnest-login-experience"
      data-theme={loginTheme.attribute}
      data-theme-family={ACTIVE_THEME_FAMILY}
      data-theme-variant={ACTIVE_THEME_VARIANT}
      data-color-mode="light"
    >
      <LoginWorkspace {...props} />
    </div>
  );
}
