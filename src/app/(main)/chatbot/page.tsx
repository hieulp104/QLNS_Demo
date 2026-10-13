import type { Metadata } from "next";
import { AiWorkspace, type AiWorkspaceProps } from "@/modules/ai/components/ai-workspace";

export const metadata: Metadata = { title: "NA AI" };

export default function ChatbotPage(props: AiWorkspaceProps) {
  return <AiWorkspace {...props} />;
}
