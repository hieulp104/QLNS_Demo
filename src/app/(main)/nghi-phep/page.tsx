import type { Metadata } from "next";
import {
  LeaveWorkspace,
  type LeaveWorkspaceProps,
} from "@/modules/leave/components/leave-workspace";

export const metadata: Metadata = { title: "Nghỉ phép" };

export default function LeavePage(props: LeaveWorkspaceProps) {
  return <LeaveWorkspace {...props} />;
}
