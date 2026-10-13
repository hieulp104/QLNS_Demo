import { redirect } from "next/navigation";

// Không có trang chủ công khai — đây là hệ thống nội bộ.
export default function RootPage() {
  redirect("/dashboard");
}
