"use client";

import { forwardRef, useState, type ChangeEvent } from "react";

import { Input, type InputProps } from "./input";

/**
 * Ô nhập tiền tự chèn dấu chấm phân cách nghìn ngay khi gõ.
 *
 * Kế toán nhập hàng trăm dòng vật tư mỗi tháng và phải đếm chữ số để biết mình
 * vừa gõ 25.000 hay 250.000 — đếm nhầm một chữ số là lệch mười lần. Dấu chấm
 * hiện ngay lúc gõ thì nhìn phát biết luôn.
 *
 * Giá trị gửi lên vẫn là chuỗi có dấu chấm; mọi schema tiền trong repo đều lọc
 * ký tự không phải chữ số trước khi validate nên không cần đổi tầng server.
 * KHÔNG dùng cho ô không phải tiền (số ngày công, tỉ lệ %, số lượng).
 */

/** "25000" → "25.000". Bỏ mọi ký tự không phải số, nhóm 3 chữ số từ phải sang. */
export function formatMoneyInput(value: string) {
  const digits = value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export type MoneyInputProps = Omit<
  InputProps,
  "type" | "inputMode" | "value" | "onChange" | "defaultValue"
> & {
  defaultValue?: string | number | null;
};

export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(
  function MoneyInput({ defaultValue, ...props }, ref) {
    const [value, setValue] = useState(() =>
      formatMoneyInput(defaultValue == null ? "" : String(defaultValue)),
    );

    function handleChange(event: ChangeEvent<HTMLInputElement>) {
      const field = event.target;
      const caret = field.selectionStart ?? field.value.length;
      /**
       * Số chữ số đứng trước con trỏ là mốc duy nhất còn nguyên sau khi chèn
       * lại dấu chấm — bám theo vị trí ký tự thì sửa giữa số là con trỏ nhảy.
       */
      const digitsBeforeCaret = field.value.slice(0, caret).replace(/\D/g, "").length;
      const formatted = formatMoneyInput(field.value);
      setValue(formatted);

      /** Đặt lại con trỏ SAU khi React ghi value mới, không thì nó văng về cuối. */
      requestAnimationFrame(() => {
        let seen = 0;
        let position = digitsBeforeCaret === 0 ? 0 : formatted.length;
        for (let index = 0; index < formatted.length; index += 1) {
          if (formatted[index] !== ".") seen += 1;
          if (seen === digitsBeforeCaret) {
            position = index + 1;
            break;
          }
        }
        field.setSelectionRange(position, position);
      });
    }

    return (
      <Input
        {...props}
        ref={ref}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={handleChange}
      />
    );
  },
);
