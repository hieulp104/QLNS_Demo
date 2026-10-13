"use client";

import { Button, Input, Alert, Label } from "@/components/ui";

import { useActionState, useState } from "react";
import { Eye, EyeOff, LoaderCircle, TriangleAlert } from "lucide-react";
import {
  changePasswordAction,
  type ChangePasswordState,
} from "@/modules/auth/auth.actions";

const initialState: ChangePasswordState = { error: null };

type FieldProps = {
  id: string;
  label: string;
  autoComplete: string;
};

function PasswordField({ id, label, autoComplete }: FieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          name={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required
          className="px-3.5 py-2.5 pr-11"
        />
        <Button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
          variant="ghost" size="icon-sm" className="absolute right-1 top-1/2 -translate-y-1/2 p-2"
        >
          {visible ? (
            <EyeOff className="size-4" />
          ) : (
            <Eye className="size-4" />
          )}
        </Button>
      </div>
    </div>
  );
}

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(
    changePasswordAction,
    initialState,
  );

  return (
    <form action={formAction} className="space-y-5">
      {state.error && (
        <Alert
          variant="danger"
          className="flex items-start gap-2.5 px-3.5 py-3"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{state.error}</span>
        </Alert>
      )}

      <PasswordField
        id="currentPassword"
        label="Mật khẩu hiện tại"
        autoComplete="current-password"
      />
      <PasswordField
        id="newPassword"
        label="Mật khẩu mới"
        autoComplete="new-password"
      />
      <PasswordField
        id="confirmPassword"
        label="Nhập lại mật khẩu mới"
        autoComplete="new-password"
      />

      <p className="text-xs leading-relaxed text-muted">
        Mật khẩu mới cần tối thiểu 8 ký tự, có ít nhất một chữ cái và một chữ số.
      </p>

      <Button
        type="submit"
        disabled={pending}
        size="lg" className="w-full px-4 py-2.5 disabled:cursor-not-allowed"
      >
        {pending && <LoaderCircle className="size-4 animate-spin" />}
        {pending ? "Đang đổi mật khẩu..." : "Đổi mật khẩu"}
      </Button>
    </form>
  );
}
