"use client";

import { Button, Input, Alert, Label } from "@/components/ui";

import { useActionState } from "react";
import { Eye, EyeOff, LoaderCircle, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { loginAction, type LoginState } from "@/modules/auth/auth.actions";

const initialState: LoginState = { error: null };

type Props = {
  /** proxy.ts gắn vào khi chặn route chưa đăng nhập — đăng nhập xong quay lại đúng trang đó. */
  callbackUrl?: string;
};

export function LoginForm({ callbackUrl }: Props) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="space-y-5">
      {callbackUrl && (
        <Input type="hidden" name="callbackUrl" value={callbackUrl} />
      )}
      {state.error && (
        <Alert
          variant="danger"
          className="flex items-start gap-2.5 px-3.5 py-3"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{state.error}</span>
        </Alert>
      )}

      <div className="space-y-1.5">
        <Label
          htmlFor="login"
          className="block text-sm font-medium text-foreground"
        >
          Email hoặc số điện thoại
        </Label>
        <Input
          id="login"
          name="login"
          // type="text" chứ không phải "email": trình duyệt sẽ chặn SĐT
          // vì thiếu "@" trước khi form kịp gửi lên server.
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          defaultValue={state.login}
          placeholder="ten@na.vn hoặc 0912345678"
          className="px-3.5 py-2.5"
        />
      </div>

      <div className="space-y-1.5">
        <Label
          htmlFor="password"
          className="block text-sm font-medium text-foreground"
        >
          Mật khẩu
        </Label>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            className="px-3.5 py-2.5 pr-11"
          />
          <Button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            variant="ghost" size="icon-sm" className="absolute right-1 top-1/2 -translate-y-1/2 p-2"
          >
            {showPassword ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </Button>
        </div>
      </div>

      <Button
        type="submit"
        disabled={pending}
        size="lg" className="w-full px-4 py-2.5 disabled:cursor-not-allowed"
      >
        {pending && <LoaderCircle className="size-4 animate-spin" />}
        {pending ? "Đang đăng nhập..." : "Đăng nhập"}
      </Button>
    </form>
  );
}
