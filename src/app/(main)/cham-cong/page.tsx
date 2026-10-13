import type { Metadata } from "next";
import {
  AttendanceWorkspace,
  type AttendanceWorkspaceProps,
} from "@/modules/attendance/components/attendance-workspace";

export const metadata: Metadata = { title: "Chấm công" };

export default function AttendancePage(props: AttendanceWorkspaceProps) {
  return <AttendanceWorkspace {...props} />;
}
