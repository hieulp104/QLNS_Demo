import type { Metadata } from "next";
import {
  MaterialsPageWorkspace,
  type MaterialsPageSearchParams,
} from "@/modules/materials/components/materials-page-workspace";

export const metadata: Metadata = { title: "Vật tư" };

export default function MaterialsPage({
  searchParams,
}: {
  searchParams: MaterialsPageSearchParams;
}) {
  return <MaterialsPageWorkspace searchParams={searchParams} />;
}
